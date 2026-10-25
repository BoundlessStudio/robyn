-- Source originals share immutable packages and exact dependency references with
-- native documents, but have no owning Craft. Existing native rows are unchanged.
alter table public.studio_assets add column asset_kind text not null default 'native'
  check (asset_kind in ('native','image','audio','video'));
alter table public.studio_assets alter column app_id drop not null;
alter table public.studio_assets add constraint studio_asset_kind_app check
  ((asset_kind='native' and app_id is not null) or (asset_kind<>'native' and app_id is null));
alter table public.studio_revisions add column provenance jsonb not null default '{}';

create function public.restore_media_provenance() returns trigger language plpgsql set search_path=public as $$
begin
  if new.restored_from_id is not null then
    select provenance into new.provenance from public.studio_revisions
      where workspace_id=new.workspace_id and asset_id=new.asset_id and id=new.restored_from_id;
  end if;
  return new;
end $$;
create trigger studio_restore_media_provenance before insert on public.studio_revisions
  for each row execute function public.restore_media_provenance();

create function public.protect_media_dependency_scope() returns trigger language plpgsql set search_path=public as $$
begin
  if exists(select 1 from public.studio_assets source join public.studio_revisions consumer on consumer.id=new.revision_id
    join public.studio_assets target on target.id=consumer.asset_id
    where source.id=new.dependency_asset_id and source.asset_kind<>'native' and source.project_id<>target.project_id) then raise exception 'dependency unavailable'; end if;
  return new;
end $$;
create trigger studio_media_dependency_scope before insert on public.studio_revision_dependencies
  for each row execute function public.protect_media_dependency_scope();

create function public.read_source_credits(p_workspace uuid,p_revision uuid)
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare result jsonb;
begin
  if not exists(select 1 from public.studio_revisions where workspace_id=p_workspace and id=p_revision) then raise exception 'not found'; end if;
  with recursive linked(id) as (
    select p_revision
    union
    select d.dependency_revision_id from public.studio_revision_dependencies d join linked l on l.id=d.revision_id where d.workspace_id=p_workspace
  )
  select coalesce(jsonb_agg(jsonb_build_object('ref',jsonb_build_object('assetId',a.id,'revisionId',r.id),'name',a.name,'provenance',r.provenance) order by a.name,r.id),'[]') into result
    from linked l join public.studio_revisions r on r.id=l.id and r.workspace_id=p_workspace
    join public.studio_assets a on a.id=r.asset_id and a.workspace_id=p_workspace
    where r.id<>p_revision and r.provenance ? 'provider';
  return result;
end $$;
revoke all on function public.read_source_credits(uuid,uuid) from public,anon,authenticated;
grant execute on function public.read_source_credits(uuid,uuid) to service_role;

