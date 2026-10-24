-- A response acknowledgement can be lost after the turn finishes. The trusted
-- worker may recover a terminal turn from this assignment's exact transcript;
-- an empty transcript is never terminal evidence.
alter table public.studio_assignments add column if not exists terminal_history_at timestamptz;

create or replace function public.record_studio_assignment_terminal_history(p_workspace uuid,p_user uuid,p_assignment uuid,p_workflow text,p_attempt uuid,p_session text)
returns boolean language plpgsql security definer set search_path=public as $$
begin
  update public.studio_assignments a set terminal_history_at=coalesce(terminal_history_at,now())
    where a.workspace_id=p_workspace and a.id=p_assignment and p_workflow is not null and p_attempt is not null
      and a.workflow_id=p_workflow and a.run_attempt=p_attempt and a.session_id=p_session
      and a.state in ('running','cancelling') and a.dispatch_state in ('dispatching','uncertain','dispatched')
      and exists(select 1 from public.workspaces where id=p_workspace and owner_id=p_user);
  return found;
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
  if a.dispatch_state='finished' then return to_jsonb(a); end if;
  if a.state not in ('running','cancelling') then return null; end if;
  if p_response is null then
    if a.terminal_history_at is null and (a.dispatch_state<>'idle' or p_outcome='completed') then return null; end if;
  elsif a.response_id is distinct from p_response then return null;
  end if;
  select kind into v_kind from public.studio_employees where id=a.employee_id;
  v_error:=left(p_error,100);
  if a.state='cancelling' or p_outcome='cancelled' then v_state:='cancelled';
  elsif p_outcome='failed' then v_state:='failed';
  elsif v_kind='specialist' and not exists(select 1 from public.studio_revisions where workspace_id=p_workspace and assignment_id=a.id and state='committed')
    then v_state:='failed'; v_error:='no_committed_deliverable';
  else v_state:='awaiting_review'; end if;
  update public.studio_assignments set state=v_state,dispatch_state='finished',finished_at=now(),result_text=left(p_text,65536),error_code=v_error
    where id=a.id returning * into a;
  update public.studio_employee_tokens set revoked_at=coalesce(revoked_at,now()) where assignment_id=a.id;
  insert into public.studio_activity(workspace_id,project_id,actor_user_id,kind,details)
    values(a.workspace_id,a.project_id,p_user,'assignment.'||v_state,jsonb_build_object('assignmentId',a.id,'employeeId',a.employee_id));
  return to_jsonb(a);
end $$;

-- Creation is at-most-once for a persistent workstation. A lost create reply
-- is reconciled by exact upstream metadata, never by another blind POST.
alter table public.studio_employees add column if not exists provision_attempt uuid;
alter table public.studio_employees add column if not exists provision_create_started_at timestamptz;
alter table public.studio_employees add column if not exists provision_error text;
alter table public.studio_employees add column if not exists assignment_generation bigint not null default 0;
alter table public.studio_assignments add column if not exists employee_generation bigint;

create or replace function public.claim_studio_assignment(p_workspace uuid,p_user uuid,p_assignment uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare a public.studio_assignments%rowtype; v_kind text; v_generation bigint;
begin
  perform 1 from public.workspaces where id=p_workspace and owner_id=p_user for no key update;
  if not found then raise exception 'not found'; end if;
  select * into a from public.studio_assignments where workspace_id=p_workspace and id=p_assignment for update;
  if not found then raise exception 'not found'; end if;
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

create or replace function public.claim_studio_employee_provision(p_workspace uuid,p_user uuid,p_employee uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare e public.studio_employees%rowtype;
begin
  select j.* into e from public.studio_employees j join public.workspaces w on w.id=j.workspace_id
    where j.workspace_id=p_workspace and j.id=p_employee and w.owner_id=p_user for update of j;
  if not found then raise exception 'not found'; end if;
  if e.instance_id is null and e.provision_attempt is null then
    update public.studio_employees set provision_state='provisioning',provision_attempt=gen_random_uuid(),provision_error=null
      where id=e.id returning * into e;
  end if;
  return to_jsonb(e);
end $$;

create or replace function public.claim_studio_employee_creation(p_workspace uuid,p_user uuid,p_employee uuid,p_attempt uuid)
returns boolean language plpgsql security definer set search_path=public as $$
begin
  update public.studio_employees e set provision_create_started_at=now()
    where e.workspace_id=p_workspace and e.id=p_employee and p_attempt is not null and e.provision_attempt=p_attempt
      and e.instance_id is null and e.provision_state='provisioning' and e.provision_create_started_at is null
      and exists(select 1 from public.workspaces where id=p_workspace and owner_id=p_user);
  return found;
end $$;

create or replace function public.bind_studio_employee_instance(p_workspace uuid,p_user uuid,p_employee uuid,p_attempt uuid,p_instance text,p_template text,p_resources jsonb)
returns boolean language plpgsql security definer set search_path=public as $$
declare e public.studio_employees%rowtype;
begin
  if p_instance is null or char_length(p_instance) not between 1 and 200 then raise exception 'invalid instance'; end if;
  select j.* into e from public.studio_employees j join public.workspaces w on w.id=j.workspace_id
    where j.workspace_id=p_workspace and j.id=p_employee and w.owner_id=p_user for update of j;
  if not found then raise exception 'not found'; end if;
  if p_attempt is null or e.provision_attempt is distinct from p_attempt then return false; end if;
  if e.instance_id is not null then return e.instance_id=p_instance; end if;
  if e.provision_state<>'provisioning' or e.provision_create_started_at is null then return false; end if;
  -- A preexisting mirror must belong to this studio. Never reassign ownership.
  if exists(select 1 from public.agents where agent37_id=p_instance and workspace_id<>p_workspace) then raise exception 'not found'; end if;
  insert into public.agents(agent37_id,workspace_id,name,template,cpu,memory,disk,created_by)
    values(p_instance,p_workspace,e.role,p_template,(p_resources->>'cpu')::numeric,(p_resources->>'memory')::numeric,(p_resources->>'disk')::numeric,p_user)
    on conflict(agent37_id) do nothing;
  update public.studio_employees set instance_id=p_instance where id=e.id;
  return true;
end $$;

create or replace function public.ready_studio_employee(p_workspace uuid,p_user uuid,p_employee uuid,p_instance text)
returns boolean language plpgsql security definer set search_path=public as $$
begin
  update public.studio_employees e set provision_state='ready',provision_error=null
    where e.workspace_id=p_workspace and e.id=p_employee and e.instance_id=p_instance
      and exists(select 1 from public.workspaces where id=p_workspace and owner_id=p_user);
  return found;
end $$;

do $$ declare f record; begin
  for f in select oid::regprocedure as signature from pg_proc where pronamespace='public'::regnamespace and proname in (
    'record_studio_assignment_terminal_history','claim_studio_employee_provision','claim_studio_employee_creation',
    'bind_studio_employee_instance','ready_studio_employee','finish_studio_assignment','claim_studio_assignment'
  ) loop
    execute format('revoke all on function %s from public,anon,authenticated',f.signature);
    execute format('grant execute on function %s to service_role',f.signature);
  end loop;
end $$;
