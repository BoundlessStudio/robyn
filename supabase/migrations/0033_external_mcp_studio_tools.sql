-- Take locks in the same workspace-first order as Studio assignment writes.
-- A concurrent grant revocation must wait for the current mutation or win first.
create function public.lock_studio_mcp_grant(p_workspace uuid, p_user uuid, p_grant uuid)
returns void language plpgsql set search_path=public as $$
begin
  perform 1 from public.workspaces where id=p_workspace and owner_id=p_user for no key update;
  if not found then raise exception 'not found'; end if;
  perform 1 from public.studio_mcp_grants
    where id=p_grant and workspace_id=p_workspace and user_id=p_user for share;
  if not found or not public.studio_mcp_grant_active(p_grant,p_workspace,p_user) then
    raise exception 'not found';
  end if;
end $$;

create function public.create_studio_mcp_project(
  p_workspace uuid, p_user uuid, p_grant uuid, p_creation uuid, p_name text, p_brief text
)
returns jsonb language plpgsql security definer set search_path=public as $$
declare project public.studio_projects%rowtype;
begin
  perform public.lock_studio_mcp_grant(p_workspace,p_user,p_grant);
  insert into public.studio_projects(id,workspace_id,created_by,name,brief)
    values(p_creation,p_workspace,p_user,p_name,p_brief)
    on conflict (id) do nothing returning * into project;
  if not found then
    select * into project from public.studio_projects
      where id=p_creation and workspace_id=p_workspace and created_by=p_user;
    if not found then raise exception 'creation id reused'; end if;
  end if;
  return to_jsonb(project);
end $$;

create function public.update_studio_mcp_project(
  p_workspace uuid, p_user uuid, p_grant uuid, p_project uuid,
  p_expected_updated_at timestamptz, p_name text, p_brief text
)
returns jsonb language plpgsql security definer set search_path=public as $$
declare project public.studio_projects%rowtype;
begin
  perform public.lock_studio_mcp_grant(p_workspace,p_user,p_grant);
  select * into project from public.studio_projects
    where id=p_project and workspace_id=p_workspace for update;
  if not found then raise exception 'not found'; end if;
  if p_expected_updated_at is distinct from project.updated_at then raise exception 'project changed'; end if;
  update public.studio_projects
    set name=coalesce(p_name,project.name), brief=coalesce(p_brief,project.brief),
      updated_at=greatest(clock_timestamp(),project.updated_at + interval '1 microsecond')
    where id=project.id returning * into project;
  return to_jsonb(project);
end $$;

create function public.cancel_studio_mcp_job(
  p_workspace uuid, p_user uuid, p_grant uuid, p_project uuid, p_assignment uuid
)
returns jsonb language plpgsql security definer set search_path=public as $$
begin
  perform public.lock_studio_mcp_grant(p_workspace,p_user,p_grant);
  perform 1 from public.studio_assignments
    where id=p_assignment and workspace_id=p_workspace and project_id=p_project and execution_model='robyn' for update;
  if not found then raise exception 'not found'; end if;
  return public.cancel_studio_assignment(p_workspace,p_user,p_assignment);
end $$;

revoke all on function public.lock_studio_mcp_grant(uuid,uuid,uuid),
  public.create_studio_mcp_project(uuid,uuid,uuid,uuid,text,text),
  public.update_studio_mcp_project(uuid,uuid,uuid,uuid,timestamptz,text,text),
  public.cancel_studio_mcp_job(uuid,uuid,uuid,uuid,uuid) from public, anon, authenticated;
grant execute on function public.create_studio_mcp_project(uuid,uuid,uuid,uuid,text,text),
  public.update_studio_mcp_project(uuid,uuid,uuid,uuid,timestamptz,text,text),
  public.cancel_studio_mcp_job(uuid,uuid,uuid,uuid,uuid) to service_role;
