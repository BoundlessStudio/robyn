create table public.studio_workflow_health (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  project_id uuid not null references public.studio_projects(id) on delete cascade,
  kind text not null check(kind in ('assignment','campaign','media')),
  job_id uuid not null,
  workflow_id text not null,
  last_state text not null,
  fingerprint jsonb not null,
  last_success_at timestamptz,
  last_progress_at timestamptz not null default now(),
  last_checked_at timestamptz not null default now(),
  last_error_code text,
  consecutive_failures integer not null default 0,
  next_retry_at timestamptz,
  primary key(kind,job_id)
);
alter table public.studio_workflow_health enable row level security;
revoke all on public.studio_workflow_health from public,anon,authenticated;
grant select,insert,update,delete on public.studio_workflow_health to service_role;
create index studio_workflow_health_workspace on public.studio_workflow_health(workspace_id,last_checked_at desc);

create function public.record_studio_workflow_health(p_workspace uuid,p_user uuid,p_kind text,p_job uuid,p_workflow text,p_error text,p_delay integer)
returns integer language plpgsql security definer set search_path=public as $$
declare source_table text; j jsonb; signature jsonb; failures integer;
begin
  source_table:=case p_kind when 'assignment' then 'studio_assignments' when 'campaign' then 'studio_campaigns' when 'media' then 'studio_media_jobs' end;
  if source_table is null or not exists(select 1 from workspaces where id=p_workspace and owner_id=p_user) then raise exception 'not found'; end if;
  execute format('select to_jsonb(j) from public.%I j where id=$1 and workspace_id=$2',source_table) into j using p_job,p_workspace;
  if j is null or j->>'workflow_id' is distinct from p_workflow then return 0; end if;
  if p_error is not null and p_error not in ('platform_unavailable','resource_missing','authorization_changed','workflow_step_failed') then raise exception 'invalid diagnostic'; end if;
  signature:=jsonb_build_object('state',j->'state','error',j->'error_code','response',j->'response_id','revision',j->'revision_id','budgetPaused',j->'budget_paused');
  insert into studio_workflow_health(workspace_id,project_id,kind,job_id,workflow_id,last_state,fingerprint,last_success_at,last_error_code,consecutive_failures,next_retry_at)
    values(p_workspace,(j->>'project_id')::uuid,p_kind,p_job,p_workflow,j->>'state',signature,case when p_error is null then now() else null end,p_error,case when p_error is null then 0 else 1 end,
      case when p_delay>0 then now()+make_interval(secs=>least(p_delay,900)) else null end)
  on conflict(kind,job_id) do update set
    workflow_id=excluded.workflow_id,last_state=excluded.last_state,fingerprint=excluded.fingerprint,
    last_checked_at=now(),last_progress_at=case when studio_workflow_health.fingerprint<>excluded.fingerprint then now() else studio_workflow_health.last_progress_at end,
    last_success_at=coalesce(excluded.last_success_at,studio_workflow_health.last_success_at),
    last_error_code=p_error,consecutive_failures=case when p_error is null then 0 else studio_workflow_health.consecutive_failures+1 end,
    next_retry_at=excluded.next_retry_at returning consecutive_failures into failures;
  return failures;
end $$;
revoke all on function public.record_studio_workflow_health(uuid,uuid,text,uuid,text,text,integer) from public,anon,authenticated;
grant execute on function public.record_studio_workflow_health(uuid,uuid,text,uuid,text,text,integer) to service_role;
