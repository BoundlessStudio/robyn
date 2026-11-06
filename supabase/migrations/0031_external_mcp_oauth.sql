-- OAuth credentials are separate from browser sessions and employee capabilities.
create table public.studio_mcp_clients (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 120),
  redirect_uris text[] not null check (cardinality(redirect_uris) between 1 and 8),
  auth_method text not null check (auth_method in ('none','client_secret_basic','client_secret_post')),
  secret_hash text,
  created_at timestamptz not null default now(),
  check ((auth_method = 'none') = (secret_hash is null))
);
create index studio_mcp_clients_created on public.studio_mcp_clients(created_at);

create table public.studio_mcp_codes (
  code_hash text primary key,
  client_id uuid not null references public.studio_mcp_clients(id),
  user_id uuid not null references auth.users(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  redirect_uri text not null,
  challenge text not null,
  resource text not null,
  expires_at timestamptz not null default now() + interval '5 minutes'
);
create index studio_mcp_codes_expiry on public.studio_mcp_codes(expires_at);

create table public.studio_mcp_grants (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.studio_mcp_clients(id),
  user_id uuid not null references auth.users(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  resource text not null,
  access_hash text not null unique,
  refresh_hash text not null unique,
  access_expires_at timestamptz not null default now() + interval '1 hour',
  refresh_expires_at timestamptz not null default now() + interval '30 days',
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);
create index studio_mcp_grants_owner on public.studio_mcp_grants(workspace_id, user_id);

alter table public.studio_mcp_clients enable row level security;
alter table public.studio_mcp_codes enable row level security;
alter table public.studio_mcp_grants enable row level security;
revoke all on public.studio_mcp_clients, public.studio_mcp_codes, public.studio_mcp_grants from public, anon, authenticated;
grant select, insert on public.studio_mcp_clients, public.studio_mcp_codes to service_role;
grant select, update on public.studio_mcp_grants to service_role;

create function public.register_studio_mcp_client(p_name text, p_redirects text[], p_method text, p_secret_hash text)
returns uuid language plpgsql security definer set search_path=public as $$
declare client uuid;
begin
  perform pg_advisory_xact_lock(163491713, 1);
  if p_method = 'none' then
    select id into client from public.studio_mcp_clients
    where auth_method = 'none' and name = p_name and redirect_uris = p_redirects limit 1;
    if found then return client; end if;
  end if;
  if (select count(*) from public.studio_mcp_clients where created_at > now() - interval '1 minute') >= 30
    then raise exception 'registration rate limit'; end if;
  insert into public.studio_mcp_clients(name, redirect_uris, auth_method, secret_hash)
    values(p_name, p_redirects, p_method, p_secret_hash) returning id into client;
  return client;
end $$;

create function public.exchange_studio_mcp_code(p_code_hash text, p_client uuid, p_redirect text, p_challenge text,
  p_resource text, p_access_hash text, p_refresh_hash text)
returns boolean language plpgsql security definer set search_path=public as $$
declare code public.studio_mcp_codes;
begin
  delete from public.studio_mcp_codes where expires_at <= now();
  delete from public.studio_mcp_codes c using public.workspaces w, auth.users u
    where c.code_hash=p_code_hash and c.client_id=p_client and c.redirect_uri=p_redirect and c.challenge=p_challenge
      and c.resource=p_resource and c.expires_at>now() and w.id=c.workspace_id and w.owner_id=c.user_id
      and u.id=c.user_id and u.email_confirmed_at is not null and (u.banned_until is null or u.banned_until<=now())
    returning c.* into code;
  if not found then return false; end if;
  insert into public.studio_mcp_grants(client_id,user_id,workspace_id,resource,access_hash,refresh_hash)
    values(code.client_id,code.user_id,code.workspace_id,code.resource,p_access_hash,p_refresh_hash);
  return true;
end $$;

create function public.refresh_studio_mcp_grant(p_refresh_hash text, p_client uuid, p_resource text,
  p_new_access text, p_new_refresh text)
returns boolean language plpgsql security definer set search_path=public as $$
begin
  update public.studio_mcp_grants g set access_hash=p_new_access, refresh_hash=p_new_refresh,
      access_expires_at=now()+interval '1 hour', refresh_expires_at=now()+interval '30 days'
    from public.workspaces w, auth.users u
    where g.refresh_hash=p_refresh_hash and g.client_id=p_client and g.resource=p_resource
      and g.revoked_at is null and g.refresh_expires_at>now() and w.id=g.workspace_id and w.owner_id=g.user_id
      and u.id=g.user_id and u.email_confirmed_at is not null and (u.banned_until is null or u.banned_until<=now());
  return found;
end $$;

create function public.studio_mcp_identity(p_access_hash text, p_resource text)
returns jsonb language plpgsql stable security definer set search_path=public as $$
begin
  return (select jsonb_build_object('grantId',g.id,'userId',g.user_id,'workspaceId',g.workspace_id)
  from public.studio_mcp_grants g join public.workspaces w on w.id=g.workspace_id and w.owner_id=g.user_id
    join auth.users u on u.id=g.user_id
  where g.access_hash=p_access_hash and g.resource=p_resource and g.revoked_at is null
    and g.access_expires_at>now() and u.email_confirmed_at is not null
    and (u.banned_until is null or u.banned_until<=now()));
end
$$;

revoke all on function public.register_studio_mcp_client(text,text[],text,text),
  public.exchange_studio_mcp_code(text,uuid,text,text,text,text,text),
  public.refresh_studio_mcp_grant(text,uuid,text,text,text), public.studio_mcp_identity(text,text)
  from public, anon, authenticated;
grant execute on function public.register_studio_mcp_client(text,text[],text,text),
  public.exchange_studio_mcp_code(text,uuid,text,text,text,text,text),
  public.refresh_studio_mcp_grant(text,uuid,text,text,text), public.studio_mcp_identity(text,text)
  to service_role;
