-- A replacement worker adopts the same attempt, session and dispatch record.
-- Only one replacement wins, and every delayed old-worker write is fenced out.
create or replace function public.replace_studio_assignment_workflow(p_workspace uuid,p_user uuid,p_assignment uuid,p_previous text,p_workflow text)
returns boolean language plpgsql security definer set search_path=public as $$
declare a public.studio_assignments%rowtype;
begin
  if p_previous is null or p_workflow is null or p_previous=p_workflow or char_length(p_workflow) not between 1 and 200 then raise exception 'invalid workflow'; end if;
  select j.* into a from public.studio_assignments j join public.workspaces w on w.id=j.workspace_id
    where j.workspace_id=p_workspace and j.id=p_assignment and w.owner_id=p_user for update of j;
  if not found then raise exception 'not found'; end if;
  if a.workflow_id=p_workflow then return true; end if;
  if a.workflow_id is distinct from p_previous or a.state not in ('queued','running','cancelling') then return false; end if;
  update public.studio_assignments set workflow_id=p_workflow where id=a.id;
  return true;
end $$;

-- Idle cancellation needs no live workflow. The row lock also excludes a
-- concurrent dispatch claim, so a stopped preparation can never start a turn.
create or replace function public.cancel_studio_assignment(p_workspace uuid,p_user uuid,p_assignment uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare a public.studio_assignments%rowtype; v_done boolean; v_previous text;
begin
  perform 1 from public.workspaces where id=p_workspace and owner_id=p_user for no key update;
  if not found then raise exception 'not found'; end if;
  select * into a from public.studio_assignments where workspace_id=p_workspace and id=p_assignment for update;
  if not found then raise exception 'not found'; end if;
  if a.state in ('queued','running','cancelling') then
    v_previous:=a.state;
    v_done:=a.state='queued' or a.dispatch_state='idle';
    update public.studio_assignments set state=case when v_done then 'cancelled' else 'cancelling' end,
      dispatch_state=case when v_done then 'finished' else dispatch_state end,
      finished_at=case when v_done then now() else finished_at end,
      error_code=case when v_done then null else error_code end
      where id=a.id returning * into a;
    if a.state<>v_previous then
      insert into public.studio_activity(workspace_id,project_id,actor_user_id,kind,details)
        values(a.workspace_id,a.project_id,p_user,'assignment.'||a.state,jsonb_build_object('assignmentId',a.id,'employeeId',a.employee_id));
    end if;
  end if;
  update public.studio_employee_tokens set revoked_at=coalesce(revoked_at,now()) where assignment_id=p_assignment;
  return to_jsonb(a);
end $$;

revoke all on function public.replace_studio_assignment_workflow(uuid,uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.replace_studio_assignment_workflow(uuid,uuid,uuid,text,text) to service_role;
revoke all on function public.cancel_studio_assignment(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.cancel_studio_assignment(uuid,uuid,uuid) to service_role;
