alter table public.studio_assignments add column if not exists purpose text not null default 'independent'
  check(purpose in ('independent','campaign_step','campaign_final'));
-- A Director can enqueue several tasks in one transaction. now() would give
-- them all the same timestamp and let random UUID order scramble an employee's
-- queue. Preserve actual insertion order for these batches as well.
alter table public.studio_assignments alter column created_at set default clock_timestamp();

create table if not exists public.studio_campaigns (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id),
  project_id uuid not null,
  root_assignment_id uuid not null unique,
  final_assignment_id uuid unique,
  workflow_id text unique,
  specification jsonb not null,
  state text not null default 'planning' check(state in ('planning','running','cancelling','awaiting_review','completed','cancelled','failed')),
  error_code text,
  created_at timestamptz not null default now(),
  finished_at timestamptz,
  unique(workspace_id,id),
  foreign key(workspace_id,project_id) references public.studio_projects(workspace_id,id),
  foreign key(workspace_id,root_assignment_id) references public.studio_assignments(workspace_id,id),
  foreign key(workspace_id,final_assignment_id) references public.studio_assignments(workspace_id,id)
);
create table if not exists public.studio_campaign_steps (
  campaign_id uuid not null,
  workspace_id uuid not null,
  key text not null check(key ~ '^[a-z][a-z0-9-]{0,39}$'),
  position integer not null,
  employee_id uuid not null,
  request_key uuid not null default gen_random_uuid(),
  brief text not null check(char_length(trim(brief)) between 1 and 10000),
  depends_on text[] not null,
  input_refs jsonb not null,
  is_final boolean not null,
  assignment_id uuid unique,
  output_refs jsonb,
  primary key(campaign_id,key),
  unique(campaign_id,position),
  foreign key(workspace_id,campaign_id) references public.studio_campaigns(workspace_id,id),
  foreign key(workspace_id,employee_id) references public.studio_employees(workspace_id,id),
  foreign key(workspace_id,assignment_id) references public.studio_assignments(workspace_id,id)
);
create table if not exists public.studio_assignment_deliverables (
  workspace_id uuid not null,
  assignment_id uuid not null,
  asset_id uuid not null,
  revision_id uuid not null,
  primary key(assignment_id,revision_id),
  foreign key(workspace_id,assignment_id) references public.studio_assignments(workspace_id,id),
  foreign key(workspace_id,asset_id,revision_id) references public.studio_revisions(workspace_id,asset_id,id)
);

