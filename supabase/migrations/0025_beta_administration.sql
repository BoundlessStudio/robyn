-- A separate, single operator account. Creator workspace roles cannot administer beta access.
create table public.studio_beta_admin (
  singleton boolean primary key default true check (singleton),
  username text not null check (char_length(username) between 1 and 80),
  password_hash text not null check (password_hash ~ '^scrypt\$[a-f0-9]{32}\$[a-f0-9]{128}$'),
  updated_at timestamptz not null default now()
);
create table public.studio_beta_admin_sessions (
  token_hash text primary key check (token_hash ~ '^[a-f0-9]{64}$'),
  admin boolean not null default true references public.studio_beta_admin(singleton) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);
create table public.studio_beta_admin_limits (
  rate_key text not null,
  window_start timestamptz not null,
  attempts integer not null,
  primary key (rate_key, window_start)
);
alter table public.studio_beta_admin enable row level security;
alter table public.studio_beta_admin_sessions enable row level security;
alter table public.studio_beta_admin_limits enable row level security;
revoke all on public.studio_beta_admin, public.studio_beta_admin_sessions, public.studio_beta_admin_limits from public, anon, authenticated;
grant select, insert, update, delete on public.studio_beta_admin, public.studio_beta_admin_sessions, public.studio_beta_admin_limits to service_role;

