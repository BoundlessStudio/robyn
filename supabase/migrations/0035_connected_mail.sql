-- Agent37 owns the OAuth grant. Studio persists only the mailbox selected for
-- a job and the receipt needed to fence an ambiguous draft creation.
create table public.studio_assignment_mail (
  workspace_id uuid not null,
  assignment_id uuid primary key,
  instance_id text not null check (instance_id ~ '^[a-z0-9-]{1,80}$'),
  connection_id text not null check (connection_id ~ '^[A-Za-z0-9_-]{1,128}$'),
  provider text not null check (provider in ('gmail','outlook')),
  unique (workspace_id,assignment_id,connection_id),
  foreign key (workspace_id,assignment_id) references public.studio_assignments(workspace_id,id) on delete cascade
);

create table public.studio_mail_draft_operations (
  workspace_id uuid not null,
  assignment_id uuid not null,
  connection_id text not null,
  operation_id uuid not null,
  request_hash text not null check (request_hash ~ '^[0-9a-f]{64}$'),
  state text not null default 'dispatching' check (state in ('dispatching','saved','rejected')),
  draft_id text check (char_length(draft_id) between 1 and 512 and draft_id ~ '^[A-Za-z0-9+/_=-]+$'),
  created_at timestamptz not null default now(),
  primary key (assignment_id,operation_id),
  check ((state='saved') = (draft_id is not null)),
  foreign key (workspace_id,assignment_id,connection_id)
    references public.studio_assignment_mail(workspace_id,assignment_id,connection_id) on delete cascade
);
create unique index studio_mail_one_unsettled_draft
  on public.studio_mail_draft_operations(assignment_id) where state='dispatching';

alter table public.studio_assignment_mail enable row level security;
alter table public.studio_mail_draft_operations enable row level security;
revoke all on public.studio_assignment_mail, public.studio_mail_draft_operations from public,anon,authenticated,service_role;
grant select on public.studio_assignment_mail, public.studio_mail_draft_operations to service_role;

-- Reuse the existing assignment creation, validation and replay transaction.
-- Compare the original mailbox under the same workspace lock as request_key.
create function public.create_robyn_assignment_with_mail(
  p_workspace uuid,p_user uuid,p_project uuid,p_employee uuid,p_request uuid,p_brief text,
  p_inputs jsonb,p_app text,p_allowed_apps jsonb,p_mode text,p_mail jsonb
) returns jsonb language plpgsql security definer set search_path=public as $$
declare prior uuid; prior_mail jsonb; assignment jsonb;
begin
  perform 1 from public.workspaces where id=p_workspace and owner_id=p_user for no key update;
  if not found then raise exception 'not found'; end if;
  select id into prior from public.studio_assignments where workspace_id=p_workspace and request_key=p_request;
  if prior is not null then
    select jsonb_build_object('instanceId',instance_id,'connectionId',connection_id,'provider',provider)
      into prior_mail from public.studio_assignment_mail where assignment_id=prior;
    if prior_mail is distinct from p_mail then raise exception 'operation key reused'; end if;
  elsif p_mail is not null then
    if not exists(select 1 from public.studio_employees
        where workspace_id=p_workspace and id=p_employee and instance_id=p_mail->>'instanceId' and provision_state='ready')
      then raise exception 'mail workstation changed'; end if;
  end if;
  assignment:=public.create_robyn_assignment(p_workspace,p_user,p_project,p_employee,
    p_request,p_brief,p_inputs,p_app,p_allowed_apps,p_mode);
  if prior is null and p_mail is not null then
    insert into public.studio_assignment_mail(workspace_id,assignment_id,instance_id,connection_id,provider)
      values(p_workspace,(assignment->>'id')::uuid,p_mail->>'instanceId',p_mail->>'connectionId',p_mail->>'provider');
  end if;
  return assignment;
end $$;

