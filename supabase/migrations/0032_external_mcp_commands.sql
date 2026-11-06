-- Direct Craft commands use the same workstation slot as assignments and media.
-- A transport timeout leaves the slot held until the exact worker reports back.
create table public.studio_mcp_operations (
  id uuid primary key default gen_random_uuid(),
  request_key uuid not null,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  project_id uuid not null,
  grant_id uuid not null references public.studio_mcp_grants(id) on delete cascade,
  instance_id text not null,
  app_id text not null,
  request_hash text not null,
  inputs jsonb not null,
  save_spec jsonb,
  save_package jsonb,
  save_asset_id uuid,
  save_revision_id uuid,
  result jsonb,
  created_at timestamptz not null default now(),
  dispatched_at timestamptz,
  worker_started_at timestamptz,
  finished_at timestamptz,
  unique (workspace_id, request_key),
  foreign key (workspace_id, project_id) references public.studio_projects(workspace_id, id) on delete cascade
);
create unique index studio_mcp_operation_slot on public.studio_mcp_operations(workspace_id) where finished_at is null;
alter table public.studio_mcp_operations enable row level security;
revoke all on public.studio_mcp_operations from public, anon, authenticated;
grant select on public.studio_mcp_operations to service_role;

create function public.studio_mcp_grant_active(p_grant uuid, p_workspace uuid, p_user uuid)
returns boolean language plpgsql stable security definer set search_path=public as $$
begin
  return exists(select 1 from public.studio_mcp_grants g join auth.users u on u.id=g.user_id
    join public.workspaces w on w.id=g.workspace_id and w.owner_id=u.id
    where g.id=p_grant and g.workspace_id=p_workspace and g.user_id=p_user and g.revoked_at is null
      and g.refresh_expires_at>now() and u.email_confirmed_at is not null and (u.banned_until is null or u.banned_until<=now()));
end $$;

