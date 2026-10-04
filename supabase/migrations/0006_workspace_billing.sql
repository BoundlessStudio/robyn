-- App wallets are independent of the single operator wallet on Agent37.
create table if not exists public.workspace_billing (
  workspace_id uuid primary key references public.workspaces(id) on delete cascade,
  balance_micros bigint not null default 0 check (abs(balance_micros) <= 9007199254740991),
  stripe_customer_id text unique,
  payment_method_id text,
  payment_method_details jsonb,
  payment_method_updated_at bigint not null default 0,
  auto_top_up_enabled boolean not null default false,
  auto_top_up_amount_micros bigint not null default 25000000 check (auto_top_up_amount_micros between 5000000 and 10000000000),
  auto_top_up_threshold_micros bigint not null default 12500000 check (auto_top_up_threshold_micros between 3000000 and 10000000000),
  auto_top_up_error text,
  usage_synced_through date,
  created_at timestamptz not null default now(),
  check (not auto_top_up_enabled or payment_method_id is not null),
  check (auto_top_up_threshold_micros < auto_top_up_amount_micros)
);

create table if not exists public.billing_ledger (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspace_billing(workspace_id) on delete cascade,
  amount_micros bigint not null check (amount_micros <> 0 and abs(amount_micros) <= 9007199254740991),
  kind text not null check (kind in ('payment', 'coupon', 'usage', 'refund')),
  source_key text not null unique,
  created_at timestamptz not null default now()
);
create index if not exists billing_ledger_workspace_date on public.billing_ledger(workspace_id, created_at);

create table if not exists public.billing_refunds (
  payment_source text primary key references public.billing_ledger(source_key) on delete cascade,
  refunded_micros bigint not null default 0 check (refunded_micros >= 0)
);

-- Only the operator's service-role tooling can issue coupons. Workspace admins redeem them.
create table if not exists public.billing_coupons (
  code_hash text primary key check (code_hash ~ '^[a-f0-9]{64}$'),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  amount_micros bigint not null check (amount_micros between 10000 and 10000000000),
  expires_at timestamptz not null,
  redeemed_at timestamptz,
  redeemed_by uuid references auth.users(id) on delete set null
);

-- Keep attribution after an agent's mirror row is deleted, including its final compute debit.
create table if not exists public.billing_agents (
  agent37_id text primary key,
  workspace_id uuid not null references public.workspace_billing(workspace_id) on delete cascade,
  started_on date not null default ((now() at time zone 'UTC')::date),
  baseline_pending boolean not null default false
);
create index if not exists billing_agents_workspace on public.billing_agents(workspace_id);
create table if not exists public.billing_usage_days (
  agent37_id text not null references public.billing_agents(agent37_id) on delete cascade,
  day date not null,
  total_micros bigint not null check (total_micros between 0 and 9007199254740991),
  primary key (agent37_id, day)
);

create table if not exists public.billing_auto_topups (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspace_billing(workspace_id) on delete cascade,
  amount_micros bigint not null,
  customer_id text not null,
  payment_method_id text not null,
  finished boolean not null default false,
  created_at timestamptz not null default now()
);
create unique index if not exists billing_one_pending_auto_topup on public.billing_auto_topups(workspace_id) where not finished;

create or replace function public.initialize_workspace_billing() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into workspace_billing(workspace_id) values (new.id) on conflict do nothing;
  return new;
end; $$;
drop trigger if exists on_workspace_billing_created on public.workspaces;
create trigger on_workspace_billing_created after insert on public.workspaces
  for each row execute function public.initialize_workspace_billing();
insert into public.workspace_billing(workspace_id) select id from public.workspaces on conflict do nothing;

create or replace function public.track_billing_agent() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into billing_agents(agent37_id, workspace_id) values (new.agent37_id, new.workspace_id) on conflict do nothing;
  return new;
