-- A local source is independent of any Craft. Create its asset and initial
-- revision atomically; replay the exact request after an uncertain response.
-- The existing source revision route remains closed to arbitrary later edits.
create function public.begin_local_source_import(p_workspace uuid,p_user uuid,p_project uuid,p_creation uuid,p_name text,p_kind text,p_package jsonb)
returns uuid language plpgsql security definer set search_path=public as $$
declare a public.studio_assets; r public.studio_revisions; created uuid; revision uuid; requested jsonb; prior jsonb;
begin
  if not exists(select 1 from public.workspaces where id=p_workspace and owner_id=p_user)
    or not exists(select 1 from public.studio_projects where id=p_project and workspace_id=p_workspace) then raise exception 'not found'; end if;
  if p_kind not in ('image','audio','video') or length(trim(p_name)) not between 1 and 160
    or jsonb_typeof(p_package->'files') is distinct from 'array' or jsonb_array_length(p_package->'files') not between 1 and 2
    or coalesce(p_package->'dependencies','[]'::jsonb)<>'[]'::jsonb then raise exception 'invalid source import'; end if;
  if (select count(*) from jsonb_array_elements(p_package->'files') f where f->>'role'='master')<>1
    or exists(select 1 from jsonb_array_elements(p_package->'files') f where f->>'role' not in ('master','export') or (f->>'bytes')::bigint not between 1 and 268435456 or f->>'mimeType' not like p_kind||'/%') then raise exception 'invalid source import'; end if;
  insert into public.studio_assets(id,workspace_id,project_id,app_id,asset_kind,name,created_by)
    values(p_creation,p_workspace,p_project,null,p_kind,p_name,p_user)
    on conflict(id) do nothing returning id into created;
  select * into a from public.studio_assets where id=p_creation and workspace_id=p_workspace and project_id=p_project and created_by=p_user for update;
  if not found or a.app_id is not null or a.asset_kind<>p_kind or a.name<>p_name then raise exception 'source import identity reused'; end if;
  if created is null then
    select * into r from public.studio_revisions where asset_id=a.id and workspace_id=p_workspace and provenance->>'origin'='local' order by created_at,id limit 1;
    if not found or r.state not in ('uploading','committed') then raise exception 'source import identity reused'; end if;
    select jsonb_agg(jsonb_build_object('path',path,'role',role,'mimeType',mime_type,'bytes',bytes,'sha256',sha256) order by path) into prior
      from public.studio_package_files where revision_id=r.id and workspace_id=p_workspace;
    select jsonb_agg(f order by f->>'path') into requested from jsonb_array_elements(p_package->'files') f;
    if prior is distinct from requested then raise exception 'source import identity reused'; end if;
    return r.id;
  end if;
  revision:=public.begin_studio_revision(p_workspace,p_user,p_creation,null,p_package||jsonb_build_object('message','Imported original'));
  update public.studio_revisions set provenance=jsonb_build_object('origin','local') where id=revision and state='uploading';
  return revision;
end $$;
revoke all on function public.begin_local_source_import(uuid,uuid,uuid,uuid,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.begin_local_source_import(uuid,uuid,uuid,uuid,text,text,jsonb) to service_role;
