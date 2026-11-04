-- Generic file collections share the private immutable revision library.
-- Empty files are meaningful in directory snapshots; other intake routes keep
-- their existing nonempty-file validation.
alter table public.studio_assets drop constraint studio_assets_asset_kind_check;
alter table public.studio_assets add constraint studio_assets_asset_kind_check
  check (asset_kind in ('native','image','audio','video','file'));
alter table public.studio_package_files drop constraint studio_package_files_bytes_check;
alter table public.studio_package_files add constraint studio_package_files_bytes_check
  check (bytes between 0 and 10737418240);

create function public.begin_asset_bridge_import(p_workspace uuid,p_user uuid,p_project uuid,p_creation uuid,p_name text,p_package jsonb)
returns uuid language plpgsql security definer set search_path=public as $$
declare a public.studio_assets; r public.studio_revisions; created uuid; revision uuid; requested jsonb; prior jsonb;
begin
  if not exists(select 1 from public.workspaces where id=p_workspace and owner_id=p_user)
    or not exists(select 1 from public.studio_projects where id=p_project and workspace_id=p_workspace and status='active') then raise exception 'not found'; end if;
  if p_name is null or length(trim(p_name)) not between 1 and 160
    or jsonb_typeof(p_package->'files') is distinct from 'array' or jsonb_array_length(p_package->'files') not between 1 and 200
    or p_package->'dependencies' is distinct from '[]'::jsonb then raise exception 'invalid bridge import'; end if;
  if (select count(*) from jsonb_array_elements(p_package->'files') f where f->>'role'='master')<>1
    or exists(select 1 from jsonb_array_elements(p_package->'files') f where f->>'role' is null or f->>'role' not in ('master','dependency')
      or f->>'mimeType' is distinct from 'application/octet-stream' or (f->>'bytes')::bigint not between 0 and 536870912)
    or (select sum((f->>'bytes')::bigint) from jsonb_array_elements(p_package->'files') f)>1073741824 then raise exception 'invalid bridge import'; end if;
  insert into public.studio_assets(id,workspace_id,project_id,app_id,asset_kind,name,created_by)
    values(p_creation,p_workspace,p_project,null,'file',p_name,p_user)
    on conflict(id) do nothing returning id into created;
  select * into a from public.studio_assets where id=p_creation and workspace_id=p_workspace and project_id=p_project and created_by=p_user for update;
  if not found or a.app_id is not null or a.asset_kind<>'file' then raise exception 'bridge import identity reused'; end if;
  if created is null then
    select * into r from public.studio_revisions where asset_id=a.id and workspace_id=p_workspace and provenance->>'origin'='asset-bridge' order by created_at,id limit 1;
    if not found or r.state not in ('uploading','committed') or r.provenance->>'importName' is distinct from p_name then raise exception 'bridge import identity reused'; end if;
    select jsonb_agg(jsonb_build_object('path',path,'role',role,'mimeType',mime_type,'bytes',bytes,'sha256',sha256) order by path) into prior
      from public.studio_package_files where revision_id=r.id and workspace_id=p_workspace;
    select jsonb_agg(f order by f->>'path') into requested from jsonb_array_elements(p_package->'files') f;
    if prior is distinct from requested or r.message is distinct from p_package->>'message' then raise exception 'bridge import identity reused'; end if;
    return r.id;
  end if;
  revision:=public.begin_studio_revision(p_workspace,p_user,p_creation,null,p_package);
  update public.studio_revisions set provenance=jsonb_build_object('origin','asset-bridge','importName',p_name) where id=revision and state='uploading';
  return revision;
end $$;
revoke all on function public.begin_asset_bridge_import(uuid,uuid,uuid,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.begin_asset_bridge_import(uuid,uuid,uuid,uuid,text,jsonb) to service_role;
