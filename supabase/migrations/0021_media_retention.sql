-- Expired search results are disposable only when no acquisition references
-- them. Storage objects and saved revision dependencies are never deleted here.
create index studio_media_discoveries_expiry on public.studio_media_discoveries(workspace_id,expires_at);
create index studio_media_cache_expiry on public.studio_media_search_cache(workspace_id,expires_at);
create function public.prune_studio_media_search(p_workspace uuid,p_user uuid)
returns integer language plpgsql security definer set search_path=public as $$
declare removed integer; caches integer;
begin
  if not exists(select 1 from workspaces where id=p_workspace and owner_id=p_user) then raise exception 'not found'; end if;
  delete from studio_media_discoveries where id in (
    select d.id from studio_media_discoveries d where d.workspace_id=p_workspace and d.expires_at<now()
      and not exists(select 1 from studio_media_jobs j where j.discovery_id=d.id)
      order by d.expires_at limit 500 for update skip locked);
  get diagnostics removed=row_count;
  delete from studio_media_search_cache where (workspace_id,cache_key) in (
    select workspace_id,cache_key from studio_media_search_cache where workspace_id=p_workspace and expires_at<now()
      order by expires_at limit 500 for update skip locked);
  get diagnostics caches=row_count;
  return removed+caches;
end $$;
revoke all on function public.prune_studio_media_search(uuid,uuid) from public,anon,authenticated;
grant execute on function public.prune_studio_media_search(uuid,uuid) to service_role;