-- External MCP clients cannot bind a mailbox or reuse a mail-enabled request.
create or replace function public.create_studio_mcp_job(p_workspace uuid,p_user uuid,p_grant uuid,p_project uuid,p_employee uuid,
  p_request uuid,p_brief text,p_inputs jsonb,p_app text,p_allowed_apps jsonb,p_mode text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare allowance bigint; sync text; cap_pending jsonb;
begin
  perform 1 from public.workspaces where id=p_workspace and owner_id=p_user for no key update;
  if not found or not public.studio_mcp_grant_active(p_grant,p_workspace,p_user) then raise exception 'not found'; end if;
  select coalesce(b.monthly_limit_micros,e.monthly_cap_micros,0),b.sync_state,b.cap_sync into allowance,sync,cap_pending
  from public.studio_employees e left join public.studio_managed_budgets b on b.workspace_id=e.workspace_id
  where e.workspace_id=p_workspace and e.id=p_employee and e.employee_key='robyn' and e.retired_at is null;
  if not found then raise exception 'not found'; end if;
  if allowance <= 0 then raise exception 'mcp ai helper disabled'; end if;
  if coalesce(sync,'synced')<>'synced' or cap_pending is not null then raise exception 'mcp budget sync pending'; end if;
  return public.create_robyn_assignment_with_mail(p_workspace,p_user,p_project,p_employee,p_request,p_brief,p_inputs,p_app,p_allowed_apps,p_mode,null);
end $$;

create function public.reserve_studio_mail_draft(p_hash text,p_operation uuid,p_request_hash text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare scope jsonb; mailbox public.studio_assignment_mail%rowtype; operation public.studio_mail_draft_operations%rowtype;
begin
  scope:=public.studio_employee_scope(p_hash);
  if scope->>'kind'<>'robyn' or scope->>'startMode'='plan' then raise exception 'mail draft access denied'; end if;
  select * into mailbox from public.studio_assignment_mail
    where assignment_id=(scope->>'assignmentId')::uuid and workspace_id=(scope->>'workspaceId')::uuid
      and instance_id=scope->>'instanceId';
  if not found then raise exception 'mail draft access denied'; end if;
  select * into operation from public.studio_mail_draft_operations
    where assignment_id=mailbox.assignment_id and operation_id=p_operation;
  if found then
    if operation.request_hash is distinct from p_request_hash then raise exception 'operation key reused'; end if;
    return jsonb_build_object('state',operation.state,'draftId',operation.draft_id);
  end if;
  insert into public.studio_mail_draft_operations(workspace_id,assignment_id,connection_id,operation_id,request_hash)
    values(mailbox.workspace_id,mailbox.assignment_id,mailbox.connection_id,p_operation,p_request_hash)
    on conflict do nothing;
  if not found then return jsonb_build_object('state','dispatching'); end if;
  return jsonb_build_object('state','dispatch');
end $$;

create function public.finish_studio_mail_draft(p_hash text,p_operation uuid,p_state text,p_draft_id text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare scope jsonb; operation public.studio_mail_draft_operations%rowtype;
begin
  scope:=public.studio_employee_scope(p_hash);
  if scope->>'kind'<>'robyn' or scope->>'startMode'='plan' or p_state not in ('saved','rejected')
    then raise exception 'mail draft access denied'; end if;
  select o.* into operation from public.studio_mail_draft_operations o
    join public.studio_assignment_mail m on m.assignment_id=o.assignment_id
    where o.assignment_id=(scope->>'assignmentId')::uuid and o.workspace_id=(scope->>'workspaceId')::uuid
      and m.instance_id=scope->>'instanceId' and o.operation_id=p_operation for update of o;
  if not found then raise exception 'mail draft access denied'; end if;
  if operation.state='dispatching' then
    update public.studio_mail_draft_operations set state=p_state,draft_id=p_draft_id
      where assignment_id=operation.assignment_id and operation_id=p_operation returning * into operation;
  elsif operation.state is distinct from p_state or operation.draft_id is distinct from p_draft_id then
    raise exception 'operation key reused';
  end if;
  return jsonb_build_object('state',operation.state,'draftId',operation.draft_id);
end $$;

-- An unhinted first draft can deliver a confirmed provider draft. A brief
-- that targets a Craft still needs its exact committed native deliverable.
create or replace function public.finish_studio_assignment(p_workspace uuid,p_user uuid,p_assignment uuid,p_workflow text,p_attempt uuid,p_response text,p_outcome text,p_text text,p_error text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare a public.studio_assignments%rowtype; next_state text; next_error text; employee_kind text;
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
  select kind into employee_kind from public.studio_employees where id=a.employee_id;
  next_error:=left(p_error,100);
  if a.state='cancelling' or p_outcome='cancelled' then next_state:='cancelled';
  elsif p_outcome='failed' then next_state:='failed';
  elsif exists(select 1 from public.studio_mail_draft_operations where workspace_id=p_workspace and assignment_id=a.id and state='dispatching')
    then next_state:='failed';next_error:='mail_draft_unconfirmed';
  elsif ((a.execution_model='robyn' and a.start_mode<>'plan' and (a.app_id is not null or a.start_mode='draft'))
      or (a.execution_model='legacy' and employee_kind='specialist'))
    and not exists(select 1 from public.studio_revisions r join public.studio_assets asset on asset.id=r.asset_id
      where r.workspace_id=p_workspace and r.assignment_id=a.id and r.state='committed'
        and (a.execution_model='legacy' or (asset.asset_kind='native' and (a.app_id is null or asset.app_id=a.app_id))))
    and not (a.execution_model='robyn' and a.app_id is null and exists(
      select 1 from public.studio_mail_draft_operations where workspace_id=p_workspace and assignment_id=a.id and state='saved'))
    then next_state:='failed';next_error:='no_committed_deliverable';
  elsif a.execution_model='legacy' and a.purpose='campaign_step' and exists(select 1 from public.studio_revisions where assignment_id=a.id and state='conflict')
    then next_state:='failed';next_error:='deliverable_conflict';
  elsif a.execution_model='legacy' and (a.purpose='campaign_step' or exists(select 1 from public.studio_campaigns where root_assignment_id=a.id))
    then next_state:='completed';
  else next_state:='awaiting_review'; end if;
  update public.studio_assignments set state=next_state,dispatch_state='finished',finished_at=now(),result_text=left(p_text,65536),error_code=next_error
    where id=a.id returning * into a;
  update public.studio_employee_tokens set revoked_at=coalesce(revoked_at,now()) where assignment_id=a.id;
  insert into public.studio_activity(workspace_id,project_id,actor_user_id,kind,details)
    values(a.workspace_id,a.project_id,p_user,'assignment.'||next_state,jsonb_build_object('assignmentId',a.id,'employeeId',a.employee_id));
  return to_jsonb(a);
end $$;

revoke all on function public.create_robyn_assignment_with_mail(uuid,uuid,uuid,uuid,uuid,text,jsonb,text,jsonb,text,jsonb),
  public.reserve_studio_mail_draft(text,uuid,text),public.finish_studio_mail_draft(text,uuid,text,text) from public,anon,authenticated;
grant execute on function public.create_robyn_assignment_with_mail(uuid,uuid,uuid,uuid,uuid,text,jsonb,text,jsonb,text,jsonb),
  public.reserve_studio_mail_draft(text,uuid,text),public.finish_studio_mail_draft(text,uuid,text,text) to service_role;