end; $$;
drop trigger if exists on_billing_agent_created on public.agents;
create trigger on_billing_agent_created after insert on public.agents for each row execute function public.track_billing_agent();
-- Existing agents establish a baseline on the first sweep; no historic charges or free credit.
insert into public.billing_agents(agent37_id, workspace_id, baseline_pending)
  select agent37_id, workspace_id, true from public.agents on conflict do nothing;

create or replace function public.billing_credit(p_workspace uuid, p_amount bigint, p_kind text, p_source text)
returns bigint language plpgsql security definer set search_path = public as $$
declare v_balance bigint; v_existing billing_ledger%rowtype;
begin
  if p_amount <= 0 or p_amount > 10000000000 or p_kind not in ('payment', 'coupon') then raise exception 'invalid credit'; end if;
  select balance_micros into strict v_balance from workspace_billing where workspace_id = p_workspace for update;
  select * into v_existing from billing_ledger where source_key = p_source;
  if found then
    if v_existing.workspace_id <> p_workspace or v_existing.amount_micros <> p_amount or v_existing.kind <> p_kind then raise exception 'credit conflict'; end if;
    return v_balance;
  end if;
  insert into billing_ledger(workspace_id, amount_micros, kind, source_key) values(p_workspace, p_amount, p_kind, p_source);
  update workspace_billing set balance_micros = balance_micros + p_amount where workspace_id = p_workspace returning balance_micros into v_balance;
  return v_balance;
end; $$;

create or replace function public.billing_redeem_coupon(p_workspace uuid, p_user uuid, p_hash text)
returns bigint language plpgsql security definer set search_path = public as $$
declare v_coupon billing_coupons%rowtype; v_balance bigint;
begin
  select * into v_coupon from billing_coupons where code_hash = p_hash for update;
  if not found or v_coupon.workspace_id <> p_workspace or v_coupon.expires_at <= now() or v_coupon.redeemed_at is not null then
    raise exception 'invalid or redeemed coupon';
  end if;
  select billing_credit(p_workspace, v_coupon.amount_micros, 'coupon', 'coupon:' || p_hash) into v_balance;
  update billing_coupons set redeemed_at = now(), redeemed_by = p_user where code_hash = p_hash;
  return v_balance;
end; $$;

create or replace function public.billing_settle_refund(p_source text, p_refunded bigint)
returns void language plpgsql security definer set search_path = public as $$
declare v_credit billing_ledger%rowtype; v_previous bigint; v_delta bigint;
begin
  select * into strict v_credit from billing_ledger where source_key = p_source and kind = 'payment';
  if p_refunded < 0 or p_refunded > v_credit.amount_micros then raise exception 'invalid refund'; end if;
  perform 1 from workspace_billing where workspace_id = v_credit.workspace_id for update;
  select refunded_micros into v_previous from billing_refunds where payment_source = p_source;
  v_delta := greatest(0, p_refunded - coalesce(v_previous, 0));
  if v_delta > 0 then
    insert into billing_ledger(workspace_id, amount_micros, kind, source_key)
      values(v_credit.workspace_id, -v_delta, 'refund', 'refund:' || p_source || ':' || p_refunded);
    update workspace_billing set balance_micros = balance_micros - v_delta where workspace_id = v_credit.workspace_id;
  end if;
  insert into billing_refunds(payment_source,refunded_micros) values(p_source,p_refunded)
    on conflict(payment_source) do update set refunded_micros = greatest(billing_refunds.refunded_micros, excluded.refunded_micros);
end; $$;

