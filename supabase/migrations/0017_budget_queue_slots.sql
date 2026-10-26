-- A positively stopped budget turn does not occupy a global execution slot.
-- Its employee stays serialized; resumption reacquires capacity atomically.
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
    or (v_kind='specialist' and (select count(*) from public.studio_assignments j join public.studio_employees e on e.id=j.employee_id where j.workspace_id=p_workspace and j.state in ('running','cancelling') and not j.budget_paused and e.kind='specialist')>=3)
    then return jsonb_build_object('claimed',false,'assignment',to_jsonb(a)); end if;
  update public.studio_employees set assignment_generation=assignment_generation+1 where id=a.employee_id returning assignment_generation into v_generation;
  update public.studio_assignments set state='running',started_at=now(),run_attempt=gen_random_uuid(),session_id=replace(gen_random_uuid()::text,'-',''),employee_generation=v_generation
    where id=a.id returning * into a;
  return jsonb_build_object('claimed',true,'assignment',to_jsonb(a));
end $$;

create or replace function public.resume_studio_assignment_budget(p_workspace uuid,p_user uuid,p_assignment uuid,p_workflow text,p_attempt uuid)
returns boolean language plpgsql security definer set search_path=public as $$
declare a public.studio_assignments%rowtype; v_kind text;
begin
  perform 1 from public.workspaces where id=p_workspace and owner_id=p_user for no key update;
  if not found then raise exception 'not found'; end if;
  select * into a from public.studio_assignments where workspace_id=p_workspace and id=p_assignment for update;
  if not found then raise exception 'not found'; end if;
  if p_workflow is null or p_attempt is null or a.workflow_id is distinct from p_workflow or a.run_attempt is distinct from p_attempt or a.state<>'running'
    or not a.budget_paused or a.dispatch_state<>'dispatched' or a.response_id is null then return false; end if;
  if a.browser_paused or exists(select 1 from public.studio_employees where id=a.employee_id and browser_control<>'agent') then return false; end if;
  select kind into v_kind from public.studio_employees where id=a.employee_id;
  if v_kind='specialist' and (select count(*) from public.studio_assignments j join public.studio_employees e on e.id=j.employee_id where j.workspace_id=p_workspace and j.state in ('running','cancelling') and not j.budget_paused and e.kind='specialist')>=3 then return false; end if;
  update public.studio_assignments set
    budget_turns=budget_turns||jsonb_build_array(jsonb_build_object('sessionId',session_id,'responseId',response_id,'pausedAt',now())),
    budget_paused=false,error_code=null,session_id=replace(gen_random_uuid()::text,'-',''),response_id=null,
    dispatch_state='idle',dispatch_started_at=null,terminal_history_at=null where id=a.id;
  return true;
end $$;