-- Save As preserves a source's kind and rights just as restore preserves them.
create or replace function public.fork_studio_revision(p_workspace uuid,p_user uuid,p_source uuid,p_name text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_source public.studio_revisions; v_original public.studio_assets; v_asset uuid; v_revision uuid; v_verified jsonb;
begin
  if not exists(select 1 from public.workspaces where id=p_workspace and owner_id=p_user) then raise exception 'not found'; end if;
  select * into v_source from public.studio_revisions where workspace_id=p_workspace and id=p_source and state in ('committed','conflict');
  if not found then raise exception 'source revision unavailable'; end if;
  select * into v_original from public.studio_assets where workspace_id=p_workspace and id=v_source.asset_id;
  insert into public.studio_assets(workspace_id,project_id,app_id,asset_kind,name,created_by)
    values(p_workspace,v_original.project_id,v_original.app_id,v_original.asset_kind,p_name,p_user) returning id into v_asset;
  insert into public.studio_revisions(workspace_id,asset_id,author_user_id,message,provenance)
    values(p_workspace,v_asset,p_user,'Saved as a new asset',v_source.provenance) returning id into v_revision;
  insert into public.studio_package_files(workspace_id,revision_id,path,role,mime_type,bytes,sha256,storage_key)
    select workspace_id,v_revision,path,role,mime_type,bytes,sha256,storage_key from public.studio_package_files where revision_id=p_source;
  insert into public.studio_revision_dependencies(workspace_id,revision_id,dependency_asset_id,dependency_revision_id)
    select workspace_id,v_revision,dependency_asset_id,dependency_revision_id from public.studio_revision_dependencies where revision_id=p_source;
  select jsonb_agg(jsonb_build_object('id',id,'bytes',bytes)) into v_verified from public.studio_package_files where revision_id=v_revision;
  insert into public.studio_activity(workspace_id,project_id,actor_user_id,kind,details)
    values(p_workspace,v_original.project_id,p_user,'asset.forked',jsonb_build_object('assetId',v_asset,'sourceAssetId',v_original.id,'sourceRevisionId',p_source));
  return public.commit_studio_revision(p_workspace,p_user,v_revision,v_verified);
end $$;

create table public.studio_media_budgets (
  workspace_id uuid primary key references public.workspaces(id) on delete cascade,
  monthly_limit_micros bigint not null default 0 check(monthly_limit_micros between 0 and 1000000000),
  updated_at timestamptz not null default now()
);
create table public.studio_media_search_cache (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  cache_key text not null, provider text not null check(provider in ('commons')),
  results jsonb not null, expires_at timestamptz not null, primary key(workspace_id,cache_key)
);
create table public.studio_media_discoveries (
  id uuid primary key default gen_random_uuid(), workspace_id uuid not null,
  project_id uuid not null, provider text not null check(provider in ('commons')),
  source_id text not null, kind text not null check(kind in ('image','video','music','sound_effect')),
  metadata jsonb not null, expires_at timestamptz not null, created_at timestamptz not null default now(),
  foreign key(workspace_id,project_id) references public.studio_projects(workspace_id,id) on delete cascade,
  unique(workspace_id,id)
);
create table public.studio_media_jobs (
  id uuid primary key default gen_random_uuid(), workspace_id uuid not null,
  project_id uuid not null, created_by uuid not null references auth.users(id),
  assignment_id uuid, employee_id uuid, employee_token_hash text, operation_id uuid not null,
  operation text not null check(operation in ('import','generate')),
  provider text not null check(provider in ('commons','perflo')),
  kind text not null check(kind in ('image','audio','video')),
  name text not null check(char_length(name) between 1 and 160),
  request jsonb not null, discovery_id uuid,
  state text not null default 'queued' check(state in ('queued','preparing','submitting','running','processing','uploading','completed','failed','uncertain','cancelled')),
  workflow_id text, instance_id text, provider_job_id text,
  reserved_micros bigint not null check(reserved_micros between 0 and 10000000),
  actual_micros bigint check(actual_micros>=0), billing_settled boolean not null default false,
  asset_id uuid, revision_id uuid, package jsonb, provider_metadata jsonb, error_code text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(workspace_id,project_id,operation_id), unique(workspace_id,id),
  foreign key(workspace_id,project_id) references public.studio_projects(workspace_id,id) on delete cascade,
  foreign key(workspace_id,discovery_id) references public.studio_media_discoveries(workspace_id,id),
  foreign key(workspace_id,assignment_id) references public.studio_assignments(workspace_id,id),
  foreign key(workspace_id,employee_id) references public.studio_employees(workspace_id,id),
  foreign key(workspace_id,asset_id,revision_id) references public.studio_revisions(workspace_id,asset_id,id),
  check ((assignment_id is null)=(employee_id is null))
);
create index studio_media_jobs_project on public.studio_media_jobs(workspace_id,project_id,created_at desc);

create function public.create_media_job(p_workspace uuid,p_user uuid,p_project uuid,p_operation uuid,p_request jsonb,p_hash text default null)
returns public.studio_media_jobs language plpgsql security definer set search_path=public as $$
declare j public.studio_media_jobs; b public.studio_media_budgets; s jsonb; amount bigint; used bigint; d public.studio_media_discoveries; ref jsonb;
begin
  if not exists(select 1 from public.workspaces w join public.studio_projects p on p.workspace_id=w.id
    where w.id=p_workspace and w.owner_id=p_user and p.id=p_project and p.status='active') then raise exception 'not found'; end if;
  if p_hash is not null then
    s:=public.studio_employee_scope(p_hash);
    if s->>'workspaceId'<>p_workspace::text or s->>'projectId'<>p_project::text or s->>'userId'<>p_user::text then raise exception 'employee access denied'; end if;
  end if;
  -- One serialized reservation per studio; racing retries cannot spend twice.
  insert into public.studio_media_budgets(workspace_id) values(p_workspace) on conflict do nothing;
  select * into b from public.studio_media_budgets where workspace_id=p_workspace for update;
  select * into j from public.studio_media_jobs where workspace_id=p_workspace and project_id=p_project and operation_id=p_operation;
  if found then
    if j.request<>p_request or j.created_by<>p_user or j.assignment_id is distinct from (s->>'assignmentId')::uuid then raise exception 'operation key reused'; end if;
    return j;
  end if;
  if p_request->>'operation' not in ('import','generate') or p_request->>'provider' not in ('commons','perflo') then raise exception 'invalid media request'; end if;
  amount:=(p_request->>'maxCostMicros')::bigint;
  if amount is null or amount<0 or amount>10000000 or (p_request->>'operation'='generate' and (amount=0 or p_request->>'provider'<>'perflo')) then raise exception 'invalid media budget'; end if;
  select coalesce(sum(case when billing_settled then actual_micros else reserved_micros end),0) into used
    from public.studio_media_jobs where workspace_id=p_workspace and
      (created_at>=date_trunc('month',now() at time zone 'UTC') at time zone 'UTC' or not billing_settled);
  if amount>0 and used+amount>b.monthly_limit_micros then raise exception 'media budget exhausted'; end if;
  if p_request->>'operation'='import' then
    select * into d from public.studio_media_discoveries where id=(p_request->>'discoveryId')::uuid and workspace_id=p_workspace and project_id=p_project and expires_at>now();
    if not found or d.provider<>p_request->>'provider' or
      (case when d.kind in ('music','sound_effect') then 'audio' else d.kind end)<>p_request->>'kind' then raise exception 'media discovery unavailable'; end if;
  end if;
  if (select count(*) from public.studio_media_jobs where workspace_id=p_workspace and state not in ('completed','failed','cancelled','uncertain'))>=3 then raise exception 'media capacity reached'; end if;
  for ref in select * from jsonb_array_elements(coalesce(p_request->'inputs','[]')) loop
    if not exists(select 1 from public.studio_assets a join public.studio_revisions r on r.asset_id=a.id
      where a.workspace_id=p_workspace and a.project_id=p_project and a.id=(ref->>'assetId')::uuid and r.id=(ref->>'revisionId')::uuid and r.state='committed') then raise exception 'dependency unavailable'; end if;
  end loop;
  insert into public.studio_media_jobs(workspace_id,project_id,created_by,assignment_id,employee_id,employee_token_hash,operation_id,operation,provider,kind,name,request,discovery_id,reserved_micros)
    values(p_workspace,p_project,p_user,(s->>'assignmentId')::uuid,(s->>'employeeId')::uuid,p_hash,p_operation,p_request->>'operation',p_request->>'provider',p_request->>'kind',p_request->>'name',p_request,d.id,amount) returning * into j;
  return j;
end $$;

create function public.claim_media_job(p_workspace uuid,p_user uuid,p_job uuid,p_workflow text)
returns boolean language plpgsql security definer set search_path=public as $$
declare j public.studio_media_jobs;
begin
  select * into j from public.studio_media_jobs where workspace_id=p_workspace and created_by=p_user and id=p_job for update;
  if not found then raise exception 'not found'; end if;
  if j.state in ('completed','failed','cancelled') then return false; end if;
  if j.workflow_id is not null and j.workflow_id<>p_workflow then return false; end if;
  update public.studio_media_jobs set workflow_id=p_workflow,state=case when state='queued' then 'preparing' else state end,updated_at=now() where id=p_job;
  return true;
end $$;

create function public.prepare_media_package(p_workspace uuid,p_user uuid,p_job uuid,p_package jsonb,p_provenance jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
declare j public.studio_media_jobs; a uuid; r uuid; f jsonb; ref jsonb;
begin
  select * into j from public.studio_media_jobs where workspace_id=p_workspace and created_by=p_user and id=p_job for update;
  if not found then raise exception 'not found'; end if;
  if j.revision_id is not null then
    if j.package<>p_package then raise exception 'operation key reused'; end if;
    return jsonb_build_object('assetId',j.asset_id,'revisionId',j.revision_id);
  end if;
  if j.state not in ('processing','uploading') then raise exception 'media job not ready'; end if;
  if j.assignment_id is not null then
    perform 1 from public.studio_assignments where id=j.assignment_id and state='running' for update;
    if not found then raise exception 'employee access denied'; end if;
    perform 1 from public.studio_employee_tokens where token_hash=j.employee_token_hash for update;
    perform public.studio_employee_scope(j.employee_token_hash);
  end if;
  if not exists(select 1 from public.studio_projects where id=j.project_id and status='active') then raise exception 'not found'; end if;
  if jsonb_typeof(p_package->'files')<>'array' or jsonb_array_length(p_package->'files') not between 1 and 10
    or (select count(*) from jsonb_array_elements(p_package->'files') candidate where candidate->>'role'='master' and candidate->>'mimeType' like j.kind||'/%')<>1
    or p_provenance->>'provider' is distinct from j.provider then raise exception 'invalid media package'; end if;
  insert into public.studio_assets(workspace_id,project_id,app_id,asset_kind,name,created_by) values(p_workspace,j.project_id,null,j.kind,j.name,p_user) returning id into a;
  insert into public.studio_revisions(workspace_id,asset_id,author_user_id,author_employee_id,assignment_id,provenance,message)
    values(p_workspace,a,p_user,j.employee_id,j.assignment_id,p_provenance,'Acquired source media') returning id into r;
  for f in select * from jsonb_array_elements(p_package->'files') loop
    insert into public.studio_package_files(workspace_id,revision_id,path,role,mime_type,bytes,sha256,storage_key)
      values(p_workspace,r,f->>'path',f->>'role',f->>'mimeType',(f->>'bytes')::bigint,f->>'sha256',p_workspace::text||'/'||j.project_id::text||'/'||a::text||'/'||r::text||'/'||gen_random_uuid()::text);
  end loop;
  for ref in select * from jsonb_array_elements(coalesce(j.request->'inputs','[]')) loop
    insert into public.studio_revision_dependencies values(p_workspace,r,(ref->>'assetId')::uuid,(ref->>'revisionId')::uuid);
  end loop;
  update public.studio_media_jobs set asset_id=a,revision_id=r,package=p_package,state='uploading',updated_at=now() where id=p_job;
  return jsonb_build_object('assetId',a,'revisionId',r);
end $$;

create function public.complete_media_job(p_workspace uuid,p_user uuid,p_job uuid,p_verified jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
declare j public.studio_media_jobs; result jsonb;
begin
  select * into j from public.studio_media_jobs where workspace_id=p_workspace and created_by=p_user and id=p_job for update;
  if not found then raise exception 'not found'; end if;
  if j.state='completed' then return jsonb_build_object('assetId',j.asset_id,'revisionId',j.revision_id,'status','committed'); end if;
  if j.state<>'uploading' then raise exception 'media job not ready'; end if;
  if j.assignment_id is not null then
    perform 1 from public.studio_assignments where id=j.assignment_id and state='running' for update;
    if not found then raise exception 'employee access denied'; end if;
    perform 1 from public.studio_employee_tokens where token_hash=j.employee_token_hash for update;
    perform public.studio_employee_scope(j.employee_token_hash);
  end if;
  if not exists(select 1 from public.studio_projects where id=j.project_id and status='active') then raise exception 'not found'; end if;
  result:=public.commit_studio_revision(p_workspace,p_user,j.revision_id,p_verified);
  update public.studio_media_jobs set state='completed',updated_at=now() where id=p_job;
  return result;
end $$;

do $$ declare t text; fn regprocedure; begin
  foreach t in array array['studio_media_budgets','studio_media_search_cache','studio_media_discoveries','studio_media_jobs'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('revoke all on public.%I from public,anon,authenticated',t);
    execute format('grant select,insert,update,delete on public.%I to service_role',t);
  end loop;
  for fn in select oid::regprocedure from pg_proc where pronamespace='public'::regnamespace and proname in ('create_media_job','claim_media_job','prepare_media_package','complete_media_job') loop
    execute format('revoke all on function %s from public,anon,authenticated',fn);
    execute format('grant execute on function %s to service_role',fn);
  end loop;
end $$;


