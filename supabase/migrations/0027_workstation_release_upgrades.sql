-- Upgrade only an owned, mirrored Studio employee before its AI turn starts.
-- A dispatched image change is never repeated merely because time passed.
create table public.studio_workstation_upgrades (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  employee_id uuid not null,
  instance_id text not null check (char_length(instance_id) between 1 and 200),
  from_template text not null,
  target_template text not null,
  target_digest text not null check (target_digest ~ '^sha256:[0-9a-f]{64}$'),
  -- Retention may delete an assignment, but cannot erase an unknown provider
  -- outcome for its persistent employee. A later assignment keeps that fence.
  assignment_id uuid,
  generation bigint not null,
  state text not null default 'pending' check (state in ('pending','dispatched','ready','superseded')),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  dispatched_at timestamptz,
  completed_at timestamptz,
  check ((state in ('pending','superseded') and dispatched_at is null and completed_at is null)
    or (state='dispatched' and dispatched_at is not null and completed_at is null)
    or (state='ready' and dispatched_at is not null and completed_at is not null)),
  foreign key (workspace_id,employee_id) references public.studio_employees(workspace_id,id) on delete cascade,
  foreign key (workspace_id,assignment_id) references public.studio_assignments(workspace_id,id) on delete set null (assignment_id),
  unique(employee_id,instance_id,target_template,target_digest)
);
alter table public.studio_workstation_upgrades enable row level security;
revoke all on public.studio_workstation_upgrades from public,anon,authenticated;
grant all on public.studio_workstation_upgrades to service_role;

-- Token-bound creation already locks the assignment in studio_employee_scope;
-- image dispatch locks that assignment before checking the resulting jobs.
-- Unattributed new jobs have no Craft instance. Serialize their later binding,
-- revival and reservation here, without taking the reverse lock order during
-- creation or blocking normal progress and financial settlement.
create function public.fence_studio_workstation_media() returns trigger
language plpgsql security definer set search_path=public as $$
begin
  if new.state in ('completed','failed','cancelled') and not
    (new.operation='generate' and not new.billing_settled and (new.reserved_micros>0 or new.provider_job_id is not null)) then return new; end if;
  if tg_op='UPDATE' then
    if new.workspace_id is not distinct from old.workspace_id
      and new.instance_id is not distinct from old.instance_id
      and new.employee_id is not distinct from old.employee_id
      and new.budget_employee_id is not distinct from old.budget_employee_id
      and not (old.state in ('completed','failed','cancelled') and new.state not in ('completed','failed','cancelled'))
      and new.reserved_micros<=old.reserved_micros then return new; end if;
  end if;
  -- Current reservations use the unchanged Director. Avoid adding a workspace
  -- lock to those existing budget/assignment transactions.
  if not exists(select 1 from public.studio_employees e where e.workspace_id=new.workspace_id and e.kind='specialist'
    and ((new.instance_id is not null and (e.instance_id=new.instance_id or exists(
      select 1 from public.studio_workstation_upgrades u where u.employee_id=e.id and u.instance_id=new.instance_id and u.state='dispatched')))
      or (new.instance_id is null and (e.id=new.employee_id or e.id=new.budget_employee_id)))) then return new; end if;
  perform 1 from public.workspaces where id=new.workspace_id for no key update;
  if exists(select 1 from public.studio_workstation_upgrades u join public.studio_employees e on e.id=u.employee_id
    where u.workspace_id=new.workspace_id and e.workspace_id=new.workspace_id and e.kind='specialist' and u.state='dispatched'
      and (u.instance_id=new.instance_id or (new.instance_id is null
        and (u.employee_id=new.employee_id or u.employee_id=new.budget_employee_id)))) then
    raise exception 'workstation upgrade in progress';
  end if;
  return new;
end $$;
create trigger studio_workstation_media_fence before update of workspace_id,instance_id,employee_id,budget_employee_id,state,reserved_micros
  on public.studio_media_jobs for each row execute function public.fence_studio_workstation_media();
revoke all on function public.fence_studio_workstation_media() from public,anon,authenticated;

create function public.claim_studio_workstation_upgrade(
  p_workspace uuid,p_user uuid,p_employee uuid,p_instance text,
  p_assignment uuid,p_workflow text,p_run_attempt uuid,
  p_from_template text,p_target_template text,p_target_digest text
) returns jsonb language plpgsql security definer set search_path=public as $$
declare e public.studio_employees%rowtype; a public.studio_assignments%rowtype;
  u public.studio_workstation_upgrades%rowtype;
