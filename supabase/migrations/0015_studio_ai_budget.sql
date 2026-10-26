create table public.studio_managed_budgets (
  workspace_id uuid primary key references public.workspaces(id) on delete cascade,
  monthly_limit_micros bigint not null check(monthly_limit_micros between 0 and 9007199254740991),
  allocation_mode text not null check(allocation_mode in ('automatic','custom')),
  allocations jsonb not null default '{}',
  sync_state text not null check(sync_state in ('applying','synced','failed')),
  operation_id uuid not null, pending_request jsonb not null,
  lease_id uuid, lease_expires_at timestamptz, last_error text,
  updated_at timestamptz not null default now()
);
alter table public.studio_managed_budgets enable row level security;
revoke all on public.studio_managed_budgets from public,anon,authenticated;
grant select,insert,update,delete on public.studio_managed_budgets to service_role;

create function public.claim_studio_budget_change(p_workspace uuid,p_user uuid,p_operation uuid,p_request jsonb,p_lease uuid,p_current_limit bigint,p_current_allocations jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
declare b public.studio_managed_budgets;
begin
  if not exists(select 1 from public.workspaces where id=p_workspace and owner_id=p_user) then raise exception 'not found'; end if;
  insert into public.studio_media_budgets(workspace_id) values(p_workspace) on conflict do nothing;
  perform 1 from public.studio_media_budgets where workspace_id=p_workspace for update;
  if exists(select 1 from public.studio_employees where workspace_id=p_workspace and provision_state='provisioning') then raise exception 'workstation setup in progress'; end if;
  select * into b from public.studio_managed_budgets where workspace_id=p_workspace for update;
  if found then
    if b.operation_id=p_operation and b.pending_request<>p_request then raise exception 'operation key reused'; end if;
    if b.operation_id=p_operation and b.sync_state='synced' then return jsonb_build_object('claimed',false,'saved',true); end if;
    if b.sync_state='applying' and b.lease_expires_at>now() then raise exception 'studio budget update in progress'; end if;
    update public.studio_managed_budgets set operation_id=p_operation,pending_request=p_request,sync_state='applying',lease_id=p_lease,lease_expires_at=now()+interval '10 minutes',last_error=null,updated_at=now() where workspace_id=p_workspace;
  else
    insert into public.studio_managed_budgets(workspace_id,monthly_limit_micros,allocation_mode,allocations,sync_state,operation_id,pending_request,lease_id,lease_expires_at)
      values(p_workspace,p_current_limit,'custom',p_current_allocations,'applying',p_operation,p_request,p_lease,now()+interval '10 minutes');
  end if;
  return jsonb_build_object('claimed',true,'saved',false);
end $$;

-- Called after all reductions are confirmed, before any increases. Partial
-- application therefore remains bounded by the newly authorized Studio total.
create function public.stage_studio_budget_change(p_workspace uuid,p_user uuid,p_operation uuid,p_lease uuid,p_limit bigint,p_mode text,p_allocations jsonb)
returns boolean language plpgsql security definer set search_path=public as $$
begin
  if not exists(select 1 from public.workspaces where id=p_workspace and owner_id=p_user) then raise exception 'not found'; end if;
  if p_mode not in ('automatic','custom') or p_limit<0 or jsonb_typeof(p_allocations)<>'object'
    or exists(select 1 from public.studio_employees where workspace_id=p_workspace and not p_allocations ? id::text)
    or exists(select 1 from jsonb_each_text(p_allocations) a where not exists(select 1 from public.studio_employees e where e.workspace_id=p_workspace and e.id::text=a.key) or a.value !~ '^[0-9]+$')
    then raise exception 'invalid studio allocations'; end if;
  if (select coalesce(sum(value::numeric),0) from jsonb_each_text(p_allocations))>p_limit then raise exception 'studio allocations exceed limit'; end if;
  update public.studio_managed_budgets set monthly_limit_micros=p_limit,allocation_mode=p_mode,allocations=p_allocations,lease_expires_at=now()+interval '10 minutes',updated_at=now()
    where workspace_id=p_workspace and operation_id=p_operation and lease_id=p_lease and sync_state='applying';
  if not found then raise exception 'studio budget lease lost'; end if;
  return true;
end $$;

create function public.finish_studio_budget_change(p_workspace uuid,p_user uuid,p_operation uuid,p_lease uuid,p_error text default null)
returns boolean language plpgsql security definer set search_path=public as $$
declare b public.studio_managed_budgets; pair record;
begin
  if not exists(select 1 from public.workspaces where id=p_workspace and owner_id=p_user) then raise exception 'not found'; end if;
  select * into b from public.studio_managed_budgets where workspace_id=p_workspace and operation_id=p_operation and lease_id=p_lease for update;
  if not found then raise exception 'studio budget lease lost'; end if;
  if p_error is null then
    for pair in select * from jsonb_each_text(b.allocations) loop
      update public.studio_employees set monthly_cap_micros=pair.value::bigint where workspace_id=p_workspace and id=pair.key::uuid;
    end loop;
  end if;
  update public.studio_managed_budgets set sync_state=case when p_error is null then 'synced' else 'failed' end,last_error=p_error,lease_id=null,lease_expires_at=null,updated_at=now() where workspace_id=p_workspace;
  return true;
end $$;

create function public.guard_studio_budget_provision() returns trigger language plpgsql set search_path=public as $$
begin
  if new.provision_state='provisioning' and old.provision_state<>'provisioning' then
    insert into public.studio_media_budgets(workspace_id) values(new.workspace_id) on conflict do nothing;
    perform 1 from public.studio_media_budgets where workspace_id=new.workspace_id for update;
    if exists(select 1 from public.studio_managed_budgets where workspace_id=new.workspace_id and sync_state in ('applying','failed')) then raise exception 'studio budget update in progress'; end if;
  end if;
  return new;
end $$;
create trigger studio_budget_provision_guard before update of provision_state on public.studio_employees for each row execute function public.guard_studio_budget_provision();

do $$ declare fn regprocedure; begin
  for fn in select oid::regprocedure from pg_proc where pronamespace='public'::regnamespace and proname in ('claim_studio_budget_change','stage_studio_budget_change','finish_studio_budget_change') loop
    execute format('revoke all on function %s from public,anon,authenticated',fn);
    execute format('grant execute on function %s to service_role',fn);
  end loop;
end $$;
