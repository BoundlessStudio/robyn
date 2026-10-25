-- Only a positively observed terminal response may open another paid turn.
-- Unknown dispatches retain their existing response/session and cannot resume.
alter table public.studio_assignments add column budget_paused boolean not null default false;
alter table public.studio_assignments add column budget_turns jsonb not null default '[]';

create function public.pause_studio_assignment_budget(p_workspace uuid,p_user uuid,p_assignment uuid,p_workflow text,p_attempt uuid,p_response text)
returns boolean language plpgsql security definer set search_path=public as $$
begin
  update public.studio_assignments a set budget_paused=true,error_code='employee_budget_required'
    where a.workspace_id=p_workspace and a.id=p_assignment and a.workflow_id=p_workflow and a.run_attempt=p_attempt
      and a.state='running' and a.dispatch_state='dispatched' and a.response_id=p_response and p_response is not null
      and exists(select 1 from public.workspaces where id=p_workspace and owner_id=p_user);
  return found;
end $$;

create function public.resume_studio_assignment_budget(p_workspace uuid,p_user uuid,p_assignment uuid,p_workflow text,p_attempt uuid)
returns boolean language plpgsql security definer set search_path=public as $$
begin
  update public.studio_assignments a set
    budget_turns=budget_turns||jsonb_build_array(jsonb_build_object('sessionId',session_id,'responseId',response_id,'pausedAt',now())),
    budget_paused=false,error_code=null,session_id=replace(gen_random_uuid()::text,'-',''),response_id=null,
    dispatch_state='idle',dispatch_started_at=null,terminal_history_at=null
    where a.workspace_id=p_workspace and a.id=p_assignment and a.workflow_id=p_workflow and a.run_attempt=p_attempt
      and a.state='running' and a.budget_paused and a.dispatch_state='dispatched' and a.response_id is not null
      and exists(select 1 from public.workspaces where id=p_workspace and owner_id=p_user);
  return found;
end $$;
revoke all on function public.pause_studio_assignment_budget(uuid,uuid,uuid,text,uuid,text) from public,anon,authenticated;
revoke all on function public.resume_studio_assignment_budget(uuid,uuid,uuid,text,uuid) from public,anon,authenticated;
grant execute on function public.pause_studio_assignment_budget(uuid,uuid,uuid,text,uuid,text) to service_role;
grant execute on function public.resume_studio_assignment_budget(uuid,uuid,uuid,text,uuid) to service_role;