-- The TypeScript path also checks live provider headroom. This check serializes
-- new MCP jobs with a change to the saved owner allowance.
create function public.create_studio_mcp_job(p_workspace uuid,p_user uuid,p_grant uuid,p_project uuid,p_employee uuid,
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
  return public.create_robyn_assignment(p_workspace,p_user,p_project,p_employee,p_request,p_brief,p_inputs,p_app,p_allowed_apps,p_mode);
end $$;

create function public.reserve_studio_mcp_operation(p_workspace uuid,p_user uuid,p_grant uuid,p_project uuid,
  p_request uuid,p_instance text,p_app text,p_request_hash text,p_inputs jsonb,p_save jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
declare op public.studio_mcp_operations; ref jsonb;
begin
  perform 1 from public.workspaces where id=p_workspace and owner_id=p_user for no key update;
  if not found or not public.studio_mcp_grant_active(p_grant,p_workspace,p_user) then raise exception 'not found'; end if;
  select * into op from public.studio_mcp_operations where workspace_id=p_workspace and request_key=p_request;
  if found then
    if op.grant_id<>p_grant or op.request_hash<>p_request_hash then raise exception 'operation key reused'; end if;
    return to_jsonb(op);
  end if;
  if not exists(select 1 from public.studio_projects where id=p_project and workspace_id=p_workspace and status='active')
    or not exists(select 1 from public.studio_employees where workspace_id=p_workspace and employee_key='robyn'
      and retired_at is null and instance_id=p_instance and provision_state='ready' and browser_control='agent')
    then raise exception 'mcp workstation unavailable'; end if;
  if exists(select 1 from public.studio_mcp_operations where workspace_id=p_workspace and finished_at is null)
    or exists(select 1 from public.studio_workstation_upgrades where workspace_id=p_workspace and state in ('pending','dispatched'))
    or not public.studio_media_admission_available(p_workspace,null,null)
    then raise exception 'mcp workstation busy'; end if;
  if jsonb_typeof(p_inputs) is distinct from 'array' or jsonb_array_length(p_inputs)>12 then raise exception 'dependency unavailable'; end if;
  for ref in select * from jsonb_array_elements(p_inputs) loop
    if not exists(select 1 from public.studio_assets a join public.studio_revisions r on r.asset_id=a.id
      where a.id=(ref->>'assetId')::uuid and a.workspace_id=p_workspace and a.project_id=p_project
        and r.id=(ref->>'revisionId')::uuid and r.state='committed') then raise exception 'dependency unavailable'; end if;
  end loop;
  insert into public.studio_mcp_operations(request_key,workspace_id,project_id,grant_id,instance_id,app_id,request_hash,inputs,save_spec)
    values(p_request,p_workspace,p_project,p_grant,p_instance,p_app,p_request_hash,p_inputs,p_save) returning * into op;
  return to_jsonb(op);
end $$;

create function public.dispatch_studio_mcp_operation(p_operation uuid,p_workspace uuid,p_user uuid,p_grant uuid)
returns boolean language plpgsql security definer set search_path=public as $$
begin
  perform 1 from public.workspaces where id=p_workspace and owner_id=p_user for no key update;
  if not found or not public.studio_mcp_grant_active(p_grant,p_workspace,p_user) then return false; end if;
  update public.studio_mcp_operations set dispatched_at=coalesce(dispatched_at,now())
    where id=p_operation and workspace_id=p_workspace and grant_id=p_grant and finished_at is null;
  return found;
end $$;

create function public.fail_prepared_studio_mcp_operation(p_operation uuid,p_workspace uuid,p_grant uuid)
returns boolean language plpgsql security definer set search_path=public as $$
begin
  update public.studio_mcp_operations set finished_at=now(),
    result=jsonb_build_object('outcome','failed','commands','[]'::jsonb,'error','The Craft worker could not be prepared.')
    where id=p_operation and workspace_id=p_workspace and grant_id=p_grant
      and dispatched_at is null and finished_at is null;
  return found;
end $$;

-- Called only with a verified, operation-specific workstation credential.
create function public.studio_mcp_worker_scope(p_operation uuid)
returns jsonb language plpgsql stable security definer set search_path=public as $$
begin
  return (select to_jsonb(op) || jsonb_build_object('user_id',g.user_id)
    from public.studio_mcp_operations op join public.studio_mcp_grants g on g.id=op.grant_id
    where op.id=p_operation and op.dispatched_at is not null and op.finished_at is null
      and public.studio_mcp_grant_active(op.grant_id,op.workspace_id,g.user_id)
      and exists(select 1 from public.studio_projects p where p.id=op.project_id and p.status='active')
      and exists(select 1 from public.studio_employees e where e.workspace_id=op.workspace_id
        and e.employee_key='robyn' and e.retired_at is null and e.instance_id=op.instance_id and e.browser_control='agent'));
end $$;

-- The remote marker recovers receipts after interrupted replies. This claim
-- also prevents replay if the workstation loses the marker with its disk.
create function public.claim_studio_mcp_worker(p_operation uuid)
returns boolean language plpgsql security definer set search_path=public as $$
begin
  update public.studio_mcp_operations set worker_started_at=now()
    where id=p_operation and worker_started_at is null and finished_at is null
      and public.studio_mcp_worker_scope(p_operation) is not null;
  return found;
end $$;

create function public.prepare_studio_mcp_save(p_operation uuid,p_package jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
declare op public.studio_mcp_operations; owner uuid; target uuid; base uuid; revision uuid;
begin
  select * into op from public.studio_mcp_operations where id=p_operation for update;
  if not found or op.worker_started_at is null or op.save_spec is null or public.studio_mcp_worker_scope(p_operation) is null
    then raise exception 'not found'; end if;
  select user_id into owner from public.studio_mcp_grants where id=op.grant_id and revoked_at is null for share;
  if not found then raise exception 'not found'; end if;
  if op.save_revision_id is not null then
    if op.save_package is distinct from p_package then raise exception 'operation key reused'; end if;
    return jsonb_build_object('assetId',op.save_asset_id,'revisionId',op.save_revision_id);
  end if;
  base:=(op.save_spec->>'revisionId')::uuid;
  if base is not null then
    select a.id into target from public.studio_assets a join public.studio_revisions r on r.asset_id=a.id
    where a.id=(op.save_spec->>'assetId')::uuid and a.workspace_id=op.workspace_id and a.project_id=op.project_id
      and a.app_id=op.app_id and a.asset_kind='native' and r.id=base and r.state='committed';
    if not found then raise exception 'not found'; end if;
  else
    insert into public.studio_assets(workspace_id,project_id,app_id,name,created_by)
      values(op.workspace_id,op.project_id,op.app_id,op.save_spec->>'name',owner) returning id into target;
  end if;
  revision:=public.begin_studio_revision(op.workspace_id,owner,target,base,p_package);
  update public.studio_mcp_operations set save_asset_id=target,save_revision_id=revision,save_package=p_package where id=op.id;
  return jsonb_build_object('assetId',target,'revisionId',revision);
end $$;

create function public.commit_studio_mcp_save(p_operation uuid,p_revision uuid,p_verified jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
declare op public.studio_mcp_operations; owner uuid;
begin
  select * into op from public.studio_mcp_operations where id=p_operation for update;
  if not found or op.save_revision_id is distinct from p_revision or public.studio_mcp_worker_scope(p_operation) is null
    then raise exception 'not found'; end if;
  select user_id into owner from public.studio_mcp_grants where id=op.grant_id and revoked_at is null for share;
  if not found then raise exception 'not found'; end if;
  -- Match the browser commit's asset-then-project locking order.
  perform 1 from public.studio_assets where id=op.save_asset_id for update;
  if not found then raise exception 'not found'; end if;
  perform 1 from public.studio_projects where id=op.project_id and status='active' for share;
  if not found then raise exception 'not found'; end if;
  return public.commit_studio_revision(op.workspace_id,owner,p_revision,p_verified);
end $$;

-- Even revoked connections must be able to acknowledge that their command
-- stopped. The worker can report a result but cannot decide library status.
create function public.finish_studio_mcp_operation(p_operation uuid,p_result jsonb)
returns boolean language plpgsql security definer set search_path=public as $$
declare op public.studio_mcp_operations; revision_state text;
begin
  select * into op from public.studio_mcp_operations where id=p_operation and dispatched_at is not null for update;
  if not found then return false; end if;
  if op.finished_at is not null then return true; end if;
  select state into revision_state from public.studio_revisions where id=op.save_revision_id;
  update public.studio_mcp_operations set finished_at=now(),result=(p_result - 'save') ||
    jsonb_build_object('save',case when op.save_revision_id is not null then
      jsonb_build_object('assetId',op.save_asset_id,'revisionId',op.save_revision_id,'status',revision_state) end) ||
    case when op.save_spec is not null and p_result->>'outcome'='completed' and revision_state is distinct from 'committed'
      then jsonb_build_object('outcome','failed','error','The library did not confirm a committed revision.') else '{}'::jsonb end
    where id=op.id;
  return true;
end $$;

create or replace function public.studio_media_admission_available(p_workspace uuid,p_assignment uuid,p_job uuid)
returns boolean language sql stable security definer set search_path=public as $$
  select not exists(select 1 from public.studio_mcp_operations where workspace_id=p_workspace and finished_at is null)
    and not exists(select 1 from public.studio_assignments where workspace_id=p_workspace and id is distinct from p_assignment
      and (state in ('running','cancelling') or dispatch_state in ('dispatching','dispatched','uncertain')))
    and not exists(select 1 from public.studio_media_jobs where workspace_id=p_workspace and id is distinct from p_job
      and (state in ('preparing','submitting','running','processing','uploading','uncertain')
        or (operation='generate' and not billing_settled and (reserved_micros>0 or provider_job_id is not null))));
$$;

create or replace function public.claim_studio_assignment(p_workspace uuid,p_user uuid,p_assignment uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare a public.studio_assignments%rowtype; e public.studio_employees%rowtype; generation bigint;
begin
  perform 1 from public.workspaces where id=p_workspace and owner_id=p_user for no key update;
  if not found then raise exception 'not found'; end if;
  select * into a from public.studio_assignments where workspace_id=p_workspace and id=p_assignment for update;
  if not found then raise exception 'not found'; end if;
  select * into e from public.studio_employees where id=a.employee_id and workspace_id=p_workspace for update;
  if a.state<>'queued' or a.execution_model<>'robyn' or e.retired_at is not null or e.employee_key<>'robyn'
    or e.browser_control<>'agent' or not exists(select 1 from public.studio_projects where id=a.project_id and status='active')
    then return jsonb_build_object('claimed',false,'assignment',to_jsonb(a)); end if;
  if not public.studio_media_admission_available(p_workspace,a.id,null)
    or exists(select 1 from public.studio_assignments where workspace_id=p_workspace and execution_model='robyn'
      and state='queued' and (created_at,id)<(a.created_at,a.id))
    then return jsonb_build_object('claimed',false,'assignment',to_jsonb(a)); end if;
  update public.studio_employees set assignment_generation=assignment_generation+1 where id=e.id
    returning assignment_generation into generation;
  update public.studio_assignments set state='running',started_at=now(),run_attempt=gen_random_uuid(),
    session_id=replace(gen_random_uuid()::text,'-',''),employee_generation=generation,
    workstation_profile='robyn-'||replace(id::text,'-','')||'-'||generation::text
    where id=a.id returning * into a;
  return jsonb_build_object('claimed',true,'assignment',to_jsonb(a));
end $$;

revoke all on function public.studio_mcp_grant_active(uuid,uuid,uuid),
  public.create_studio_mcp_job(uuid,uuid,uuid,uuid,uuid,uuid,text,jsonb,text,jsonb,text),
  public.reserve_studio_mcp_operation(uuid,uuid,uuid,uuid,uuid,text,text,text,jsonb,jsonb),
  public.fail_prepared_studio_mcp_operation(uuid,uuid,uuid),
  public.dispatch_studio_mcp_operation(uuid,uuid,uuid,uuid),public.studio_mcp_worker_scope(uuid),
  public.claim_studio_mcp_worker(uuid),
  public.prepare_studio_mcp_save(uuid,jsonb),public.commit_studio_mcp_save(uuid,uuid,jsonb),
  public.finish_studio_mcp_operation(uuid,jsonb) from public, anon, authenticated;
grant execute on function public.create_studio_mcp_job(uuid,uuid,uuid,uuid,uuid,uuid,text,jsonb,text,jsonb,text),
  public.reserve_studio_mcp_operation(uuid,uuid,uuid,uuid,uuid,text,text,text,jsonb,jsonb),
  public.fail_prepared_studio_mcp_operation(uuid,uuid,uuid),
  public.dispatch_studio_mcp_operation(uuid,uuid,uuid,uuid),public.studio_mcp_worker_scope(uuid),
  public.claim_studio_mcp_worker(uuid),
  public.prepare_studio_mcp_save(uuid,jsonb),public.commit_studio_mcp_save(uuid,uuid,jsonb),
  public.finish_studio_mcp_operation(uuid,jsonb) to service_role;
