begin;

-- Serialize installation with signups. The singleton claim itself arbitrates
-- concurrent signups after installation without serializing every user insert.
lock table auth.users in share row exclusive mode;
lock table public.host_admins in share row exclusive mode;

-- Keep this claim after revocation or account deletion: an untrusted later
-- signup must never become Host merely because the permissions table is empty.
create table if not exists public.host_signup_claim (
  singleton boolean primary key default true check (singleton),
  user_id uuid references auth.users(id) on delete set null,
  claimed_at timestamptz not null default now()
);
alter table public.host_signup_claim enable row level security;
revoke all on public.host_signup_claim from public, anon, authenticated, service_role;
grant select on public.host_signup_claim to service_role;

-- Preserve operator grants on upgrades. If no Host exists, use the earliest
-- normal email signup already present, independently of email or user metadata.
-- Only the initial insert grants access, so replaying setup honors revocations.
do $$
declare v_user uuid;
begin
  select h.user_id into v_user from public.host_admins h
    order by h.created_at, h.user_id limit 1;
  if v_user is null then
    select u.id into v_user from auth.users u
      where u.email is not null and u.invited_at is null
        and not coalesce(u.is_anonymous, false)
      order by u.created_at, u.id limit 1;
  end if;
  if v_user is not null then
    insert into public.host_signup_claim(singleton, user_id)
      values (true, v_user) on conflict (singleton) do nothing;
    if found then
      insert into public.host_admins(user_id) values (v_user)
        on conflict (user_id) do nothing;
    end if;
  end if;
end;
$$;

create or replace function public.assign_first_signup_host()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  -- Invited and anonymous accounts do not claim first self-service signup.
  if new.email is null or new.invited_at is not null
    or coalesce(new.is_anonymous, false) then
    return new;
  end if;
  insert into public.host_signup_claim(singleton, user_id)
    values (true, new.id) on conflict (singleton) do nothing;
  if found then
    insert into public.host_admins(user_id) values (new.id)
      on conflict (user_id) do nothing;
  end if;
  return new;
end;
$$;
revoke all on function public.assign_first_signup_host() from public, anon, authenticated, service_role;

drop trigger if exists on_auth_user_first_signup_host on auth.users;
create trigger on_auth_user_first_signup_host after insert on auth.users
  for each row execute function public.assign_first_signup_host();

commit;
