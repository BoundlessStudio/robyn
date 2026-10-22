-- Invited solo creators own one private studio. Memberships remain for the
-- starter's server boundary, but studio APIs also require workspace ownership.
create unique index if not exists workspaces_one_per_owner on public.workspaces(owner_id);
create unique index if not exists agents_workspace_identity on public.agents(workspace_id, agent37_id);

create table if not exists public.studio_employees (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  employee_key text not null,
  kind text not null check (kind in ('director', 'specialist')),
  app_id text,
  role text not null,
  manifest_version text not null,
  instructions text not null,
  instance_id text unique,
  provision_state text not null default 'unprovisioned' check (provision_state in ('unprovisioned', 'provisioning', 'ready', 'failed')),
  created_at timestamptz not null default now(),
  unique (workspace_id, employee_key),
  unique (workspace_id, id),
  foreign key (workspace_id, instance_id) references public.agents(workspace_id, agent37_id) on delete set null (instance_id),
  check ((kind = 'director' and app_id is null) or (kind = 'specialist' and app_id is not null))
);

create table if not exists public.studio_projects (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 120),
  brief text not null default '' check (char_length(brief) <= 20000),
  status text not null default 'active' check (status in ('active', 'archived')),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, id)
);

create table if not exists public.studio_assets (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  project_id uuid not null,
  app_id text not null,
  name text not null check (char_length(trim(name)) between 1 and 160),
  current_revision_id uuid,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  unique (workspace_id, id),
  foreign key (workspace_id, project_id) references public.studio_projects(workspace_id, id) on delete cascade
);

create table if not exists public.studio_revisions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  asset_id uuid not null,
  base_revision_id uuid,
  revision_number integer,
  state text not null default 'uploading' check (state in ('uploading', 'committed', 'conflict', 'abandoned')),
  message text not null default '' check (char_length(message) <= 1000),
  author_user_id uuid not null references auth.users(id),
  author_employee_id uuid,
  restored_from_id uuid,
  created_at timestamptz not null default now(),
  finalized_at timestamptz,
  unique (workspace_id, id),
  unique (workspace_id, asset_id, id),
  unique (asset_id, revision_number),
  foreign key (workspace_id, asset_id) references public.studio_assets(workspace_id, id) on delete cascade,
  foreign key (workspace_id, asset_id, base_revision_id) references public.studio_revisions(workspace_id, asset_id, id),
  foreign key (workspace_id, asset_id, restored_from_id) references public.studio_revisions(workspace_id, asset_id, id),
  foreign key (workspace_id, author_employee_id) references public.studio_employees(workspace_id, id)
);

do $$ begin
  if not exists(select 1 from pg_constraint where conname = 'studio_assets_current_revision_fk') then
    alter table public.studio_assets add constraint studio_assets_current_revision_fk
      foreign key (workspace_id, id, current_revision_id) references public.studio_revisions(workspace_id, asset_id, id) deferrable initially deferred;
  end if;
end $$;

create table if not exists public.studio_package_files (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  revision_id uuid not null,
  path text not null check (char_length(path) between 1 and 512 and path !~ '(^/|(^|/)\.\.?(/|$)|\\|[[:cntrl:]])'),
  role text not null check (role in ('master', 'preview', 'export', 'dependency')),
  mime_type text not null,
  bytes bigint not null check (bytes between 1 and 10737418240),
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  storage_key text not null check (left(storage_key, 37) = workspace_id::text || '/'),
  unique (revision_id, path),
  foreign key (workspace_id, revision_id) references public.studio_revisions(workspace_id, id) on delete cascade
);
create unique index if not exists studio_one_master on public.studio_package_files(revision_id) where role = 'master';
create unique index if not exists studio_package_path_casefold on public.studio_package_files(revision_id, lower(path));

