-- The starter uses a server BFF with service-role access. Supabase's default
-- grants can otherwise leave the existing permissive RLS policies reachable.
revoke all on public.workspaces, public.memberships, public.invitations, public.agents from anon, authenticated;
revoke execute on function public.get_workspace_members(uuid), public.get_invitation(uuid), public.accept_invitation(uuid, uuid) from public, anon, authenticated;
grant execute on function public.get_workspace_members(uuid), public.get_invitation(uuid), public.accept_invitation(uuid, uuid) to service_role;

create table if not exists public.studio_access_requests (
  id uuid primary key default gen_random_uuid(),
  email text not null unique check (email = lower(trim(email)) and char_length(email) <= 254),
  craft text not null default '' check (char_length(craft) <= 280),
  consent_version text not null default 'invitation-v1',
  status text not null default 'requested' check (status in ('requested', 'invited', 'joined', 'declined')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.studio_request_limits (
  rate_key text not null,
  window_start timestamptz not null,
  requests integer not null default 1,
  primary key (rate_key, window_start)
);

alter table public.studio_access_requests enable row level security;
alter table public.studio_request_limits enable row level security;
revoke all on public.studio_access_requests, public.studio_request_limits from anon, authenticated;
grant select, insert, update, delete on public.studio_access_requests, public.studio_request_limits to service_role;

create or replace function public.submit_studio_access_request(p_email text, p_craft text, p_rate_key text)
returns text language plpgsql security definer set search_path = public as $$
declare
  v_count integer;
begin
  if char_length(p_rate_key) <> 64 or char_length(p_email) > 254 or char_length(p_craft) > 280 then
    raise exception 'invalid request';
  end if;
  insert into public.studio_request_limits(rate_key, window_start, requests)
    values (p_rate_key, date_trunc('hour', now()), 1)
    on conflict (rate_key, window_start) do update set requests = studio_request_limits.requests + 1
    returning requests into v_count;
  if v_count > 10 then return 'rate_limited'; end if;
  insert into public.studio_access_requests(email, craft)
    values (lower(trim(p_email)), p_craft)
    on conflict (email) do nothing;
  delete from public.studio_request_limits where window_start < now() - interval '24 hours';
  return 'saved';
end;
$$;
revoke all on function public.submit_studio_access_request(text, text, text) from public, anon, authenticated;
grant execute on function public.submit_studio_access_request(text, text, text) to service_role;
