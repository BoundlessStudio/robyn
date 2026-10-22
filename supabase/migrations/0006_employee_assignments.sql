-- Durable assignment identity and project-scoped employee capabilities. Only the
-- authenticated BFF may issue credentials; raw tokens are never stored here.
create table if not exists public.studio_assignments (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  project_id uuid not null,
  employee_id uuid not null,
  request_key uuid not null,
  brief text not null check (char_length(trim(brief)) between 1 and 20000),
  state text not null default 'queued' check (state in ('queued','running','cancelling','cancelled','awaiting_review','completed','failed')),
  run_attempt uuid,
  workflow_id text unique,
  session_id text,
  response_id text,
  dispatch_state text not null default 'idle' check (dispatch_state in ('idle','dispatching','dispatched','uncertain','finished')),
  result_text text,
  error_code text,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz,
  unique (workspace_id, id),
  unique (workspace_id, request_key),
  foreign key (workspace_id, project_id) references public.studio_projects(workspace_id, id) on delete cascade,
  foreign key (workspace_id, employee_id) references public.studio_employees(workspace_id, id)
);
create unique index if not exists studio_one_active_assignment_per_employee on public.studio_assignments(employee_id) where state in ('running','cancelling');
create index if not exists studio_assignment_queue on public.studio_assignments(workspace_id, state, created_at);
create table if not exists public.studio_assignment_inputs (
  workspace_id uuid not null,
  assignment_id uuid not null,
  asset_id uuid not null,
  revision_id uuid not null,
  primary key (assignment_id, revision_id),
  foreign key (workspace_id, assignment_id) references public.studio_assignments(workspace_id,id) on delete cascade,
  foreign key (workspace_id, asset_id, revision_id) references public.studio_revisions(workspace_id,asset_id,id)
);
create table if not exists public.studio_employee_tokens (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references public.studio_assignments(id) on delete cascade,
  instance_id text not null,
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  issued_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  check (expires_at > issued_at and expires_at <= issued_at + interval '24 hours')
);
create table if not exists public.studio_employee_operations (
  assignment_id uuid not null references public.studio_assignments(id) on delete cascade,
  operation_id uuid not null,
  method text not null,
  arguments jsonb not null,
  result jsonb not null,
  created_at timestamptz not null default now(),
  primary key (assignment_id, operation_id)
);
alter table public.studio_revisions add column if not exists assignment_id uuid;
do $$ begin
  if not exists(select 1 from pg_constraint where conname='studio_revision_assignment_fk') then
    alter table public.studio_revisions add constraint studio_revision_assignment_fk foreign key (workspace_id,assignment_id) references public.studio_assignments(workspace_id,id);
  end if;
end $$;