create function public.configure_beta_admin(p_username text, p_password_hash text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  insert into public.studio_beta_admin(singleton, username, password_hash) values (true, p_username, p_password_hash)
    on conflict (singleton) do update set username = excluded.username, password_hash = excluded.password_hash, updated_at = now();
  delete from public.studio_beta_admin_sessions;
end;
$$;

create function public.claim_beta_admin_login(p_rate_key text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  v_window timestamptz := date_trunc('hour', now()) + floor(extract(minute from now()) / 15) * interval '15 minutes';
  v_global integer;
  v_count integer;
begin
  if p_rate_key !~ '^[a-f0-9]{64}$' or p_rate_key = repeat('0', 64) then raise exception 'invalid rate key'; end if;
  insert into public.studio_beta_admin_limits values (repeat('0', 64), v_window, 1)
    on conflict (rate_key, window_start) do update set attempts = studio_beta_admin_limits.attempts + 1 returning attempts into v_global;
  insert into public.studio_beta_admin_limits values (p_rate_key, v_window, 1)
    on conflict (rate_key, window_start) do update set attempts = studio_beta_admin_limits.attempts + 1 returning attempts into v_count;
  delete from public.studio_beta_admin_limits where window_start < now() - interval '24 hours';
  delete from public.studio_beta_admin_sessions where expires_at <= now();
  return v_count <= 10 and v_global <= 60;
end;
$$;

create function public.start_beta_admin_session(p_password_hash text, p_token_hash text)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  -- Serialize with credential replacement so an old password cannot start a
  -- session after replacement has invalidated the previous sessions.
  perform 1 from public.studio_beta_admin where singleton and password_hash = p_password_hash for update;
  if not found then return false; end if;
  insert into public.studio_beta_admin_sessions(token_hash, expires_at) values (p_token_hash, now() + interval '8 hours');
  return true;
end;
$$;

alter table public.studio_access_requests
  add column invited_at timestamptz,
  add column last_invited_at timestamptz,
  add column invite_count integer not null default 0 check (invite_count >= 0),
  add column joined_at timestamptz,
  add column joined_user_id uuid references auth.users(id) on delete set null,
  add column send_state text not null default 'idle' check (send_state in ('idle', 'sending', 'sent', 'failed', 'uncertain')),
  add column send_operation uuid,
  add column send_started_at timestamptz;
create index studio_access_requests_status_created on public.studio_access_requests(status, created_at desc, id desc);

-- Auth confirms a real sign-in; an invite merely creating an Auth user does not count as joining.
create function public.track_beta_join()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.email_confirmed_at is not null and new.last_sign_in_at is not null then
    update public.studio_access_requests set status = 'joined', joined_user_id = new.id,
      joined_at = coalesce(joined_at, new.last_sign_in_at), updated_at = now()
      where email = lower(trim(new.email)) and (joined_user_id is null or joined_user_id = new.id)
        and (status <> 'joined' or joined_at is null);
  end if;
  return new;
end;
$$;
create trigger studio_beta_join after insert or update of email, email_confirmed_at, last_sign_in_at on auth.users
  for each row execute function public.track_beta_join();

create function public.track_existing_beta_join()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_user record;
begin
  select id, last_sign_in_at into v_user from auth.users
    where lower(trim(email)) = new.email and email_confirmed_at is not null and last_sign_in_at is not null limit 1;
  if found then
    new.status := 'joined'; new.joined_user_id := v_user.id; new.joined_at := v_user.last_sign_in_at;
  end if;
  return new;
end;
$$;
create trigger studio_beta_existing_join before insert on public.studio_access_requests
  for each row execute function public.track_existing_beta_join();

-- Reconcile invitations accepted before this feature was installed. Preserve request identity/consent.
update public.studio_access_requests r set status = 'joined', joined_user_id = u.id,
  joined_at = u.last_sign_in_at, updated_at = now()
  from auth.users u where lower(trim(u.email)) = r.email and u.email_confirmed_at is not null and u.last_sign_in_at is not null;

create function public.claim_beta_invitation(p_request uuid, p_operation uuid, p_action text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_request public.studio_access_requests;
begin
  if p_operation is null or p_action not in ('invite', 'resend') then raise exception 'invalid invitation action'; end if;
  select * into v_request from public.studio_access_requests where id = p_request for update;
  if not found then return jsonb_build_object('outcome', 'not_found'); end if;
  if v_request.send_operation = p_operation then return jsonb_build_object('outcome', 'replay', 'request', to_jsonb(v_request)); end if;
  if v_request.send_state in ('sending', 'uncertain') then return jsonb_build_object('outcome', 'pending'); end if;
  if v_request.status not in ('requested', 'invited') then return jsonb_build_object('outcome', 'closed'); end if;
  if (p_action = 'invite' and v_request.status <> 'requested') or (p_action = 'resend' and v_request.status <> 'invited') then
    return jsonb_build_object('outcome', 'changed');
  end if;
  if v_request.last_invited_at > now() - interval '60 seconds' then return jsonb_build_object('outcome', 'cooldown'); end if;
  update public.studio_access_requests set send_state = 'sending', send_operation = p_operation, send_started_at = now(), updated_at = now()
    where id = p_request returning * into v_request;
  return jsonb_build_object('outcome', 'claimed', 'request', to_jsonb(v_request));
end;
$$;

create function public.finish_beta_invitation(p_request uuid, p_operation uuid, p_result text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_request public.studio_access_requests;
begin
  if p_result not in ('sent', 'failed', 'uncertain') then raise exception 'invalid invitation result'; end if;
  update public.studio_access_requests set send_state = p_result,
    status = case when p_result = 'sent' and status <> 'joined' then 'invited' else status end,
    invited_at = case when p_result = 'sent' then coalesce(invited_at, now()) else invited_at end,
    last_invited_at = case when p_result = 'sent' then now() else last_invited_at end,
    invite_count = invite_count + case when p_result = 'sent' then 1 else 0 end,
    updated_at = now()
    where id = p_request and send_operation = p_operation and send_state in ('sending', 'uncertain') returning * into v_request;
  if not found then select * into v_request from public.studio_access_requests where id = p_request; end if;
  return to_jsonb(v_request);
end;
$$;

-- Auth commits its sent-at fields with successful email submission. Read that receipt after a lost reply.
create function public.reconcile_beta_invitation(p_request uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_request public.studio_access_requests;
begin
  select * into v_request from public.studio_access_requests where id = p_request for update;
  if not found then return null; end if;
  if v_request.send_state in ('sending', 'uncertain') and exists (
    select 1 from auth.users where lower(trim(email)) = v_request.email
      and greatest(invited_at, confirmation_sent_at, recovery_sent_at) >= v_request.send_started_at
  ) then
    return public.finish_beta_invitation(p_request, v_request.send_operation, 'sent');
  end if;
  return to_jsonb(v_request);
end;
$$;

create function public.set_beta_request_status(p_request uuid, p_status text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_request public.studio_access_requests;
begin
  if p_status not in ('requested', 'declined') then raise exception 'invalid request status'; end if;
  update public.studio_access_requests set status = p_status, updated_at = now()
    where id = p_request and status in ('requested', 'declined') and send_state not in ('sending', 'uncertain') returning * into v_request;
  if not found then return null; end if;
  return to_jsonb(v_request);
end;
$$;

create function public.beta_request_counts()
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('requested', count(*) filter (where status = 'requested'), 'invited', count(*) filter (where status = 'invited'),
    'joined', count(*) filter (where status = 'joined'), 'declined', count(*) filter (where status = 'declined')) from public.studio_access_requests;
$$;

revoke all on function public.configure_beta_admin(text,text), public.claim_beta_admin_login(text), public.start_beta_admin_session(text,text), public.track_beta_join(), public.track_existing_beta_join(),
  public.claim_beta_invitation(uuid,uuid,text), public.finish_beta_invitation(uuid,uuid,text), public.reconcile_beta_invitation(uuid),
  public.set_beta_request_status(uuid,text), public.beta_request_counts() from public, anon, authenticated;
grant execute on function public.configure_beta_admin(text,text), public.claim_beta_admin_login(text), public.start_beta_admin_session(text,text), public.claim_beta_invitation(uuid,uuid,text),
  public.finish_beta_invitation(uuid,uuid,text), public.reconcile_beta_invitation(uuid), public.set_beta_request_status(uuid,text), public.beta_request_counts() to service_role;
