begin;

alter table public.workspaces add column if not exists agent_limit integer not null default 1
  check (agent_limit between 0 and 1000);
alter table public.billing_coupons add column if not exists created_by uuid references auth.users(id) on delete set null;
alter table public.billing_coupons add column if not exists created_at timestamptz not null default now();

-- Reserve capacity before calling Agent37. Uncertain results retain their slot until reviewed.
create table if not exists public.agent_creation_reservations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  created_by uuid references auth.users(id) on delete set null,
  assigned_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists agent_creation_reservations_workspace on public.agent_creation_reservations(workspace_id);
alter table public.agent_creation_reservations enable row level security;
revoke all on public.agent_creation_reservations from public, anon, authenticated;
grant select, insert, update, delete on public.agent_creation_reservations to service_role;

create or replace function public.workspace_agent_capacity(p_workspace uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('agent_limit', w.agent_limit,
    'agent_count', (select count(*) from agents where workspace_id = w.id),
    'pending_count', (select count(*) from agent_creation_reservations where workspace_id = w.id),
    'balance_micros', b.balance_micros)
  from workspaces w left join workspace_billing b on b.workspace_id = w.id where w.id = p_workspace;
$$;

create or replace function public.reserve_agent_creation(p_workspace uuid, p_user uuid, p_assignee uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_limit integer; v_balance bigint; v_id uuid;
begin
  select agent_limit into v_limit from workspaces where id = p_workspace for update;
  if not found then raise exception 'workspace_not_found'; end if;
  if not exists (select 1 from memberships where workspace_id = p_workspace and user_id = p_user and role = 'admin') then
    raise exception 'admin_required';
  end if;
  if not exists (select 1 from memberships where workspace_id = p_workspace and user_id = p_assignee) then
    raise exception 'invalid_assignee';
  end if;
  select balance_micros into v_balance from workspace_billing where workspace_id = p_workspace for update;
  if not found then raise exception 'wallet_unavailable'; end if;
  if v_balance <= 0 then raise exception 'workspace_balance_empty'; end if;
  if (select count(*) from agents where workspace_id = p_workspace)
    + (select count(*) from agent_creation_reservations where workspace_id = p_workspace) >= v_limit then
    raise exception 'agent_limit_reached';
  end if;
  insert into agent_creation_reservations(workspace_id, created_by, assigned_user_id)
    values (p_workspace, p_user, p_assignee) returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.complete_agent_creation(p_reservation uuid, p_agent jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare v_reservation agent_creation_reservations%rowtype;
begin
  select * into v_reservation from agent_creation_reservations where id = p_reservation;
  if not found then raise exception 'reservation_not_found'; end if;
  perform 1 from workspaces where id = v_reservation.workspace_id for update;
  select * into v_reservation from agent_creation_reservations where id = p_reservation for update;
  if not found then raise exception 'reservation_not_found'; end if;
  if not exists (select 1 from memberships where workspace_id = v_reservation.workspace_id
    and user_id = v_reservation.created_by and role = 'admin') then raise exception 'admin_required'; end if;
  if not exists (select 1 from memberships where workspace_id = v_reservation.workspace_id
    and user_id = v_reservation.assigned_user_id) then raise exception 'invalid_assignee'; end if;
  -- Existing reservations finish if Host lowers the limit while provisioning is in progress.
  insert into agents(agent37_id, workspace_id, name, status, template, cpu, memory, disk, created_by, assigned_user_id)
    values (p_agent->>'id', v_reservation.workspace_id, p_agent->>'name', p_agent->>'status', p_agent->>'template',
      (p_agent->'resources'->>'cpu')::integer, (p_agent->'resources'->>'memory')::integer,
      (p_agent->'resources'->>'disk')::integer, v_reservation.created_by, v_reservation.assigned_user_id);
  delete from agent_creation_reservations where id = p_reservation;
end;
$$;

create or replace function public.host_set_agent_limit(p_host uuid, p_workspace uuid, p_limit integer)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  perform 1 from host_admins where user_id = p_host for key share;
  if not found then raise exception 'host_required'; end if;
  if p_limit is null or p_limit not between 0 and 1000 then raise exception 'invalid_limit'; end if;
  update workspaces set agent_limit = p_limit where id = p_workspace;
  if not found then raise exception 'workspace_not_found'; end if;
  return jsonb_build_object('agent_limit', p_limit);
end;
$$;

create or replace function public.host_issue_coupon(p_host uuid, p_workspace uuid, p_hash text, p_amount bigint)
returns timestamptz language plpgsql security definer set search_path = public as $$
declare v_expires timestamptz := now() + interval '30 days';
begin
  perform 1 from host_admins where user_id = p_host for key share;
  if not found then raise exception 'host_required'; end if;
  if p_amount is null or p_amount not between 10000 and 10000000000
    or p_hash is null or p_hash !~ '^[a-f0-9]{64}$' then raise exception 'invalid_coupon'; end if;
  if not exists (select 1 from workspaces where id = p_workspace) then raise exception 'workspace_not_found'; end if;
  insert into billing_coupons(code_hash, workspace_id, amount_micros, expires_at, created_by)
    values (p_hash, p_workspace, p_amount, v_expires, p_host);
  return v_expires;
end;
$$;

revoke all on function public.workspace_agent_capacity(uuid), public.reserve_agent_creation(uuid,uuid,uuid),
  public.complete_agent_creation(uuid,jsonb), public.host_set_agent_limit(uuid,uuid,integer),
  public.host_issue_coupon(uuid,uuid,text,bigint) from public, anon, authenticated;
grant execute on function public.workspace_agent_capacity(uuid), public.reserve_agent_creation(uuid,uuid,uuid),
  public.complete_agent_creation(uuid,jsonb), public.host_set_agent_limit(uuid,uuid,integer),
  public.host_issue_coupon(uuid,uuid,text,bigint) to service_role;

-- The Host read projections below include limits and reserved capacity.

create or replace function public.host_tenants(p_query text default '', p_page integer default 1)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare result jsonb;
begin
  if p_page < 1 or p_page > 1000000 or length(p_query) > 200 then raise exception 'invalid host query'; end if;
  with filtered as (
    select r.*, w.agent_limit,
      (select count(*) from agent_creation_reservations c where c.workspace_id = r.id) as pending_agent_count
    from host_tenant_rows() r join workspaces w on w.id = r.id where p_query = ''
      or strpos(lower(r.name), lower(p_query)) > 0
      or strpos(r.id::text, lower(p_query)) > 0
      or strpos(lower(coalesce(r.owner->>'email', '')), lower(p_query)) > 0
  ), paged as (
    select * from filtered order by created_at desc, id
    limit 50 offset ((p_page::bigint - 1) * 50)
  )
  select jsonb_build_object('page', p_page, 'page_size', 50,
    'total', (select count(*) from filtered),
    'items', coalesce((select jsonb_agg(to_jsonb(p) order by created_at desc, id) from paged p), '[]'::jsonb)) into result;
  return result;
end;
$$;

create or replace function public.host_tenant(
  p_workspace uuid, p_member_page integer default 1, p_agent_page integer default 1,
  p_ledger_page integer default 1
)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare tenant jsonb; wallet jsonb; member_rows jsonb; agent_rows jsonb; ledger_rows jsonb; payments jsonb;
begin
  if least(p_member_page, p_agent_page, p_ledger_page) < 1
    or greatest(p_member_page, p_agent_page, p_ledger_page) > 1000000 then raise exception 'invalid host query'; end if;
  select to_jsonb(r) || jsonb_build_object('agent_limit', w.agent_limit,
    'pending_agent_count', (select count(*) from agent_creation_reservations c where c.workspace_id = w.id))
  into tenant from host_tenant_rows() r join workspaces w on w.id = r.id where r.id = p_workspace;
  if tenant is null then return null; end if;

  select jsonb_build_object('balance_micros', balance_micros,
    'auto_top_up_enabled', auto_top_up_enabled, 'auto_top_up_amount_micros', auto_top_up_amount_micros,
    'auto_top_up_threshold_micros', auto_top_up_threshold_micros, 'auto_top_up_error', auto_top_up_error,
    'usage_synced_through', usage_synced_through, 'has_payment_method', payment_method_id is not null)
  into wallet from workspace_billing where workspace_id = p_workspace;

  select coalesce(jsonb_agg(to_jsonb(r) order by created_at, user_id), '[]'::jsonb) into member_rows from (
    select m.user_id, u.email, coalesce(nullif(trim(u.raw_user_meta_data->>'full_name'), ''),
      nullif(trim(u.raw_user_meta_data->>'name'), ''), u.email) as display_name, m.role, m.created_at
    from memberships m left join auth.users u on u.id = m.user_id
    where m.workspace_id = p_workspace order by m.created_at, m.user_id
    limit 50 offset ((p_member_page::bigint - 1) * 50)
  ) r;
  select coalesce(jsonb_agg(to_jsonb(r) order by created_at desc, id), '[]'::jsonb) into agent_rows from (
    select agent37_id as id, name, status, template, cpu, memory, disk, assigned_user_id, created_at
    from agents where workspace_id = p_workspace order by created_at desc, agent37_id
    limit 50 offset ((p_agent_page::bigint - 1) * 50)
  ) r;
  select coalesce(jsonb_agg(to_jsonb(r) order by created_at desc, id), '[]'::jsonb) into ledger_rows from (
    select id, amount_micros, kind, created_at from billing_ledger where workspace_id = p_workspace
    order by created_at desc, id limit 50 offset ((p_ledger_page::bigint - 1) * 50)
  ) r;
  -- At most one unfinished attempt per tenant (enforced by billing_one_pending_auto_topup).
  select coalesce(jsonb_agg(jsonb_build_object('amount_micros', amount_micros, 'created_at', created_at,
    'needs_review', created_at < now() - interval '23 hours') order by created_at), '[]'::jsonb)
  into payments from billing_auto_topups where workspace_id = p_workspace and not finished;

  return jsonb_build_object('tenant', tenant, 'wallet', wallet, 'pending_payments', payments,
    'generated_at', now(),
    'members', jsonb_build_object('items', member_rows, 'page', p_member_page, 'page_size', 50, 'total', tenant->'member_count'),
    'agents', jsonb_build_object('items', agent_rows, 'page', p_agent_page, 'page_size', 50, 'total', tenant->'agent_count'),
    'ledger', jsonb_build_object('items', ledger_rows, 'page', p_ledger_page, 'page_size', 50,
      'total', (select count(*) from billing_ledger where workspace_id = p_workspace)));
end;
$$;

commit;