create or replace function public.director_create_campaign(p_hash text,p_operation uuid,p_steps jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
declare s jsonb; previous public.studio_employee_operations%rowtype; campaign public.studio_campaigns%rowtype;
  step jsonb; ref jsonb; employee uuid; deps text[]; seen text[]:='{}'; position integer:=0; result jsonb; has_final boolean:=false;
begin
  s:=public.studio_employee_scope(p_hash);
  if s->>'kind'<>'director' or exists(select 1 from public.studio_assignments where id=(s->>'assignmentId')::uuid and purpose='campaign_final') then raise exception 'employee access denied'; end if;
  select * into previous from public.studio_employee_operations where assignment_id=(s->>'assignmentId')::uuid and operation_id=p_operation;
  if found then
    if previous.method<>'create_campaign' or previous.arguments<>p_steps then raise exception 'operation key reused'; end if;
    return previous.result;
  end if;
  if exists(select 1 from public.studio_campaigns where root_assignment_id=(s->>'assignmentId')::uuid) then raise exception 'campaign already planned'; end if;
  if jsonb_typeof(p_steps) is distinct from 'array' or jsonb_array_length(p_steps) not between 1 and 20 then raise exception 'invalid campaign'; end if;
  insert into public.studio_campaigns(workspace_id,project_id,root_assignment_id,specification)
    values((s->>'workspaceId')::uuid,(s->>'projectId')::uuid,(s->>'assignmentId')::uuid,p_steps) returning * into campaign;
  for step in select value from jsonb_array_elements(p_steps) loop
    if step->>'key' is null or step->>'key' !~ '^[a-z][a-z0-9-]{0,39}$' or step->>'key'=any(seen)
      or jsonb_typeof(step->'dependsOn') is distinct from 'array' or jsonb_array_length(step->'dependsOn')>20
      or jsonb_typeof(step->'inputs') is distinct from 'array' or jsonb_array_length(step->'inputs')>100
      or jsonb_typeof(step->'final') is distinct from 'boolean' then raise exception 'invalid campaign'; end if;
    select coalesce(array_agg(value),'{}') into deps from jsonb_array_elements_text(step->'dependsOn');
    -- Dependencies must precede their consumer. This rejects cycles and unknown keys.
    if not deps <@ seen then raise exception 'invalid campaign dependency'; end if;
    select id into employee from public.studio_employees where workspace_id=campaign.workspace_id and kind='specialist' and app_id=step->>'appId';
    if not found then raise exception 'employee access denied'; end if;
    for ref in select value from jsonb_array_elements(step->'inputs') loop
      if not exists(select 1 from public.studio_revisions r join public.studio_assets a on a.id=r.asset_id
        where r.workspace_id=campaign.workspace_id and a.project_id=campaign.project_id and r.asset_id=(ref->>'assetId')::uuid and r.id=(ref->>'revisionId')::uuid and r.state='committed') then raise exception 'dependency unavailable'; end if;
    end loop;
    insert into public.studio_campaign_steps(campaign_id,workspace_id,key,position,employee_id,brief,depends_on,input_refs,is_final)
      values(campaign.id,campaign.workspace_id,step->>'key',position,employee,step->>'brief',deps,step->'inputs',(step->>'final')::boolean);
    seen:=array_append(seen,step->>'key');position:=position+1;has_final:=has_final or (step->>'final')::boolean;
  end loop;
  if not has_final then raise exception 'campaign needs final deliverables'; end if;
  result:=jsonb_build_object('campaignId',campaign.id,'state',campaign.state,'steps',position);
  insert into public.studio_employee_operations(assignment_id,operation_id,method,arguments,result)
    values(campaign.root_assignment_id,p_operation,'create_campaign',p_steps,result);
  insert into public.studio_activity(workspace_id,project_id,actor_user_id,kind,details)
    values(campaign.workspace_id,campaign.project_id,(s->>'userId')::uuid,'campaign.planned',jsonb_build_object('campaignId',campaign.id,'steps',position));
  return result;
end $$;

create or replace function public.bind_studio_campaign_workflow(p_workspace uuid,p_user uuid,p_campaign uuid,p_previous text,p_workflow text)
returns boolean language plpgsql security definer set search_path=public as $$
declare c public.studio_campaigns%rowtype;
begin
  if p_workflow is null or char_length(p_workflow) not between 1 and 200 then raise exception 'invalid workflow'; end if;
  select j.* into c from public.studio_campaigns j join public.workspaces w on w.id=j.workspace_id
    where j.workspace_id=p_workspace and j.id=p_campaign and w.owner_id=p_user for update of j;
  if not found then raise exception 'not found'; end if;
  if c.workflow_id=p_workflow then return true; end if;
  if c.workflow_id is distinct from p_previous or c.state not in ('planning','running','cancelling') then return false; end if;
  update public.studio_campaigns set workflow_id=p_workflow where id=c.id;
  return true;
end $$;

create or replace function public.cancel_studio_campaign(p_workspace uuid,p_user uuid,p_campaign uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare c public.studio_campaigns%rowtype; job record;
begin
  perform 1 from public.workspaces where id=p_workspace and owner_id=p_user for no key update;
  if not found then raise exception 'not found'; end if;
  select * into c from public.studio_campaigns where workspace_id=p_workspace and id=p_campaign for update;
  if not found then raise exception 'not found'; end if;
  if c.state in ('planning','running','cancelling') then
    update public.studio_campaigns set state='cancelling' where id=c.id returning * into c;
    for job in select id from public.studio_assignments where workspace_id=p_workspace and state in ('queued','running','cancelling')
      and (id=c.root_assignment_id or id=c.final_assignment_id or id in(select assignment_id from public.studio_campaign_steps where campaign_id=c.id)) loop
      perform public.cancel_studio_assignment(p_workspace,p_user,job.id);
    end loop;
  end if;
  return to_jsonb(c);
end $$;

create or replace function public.studio_assignment_output_refs(p_workspace uuid,p_assignment uuid)
returns jsonb language sql stable security definer set search_path=public as $$
  select coalesce(jsonb_agg(jsonb_build_object('assetId',asset_id,'revisionId',id)),'[]'::jsonb)
  from (select distinct on(asset_id) asset_id,id from public.studio_revisions
    where workspace_id=p_workspace and assignment_id=p_assignment and state='committed' order by asset_id,finalized_at desc,id desc) outputs;
$$;

create or replace function public.advance_studio_campaign(p_workspace uuid,p_user uuid,p_campaign uuid,p_workflow text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare c public.studio_campaigns%rowtype; root public.studio_assignments%rowtype; step public.studio_campaign_steps%rowtype;
  job public.studio_assignments%rowtype; outputs jsonb; inputs jsonb; created jsonb; ref jsonb; notes text; launches jsonb;
begin
  perform 1 from public.workspaces where id=p_workspace and owner_id=p_user for no key update;
  if not found then raise exception 'not found'; end if;
  select * into c from public.studio_campaigns where workspace_id=p_workspace and id=p_campaign for update;
  if not found then raise exception 'not found'; end if;
  if p_workflow is null or c.workflow_id is distinct from p_workflow then return jsonb_build_object('done',true,'assignments','[]'::jsonb); end if;
  if c.state in ('awaiting_review','completed','failed','cancelled') then return jsonb_build_object('done',true,'assignments','[]'::jsonb); end if;
  select * into root from public.studio_assignments where id=c.root_assignment_id;
  if root.state in ('failed','cancelled','cancelling') or not exists(select 1 from public.studio_projects where id=c.project_id and status='active') then
    update public.studio_campaigns set state='cancelling',error_code=case when root.state='failed' then 'director_failed' else error_code end where id=c.id returning * into c;
  end if;
  for step in select * from public.studio_campaign_steps where campaign_id=c.id and assignment_id is not null order by position loop
    select * into job from public.studio_assignments where id=step.assignment_id;
    if job.state in ('failed','cancelled') and c.state<>'cancelling' then
      update public.studio_campaigns set state='cancelling',error_code='specialist_stopped' where id=c.id returning * into c;
    elsif job.state='completed' and step.output_refs is null then
      outputs:=public.studio_assignment_output_refs(p_workspace,job.id);
      if jsonb_array_length(outputs)=0 or jsonb_array_length(outputs)>100 or exists(select 1 from public.studio_revisions where assignment_id=job.id and state='conflict') then
        update public.studio_campaigns set state='cancelling',error_code='deliverables_unavailable' where id=c.id returning * into c;
      else update public.studio_campaign_steps set output_refs=outputs where campaign_id=c.id and key=step.key; end if;
    end if;
  end loop;
  if c.state='cancelling' then
    perform public.cancel_studio_campaign(p_workspace,p_user,c.id);
    if not exists(select 1 from public.studio_assignments where workspace_id=p_workspace and state in ('queued','running','cancelling')
      and (id=c.root_assignment_id or id=c.final_assignment_id or id in(select assignment_id from public.studio_campaign_steps where campaign_id=c.id))) then
      update public.studio_campaigns set state=case when error_code is null then 'cancelled' else 'failed' end,finished_at=now() where id=c.id returning * into c;
    end if;
  elsif root.state='completed' then
    update public.studio_campaigns set state='running' where id=c.id;
    for step in select * from public.studio_campaign_steps where campaign_id=c.id and assignment_id is null order by position loop
      if exists(select 1 from public.studio_campaign_steps where campaign_id=c.id and key=any(step.depends_on) and output_refs is null) then continue; end if;
      select coalesce(jsonb_agg(distinct value),'[]'::jsonb) into inputs from (
        select value from jsonb_array_elements(step.input_refs)
        union all select value from public.studio_campaign_steps d cross join lateral jsonb_array_elements(d.output_refs)
          where d.campaign_id=c.id and d.key=any(step.depends_on)
      ) refs;
      if jsonb_array_length(inputs)>100 then
        update public.studio_campaigns set state='cancelling',error_code='too_many_handoff_inputs' where id=c.id;
        exit;
      end if;
      created:=public.create_studio_assignment(p_workspace,p_user,c.project_id,step.employee_id,step.request_key,step.brief,inputs);
      update public.studio_assignments set purpose='campaign_step' where id=(created->>'id')::uuid;
      update public.studio_campaign_steps set assignment_id=(created->>'id')::uuid where campaign_id=c.id and key=step.key;
    end loop;
    if c.final_assignment_id is null and not exists(select 1 from public.studio_campaign_steps where campaign_id=c.id and output_refs is null) then
      select coalesce(jsonb_agg(distinct value),'[]'::jsonb) into inputs from public.studio_campaign_steps d cross join lateral jsonb_array_elements(d.output_refs) where d.campaign_id=c.id and d.is_final;
      if jsonb_array_length(inputs)>100 or jsonb_array_length(inputs)=0 then
        update public.studio_campaigns set state='cancelling',error_code='final_deliverables_unavailable' where id=c.id;
      else
        select string_agg(d.key||': '||left(coalesce(a.result_text,''),500),chr(10) order by d.position) into notes from public.studio_campaign_steps d join public.studio_assignments a on a.id=d.assignment_id where d.campaign_id=c.id;
        created:=public.create_studio_assignment(p_workspace,p_user,c.project_id,root.employee_id,c.id,
          'Review the exact final deliverables attached to this assignment. Explain what was made, how the files relate, and any limitations. Do not create a new production plan or alter the files. Return the work to the creator for review.'||chr(10)||'Creator brief: '||left(root.brief,6000)||chr(10)||'Production notes: '||left(coalesce(notes,''),10000),inputs);
        update public.studio_assignments set purpose='campaign_final' where id=(created->>'id')::uuid;
        for ref in select value from jsonb_array_elements(inputs) loop
          insert into public.studio_assignment_deliverables(workspace_id,assignment_id,asset_id,revision_id) values(p_workspace,(created->>'id')::uuid,(ref->>'assetId')::uuid,(ref->>'revisionId')::uuid);
        end loop;
        update public.studio_campaigns set final_assignment_id=(created->>'id')::uuid where id=c.id returning * into c;
      end if;
    end if;
    if c.final_assignment_id is not null then
      select * into job from public.studio_assignments where id=c.final_assignment_id;
      if job.state in ('awaiting_review','completed','failed','cancelled') then
        update public.studio_campaigns set state=job.state,error_code=job.error_code,finished_at=case when job.state='awaiting_review' then null else now() end where id=c.id;
      end if;
    end if;
  end if;
  select * into c from public.studio_campaigns where id=c.id;
  if c.state='cancelling' then perform public.cancel_studio_campaign(p_workspace,p_user,c.id); end if;
  select coalesce(jsonb_agg(id),'[]'::jsonb) into launches from public.studio_assignments where workspace_id=p_workspace and state in ('queued','running','cancelling')
    and (id=c.final_assignment_id or (c.state='cancelling' and id=c.root_assignment_id) or id in(select assignment_id from public.studio_campaign_steps where campaign_id=c.id));
  return jsonb_build_object('done',c.state in ('awaiting_review','completed','failed','cancelled'),'assignments',launches,'state',c.state);
end $$;

-- Intermediate specialist work is handed onward automatically. Human approval
-- remains attached to the Director's final assignment and exact deliverables.
create or replace function public.finish_studio_assignment(p_workspace uuid,p_user uuid,p_assignment uuid,p_workflow text,p_attempt uuid,p_response text,p_outcome text,p_text text,p_error text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare a public.studio_assignments%rowtype; v_state text; v_error text; v_kind text;
begin
  if p_outcome is null or p_outcome not in ('completed','failed','cancelled') then raise exception 'invalid outcome'; end if;
  perform 1 from public.workspaces where id=p_workspace and owner_id=p_user for no key update;
  if not found then raise exception 'not found'; end if;
  select * into a from public.studio_assignments where workspace_id=p_workspace and id=p_assignment for update;
  if not found then raise exception 'not found'; end if;
  if p_workflow is null or p_attempt is null or a.workflow_id is distinct from p_workflow or a.run_attempt is distinct from p_attempt then return null; end if;
  if a.dispatch_state='finished' then return to_jsonb(a); end if;
  if a.state not in ('running','cancelling') then return null; end if;
  if p_response is null then
    if a.terminal_history_at is null and (a.dispatch_state<>'idle' or p_outcome='completed') then return null; end if;
  elsif a.response_id is distinct from p_response then return null; end if;
  select kind into v_kind from public.studio_employees where id=a.employee_id;
  v_error:=left(p_error,100);
  if a.state='cancelling' or p_outcome='cancelled' then v_state:='cancelled';
  elsif p_outcome='failed' then v_state:='failed';
  elsif v_kind='specialist' and not exists(select 1 from public.studio_revisions where workspace_id=p_workspace and assignment_id=a.id and state='committed') then v_state:='failed';v_error:='no_committed_deliverable';
  elsif a.purpose='campaign_step' and exists(select 1 from public.studio_revisions where assignment_id=a.id and state='conflict') then v_state:='failed';v_error:='deliverable_conflict';
  elsif a.purpose='campaign_step' or exists(select 1 from public.studio_campaigns where root_assignment_id=a.id) then v_state:='completed';
  else v_state:='awaiting_review'; end if;
  update public.studio_assignments set state=v_state,dispatch_state='finished',finished_at=now(),result_text=left(p_text,65536),error_code=v_error where id=a.id returning * into a;
  update public.studio_employee_tokens set revoked_at=coalesce(revoked_at,now()) where assignment_id=a.id;
  insert into public.studio_activity(workspace_id,project_id,actor_user_id,kind,details)
    values(a.workspace_id,a.project_id,p_user,'assignment.'||v_state,jsonb_build_object('assignmentId',a.id,'employeeId',a.employee_id));
  return to_jsonb(a);
end $$;

create or replace function public.finish_studio_campaign_review()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  update public.studio_campaigns set state='completed',finished_at=now() where workspace_id=new.workspace_id and final_assignment_id=new.assignment_id;
  return new;
end $$;
drop trigger if exists studio_campaign_reviewed on public.studio_assignment_reviews;
create trigger studio_campaign_reviewed after insert on public.studio_assignment_reviews for each row execute function public.finish_studio_campaign_review();

alter table public.studio_campaigns enable row level security;
alter table public.studio_campaign_steps enable row level security;
alter table public.studio_assignment_deliverables enable row level security;
revoke all on public.studio_campaigns,public.studio_campaign_steps,public.studio_assignment_deliverables from anon,authenticated;
grant select,insert,update,delete on public.studio_campaigns,public.studio_campaign_steps,public.studio_assignment_deliverables to service_role;
do $$ declare f record; begin
  for f in select oid::regprocedure as signature from pg_proc where pronamespace='public'::regnamespace and proname in (
    'director_create_campaign','bind_studio_campaign_workflow','cancel_studio_campaign','studio_assignment_output_refs','advance_studio_campaign','finish_studio_assignment','finish_studio_campaign_review'
  ) loop
    execute format('revoke all on function %s from public,anon,authenticated',f.signature);
    execute format('grant execute on function %s to service_role',f.signature);
  end loop;
end $$;
