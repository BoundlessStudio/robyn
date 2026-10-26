-- Agent37 is the authority for managed LLM/tool spending. This preference is
-- used only when an employee's first workstation is provisioned.
alter table public.studio_employees add column monthly_cap_micros bigint not null default 5000000
  check(monthly_cap_micros between 0 and 9007199254740991);
-- Preserve existing grants; new employees wait for an owner allocation.
alter table public.studio_employees alter column monthly_cap_micros set default 0;
alter table public.studio_media_jobs add column budget_employee_id uuid;
alter table public.studio_media_jobs add foreign key(workspace_id,budget_employee_id)
  references public.studio_employees(workspace_id,id);
update public.studio_media_jobs j set budget_employee_id=e.id from public.studio_employees e
  where e.workspace_id=j.workspace_id and e.instance_id=j.instance_id;
alter table public.studio_media_jobs drop constraint studio_media_jobs_state_check;
alter table public.studio_media_jobs add constraint studio_media_jobs_state_check check
  (state in ('queued','preparing','waiting_budget','submitting','running','processing','uploading','completed','failed','uncertain','cancelled'));

create or replace function public.create_media_job(p_workspace uuid,p_user uuid,p_project uuid,p_operation uuid,p_request jsonb,p_hash text default null)
returns public.studio_media_jobs language plpgsql security definer set search_path=public as $$
declare j public.studio_media_jobs; s jsonb; d public.studio_media_discoveries; ref jsonb;
begin
  if not exists(select 1 from public.workspaces w join public.studio_projects p on p.workspace_id=w.id
    where w.id=p_workspace and w.owner_id=p_user and p.id=p_project and p.status='active') then raise exception 'not found'; end if;
  if p_hash is not null then
    s:=public.studio_employee_scope(p_hash);
    if s->>'workspaceId'<>p_workspace::text or s->>'projectId'<>p_project::text or s->>'userId'<>p_user::text then raise exception 'employee access denied'; end if;
  end if;
  -- Retain this legacy row only as a serialization lock, not a second cap.
  insert into public.studio_media_budgets(workspace_id) values(p_workspace) on conflict do nothing;
  perform 1 from public.studio_media_budgets where workspace_id=p_workspace for update;
  select * into j from public.studio_media_jobs where workspace_id=p_workspace and project_id=p_project and operation_id=p_operation;
  if found then
    if (j.request-'maxCostMicros')<>(p_request-'maxCostMicros') or j.created_by<>p_user or j.assignment_id is distinct from (s->>'assignmentId')::uuid then raise exception 'operation key reused'; end if;
    return j;
  end if;
  if (p_request->>'operation'='import' and p_request->>'provider'<>'commons') or
    (p_request->>'operation'='generate' and p_request->>'provider'<>'perflo') or
    p_request->>'operation' not in ('import','generate') then raise exception 'invalid media request'; end if;
  if p_request->>'operation'='import' then
    select * into d from public.studio_media_discoveries where id=(p_request->>'discoveryId')::uuid and workspace_id=p_workspace and project_id=p_project and expires_at>now();
    if not found or d.provider<>p_request->>'provider' or
      (case when d.kind in ('music','sound_effect') then 'audio' else d.kind end)<>p_request->>'kind' then raise exception 'media discovery unavailable'; end if;
  end if;
  if (select count(*) from public.studio_media_jobs where workspace_id=p_workspace and state not in ('completed','failed','cancelled','uncertain'))>=3 then raise exception 'media capacity reached'; end if;
  for ref in select * from jsonb_array_elements(coalesce(p_request->'inputs','[]')) loop
    if not exists(select 1 from public.studio_assets a join public.studio_revisions r on r.asset_id=a.id
      where a.workspace_id=p_workspace and a.project_id=p_project and a.id=(ref->>'assetId')::uuid and r.id=(ref->>'revisionId')::uuid and r.state='committed') then raise exception 'dependency unavailable'; end if;
  end loop;
  insert into public.studio_media_jobs(workspace_id,project_id,created_by,assignment_id,employee_id,employee_token_hash,operation_id,operation,provider,kind,name,request,discovery_id,reserved_micros)
    values(p_workspace,p_project,p_user,(s->>'assignmentId')::uuid,(s->>'employeeId')::uuid,p_hash,p_operation,p_request->>'operation',p_request->>'provider',p_request->>'kind',p_request->>'name',p_request,d.id,0) returning * into j;
  return j;
end $$;

-- Internal reservations prevent competing media jobs from promising the same
-- observed headroom. Agent37 still enforces actual LLM + tool spending together.
create function public.reserve_media_charge(p_workspace uuid,p_user uuid,p_job uuid,p_workflow text,p_available bigint,p_required bigint)
returns bigint language plpgsql security definer set search_path=public as $$
declare j public.studio_media_jobs; held bigint; amount bigint; legacy_limit bigint;
begin
  perform 1 from public.studio_media_budgets where workspace_id=p_workspace for update;
  select * into j from public.studio_media_jobs where workspace_id=p_workspace and created_by=p_user and id=p_job for update;
  if not found or j.workflow_id is distinct from p_workflow or j.operation<>'generate' then raise exception 'not found'; end if;
  if not exists(select 1 from public.workspaces where id=p_workspace and owner_id=p_user) or
    not exists(select 1 from public.studio_projects where id=j.project_id and status='active') then raise exception 'not found'; end if;
  if j.employee_token_hash is not null then perform public.studio_employee_scope(j.employee_token_hash); end if;
  if not exists(select 1 from public.studio_employees where workspace_id=p_workspace and id=j.budget_employee_id and kind='director' and instance_id=j.instance_id) then raise exception 'media budget owner unavailable'; end if;
  if j.state not in ('preparing','waiting_budget') then return j.reserved_micros; end if;
  select coalesce(sum(reserved_micros),0) into held from public.studio_media_jobs
    where workspace_id=p_workspace and instance_id=j.instance_id and id<>j.id and not billing_settled;
  if p_required<1 or p_required>10000000 then raise exception 'invalid media estimate'; end if;
  if exists(select 1 from public.studio_managed_budgets where workspace_id=p_workspace and sync_state<>'synced') then p_available:=0; end if;
  amount:=case when greatest(coalesce(p_available,0)-held,0)>=p_required then p_required else 0 end;
  -- Preserve ceilings on historical requests; new requests carry no user price.
  legacy_limit:=(j.request->>'maxCostMicros')::bigint;
  if legacy_limit>0 then amount:=least(amount,legacy_limit); end if;
  update public.studio_media_jobs set reserved_micros=amount,state=case when amount=0 then 'waiting_budget' else 'preparing' end,
    actual_micros=null,billing_settled=false,error_code=case when amount=0 then 'director_budget_required' else null end,updated_at=now() where id=j.id;
  return amount;
end $$;
revoke all on function public.reserve_media_charge(uuid,uuid,uuid,text,bigint,bigint) from public,anon,authenticated;
grant execute on function public.reserve_media_charge(uuid,uuid,uuid,text,bigint,bigint) to service_role;
