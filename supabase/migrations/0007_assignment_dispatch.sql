-- Workflow retries must recover the same turn. Agent37 does not document an
-- idempotency key for POST /responses, so a lost acknowledgement never resets
-- dispatch to idle. Only service-role code may use these transitions.
alter table public.studio_assignments add column if not exists dispatch_started_at timestamptz;

create or replace function public.bind_studio_assignment_workflow(p_workspace uuid,p_user uuid,p_assignment uuid,p_workflow text)
returns boolean language plpgsql security definer set search_path=public as $$
declare a public.studio_assignments%rowtype;
begin
  if p_workflow is null or char_length(p_workflow) not between 1 and 200 then raise exception 'invalid workflow'; end if;
  select j.* into a from public.studio_assignments j join public.workspaces w on w.id=j.workspace_id
    where j.workspace_id=p_workspace and w.owner_id=p_user and j.id=p_assignment for update of j;
  if not found then raise exception 'not found'; end if;
  if a.workflow_id=p_workflow then return true; end if;
  if a.workflow_id is not null or a.state<>'queued' then return false; end if;
  update public.studio_assignments set workflow_id=p_workflow where id=a.id;
  return true;
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
    where e.id=a.employee_id and e.instance_id is not null and e.provision_state='ready' and p.id=a.project_id and p.status='active')
    then return false; end if;
  update public.studio_assignments set dispatch_state='dispatching',dispatch_started_at=now() where id=a.id;
  return true;
end $$;

create or replace function public.record_studio_assignment_response(p_workspace uuid,p_user uuid,p_assignment uuid,p_workflow text,p_attempt uuid,p_session text,p_response text)
returns boolean language plpgsql security definer set search_path=public as $$
declare a public.studio_assignments%rowtype;
begin
  if p_response is null or char_length(p_response) not between 1 and 200 then raise exception 'invalid response'; end if;
  select j.* into a from public.studio_assignments j join public.workspaces w on w.id=j.workspace_id
    where j.workspace_id=p_workspace and w.owner_id=p_user and j.id=p_assignment for update of j;
  if not found then raise exception 'not found'; end if;
  if p_workflow is null or p_attempt is null or a.workflow_id is distinct from p_workflow or a.run_attempt is distinct from p_attempt
    or a.session_id is distinct from p_session or a.state not in ('running','cancelling')
    or a.dispatch_state not in ('dispatching','uncertain','dispatched')
    or (a.response_id is not null and a.response_id<>p_response) then return false; end if;
  update public.studio_assignments set response_id=p_response,dispatch_state='dispatched' where id=a.id;
  return true;
end $$;

create or replace function public.mark_studio_dispatch_uncertain(p_workspace uuid,p_user uuid,p_assignment uuid,p_workflow text,p_attempt uuid)
returns boolean language plpgsql security definer set search_path=public as $$
begin
  update public.studio_assignments a set dispatch_state='uncertain'
    where a.workspace_id=p_workspace and a.id=p_assignment and p_workflow is not null and p_attempt is not null
      and a.workflow_id=p_workflow and a.run_attempt=p_attempt and a.state in ('running','cancelling') and a.dispatch_state='dispatching'
      and exists(select 1 from public.workspaces where id=p_workspace and owner_id=p_user);
  return found;
end $$;

create or replace function public.finish_studio_assignment(p_workspace uuid,p_user uuid,p_assignment uuid,p_workflow text,p_attempt uuid,p_response text,p_outcome text,p_text text,p_error text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare a public.studio_assignments%rowtype; v_state text; v_error text; v_kind text;
begin
  if p_outcome is null or p_outcome not in ('completed','failed','cancelled') then raise exception 'invalid outcome'; end if;
  -- Match the queue/cancellation lock order; never release an employee until the
  -- caller has observed its terminal response (or no dispatch was attempted).
  perform 1 from public.workspaces where id=p_workspace and owner_id=p_user for no key update;
  if not found then raise exception 'not found'; end if;
  select * into a from public.studio_assignments where workspace_id=p_workspace and id=p_assignment for update;
  if not found then raise exception 'not found'; end if;
  if p_workflow is null or p_attempt is null or a.workflow_id is distinct from p_workflow or a.run_attempt is distinct from p_attempt then return null; end if;
  if a.dispatch_state='finished' then return to_jsonb(a); end if;
  if a.state not in ('running','cancelling') then return null; end if;
  if p_response is null then
    if a.dispatch_state<>'idle' or p_outcome='completed' then return null; end if;
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
  return to_jsonb(a);
end $$;

do $$ declare f record; begin
  for f in select oid::regprocedure as signature from pg_proc where pronamespace='public'::regnamespace and proname in (
    'bind_studio_assignment_workflow','claim_studio_assignment_dispatch','record_studio_assignment_response','mark_studio_dispatch_uncertain','finish_studio_assignment'
  ) loop
    execute format('revoke all on function %s from public,anon,authenticated',f.signature);
    execute format('grant execute on function %s to service_role',f.signature);
  end loop;
end $$;
