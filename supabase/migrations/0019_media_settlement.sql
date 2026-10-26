-- Financial reconciliation is independent of publication permission. These RPCs
-- are service-only; callers still verify workspace ownership in the BFF.
create or replace function public.claim_media_job(p_workspace uuid,p_user uuid,p_job uuid,p_workflow text)
returns boolean language plpgsql security definer set search_path=public as $$
declare j public.studio_media_jobs;
begin
  select * into j from studio_media_jobs where workspace_id=p_workspace and created_by=p_user and id=p_job for update;
  if not found or not exists(select 1 from workspaces where id=p_workspace and owner_id=p_user) then raise exception 'not found'; end if;
  if j.state in ('completed','failed','cancelled') and not
    (j.operation='generate' and not j.billing_settled and (j.reserved_micros>0 or j.provider_job_id is not null)) then return false; end if;
  if j.workflow_id is not null and j.workflow_id<>p_workflow then return false; end if;
  update studio_media_jobs set workflow_id=p_workflow,state=case when state='queued' then 'preparing' else state end,updated_at=now() where id=p_job;
  return true;
end $$;

create function public.cancel_unpaid_media_job(p_workspace uuid,p_user uuid,p_job uuid)
returns public.studio_media_jobs language plpgsql security definer set search_path=public as $$
declare j public.studio_media_jobs;
begin
  perform 1 from studio_media_budgets where workspace_id=p_workspace for update;
  select * into j from studio_media_jobs where workspace_id=p_workspace and created_by=p_user and id=p_job for update;
  if not found or not exists(select 1 from workspaces where id=p_workspace and owner_id=p_user) then raise exception 'not found'; end if;
  if j.state='cancelled' then return j; end if;
  if j.state not in ('queued','preparing','waiting_budget','waiting_capacity') or j.provider_job_id is not null then raise exception 'media already dispatched'; end if;
  update studio_media_jobs set state='cancelled',actual_micros=0,billing_settled=true,error_code=null,updated_at=now() where id=p_job returning * into j;
  return j;
end $$;

create function public.begin_media_dispatch(p_workspace uuid,p_user uuid,p_job uuid,p_workflow text)
returns boolean language plpgsql security definer set search_path=public as $$
declare j public.studio_media_jobs;
begin
  select * into j from studio_media_jobs where workspace_id=p_workspace and created_by=p_user and id=p_job for update;
  if not found or j.workflow_id is distinct from p_workflow then return false; end if;
  if j.state not in ('preparing','queued') then return false; end if;
  if not exists(select 1 from workspaces where id=p_workspace and owner_id=p_user) or
    not exists(select 1 from studio_projects where id=j.project_id and status='active') then return false; end if;
  if j.employee_token_hash is not null then perform studio_employee_scope(j.employee_token_hash); end if;
  if j.operation='generate' and j.reserved_micros<1 then return false; end if;
  update studio_media_jobs set state='running',updated_at=now() where id=p_job;
  return true;
end $$;

create function public.settle_media_charge(p_workspace uuid,p_user uuid,p_job uuid,p_workflow text,p_actual bigint,p_receipt jsonb)
returns boolean language plpgsql security definer set search_path=public as $$
declare j public.studio_media_jobs;
begin
  select * into j from studio_media_jobs where workspace_id=p_workspace and created_by=p_user and id=p_job for update;
  if not found or j.workflow_id is distinct from p_workflow or
    not exists(select 1 from workspaces where id=p_workspace and owner_id=p_user) then raise exception 'not found'; end if;
  if j.operation<>'generate' or j.state not in ('cancelled','failed','completed','uncertain') then raise exception 'settlement not ready'; end if;
  if p_actual is null or p_actual<0 or p_actual>1000000000000 or p_receipt is null or jsonb_typeof(p_receipt)<>'object' then raise exception 'invalid settlement'; end if;
  if j.billing_settled then
    if j.actual_micros is distinct from p_actual then raise exception 'settlement already recorded'; end if;
    return true;
  end if;
  update studio_media_jobs set actual_micros=p_actual,billing_settled=true,
    provider_metadata=coalesce(provider_metadata,'{}')||jsonb_build_object('settlementReceipt',p_receipt),
    error_code=case when error_code like 'payment_%' then null else error_code end,updated_at=now() where id=p_job;
  return true;
end $$;

revoke all on function public.claim_media_job(uuid,uuid,uuid,text),public.cancel_unpaid_media_job(uuid,uuid,uuid),
  public.begin_media_dispatch(uuid,uuid,uuid,text),public.settle_media_charge(uuid,uuid,uuid,text,bigint,jsonb) from public,anon,authenticated;
grant execute on function public.claim_media_job(uuid,uuid,uuid,text),public.cancel_unpaid_media_job(uuid,uuid,uuid),
  public.begin_media_dispatch(uuid,uuid,uuid,text),public.settle_media_charge(uuid,uuid,uuid,text,bigint,jsonb) to service_role;
