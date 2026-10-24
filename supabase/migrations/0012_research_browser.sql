-- Human browser takeover is a durable hold, independent of a completed assignment.
alter table public.studio_employees add column if not exists browser_control text not null default 'agent' check (browser_control in ('agent','requesting','human'));
alter table public.studio_employees add column if not exists browser_control_id uuid;
alter table public.studio_employees add column if not exists browser_assignment_id uuid;
alter table public.studio_assignments add column if not exists browser_paused boolean not null default false;
alter table public.studio_assignments add column if not exists browser_turns jsonb not null default '[]'::jsonb;

create or replace function public.claim_studio_assignment(p_workspace uuid,p_user uuid,p_assignment uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare a public.studio_assignments%rowtype; v_kind text; v_generation bigint;
begin
  perform 1 from public.workspaces where id=p_workspace and owner_id=p_user for no key update;
  if not found then raise exception 'not found'; end if;
  select * into a from public.studio_assignments where workspace_id=p_workspace and id=p_assignment for update;
  if not found then raise exception 'not found'; end if;
  if exists(select 1 from public.studio_employees where id=a.employee_id and browser_control<>'agent') then return jsonb_build_object('claimed',false,'assignment',to_jsonb(a)); end if;
  if a.state<>'queued' then return jsonb_build_object('claimed',false,'assignment',to_jsonb(a)); end if;
  select kind into v_kind from public.studio_employees where id=a.employee_id;
  if exists(select 1 from public.studio_assignments where employee_id=a.employee_id and state in ('running','cancelling'))
    or exists(select 1 from public.studio_assignments where employee_id=a.employee_id and state='queued' and (created_at,id)<(a.created_at,a.id))
    or (v_kind='specialist' and (select count(*) from public.studio_assignments j join public.studio_employees e on e.id=j.employee_id where j.workspace_id=p_workspace and j.state in ('running','cancelling') and e.kind='specialist')>=3)
    then return jsonb_build_object('claimed',false,'assignment',to_jsonb(a)); end if;
  update public.studio_employees set assignment_generation=assignment_generation+1 where id=a.employee_id returning assignment_generation into v_generation;
  update public.studio_assignments set state='running',started_at=now(),run_attempt=gen_random_uuid(),session_id=replace(gen_random_uuid()::text,'-',''),employee_generation=v_generation
    where id=a.id returning * into a;
  return jsonb_build_object('claimed',true,'assignment',to_jsonb(a));
end $$;

create or replace function public.claim_studio_assignment_dispatch(p_workspace uuid,p_user uuid,p_assignment uuid,p_workflow text,p_attempt uuid)
returns boolean language plpgsql security definer set search_path=public as $$
declare a public.studio_assignments%rowtype;
begin
  select j.* into a from public.studio_assignments j join public.workspaces w on w.id=j.workspace_id
    where j.workspace_id=p_workspace and w.owner_id=p_user and j.id=p_assignment for update of j;
  if not found then raise exception 'not found'; end if;
  if p_workflow is null or p_attempt is null or a.workflow_id is distinct from p_workflow
    or a.run_attempt is distinct from p_attempt or a.state<>'running' or a.dispatch_state<>'idle' then return false; end if;
  if not exists(select 1 from public.studio_employees e join public.studio_projects p on p.workspace_id=e.workspace_id
    where e.id=a.employee_id and e.instance_id is not null and e.provision_state='ready' and e.browser_control='agent' and p.id=a.project_id and p.status='active')
    then return false; end if;
  update public.studio_assignments set dispatch_state='dispatching',dispatch_started_at=now() where id=a.id;
  return true;
end $$;

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
  if a.browser_paused and a.state='running' then return null; end if;
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

create or replace function public.studio_employee_scope(p_hash text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_id uuid; v_scope jsonb;
begin
  select assignment_id into v_id from public.studio_employee_tokens where token_hash=p_hash;
  if not found then raise exception 'employee access denied'; end if;
  perform 1 from public.studio_assignments where id=v_id for update;
  select jsonb_build_object('workspaceId',a.workspace_id,'projectId',a.project_id,'assignmentId',a.id,'employeeId',e.id,'appId',e.app_id,'kind',e.kind,'userId',w.owner_id,'instanceId',t.instance_id,'brief',a.brief,'role',e.role)
    into v_scope from public.studio_employee_tokens t join public.studio_assignments a on a.id=t.assignment_id
    join public.studio_employees e on e.id=a.employee_id join public.workspaces w on w.id=a.workspace_id
    join public.studio_projects p on p.id=a.project_id
    where t.token_hash=p_hash and t.revoked_at is null and t.expires_at>now() and a.state='running' and e.browser_control='agent' and not a.browser_paused
      and e.instance_id=t.instance_id and e.provision_state='ready' and p.status='active';
  if v_scope is null then raise exception 'employee access denied'; end if;
  return v_scope;
end $$;

create or replace function public.control_studio_research(p_workspace uuid,p_user uuid,p_employee uuid,p_control uuid,p_action text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare e public.studio_employees%rowtype; a public.studio_assignments%rowtype;
begin
  if p_control is null or p_action not in ('request','confirm','return') then raise exception 'invalid browser control'; end if;
  perform 1 from public.workspaces where id=p_workspace and owner_id=p_user for no key update;
  if not found then raise exception 'not found'; end if;
  select * into e from public.studio_employees where id=p_employee and workspace_id=p_workspace and employee_key='research' and app_id='research' for update;
  if not found or e.instance_id is null or e.provision_state<>'ready' then raise exception 'browser unavailable'; end if;
  if p_action='request' then
    if e.browser_control<>'agent' then
      if e.browser_control_id is distinct from p_control then raise exception 'browser already controlled'; end if;
    else
      select * into a from public.studio_assignments where employee_id=e.id and state in ('running','cancelling') order by created_at limit 1 for update;
      if a.id is not null then update public.studio_assignments set browser_paused=true where id=a.id; end if;
      update public.studio_employees set browser_control='requesting',browser_control_id=p_control,browser_assignment_id=a.id where id=e.id returning * into e;
    end if;
  elsif p_action='confirm' then
    if e.browser_control_id is distinct from p_control or e.browser_control='agent' then raise exception 'browser control changed'; end if;
    update public.studio_employees set browser_control='human' where id=e.id returning * into e;
  else
    if e.browser_control='agent' and e.browser_control_id=p_control then return to_jsonb(e); end if;
    if e.browser_control_id is distinct from p_control or e.browser_control<>'human' then raise exception 'browser control changed'; end if;
    select * into a from public.studio_assignments where id=e.browser_assignment_id for update;
    if a.id is not null and a.state='running' and a.browser_paused then
      -- A new, explicitly authorized turn uses the SAME assignment and files.
      -- Rotate its workflow/attempt/session fence so late pre-takeover replies
      -- cannot finish or submit work in the resumed turn.
      update public.studio_assignments set
        browser_turns=browser_turns||jsonb_build_array(jsonb_build_object('sessionId',session_id,'responseId',response_id,'workflowId',workflow_id,'returnedAt',now(),'controlId',p_control)),
        browser_paused=false,state='queued',workflow_id=null,run_attempt=null,session_id=null,response_id=null,
        dispatch_state='idle',dispatch_started_at=null,terminal_history_at=null,employee_generation=null,error_code=null
        where id=a.id;
      update public.studio_employee_tokens set revoked_at=coalesce(revoked_at,now()) where assignment_id=a.id;
    elsif a.id is not null then update public.studio_assignments set browser_paused=false where id=a.id;
    end if;
    update public.studio_employees set browser_control='agent' where id=e.id returning * into e;
  end if;
  return to_jsonb(e);
end $$;

do $$ declare f record; begin
  for f in select oid::regprocedure as signature from pg_proc where pronamespace='public'::regnamespace and proname in ('claim_studio_assignment','claim_studio_assignment_dispatch','finish_studio_assignment','studio_employee_scope','control_studio_research') loop
    execute format('revoke all on function %s from public,anon,authenticated',f.signature);
    execute format('grant execute on function %s to service_role',f.signature);
  end loop;
end $$;
