-- A preserved conflicting save can become an independent asset without
-- overwriting either participant's work or uploading identical bytes again.
create or replace function public.fork_studio_revision(p_workspace uuid, p_user uuid, p_source uuid, p_name text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_source public.studio_revisions%rowtype; v_original public.studio_assets%rowtype; v_asset uuid; v_revision uuid; v_verified jsonb;
begin
  if not exists(select 1 from public.workspaces where id=p_workspace and owner_id=p_user) then raise exception 'not found'; end if;
  select * into v_source from public.studio_revisions where workspace_id=p_workspace and id=p_source and state in ('committed','conflict');
  if not found then raise exception 'source revision unavailable'; end if;
  select * into v_original from public.studio_assets where workspace_id=p_workspace and id=v_source.asset_id;
  insert into public.studio_assets(workspace_id,project_id,app_id,name,created_by)
    values(p_workspace,v_original.project_id,v_original.app_id,p_name,p_user) returning id into v_asset;
  insert into public.studio_revisions(workspace_id,asset_id,author_user_id,message)
    values(p_workspace,v_asset,p_user,'Saved as a new asset') returning id into v_revision;
  insert into public.studio_package_files(workspace_id,revision_id,path,role,mime_type,bytes,sha256,storage_key)
    select workspace_id,v_revision,path,role,mime_type,bytes,sha256,storage_key from public.studio_package_files where revision_id=p_source;
  insert into public.studio_revision_dependencies(workspace_id,revision_id,dependency_asset_id,dependency_revision_id)
    select workspace_id,v_revision,dependency_asset_id,dependency_revision_id from public.studio_revision_dependencies where revision_id=p_source;
  select jsonb_agg(jsonb_build_object('id',id,'bytes',bytes)) into v_verified from public.studio_package_files where revision_id=v_revision;
  insert into public.studio_activity(workspace_id,project_id,actor_user_id,kind,details)
    values(p_workspace,v_original.project_id,p_user,'asset.forked',jsonb_build_object('assetId',v_asset,'sourceAssetId',v_original.id,'sourceRevisionId',p_source));
  return public.commit_studio_revision(p_workspace,p_user,v_revision,v_verified);
end;
$$;
revoke all on function public.fork_studio_revision(uuid,uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.fork_studio_revision(uuid,uuid,uuid,text) to service_role;
