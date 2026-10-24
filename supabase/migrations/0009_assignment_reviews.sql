create table if not exists public.studio_assignment_reviews (
  assignment_id uuid primary key,
  workspace_id uuid not null,
  request_key uuid not null,
  decision text not null check(decision in ('approved','changes_requested')),
  feedback text not null default '' check(char_length(feedback)<=10000),
  reviewed_by uuid not null references auth.users(id),
  reviewed_at timestamptz not null default now(),
  followup_assignment_id uuid,
  unique(workspace_id,request_key),
  foreign key(workspace_id,assignment_id) references public.studio_assignments(workspace_id,id) on delete cascade,
  foreign key(workspace_id,followup_assignment_id) references public.studio_assignments(workspace_id,id)
);
alter table public.studio_assignment_reviews enable row level security;
revoke all on public.studio_assignment_reviews from anon,authenticated;
grant select,insert,update,delete on public.studio_assignment_reviews to service_role;

create or replace function public.review_studio_assignment(p_workspace uuid,p_user uuid,p_assignment uuid,p_request uuid,p_decision text,p_feedback text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare a public.studio_assignments%rowtype; r public.studio_assignment_reviews%rowtype; v_inputs jsonb; v_next jsonb;
begin
  if p_decision is null or p_decision not in ('approved','changes_requested') or p_feedback is null or char_length(p_feedback)>10000
    or (p_decision='changes_requested' and char_length(trim(p_feedback))=0) then raise exception 'invalid review'; end if;
  perform 1 from public.workspaces where id=p_workspace and owner_id=p_user for no key update;
  if not found then raise exception 'not found'; end if;
  select * into a from public.studio_assignments where workspace_id=p_workspace and id=p_assignment for update;
  if not found then raise exception 'not found'; end if;
  select * into r from public.studio_assignment_reviews where assignment_id=a.id;
  if found then
    if r.request_key<>p_request or r.decision<>p_decision or r.feedback<>p_feedback then raise exception 'review already recorded'; end if;
    return to_jsonb(r);
  end if;
  if a.state<>'awaiting_review' then raise exception 'assignment not ready for review'; end if;
  if p_decision='changes_requested' then
    select coalesce(jsonb_agg(jsonb_build_object('assetId',asset_id,'revisionId',id)),'[]'::jsonb) into v_inputs
      from (select distinct on(asset_id) asset_id,id from public.studio_revisions where assignment_id=a.id and workspace_id=p_workspace and state='committed' order by asset_id,finalized_at desc,id desc) latest;
    if jsonb_array_length(v_inputs)=0 then
      select coalesce(jsonb_agg(jsonb_build_object('assetId',asset_id,'revisionId',revision_id)),'[]'::jsonb) into v_inputs from public.studio_assignment_inputs where assignment_id=a.id;
    end if;
    v_next:=public.create_studio_assignment(p_workspace,p_user,a.project_id,a.employee_id,p_request,
      'Continue the exact supplied revisions. Preserve existing work except where these requested changes require it.'||chr(10)||p_feedback||chr(10)||'Original brief: '||left(a.brief,9000),v_inputs);
  end if;
  insert into public.studio_assignment_reviews(assignment_id,workspace_id,request_key,decision,feedback,reviewed_by,followup_assignment_id)
    values(a.id,p_workspace,p_request,p_decision,p_feedback,p_user,(v_next->>'id')::uuid) returning * into r;
  update public.studio_assignments set state='completed' where id=a.id;
  insert into public.studio_activity(workspace_id,project_id,actor_user_id,kind,details)
    values(p_workspace,a.project_id,p_user,'assignment.'||p_decision,jsonb_build_object('assignmentId',a.id,'followupAssignmentId',r.followup_assignment_id));
  return to_jsonb(r);
end $$;
revoke all on function public.review_studio_assignment(uuid,uuid,uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.review_studio_assignment(uuid,uuid,uuid,uuid,text,text) to service_role;
