-- Keep native filenames in the package manifest. Storage object names use
-- internal ASCII identifiers, so TUS accepts Unicode and editorial filenames.
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
        p_workspace::text || '/' || v_asset.project_id::text || '/' || p_asset::text || '/' || v_revision::text || '/' || gen_random_uuid()::text);
  end loop;
  for v_ref in select * from jsonb_array_elements(coalesce(p_package->'dependencies', '[]'::jsonb)) loop
    if not exists(select 1 from public.studio_revisions where workspace_id = p_workspace and asset_id = (v_ref->>'assetId')::uuid and id = (v_ref->>'revisionId')::uuid and state = 'committed') then raise exception 'dependency unavailable'; end if;
    insert into public.studio_revision_dependencies values(p_workspace, v_revision, (v_ref->>'assetId')::uuid, (v_ref->>'revisionId')::uuid);
  end loop;
  return v_revision;
end;
$$;


-- Repair only unfinished legacy transfers with unsupported non-ASCII keys and
-- no stored object. Confirmed packages and existing bytes remain immutable.
update public.studio_package_files f
set storage_key=f.workspace_id::text||'/'||a.project_id::text||'/'||a.id::text||'/'||r.id::text||'/'||f.id::text
from public.studio_revisions r, public.studio_assets a
where f.revision_id=r.id and r.asset_id=a.id and r.state='uploading'
  and f.storage_key !~ '^[ -~]+$'
  and not exists(select 1 from storage.objects o where o.bucket_id='studio-assets' and o.name=f.storage_key);

revoke all on function public.begin_studio_revision(uuid,uuid,uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.begin_studio_revision(uuid,uuid,uuid,uuid,jsonb) to service_role;
