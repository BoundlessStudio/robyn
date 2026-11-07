create function public.rename_studio_mcp_asset(
  p_workspace uuid, p_user uuid, p_grant uuid, p_project uuid, p_asset uuid, p_name text
)
returns jsonb language plpgsql security definer set search_path=public as $$
declare asset public.studio_assets%rowtype;
begin
  perform public.lock_studio_mcp_grant(p_workspace,p_user,p_grant);
  update public.studio_assets set name=p_name
    where id=p_asset and workspace_id=p_workspace and project_id=p_project and current_revision_id is not null
    returning * into asset;
  if not found then raise exception 'not found'; end if;
  return to_jsonb(asset);
end $$;

create function public.begin_studio_mcp_asset_import(
  p_workspace uuid, p_user uuid, p_grant uuid, p_project uuid, p_creation uuid,
  p_name text, p_kind text, p_package jsonb, p_import_hash text
)
returns uuid language plpgsql security definer set search_path=public as $$
declare revision_id uuid; saved public.studio_revisions%rowtype;
begin
  perform public.lock_studio_mcp_grant(p_workspace,p_user,p_grant);
  if p_import_hash is null or p_import_hash !~ '^[0-9a-f]{64}$' then raise exception 'invalid import identity'; end if;
  if p_kind='image' then
    if not exists(select 1 from public.studio_projects where id=p_project and workspace_id=p_workspace and status='active') then
      raise exception 'project archived';
    end if;
    revision_id:=public.begin_local_source_import(p_workspace,p_user,p_project,p_creation,p_name,p_kind,p_package);
  elsif p_kind='file' then
    revision_id:=public.begin_asset_bridge_import(p_workspace,p_user,p_project,p_creation,p_name,p_package);
  else
    raise exception 'invalid import kind';
  end if;
  select * into saved from public.studio_revisions where id=revision_id for update;
  if saved.provenance ? 'mcpImportHash' then
    if saved.provenance->>'mcpImportHash' is distinct from p_import_hash then raise exception 'bridge import identity reused'; end if;
  elsif saved.state='uploading' then
    update public.studio_revisions set provenance=provenance || jsonb_build_object('mcpImportHash',p_import_hash)
      where id=revision_id;
  else
    raise exception 'bridge import identity reused';
  end if;
  return revision_id;
end $$;

create function public.commit_studio_mcp_asset_import(
  p_workspace uuid, p_user uuid, p_grant uuid, p_project uuid, p_asset uuid,
  p_revision uuid, p_import_hash text, p_verified_files jsonb
)
returns jsonb language plpgsql security definer set search_path=public as $$
declare saved_state text;
begin
  perform public.lock_studio_mcp_grant(p_workspace,p_user,p_grant);
  perform 1 from public.studio_assets
    where id=p_asset and workspace_id=p_workspace and project_id=p_project
      and asset_kind in ('file','image') and created_by=p_user for update;
  if not found then raise exception 'not found'; end if;
  select state into saved_state from public.studio_revisions
    where id=p_revision and workspace_id=p_workspace and asset_id=p_asset
      and provenance->>'mcpImportHash'=p_import_hash;
  if not found then raise exception 'not found'; end if;
  if saved_state='committed' then
    return jsonb_build_object('assetId',p_asset,'revisionId',p_revision,'status',saved_state);
  end if;
  perform 1 from public.studio_projects where id=p_project and workspace_id=p_workspace and status='active' for share;
  if not found then raise exception 'project archived'; end if;
  return public.commit_studio_revision(p_workspace,p_user,p_revision,p_verified_files);
end $$;

revoke all on function public.rename_studio_mcp_asset(uuid,uuid,uuid,uuid,uuid,text),
  public.begin_studio_mcp_asset_import(uuid,uuid,uuid,uuid,uuid,text,text,jsonb,text),
  public.commit_studio_mcp_asset_import(uuid,uuid,uuid,uuid,uuid,uuid,text,jsonb) from public, anon, authenticated;
grant execute on function public.rename_studio_mcp_asset(uuid,uuid,uuid,uuid,uuid,text),
  public.begin_studio_mcp_asset_import(uuid,uuid,uuid,uuid,uuid,text,text,jsonb,text),
  public.commit_studio_mcp_asset_import(uuid,uuid,uuid,uuid,uuid,uuid,text,jsonb) to service_role;
