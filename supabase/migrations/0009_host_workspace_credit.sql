begin;

-- Preserve historical coupon entries while recording new grants as direct credit.
alter table public.billing_ledger drop constraint if exists billing_ledger_kind_check;
alter table public.billing_ledger add constraint billing_ledger_kind_check
  check (kind in ('payment', 'coupon', 'credit', 'usage', 'refund'));
alter table public.billing_ledger add column if not exists created_by uuid
  references auth.users(id) on delete set null;

create or replace function public.host_add_credit(p_host uuid, p_workspace uuid, p_request uuid, p_amount bigint)
returns bigint language plpgsql security definer set search_path = public as $$
declare v_balance bigint; v_existing billing_ledger%rowtype;
  v_source text := 'host-credit:' || p_request::text;
begin
  perform 1 from host_admins where user_id = p_host for key share;
  if not found then raise exception 'host_required'; end if;
  if p_request is null or p_amount is null or p_amount not between 10000 and 10000000000
    or p_amount % 10000 <> 0 then raise exception 'invalid_credit'; end if;
  if not exists (select 1 from workspaces where id = p_workspace) then raise exception 'workspace_not_found'; end if;
  select balance_micros into v_balance from workspace_billing where workspace_id = p_workspace for update;
  if not found then raise exception 'wallet_unavailable'; end if;
  select * into v_existing from billing_ledger where source_key = v_source;
  if found then
    if v_existing.workspace_id <> p_workspace or v_existing.amount_micros <> p_amount
      or v_existing.kind <> 'credit' or v_existing.created_by is distinct from p_host then
      raise exception 'credit_conflict';
    end if;
    return v_balance;
  end if;
  insert into billing_ledger(workspace_id, amount_micros, kind, source_key, created_by)
    values (p_workspace, p_amount, 'credit', v_source, p_host);
  update workspace_billing set balance_micros = balance_micros + p_amount
    where workspace_id = p_workspace returning balance_micros into v_balance;
  return v_balance;
end;
$$;

revoke all on function public.host_add_credit(uuid,uuid,uuid,bigint) from public, anon, authenticated;
grant execute on function public.host_add_credit(uuid,uuid,uuid,bigint) to service_role;

-- Coupon records remain for audit; issuance and redemption have been retired.
drop function if exists public.host_issue_coupon(uuid,uuid,text,bigint);
drop function if exists public.billing_redeem_coupon(uuid,uuid,text);

commit;
