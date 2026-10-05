begin;

-- Host permissions belong to this deployment, independently of tenant memberships.
create table if not exists public.host_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.host_admins enable row level security;
revoke all on public.host_admins from public, anon, authenticated;
grant select, insert, update, delete on public.host_admins to service_role;

-- An explicit projection: no credentials, payment IDs, tokens, or agent content.
create or replace function public.host_tenant_rows()
returns table (
  id uuid, name text, created_at timestamptz, owner jsonb,
  member_count bigint, agent_count bigint, balance_micros bigint, billing_flags text[]
)
language sql stable security definer set search_path = public as $$
  select w.id, w.name, w.created_at,
    case when u.id is null then null else jsonb_build_object(
      'user_id', u.id, 'email', u.email,
      'display_name', coalesce(nullif(trim(u.raw_user_meta_data->>'full_name'), ''),
        nullif(trim(u.raw_user_meta_data->>'name'), ''), u.email)
    ) end,
    (select count(*) from memberships m where m.workspace_id = w.id),
    (select count(*) from agents a where a.workspace_id = w.id),
    b.balance_micros,
    array_remove(array[
      case when b.workspace_id is null then 'wallet_missing' end,
      case when b.balance_micros <= 0 then 'balance_empty' end,
      case when b.auto_top_up_error is not null then 'auto_top_up_error' end,
      case when b.workspace_id is not null and (b.usage_synced_through is null
        or b.usage_synced_through < (now() at time zone 'UTC')::date) then 'usage_sync_behind' end,
      case when exists (select 1 from billing_auto_topups p where p.workspace_id = w.id
        and not p.finished and p.created_at < now() - interval '23 hours') then 'payment_review' end
    ], null)::text[]
  from workspaces w
  left join auth.users u on u.id = w.owner_id
  left join workspace_billing b on b.workspace_id = w.id;
$$;

create or replace function public.host_overview()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'generated_at', now(), 'tenant_count', count(*),
    'agent_count', coalesce(sum(agent_count), 0),
    -- Preserve exact aggregate micros even when the sum exceeds JS's safe integer range.
    'balance_micros', case when count(*) > 0 and count(balance_micros) = 0 then null
      else coalesce(sum(balance_micros), 0)::text end,
    'wallet_missing_count', count(*) filter (where 'wallet_missing' = any(billing_flags)),
    'attention_count', count(*) filter (where cardinality(billing_flags) > 0),
    'billing_flags', jsonb_build_object(
      'balance_empty', count(*) filter (where 'balance_empty' = any(billing_flags)),
      'auto_top_up_error', count(*) filter (where 'auto_top_up_error' = any(billing_flags)),
      'usage_sync_behind', count(*) filter (where 'usage_sync_behind' = any(billing_flags)),
      'payment_review', count(*) filter (where 'payment_review' = any(billing_flags))
    )
  ) from host_tenant_rows();
$$;

create or replace function public.host_tenants(p_query text default '', p_page integer default 1)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare result jsonb;
begin
  if p_page < 1 or p_page > 1000000 or length(p_query) > 200 then raise exception 'invalid host query'; end if;
  with filtered as (
    select * from host_tenant_rows() r where p_query = ''
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
  select to_jsonb(r) into tenant from host_tenant_rows() r where id = p_workspace;
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

revoke all on function public.host_tenant_rows() from public, anon, authenticated;
revoke all on function public.host_overview() from public, anon, authenticated;
revoke all on function public.host_tenants(text, integer) from public, anon, authenticated;
revoke all on function public.host_tenant(uuid, integer, integer, integer) from public, anon, authenticated;
grant execute on function public.host_tenant_rows() to service_role;
grant execute on function public.host_overview() to service_role;
grant execute on function public.host_tenants(text, integer) to service_role;
grant execute on function public.host_tenant(uuid, integer, integer, integer) to service_role;

commit;