begin
  perform 1 from public.workspaces where id=p_workspace and owner_id=p_user for update;
  if not found then raise exception 'not found'; end if;
  select * into e from public.studio_employees where workspace_id=p_workspace and id=p_employee for update;
  if not found or e.kind<>'specialist' or e.instance_id is distinct from p_instance then raise exception 'not found'; end if;
  if not exists(select 1 from public.agents where agent37_id=p_instance and workspace_id=p_workspace
    and template in (p_from_template,p_target_template)) then raise exception 'workstation mirror mismatch'; end if;
  select j.* into a from public.studio_assignments j join public.studio_projects p on p.id=j.project_id
    where j.workspace_id=p_workspace and j.id=p_assignment and j.employee_id=e.id
      and j.workflow_id=p_workflow and j.run_attempt=p_run_attempt and j.state='running'
      and j.dispatch_state='idle' and j.employee_generation=e.assignment_generation
      and not j.browser_paused and not j.budget_paused and e.browser_control='agent'
      and p.workspace_id=p_workspace and p.status='active' for update of j;
  if not found then return null; end if;
  if exists(select 1 from public.studio_assignments where employee_id=e.id and state in ('running','cancelling')
    and dispatch_state in ('dispatching','dispatched','uncertain')) then return null; end if;
  if exists(select 1 from public.studio_media_jobs where workspace_id=p_workspace
    and (instance_id=p_instance or (instance_id is null and (employee_id=e.id or budget_employee_id=e.id)))
    and (state not in ('completed','failed','cancelled') or (operation='generate' and not billing_settled
      and (reserved_micros>0 or provider_job_id is not null)))) then return null; end if;
  if p_target_template is null or p_target_template !~ '^robyn-[a-z0-9-]+@[1-9][0-9]*$'
    or p_target_digest is null or p_target_digest !~ '^sha256:[0-9a-f]{64}$'
    or p_from_template is null or p_from_template=p_target_template then raise exception 'invalid workstation release'; end if;
  if exists(select 1 from public.studio_workstation_upgrades where employee_id=e.id and state='dispatched'
    and (instance_id<>p_instance or target_template<>p_target_template or target_digest<>p_target_digest))
    then raise exception 'workstation upgrade outcome uncertain'; end if;
  update public.studio_workstation_upgrades set state='superseded'
    where employee_id=e.id and state='pending'
      and (instance_id<>p_instance or target_template<>p_target_template or target_digest<>p_target_digest);
  insert into public.studio_workstation_upgrades(workspace_id,employee_id,instance_id,from_template,target_template,target_digest,assignment_id,generation,created_by)
    values(p_workspace,e.id,p_instance,p_from_template,p_target_template,p_target_digest,a.id,a.employee_generation,p_user)
    on conflict(employee_id,instance_id,target_template,target_digest) do nothing;
  select * into u from public.studio_workstation_upgrades where employee_id=e.id and instance_id=p_instance
    and target_template=p_target_template and target_digest=p_target_digest for update;
  if u.state in ('pending','superseded') and u.dispatched_at is null then
    update public.studio_workstation_upgrades set state='pending',from_template=p_from_template,
      assignment_id=a.id,generation=a.employee_generation where id=u.id returning * into u;
  end if;
  -- A pending image claim cannot revoke a still-running paid media token.
  -- Provisioning begins only after the final media/assignment dispatch checks.
  return to_jsonb(u);
end $$;

create function public.dispatch_studio_workstation_upgrade(
  p_workspace uuid,p_user uuid,p_employee uuid,p_instance text,p_upgrade uuid,
  p_assignment uuid,p_workflow text,p_run_attempt uuid
) returns boolean language plpgsql security definer set search_path=public as $$
declare e public.studio_employees%rowtype; a public.studio_assignments%rowtype;
begin
  perform 1 from public.workspaces where id=p_workspace and owner_id=p_user for update;
  if not found then raise exception 'not found'; end if;
  select * into e from public.studio_employees where workspace_id=p_workspace and id=p_employee for update;
  if not found or e.kind<>'specialist' or e.instance_id is distinct from p_instance then raise exception 'not found'; end if;
  select j.* into a from public.studio_assignments j join public.studio_projects p on p.id=j.project_id
    where j.workspace_id=p_workspace and j.id=p_assignment and j.employee_id=e.id
      and j.workflow_id=p_workflow and j.run_attempt=p_run_attempt and j.state='running'
      and j.dispatch_state='idle' and j.employee_generation=e.assignment_generation
      and not j.browser_paused and not j.budget_paused and e.browser_control='agent'
      and p.workspace_id=p_workspace and p.status='active' for update of j;
  if not found then return false; end if;
  if exists(select 1 from public.studio_assignments where employee_id=e.id and state in ('running','cancelling')
    and dispatch_state in ('dispatching','dispatched','uncertain')) then return false; end if;
  if exists(select 1 from public.studio_media_jobs where workspace_id=p_workspace
    and (instance_id=p_instance or (instance_id is null and (employee_id=e.id or budget_employee_id=e.id)))
    and (state not in ('completed','failed','cancelled') or (operation='generate' and not billing_settled
      and (reserved_micros>0 or provider_job_id is not null)))) then return false; end if;
  if exists(select 1 from public.studio_workstation_upgrades where employee_id=e.id and state='dispatched'
    and id<>p_upgrade) then raise exception 'workstation upgrade outcome uncertain'; end if;
  update public.studio_workstation_upgrades u set state='dispatched',dispatched_at=now()
    where u.workspace_id=p_workspace and u.employee_id=e.id and u.id=p_upgrade
      and u.instance_id=p_instance and u.assignment_id=a.id and u.generation=a.employee_generation
      and u.state='pending' and u.dispatched_at is null
      and exists(select 1 from public.agents where agent37_id=p_instance and workspace_id=p_workspace and template=u.from_template);
  if not found then return false; end if;
  update public.studio_employees set provision_state='provisioning',provision_error=null where id=e.id;
  return true;