create table if not exists public.studio_revision_dependencies (
  workspace_id uuid not null,
  revision_id uuid not null,
  dependency_asset_id uuid not null,
  dependency_revision_id uuid not null,
  primary key (revision_id, dependency_revision_id),
  foreign key (workspace_id, revision_id) references public.studio_revisions(workspace_id, id) on delete cascade,
  foreign key (workspace_id, dependency_asset_id, dependency_revision_id) references public.studio_revisions(workspace_id, asset_id, id),
  check (revision_id <> dependency_revision_id)
);

create table if not exists public.studio_activity (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  project_id uuid,
  actor_user_id uuid references auth.users(id),
  kind text not null,
  details jsonb not null default '{}',
  created_at timestamptz not null default now(),
  foreign key (workspace_id, project_id) references public.studio_projects(workspace_id, id) on delete cascade
);

create index if not exists studio_projects_workspace on public.studio_projects(workspace_id, updated_at desc);
create index if not exists studio_assets_project on public.studio_assets(workspace_id, project_id);
create index if not exists studio_revisions_asset on public.studio_revisions(workspace_id, asset_id, created_at desc);
create index if not exists studio_activity_project on public.studio_activity(workspace_id, project_id, created_at desc);

create or replace function public.initialize_studio(p_owner uuid, p_profiles jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_workspace uuid; v_profile jsonb;
begin
  if jsonb_typeof(p_profiles) <> 'array' or jsonb_array_length(p_profiles) > 100 then raise exception 'invalid profiles'; end if;
  insert into public.workspaces(name, owner_id) values ('My creative studio', p_owner)
    on conflict (owner_id) do update set owner_id = excluded.owner_id returning id into v_workspace;
  insert into public.memberships(workspace_id, user_id, role) values (v_workspace, p_owner, 'admin') on conflict do nothing;
  for v_profile in select * from jsonb_array_elements(p_profiles) loop
    insert into public.studio_employees(workspace_id, employee_key, kind, app_id, role, manifest_version, instructions)
      values (v_workspace, v_profile->>'key', v_profile->>'kind', v_profile->>'appId', v_profile->>'role', v_profile->>'version', v_profile->>'instructions')
      on conflict (workspace_id, employee_key) do nothing;
  end loop;
  -- Existing employee versions/instructions never change just because a module
  -- was added. Upgrades must be an explicit operation on that employee.
  return v_workspace;
end;
$$;

create or replace function public.begin_studio_revision(p_workspace uuid, p_user uuid, p_asset uuid, p_base uuid, p_package jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_asset public.studio_assets%rowtype; v_revision uuid; v_file jsonb; v_ref jsonb;
begin
  if not exists(select 1 from public.workspaces where id = p_workspace and owner_id = p_user) then raise exception 'not found'; end if;
  select * into v_asset from public.studio_assets where workspace_id = p_workspace and id = p_asset;
  if not found then raise exception 'not found'; end if;
  if jsonb_typeof(p_package->'files') <> 'array' or jsonb_array_length(p_package->'files') not between 1 and 200 then raise exception 'invalid files'; end if;
  if (select count(*) from jsonb_array_elements(p_package->'files') f where f->>'role' = 'master') <> 1 then raise exception 'native master required'; end if;
  if p_base is not null and not exists(select 1 from public.studio_revisions where workspace_id = p_workspace and asset_id = p_asset and id = p_base and state = 'committed') then raise exception 'invalid base revision'; end if;
  insert into public.studio_revisions(workspace_id, asset_id, base_revision_id, message, author_user_id)
    values (p_workspace, p_asset, p_base, coalesce(p_package->>'message', ''), p_user) returning id into v_revision;
  for v_file in select * from jsonb_array_elements(p_package->'files') loop
    insert into public.studio_package_files(workspace_id, revision_id, path, role, mime_type, bytes, sha256, storage_key)
      values (p_workspace, v_revision, v_file->>'path', v_file->>'role', v_file->>'mimeType', (v_file->>'bytes')::bigint, v_file->>'sha256',
        p_workspace::text || '/' || v_asset.project_id::text || '/' || p_asset::text || '/' || v_revision::text || '/' || (v_file->>'path'));
  end loop;
  for v_ref in select * from jsonb_array_elements(coalesce(p_package->'dependencies', '[]'::jsonb)) loop
    if not exists(select 1 from public.studio_revisions where workspace_id = p_workspace and asset_id = (v_ref->>'assetId')::uuid and id = (v_ref->>'revisionId')::uuid and state = 'committed') then raise exception 'dependency unavailable'; end if;
    insert into public.studio_revision_dependencies values(p_workspace, v_revision, (v_ref->>'assetId')::uuid, (v_ref->>'revisionId')::uuid);
  end loop;
  return v_revision;
end;
$$;

create or replace function public.commit_studio_revision(p_workspace uuid, p_user uuid, p_revision uuid, p_verified_files jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_revision public.studio_revisions%rowtype; v_asset public.studio_assets%rowtype; v_state text; v_number integer;
begin
  if not exists(select 1 from public.workspaces where id = p_workspace and owner_id = p_user) then raise exception 'not found'; end if;
  select * into v_revision from public.studio_revisions where workspace_id = p_workspace and id = p_revision;
  if not found then raise exception 'not found'; end if;
  -- All commits on an asset serialize on this row, including retries on the
  -- same revision. Re-read the revision after acquiring the lock.
  select * into v_asset from public.studio_assets where workspace_id = p_workspace and id = v_revision.asset_id for update;
  select * into v_revision from public.studio_revisions where workspace_id = p_workspace and id = p_revision for update;
  if v_revision.state in ('committed', 'conflict') then return jsonb_build_object('assetId', v_asset.id, 'revisionId', v_revision.id, 'status', v_revision.state); end if;
  if v_revision.state <> 'uploading' then raise exception 'revision is not open'; end if;
  -- This attestation comes only from the BFF, after Storage confirms each
  -- immutable object and its size. It is never accepted from browser input.
  if jsonb_typeof(p_verified_files) <> 'array' or jsonb_array_length(p_verified_files) <> (select count(*) from public.studio_package_files where revision_id = p_revision) then raise exception 'incomplete upload'; end if;
  if exists(select 1 from public.studio_package_files f where f.revision_id = p_revision and not exists(
    select 1 from jsonb_array_elements(p_verified_files) v where v->>'id' = f.id::text and (v->>'bytes')::bigint = f.bytes
  )) then raise exception 'incomplete upload'; end if;
  if not exists(select 1 from public.studio_package_files where revision_id = p_revision and role = 'master') then raise exception 'native master required'; end if;
  v_state := case when v_asset.current_revision_id is not distinct from v_revision.base_revision_id then 'committed' else 'conflict' end;
  if v_state = 'committed' then
    select coalesce(max(revision_number), 0) + 1 into v_number from public.studio_revisions where asset_id = v_asset.id;
  end if;
  update public.studio_revisions set state = v_state, revision_number = v_number, finalized_at = now() where id = p_revision;
  if v_state = 'committed' then update public.studio_assets set current_revision_id = p_revision where id = v_asset.id; end if;
  insert into public.studio_activity(workspace_id, project_id, actor_user_id, kind, details)
    values (p_workspace, v_asset.project_id, p_user, 'revision.' || v_state, jsonb_build_object('assetId',v_asset.id,'revisionId',p_revision,'baseRevisionId',v_revision.base_revision_id));
  update public.studio_projects set updated_at = now() where id = v_asset.project_id;
  return jsonb_build_object('assetId',v_asset.id,'revisionId',p_revision,'status',v_state);
end;
$$;

create or replace function public.restore_studio_revision(p_workspace uuid, p_user uuid, p_asset uuid, p_source uuid, p_expected_base uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_asset public.studio_assets%rowtype; v_revision uuid; v_verified jsonb;
begin
  if not exists(select 1 from public.workspaces where id = p_workspace and owner_id = p_user) then raise exception 'not found'; end if;
  select * into v_asset from public.studio_assets where workspace_id = p_workspace and id = p_asset for update;
  if not found then raise exception 'not found'; end if;
  if not exists(select 1 from public.studio_revisions where workspace_id = p_workspace and asset_id = p_asset and id = p_source and state = 'committed') then raise exception 'source revision unavailable'; end if;
  insert into public.studio_revisions(workspace_id, asset_id, base_revision_id, message, author_user_id, restored_from_id)
    values(p_workspace,p_asset,p_expected_base,'Restored a previous saved revision',p_user,p_source) returning id into v_revision;
  insert into public.studio_package_files(workspace_id, revision_id, path, role, mime_type, bytes, sha256, storage_key)
    select workspace_id,v_revision,path,role,mime_type,bytes,sha256,storage_key from public.studio_package_files where revision_id = p_source;
  insert into public.studio_revision_dependencies(workspace_id, revision_id, dependency_asset_id, dependency_revision_id)
    select workspace_id,v_revision,dependency_asset_id,dependency_revision_id from public.studio_revision_dependencies where revision_id = p_source;
  select jsonb_agg(jsonb_build_object('id',id,'bytes',bytes)) into v_verified from public.studio_package_files where revision_id = v_revision;
  return public.commit_studio_revision(p_workspace,p_user,v_revision,v_verified);
end;
$$;

create or replace function public.protect_final_studio_revision()
returns trigger language plpgsql set search_path = public as $$
begin
  if old.state in ('committed','conflict') and new is distinct from old then raise exception 'saved revisions are immutable'; end if;
  return new;
end;
$$;
drop trigger if exists studio_revision_immutable on public.studio_revisions;
create trigger studio_revision_immutable before update on public.studio_revisions for each row execute function public.protect_final_studio_revision();

create or replace function public.protect_final_studio_package()
returns trigger language plpgsql set search_path = public as $$
begin
  if exists(select 1 from public.studio_revisions where id = new.revision_id and state in ('committed','conflict')) then raise exception 'saved revision packages are immutable'; end if;
  if tg_op = 'UPDATE' and exists(select 1 from public.studio_revisions where id = old.revision_id and state in ('committed','conflict')) then raise exception 'saved revision packages are immutable'; end if;
  return new;
end;
$$;
drop trigger if exists studio_files_immutable on public.studio_package_files;
create trigger studio_files_immutable before insert or update on public.studio_package_files for each row execute function public.protect_final_studio_package();
drop trigger if exists studio_dependencies_immutable on public.studio_revision_dependencies;
create trigger studio_dependencies_immutable before insert or update on public.studio_revision_dependencies for each row execute function public.protect_final_studio_package();

alter table public.studio_employees enable row level security;
alter table public.studio_projects enable row level security;
alter table public.studio_assets enable row level security;
alter table public.studio_revisions enable row level security;
alter table public.studio_package_files enable row level security;
alter table public.studio_revision_dependencies enable row level security;
alter table public.studio_activity enable row level security;
revoke all on public.studio_employees, public.studio_projects, public.studio_assets, public.studio_revisions, public.studio_package_files, public.studio_revision_dependencies, public.studio_activity from anon, authenticated;
grant select, insert, update, delete on public.studio_employees, public.studio_projects, public.studio_assets, public.studio_revisions, public.studio_package_files, public.studio_revision_dependencies, public.studio_activity to service_role;
revoke all on function public.initialize_studio(uuid,jsonb), public.begin_studio_revision(uuid,uuid,uuid,uuid,jsonb), public.commit_studio_revision(uuid,uuid,uuid,jsonb), public.restore_studio_revision(uuid,uuid,uuid,uuid,uuid) from public, anon, authenticated;
grant execute on function public.initialize_studio(uuid,jsonb), public.begin_studio_revision(uuid,uuid,uuid,uuid,jsonb), public.commit_studio_revision(uuid,uuid,uuid,jsonb), public.restore_studio_revision(uuid,uuid,uuid,uuid,uuid) to service_role;
