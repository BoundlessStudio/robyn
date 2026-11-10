-- Mailbox reads require a separate owner approval for each MCP grant and
-- exact Agent37 account. Existing and newly issued grants start with no rows.
create table public.studio_mcp_mailboxes (
  grant_id uuid not null references public.studio_mcp_grants(id) on delete cascade,
  connection_id text not null check (connection_id ~ '^[A-Za-z0-9_-]{1,128}$'),
  instance_id text not null check (instance_id ~ '^[a-z0-9-]{1,80}$'),
  provider text not null check (provider in ('gmail','outlook')),
  primary key (grant_id,connection_id)
);

alter table public.studio_mcp_mailboxes enable row level security;
revoke all on public.studio_mcp_mailboxes from public,anon,authenticated,service_role;
grant select on public.studio_mcp_mailboxes to service_role;

create function public.list_studio_mcp_mailboxes(p_grant uuid,p_workspace uuid,p_user uuid)
returns table(connection_id text,instance_id text,provider text)
language sql stable security definer set search_path=public as $$
  select m.connection_id,m.instance_id,m.provider
    from public.studio_mcp_mailboxes m
    where m.grant_id=p_grant and public.studio_mcp_grant_active(p_grant,p_workspace,p_user)
$$;

create function public.set_studio_mcp_mailbox(p_grant uuid,p_workspace uuid,p_user uuid,
  p_connection text,p_instance text,p_provider text)
returns boolean language plpgsql security definer set search_path=public as $$
begin
  perform 1 from public.studio_mcp_grants
    where id=p_grant and workspace_id=p_workspace and user_id=p_user for update;
  if not found or not public.studio_mcp_grant_active(p_grant,p_workspace,p_user) then return false; end if;

  if p_instance is null and p_provider is null then
    delete from public.studio_mcp_mailboxes where grant_id=p_grant and connection_id=p_connection;
  else
    if not exists(select 1 from public.studio_employees
      where workspace_id=p_workspace and employee_key='robyn' and retired_at is null
        and provision_state='ready' and instance_id=p_instance) then return false; end if;
    insert into public.studio_mcp_mailboxes(grant_id,connection_id,instance_id,provider)
      values(p_grant,p_connection,p_instance,p_provider)
      on conflict(grant_id,connection_id) do update
        set instance_id=excluded.instance_id,provider=excluded.provider;
  end if;
  return true;
end $$;

revoke all on function public.list_studio_mcp_mailboxes(uuid,uuid,uuid),
  public.set_studio_mcp_mailbox(uuid,uuid,uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.list_studio_mcp_mailboxes(uuid,uuid,uuid),
  public.set_studio_mcp_mailbox(uuid,uuid,uuid,text,text,text) to service_role;