create or replace function public.create_studio_assignment(p_workspace uuid,p_user uuid,p_project uuid,p_employee uuid,p_request uuid,p_brief text,p_inputs jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_assignment public.studio_assignments%rowtype; v_ref jsonb; v_inputs jsonb;
begin
  -- Serialize the queue without blocking foreign-key checks by an in-flight
  -- save. FOR UPDATE here would deadlock a cancellation against an assignment
  -- that already holds its own row and is inserting a workspace-owned record.
  perform 1 from public.workspaces where id=p_workspace and owner_id=p_user for no key update;
  if not found then raise exception 'not found'; end if;
  if not exists(select 1 from public.studio_projects where workspace_id=p_workspace and id=p_project and status='active')
    or not exists(select 1 from public.studio_employees where workspace_id=p_workspace and id=p_employee) then raise exception 'not found'; end if;
  if jsonb_typeof(p_inputs) is distinct from 'array' or jsonb_array_length(p_inputs)>100 then raise exception 'invalid inputs'; end if;
  select * into v_assignment from public.studio_assignments where workspace_id=p_workspace and request_key=p_request;
  if found then
    select coalesce(jsonb_agg(jsonb_build_object('assetId',asset_id,'revisionId',revision_id) order by revision_id),'[]'::jsonb) into v_inputs from public.studio_assignment_inputs where assignment_id=v_assignment.id;
    if v_assignment.project_id<>p_project or v_assignment.employee_id<>p_employee or v_assignment.brief<>p_brief or v_inputs<>(select coalesce(jsonb_agg(x order by x->>'revisionId'),'[]'::jsonb) from jsonb_array_elements(p_inputs) x) then raise exception 'operation key reused'; end if;
    return to_jsonb(v_assignment);
  end if;
  insert into public.studio_assignments(workspace_id,project_id,employee_id,request_key,brief,created_by)
    values(p_workspace,p_project,p_employee,p_request,p_brief,p_user) returning * into v_assignment;
  for v_ref in select * from jsonb_array_elements(p_inputs) loop
    if not exists(select 1 from public.studio_revisions r join public.studio_assets a on a.id=r.asset_id
      where r.workspace_id=p_workspace and a.project_id=p_project and r.asset_id=(v_ref->>'assetId')::uuid and r.id=(v_ref->>'revisionId')::uuid and r.state='committed') then raise exception 'dependency unavailable'; end if;
    insert into public.studio_assignment_inputs values(p_workspace,v_assignment.id,(v_ref->>'assetId')::uuid,(v_ref->>'revisionId')::uuid);
  end loop;
  return to_jsonb(v_assignment);
end $$;

create or replace function public.claim_studio_assignment(p_workspace uuid,p_user uuid,p_assignment uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_assignment public.studio_assignments%rowtype; v_kind text;
begin
  perform 1 from public.workspaces where id=p_workspace and owner_id=p_user for no key update;
  if not found then raise exception 'not found'; end if;
  select * into v_assignment from public.studio_assignments where workspace_id=p_workspace and id=p_assignment for update;
  if not found then raise exception 'not found'; end if;
  if v_assignment.state<>'queued' then return jsonb_build_object('claimed',false,'assignment',to_jsonb(v_assignment)); end if;
  select kind into v_kind from public.studio_employees where id=v_assignment.employee_id;
  if exists(select 1 from public.studio_assignments where employee_id=v_assignment.employee_id and state in ('running','cancelling'))
    or (v_kind='specialist' and (select count(*) from public.studio_assignments a join public.studio_employees e on e.id=a.employee_id where a.workspace_id=p_workspace and a.state in ('running','cancelling') and e.kind='specialist')>=3)
    then return jsonb_build_object('claimed',false,'assignment',to_jsonb(v_assignment)); end if;
  update public.studio_assignments set state='running',started_at=now(),run_attempt=gen_random_uuid(),session_id=replace(gen_random_uuid()::text,'-','') where id=p_assignment returning * into v_assignment;
  return jsonb_build_object('claimed',true,'assignment',to_jsonb(v_assignment));
end $$;

-- Lock the assignment before checking capability validity. A cancellation and a
-- save cannot cross: whichever obtains this lock first establishes the order.
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
    where t.token_hash=p_hash and t.revoked_at is null and t.expires_at>now() and a.state='running'
      and e.instance_id=t.instance_id and e.provision_state='ready' and p.status='active';
  if v_scope is null then raise exception 'employee access denied'; end if;
  return v_scope;
end $$;

create or replace function public.employee_create_asset(p_hash text,p_operation uuid,p_name text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare s jsonb; v_old public.studio_employee_operations%rowtype; v_asset public.studio_assets%rowtype; v_args jsonb; v_result jsonb;
begin
  s:=public.studio_employee_scope(p_hash);
  if s->>'kind'<>'specialist' then raise exception 'employee access denied'; end if;
  v_args:=jsonb_build_object('name',p_name);
  select * into v_old from public.studio_employee_operations where assignment_id=(s->>'assignmentId')::uuid and operation_id=p_operation;
  if found then
    if v_old.method<>'create_asset' or v_old.arguments<>v_args then raise exception 'operation key reused'; end if;
    return v_old.result;
  end if;
  insert into public.studio_assets(workspace_id,project_id,app_id,name,created_by)
    values((s->>'workspaceId')::uuid,(s->>'projectId')::uuid,s->>'appId',p_name,(s->>'userId')::uuid) returning * into v_asset;
  v_result:=jsonb_build_object('assetId',v_asset.id,'name',v_asset.name,'appId',v_asset.app_id);
  insert into public.studio_employee_operations(assignment_id,operation_id,method,arguments,result) values((s->>'assignmentId')::uuid,p_operation,'create_asset',v_args,v_result);
  return v_result;
end $$;

create or replace function public.employee_begin_revision(p_hash text,p_operation uuid,p_asset uuid,p_base uuid,p_package jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
declare s jsonb; v_old public.studio_employee_operations%rowtype; v_args jsonb; v_revision uuid; v_ref jsonb; v_result jsonb;
begin
  s:=public.studio_employee_scope(p_hash);
  if s->>'kind'<>'specialist' or not exists(select 1 from public.studio_assets where workspace_id=(s->>'workspaceId')::uuid and project_id=(s->>'projectId')::uuid and app_id=s->>'appId' and id=p_asset) then raise exception 'not found'; end if;
  v_args:=jsonb_build_object('assetId',p_asset,'base',p_base,'package',p_package);
  select * into v_old from public.studio_employee_operations where assignment_id=(s->>'assignmentId')::uuid and operation_id=p_operation;
  if found then
    if v_old.method<>'begin_revision' or v_old.arguments<>v_args then raise exception 'operation key reused'; end if;
    return v_old.result;
  end if;
  for v_ref in select * from jsonb_array_elements(p_package->'dependencies') loop
    if not exists(select 1 from public.studio_assets where workspace_id=(s->>'workspaceId')::uuid and project_id=(s->>'projectId')::uuid and id=(v_ref->>'assetId')::uuid) then raise exception 'dependency unavailable'; end if;
  end loop;
  v_revision:=public.begin_studio_revision((s->>'workspaceId')::uuid,(s->>'userId')::uuid,p_asset,p_base,p_package);
  update public.studio_revisions set author_employee_id=(s->>'employeeId')::uuid,assignment_id=(s->>'assignmentId')::uuid where id=v_revision;
  v_result:=jsonb_build_object('revisionId',v_revision,'status','uploading');
  insert into public.studio_employee_operations(assignment_id,operation_id,method,arguments,result) values((s->>'assignmentId')::uuid,p_operation,'begin_revision',v_args,v_result);
  return v_result;
end $$;

create or replace function public.employee_commit_revision(p_hash text,p_revision uuid,p_verified_files jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
declare s jsonb;
begin
  s:=public.studio_employee_scope(p_hash);
  if not exists(select 1 from public.studio_revisions where id=p_revision and workspace_id=(s->>'workspaceId')::uuid and assignment_id=(s->>'assignmentId')::uuid and author_employee_id=(s->>'employeeId')::uuid) then raise exception 'not found'; end if;
  return public.commit_studio_revision((s->>'workspaceId')::uuid,(s->>'userId')::uuid,p_revision,p_verified_files);
end $$;

create or replace function public.cancel_studio_assignment(p_workspace uuid,p_user uuid,p_assignment uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_assignment public.studio_assignments%rowtype;
begin
  perform 1 from public.workspaces where id=p_workspace and owner_id=p_user for no key update;
  if not found then raise exception 'not found'; end if;
  select * into v_assignment from public.studio_assignments where workspace_id=p_workspace and id=p_assignment for update;
  if not found then raise exception 'not found'; end if;
  if v_assignment.state in ('queued','running') then
    update public.studio_assignments set state=case when state='queued' then 'cancelled' else 'cancelling' end,finished_at=case when state='queued' then now() else null end where id=p_assignment returning * into v_assignment;
  end if;
  update public.studio_employee_tokens set revoked_at=coalesce(revoked_at,now()) where assignment_id=p_assignment;
  return to_jsonb(v_assignment);
end $$;

alter table public.studio_assignments enable row level security;
alter table public.studio_assignment_inputs enable row level security;
alter table public.studio_employee_tokens enable row level security;
alter table public.studio_employee_operations enable row level security;
revoke all on public.studio_assignments,public.studio_assignment_inputs,public.studio_employee_tokens,public.studio_employee_operations from anon,authenticated;
grant select,insert,update,delete on public.studio_assignments,public.studio_assignment_inputs,public.studio_employee_tokens,public.studio_employee_operations to service_role;
do $$ declare f record; begin
  for f in select oid::regprocedure as signature from pg_proc where pronamespace='public'::regnamespace and proname in ('create_studio_assignment','claim_studio_assignment','studio_employee_scope','employee_create_asset','employee_begin_revision','employee_commit_revision','cancel_studio_assignment') loop
    execute format('revoke all on function %s from public,anon,authenticated',f.signature);
    execute format('grant execute on function %s to service_role',f.signature);
  end loop;
end $$;