create or replace function public.billing_settle_usage(p_workspace uuid, p_day date, p_totals jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare v_row record; v_previous bigint; v_delta bigint;
begin
  perform 1 from workspace_billing where workspace_id = p_workspace for update;
  if not found then raise exception 'wallet not found'; end if;
  for v_row in
    select a.agent37_id, a.baseline_pending, coalesce((p_totals ->> a.agent37_id)::bigint, 0) as total
      from billing_agents a where a.workspace_id = p_workspace and a.started_on <= p_day
  loop
    if v_row.total < 0 or v_row.total > 9007199254740991 then raise exception 'invalid usage'; end if;
    select total_micros into v_previous from billing_usage_days where agent37_id = v_row.agent37_id and day = p_day;
    -- Stale snapshots cannot charge twice or rewind a meter.
    v_delta := greatest(0, v_row.total - coalesce(v_previous, 0));
    if v_row.baseline_pending then v_delta := 0; end if;
    if v_delta > 0 then
      insert into billing_ledger(workspace_id, amount_micros, kind, source_key)
        values(p_workspace, -v_delta, 'usage', 'usage:' || v_row.agent37_id || ':' || p_day || ':' || v_row.total);
      update workspace_billing set balance_micros = balance_micros - v_delta where workspace_id = p_workspace;
    end if;
    insert into billing_usage_days(agent37_id, day, total_micros) values(v_row.agent37_id, p_day, v_row.total)
      on conflict (agent37_id, day) do update set total_micros = greatest(billing_usage_days.total_micros, excluded.total_micros);
    update billing_agents set baseline_pending = false where agent37_id = v_row.agent37_id;
  end loop;
  update workspace_billing set usage_synced_through = greatest(usage_synced_through, p_day) where workspace_id = p_workspace;
end; $$;

create or replace function public.billing_claim_auto_topup(p_workspace uuid)
returns setof public.billing_auto_topups language plpgsql security definer set search_path = public as $$
declare v_wallet workspace_billing%rowtype;
begin
  select * into strict v_wallet from workspace_billing where workspace_id = p_workspace for update;
  -- Resolve an existing attempt even if the settings were switched off mid-charge.
  if exists(select 1 from billing_auto_topups where workspace_id = p_workspace and not finished) then
    return query select * from billing_auto_topups where workspace_id = p_workspace and not finished;
    return;
  end if;
  if not v_wallet.auto_top_up_enabled or v_wallet.balance_micros >= v_wallet.auto_top_up_threshold_micros or v_wallet.stripe_customer_id is null then return; end if;
  return query insert into billing_auto_topups(workspace_id, amount_micros, customer_id, payment_method_id)
    values(p_workspace, v_wallet.auto_top_up_amount_micros, v_wallet.stripe_customer_id, v_wallet.payment_method_id) returning *;
end; $$;

-- No browser/JWT table access and no public SECURITY DEFINER execution.
alter table public.workspace_billing enable row level security;
alter table public.billing_ledger enable row level security;
alter table public.billing_coupons enable row level security;
alter table public.billing_agents enable row level security;
alter table public.billing_usage_days enable row level security;
alter table public.billing_auto_topups enable row level security;
alter table public.billing_refunds enable row level security;
revoke all on public.workspace_billing, public.billing_ledger, public.billing_coupons, public.billing_agents, public.billing_usage_days, public.billing_auto_topups from public, anon, authenticated;
grant select, insert, update, delete on public.workspace_billing, public.billing_coupons, public.billing_agents, public.billing_usage_days, public.billing_auto_topups to service_role;
grant select, insert on public.billing_ledger to service_role;
revoke all on public.billing_refunds from public, anon, authenticated;
grant select, insert, update on public.billing_refunds to service_role;
revoke all on function public.billing_settle_refund(text,bigint) from public, anon, authenticated;
grant execute on function public.billing_settle_refund(text,bigint) to service_role;
revoke all on function public.initialize_workspace_billing(), public.track_billing_agent(), public.billing_credit(uuid,bigint,text,text), public.billing_redeem_coupon(uuid,uuid,text), public.billing_settle_usage(uuid,date,jsonb), public.billing_claim_auto_topup(uuid) from public, anon, authenticated;
grant execute on function public.billing_credit(uuid,bigint,text,text), public.billing_redeem_coupon(uuid,uuid,text), public.billing_settle_usage(uuid,date,jsonb), public.billing_claim_auto_topup(uuid) to service_role;
