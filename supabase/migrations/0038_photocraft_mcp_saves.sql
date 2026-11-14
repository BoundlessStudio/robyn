-- Preserve the same upload and receipt if a PhotoCraft save acknowledgement
-- is interrupted. Studio's normal conflict and immutable revision rules apply.
create function public.begin_studio_mcp_photocraft_save(
  p_workspace uuid, p_user uuid, p_grant uuid, p_project uuid, p_asset uuid,
  p_base uuid, p_new_asset jsonb, p_request uuid, p_session text, p_fingerprint text, p_package jsonb
)
returns jsonb language plpgsql security definer set search_path=public as $$
declare saved public.studio_revisions%rowtype; revision_id uuid;
begin
  perform public.lock_studio_mcp_grant(p_workspace,p_user,p_grant);
  perform 1 from public.studio_projects
    where workspace_id=p_workspace and id=p_project and status='active' for share;
  if not found then raise exception 'project unavailable'; end if;

  select r.* into saved from public.studio_revisions r
    join public.studio_assets a on a.workspace_id=r.workspace_id and a.id=r.asset_id
    where r.workspace_id=p_workspace and a.project_id=p_project and r.asset_id=p_asset
      and r.provenance->>'photoCraftSession'=p_session
      and r.provenance->>'photoCraftRequest'=p_request::text;
  if found then
    if saved.provenance->>'photoCraftFingerprint' is distinct from p_fingerprint then
      raise exception 'photo save identity reused';
    end if;
    if saved.state='abandoned' then raise exception 'revision is not open'; end if;
    return jsonb_build_object('revisionId',saved.id,'status',saved.state);
  end if;

  if exists (
    select 1 from jsonb_array_elements(p_package->'dependencies') ref
    where not exists (
      select 1 from public.studio_assets a
        where a.workspace_id=p_workspace and a.project_id=p_project and a.id=(ref->>'assetId')::uuid
          and a.app_id is distinct from 'mailcraft'
    )
  ) then raise exception 'dependency unavailable'; end if;
  if p_new_asset is null then
    if p_base is null or not exists (
      select 1 from public.studio_assets where workspace_id=p_workspace and project_id=p_project
        and id=p_asset and app_id='photocraft' and asset_kind='native'
    ) then raise exception 'not found'; end if;
  else
    if p_base is not null or not exists (
      select 1 from public.studio_assets a join public.studio_revisions r
        on r.workspace_id=a.workspace_id and r.asset_id=a.id
      where a.workspace_id=p_workspace and a.project_id=p_project and a.app_id='photocraft'
        and a.asset_kind='native' and a.id=(p_new_asset->'source'->>'assetId')::uuid
        and r.id=(p_new_asset->'source'->>'revisionId')::uuid and r.state='committed'
    ) or not (p_package->'dependencies' @> jsonb_build_array(p_new_asset->'source'))
      then raise exception 'source revision unavailable'; end if;
    insert into public.studio_assets(id,workspace_id,project_id,app_id,name,created_by)
      values(p_asset,p_workspace,p_project,'photocraft',p_new_asset->>'name',p_user)
      on conflict(id) do nothing;
    if not found then raise exception 'photo save identity reused'; end if;
  end if;

  revision_id:=public.begin_studio_revision(p_workspace,p_user,p_asset,p_base,p_package);
  update public.studio_revisions set provenance=provenance || jsonb_build_object(
    'photoCraftSession',p_session,'photoCraftRequest',p_request,'photoCraftFingerprint',p_fingerprint
  ) where id=revision_id;
  return jsonb_build_object('revisionId',revision_id,'status','uploading');
end $$;

create function public.commit_studio_mcp_photocraft_save(
  p_workspace uuid, p_user uuid, p_grant uuid, p_project uuid, p_revision uuid, p_session text, p_verified jsonb
)
returns jsonb language plpgsql security definer set search_path=public as $$
begin
  perform public.lock_studio_mcp_grant(p_workspace,p_user,p_grant);
  perform 1 from public.studio_projects
    where workspace_id=p_workspace and id=p_project and status='active' for share;
  if not found then raise exception 'project unavailable'; end if;
  if not exists (
    select 1 from public.studio_revisions r join public.studio_assets a
      on a.workspace_id=r.workspace_id and a.id=r.asset_id
    where r.workspace_id=p_workspace and r.id=p_revision and a.project_id=p_project
      and a.app_id='photocraft' and r.provenance->>'photoCraftSession'=p_session
  ) then raise exception 'not found'; end if;
  return public.commit_studio_revision(p_workspace,p_user,p_revision,p_verified);
end $$;

revoke all on function public.begin_studio_mcp_photocraft_save(uuid,uuid,uuid,uuid,uuid,uuid,jsonb,uuid,text,text,jsonb),
  public.commit_studio_mcp_photocraft_save(uuid,uuid,uuid,uuid,uuid,text,jsonb) from public, anon, authenticated;
grant execute on function public.begin_studio_mcp_photocraft_save(uuid,uuid,uuid,uuid,uuid,uuid,jsonb,uuid,text,text,jsonb),
  public.commit_studio_mcp_photocraft_save(uuid,uuid,uuid,uuid,uuid,text,jsonb) to service_role;