end $$;

create function public.finish_studio_workstation_upgrade(
  p_workspace uuid,p_user uuid,p_employee uuid,p_instance text,p_target_template text,p_target_digest text
) returns boolean language plpgsql security definer set search_path=public as $$
declare e public.studio_employees%rowtype; u public.studio_workstation_upgrades%rowtype;
begin
  perform 1 from public.workspaces where id=p_workspace and owner_id=p_user for update;
  if not found then raise exception 'not found'; end if;
  select * into e from public.studio_employees where workspace_id=p_workspace and id=p_employee for update;
  if not found or e.kind<>'specialist' or e.instance_id is distinct from p_instance then raise exception 'not found'; end if;
  if p_target_template is null or p_target_template !~ '^robyn-[a-z0-9-]+@[1-9][0-9]*$'
    or p_target_digest is null or p_target_digest !~ '^sha256:[0-9a-f]{64}$' then raise exception 'invalid workstation release'; end if;
  -- Reconcile even when no matching row exists. Another in-flight target may
  -- still arrive after the current GET and must continue to fence every turn.
  if exists(select 1 from public.studio_workstation_upgrades where employee_id=e.id and state='dispatched'
    and (instance_id<>p_instance or target_template<>p_target_template or target_digest<>p_target_digest))
    then raise exception 'workstation upgrade outcome uncertain'; end if;
  -- The caller has confirmed the exact current pin through GET. A never-sent
  -- plan may be cancelled, including after a deployment rollback. Its old
  -- worker can no longer dispatch it. Unknown provider outcomes stay fenced.
  update public.studio_workstation_upgrades set state='superseded'
    where employee_id=e.id and state='pending' and dispatched_at is null;
  select * into u from public.studio_workstation_upgrades where workspace_id=p_workspace and employee_id=e.id
    and instance_id=p_instance and target_template=p_target_template and target_digest=p_target_digest for update;
  if not found then return false; end if;
  if u.state='ready' then
    if not exists(select 1 from public.agents where agent37_id=p_instance and workspace_id=p_workspace
      and template=p_target_template) then raise exception 'workstation mirror mismatch'; end if;
    return true;
  end if;
  if u.state<>'dispatched' then return false; end if;
  update public.agents set template=p_target_template where agent37_id=p_instance and workspace_id=p_workspace
    and template in (u.from_template,u.target_template);
  if not found then raise exception 'workstation mirror mismatch'; end if;
  update public.studio_workstation_upgrades set state='ready',completed_at=now() where id=u.id;
  return true;
end $$;

-- Reciprocal fence: a concurrent or delayed preparation must not dispatch an
-- AI turn while an image request is still unresolved. Use the same workspace
-- serialization as the upgrade claims before locking the assignment.
create or replace function public.claim_studio_assignment_dispatch(p_workspace uuid,p_user uuid,p_assignment uuid,p_workflow text,p_attempt uuid)
returns boolean language plpgsql security definer set search_path=public as $$
declare a public.studio_assignments%rowtype;
begin
  perform 1 from public.workspaces where id=p_workspace and owner_id=p_user for no key update;
  if not found then raise exception 'not found'; end if;
  select * into a from public.studio_assignments where workspace_id=p_workspace and id=p_assignment for update;
  if not found then raise exception 'not found'; end if;
  if p_workflow is null or p_attempt is null or a.workflow_id is distinct from p_workflow
    or a.run_attempt is distinct from p_attempt or a.state<>'running' or a.dispatch_state<>'idle' then return false; end if;
  if exists(select 1 from public.studio_workstation_upgrades where employee_id=a.employee_id and state in ('pending','dispatched')) then return false; end if;
  if not exists(select 1 from public.studio_employees e join public.studio_projects p on p.workspace_id=e.workspace_id
    where e.id=a.employee_id and e.instance_id is not null and e.provision_state='ready' and e.browser_control='agent'
      and e.assignment_generation=a.employee_generation and p.id=a.project_id and p.status='active') then return false; end if;
  update public.studio_assignments set dispatch_state='dispatching',dispatch_started_at=now() where id=a.id;
  return true;
end $$;

revoke all on function public.claim_studio_workstation_upgrade(uuid,uuid,uuid,text,uuid,text,uuid,text,text,text) from public,anon,authenticated;
revoke all on function public.dispatch_studio_workstation_upgrade(uuid,uuid,uuid,text,uuid,uuid,text,uuid) from public,anon,authenticated;
revoke all on function public.finish_studio_workstation_upgrade(uuid,uuid,uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.claim_studio_workstation_upgrade(uuid,uuid,uuid,text,uuid,text,uuid,text,text,text) to service_role;
grant execute on function public.dispatch_studio_workstation_upgrade(uuid,uuid,uuid,text,uuid,uuid,text,uuid) to service_role;
grant execute on function public.finish_studio_workstation_upgrade(uuid,uuid,uuid,text,text,text) to service_role;

