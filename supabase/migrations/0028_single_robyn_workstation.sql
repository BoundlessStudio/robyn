-- One current Robyn identity per studio; historical employees, assignments,
-- image outcomes, media receipts and financial records remain attributable.
lock table public.studio_employees,public.studio_assignments,public.studio_media_jobs,
  public.studio_workstation_upgrades,public.studio_managed_budgets in share row exclusive mode;
do $$ begin
  if exists(select 1 from public.studio_assignments where state in ('queued','running','cancelling')
      or dispatch_state in ('dispatching','dispatched','uncertain'))
    or exists(select 1 from public.studio_media_jobs where state not in ('completed','failed','cancelled')
      or (operation='generate' and not billing_settled and (reserved_micros>0 or provider_job_id is not null)))
    or exists(select 1 from public.studio_workstation_upgrades where state in ('pending','dispatched'))
    or exists(select 1 from public.studio_managed_budgets where sync_state<>'synced')
    or exists(select 1 from public.studio_employees where provision_state='provisioning' or browser_control<>'agent'
      or (instance_id is null and provision_create_started_at is not null))
    then raise exception 'Robyn cutover requires reconciled idle workstations'; end if;
end $$;

alter table public.studio_employees add column retired_at timestamptz;
alter table public.studio_employees add column budget_cap_period text
  check(budget_cap_period ~ '^[0-9]{4}-(0[1-9]|1[0-2])$');
alter table public.studio_employees add column budget_cap_micros bigint check(budget_cap_micros>=0);
alter table public.studio_assignments add column app_id text;
alter table public.studio_assignments add column allowed_app_ids text[] not null default '{}';
alter table public.studio_assignments add column execution_model text not null default 'legacy'
  check(execution_model in ('legacy','robyn'));
alter table public.studio_assignments add column workstation_profile text
  check(workstation_profile ~ '^robyn-[0-9a-f]{32}-[1-9][0-9]*$');
alter table public.studio_employee_tokens add column employee_generation bigint;
alter table public.studio_employee_tokens add column workstation_profile text;

-- Snapshot the old application authority before changing the director identity.
update public.studio_assignments a set app_id=e.app_id,
  allowed_app_ids=case when e.app_id is null then '{}'::text[] else array[e.app_id] end
  from public.studio_employees e where e.id=a.employee_id and e.workspace_id=a.workspace_id;
update public.studio_employees set retired_at=coalesce(retired_at,now()) where employee_key<>'robyn';
-- A new row, not an old Director binding, owns the replacement workstation.
-- Legacy IDs, instance bindings and foreign keys remain intact until the
-- operator checkpoints and positively confirms their provider deletion.
insert into public.studio_employees(workspace_id,employee_key,kind,app_id,role,manifest_version,instructions,monthly_cap_micros)
  select id,'robyn','director',null,'Robyn','0',
    'Work within this project and save editable results through the private studio tools.',0
  from public.workspaces on conflict(workspace_id,employee_key) do nothing;
update public.studio_employee_tokens t set revoked_at=coalesce(t.revoked_at,now())
  from public.studio_assignments a join public.studio_employees e on e.id=a.employee_id
  where t.assignment_id=a.id and e.retired_at is not null
    and a.state not in ('running','cancelling') and a.dispatch_state not in ('dispatching','dispatched','uncertain');
alter table public.studio_employees add constraint studio_current_employee_is_robyn
  check(retired_at is not null or (employee_key='robyn' and kind='director' and app_id is null));

create table public.studio_retired_workstations (
  instance_id text primary key check(char_length(instance_id) between 1 and 200),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  employee_id uuid not null,
  operation_id uuid not null unique,
  period text not null check(period ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  budget jsonb not null check(jsonb_typeof(budget)='object'),
  usage jsonb not null check(jsonb_typeof(usage)='object'),
  metadata jsonb not null check(jsonb_typeof(metadata)='object'),
  mirror jsonb not null check(jsonb_typeof(mirror)='object'),
  archive_sha256 text not null check(archive_sha256 ~ '^[0-9a-f]{64}$'),
  archive_bytes bigint not null check(archive_bytes>=0),
  checkpointed_at timestamptz not null default now(),
  delete_started_at timestamptz,
  deleted_at timestamptz,
  deletion_receipt jsonb,
  foreign key(workspace_id,employee_id) references public.studio_employees(workspace_id,id),
  check((deleted_at is null and deletion_receipt is null) or (deleted_at is not null and delete_started_at is not null
    and deletion_receipt is not null and jsonb_typeof(deletion_receipt)='object'))
);
alter table public.studio_retired_workstations enable row level security;
revoke all on public.studio_retired_workstations from public,anon,authenticated,service_role;
grant select,insert,update on public.studio_retired_workstations to service_role;
create function public.guard_retired_workstation_checkpoint() returns trigger
language plpgsql security definer set search_path=public as $$
begin
  if tg_op='INSERT' then
    if new.metadata->>'app_workspace' is distinct from new.workspace_id::text
      or new.metadata->>'studio_employee' is distinct from new.employee_id::text
      or new.mirror->>'workspace_id' is distinct from new.workspace_id::text
      or new.mirror->>'agent37_id' is distinct from new.instance_id then raise exception 'retirement ownership mismatch'; end if;
  else
    if (to_jsonb(new)-array['delete_started_at','deleted_at','deletion_receipt'])
      is distinct from (to_jsonb(old)-array['delete_started_at','deleted_at','deletion_receipt'])
      then raise exception 'retirement checkpoint immutable'; end if;
    if old.delete_started_at is not null and new.delete_started_at is distinct from old.delete_started_at
      then raise exception 'retirement deletion fenced'; end if;
    if old.deleted_at is not null and (new.deleted_at is distinct from old.deleted_at
      or new.deletion_receipt is distinct from old.deletion_receipt) then raise exception 'retirement receipt immutable'; end if;
  end if;
  return new;
end $$;
create trigger studio_retirement_checkpoint before insert or update on public.studio_retired_workstations
  for each row execute function public.guard_retired_workstation_checkpoint();
revoke all on function public.guard_retired_workstation_checkpoint() from public,anon,authenticated;

create or replace function public.initialize_studio(p_owner uuid,p_profiles jsonb)
returns uuid language plpgsql security definer set search_path=public as $$
declare w uuid; profile jsonb; e public.studio_employees%rowtype;
begin
  if jsonb_typeof(p_profiles) is distinct from 'array' or jsonb_array_length(p_profiles)>100 then raise exception 'invalid profiles'; end if;
  insert into public.workspaces(name,owner_id) values('My creative studio',p_owner)
    on conflict(owner_id) do update set owner_id=excluded.owner_id returning id into w;
  insert into public.memberships(workspace_id,user_id,role) values(w,p_owner,'admin') on conflict do nothing;
  select * into profile from jsonb_array_elements(p_profiles) p where p->>'key'='robyn' limit 1;
  select * into e from public.studio_employees where workspace_id=w and employee_key='robyn' for update;
  if not found then
    insert into public.studio_employees(workspace_id,employee_key,kind,app_id,role,manifest_version,instructions,monthly_cap_micros)
      values(w,'robyn','director',null,'Robyn',coalesce(profile->>'version','1'),
        coalesce(profile->>'instructions','Work within this project and save editable results through the private studio tools.'),0);
  elsif profile is not null and e.manifest_version is distinct from profile->>'version' then
    update public.studio_employees set manifest_version=profile->>'version',instructions=profile->>'instructions',role='Robyn'
      where id=e.id;
  end if;
  -- A legacy server may still send the old catalogue during cutover. It must
  -- never recreate retired specialists or a separate Researcher identity.
  return w;
end $$;

create function public.create_robyn_assignment(p_workspace uuid,p_user uuid,p_project uuid,p_employee uuid,
  p_request uuid,p_brief text,p_inputs jsonb,p_app text,p_allowed_apps jsonb,p_mode text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare a public.studio_assignments%rowtype; apps text[]; ref jsonb; prior_inputs jsonb;
begin
  perform 1 from public.workspaces where id=p_workspace and owner_id=p_user for no key update;
  if not found then raise exception 'not found'; end if;
  if not exists(select 1 from public.studio_employees where workspace_id=p_workspace and id=p_employee
    and employee_key='robyn' and kind='director' and app_id is null and retired_at is null)
    or not exists(select 1 from public.studio_projects where id=p_project and workspace_id=p_workspace and status='active')
    then raise exception 'not found'; end if;
  if p_mode is null or p_mode not in ('work','draft','plan') or jsonb_typeof(p_inputs) is distinct from 'array'
    or jsonb_array_length(p_inputs)>100 or jsonb_typeof(p_allowed_apps) is distinct from 'array'
    or jsonb_array_length(p_allowed_apps) not between 1 and 100
    or exists(select 1 from jsonb_array_elements(p_allowed_apps) v where jsonb_typeof(v)<>'string'
      or v#>>'{}' !~ '^[a-z][a-z0-9-]{0,79}$') then raise exception 'invalid task scope'; end if;
  select array_agg(v#>>'{}' order by v#>>'{}') into apps from jsonb_array_elements(p_allowed_apps) v;
  if cardinality(apps)<>(select count(distinct x) from unnest(apps) x)
    or (p_app is not null and p_app<>'research' and not p_app=any(apps)) then raise exception 'invalid task scope'; end if;
  select * into a from public.studio_assignments where workspace_id=p_workspace and request_key=p_request;
  if found then
    select coalesce(jsonb_agg(jsonb_build_object('assetId',asset_id,'revisionId',revision_id) order by revision_id),'[]'::jsonb)
      into prior_inputs from public.studio_assignment_inputs where assignment_id=a.id;
    if a.execution_model<>'robyn' or a.project_id is distinct from p_project or a.employee_id is distinct from p_employee or a.brief is distinct from p_brief
      or a.app_id is distinct from p_app or a.allowed_app_ids<>apps or a.start_mode<>p_mode
      or prior_inputs<>(select coalesce(jsonb_agg(v order by v->>'revisionId'),'[]'::jsonb) from jsonb_array_elements(p_inputs) v)
      then raise exception 'operation key reused'; end if;
    return to_jsonb(a);
  end if;
  insert into public.studio_assignments(workspace_id,project_id,employee_id,request_key,brief,created_by,
    app_id,allowed_app_ids,execution_model,start_mode)
    values(p_workspace,p_project,p_employee,p_request,p_brief,p_user,p_app,apps,'robyn',p_mode) returning * into a;
  for ref in select * from jsonb_array_elements(p_inputs) loop
    if not exists(select 1 from public.studio_revisions r join public.studio_assets s on s.id=r.asset_id
      where r.workspace_id=p_workspace and s.project_id=p_project and r.asset_id=(ref->>'assetId')::uuid
        and r.id=(ref->>'revisionId')::uuid and r.state='committed') then raise exception 'dependency unavailable'; end if;
    insert into public.studio_assignment_inputs values(p_workspace,a.id,(ref->>'assetId')::uuid,(ref->>'revisionId')::uuid);
  end loop;
  if p_mode<>'work' then update public.studio_projects set brief=p_brief,updated_at=now()
    where id=p_project and workspace_id=p_workspace and brief=''; end if;
  return to_jsonb(a);
end $$;

-- Historical reconnects retain their original identity. Fresh requests must
-- freeze their server-selected multi-app authority through the new entrypoint.
create or replace function public.create_studio_assignment(p_workspace uuid,p_user uuid,p_project uuid,p_employee uuid,p_request uuid,p_brief text,p_inputs jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
declare a public.studio_assignments%rowtype; refs jsonb;
begin
  perform 1 from public.workspaces where id=p_workspace and owner_id=p_user for no key update;
  if not found then raise exception 'not found'; end if;
  select * into a from public.studio_assignments where workspace_id=p_workspace and request_key=p_request;
  if not found then raise exception 'legacy assignment creation unavailable'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('assetId',asset_id,'revisionId',revision_id) order by revision_id),'[]'::jsonb)
    into refs from public.studio_assignment_inputs where assignment_id=a.id;
  if jsonb_typeof(p_inputs) is distinct from 'array' or a.project_id is distinct from p_project or a.employee_id is distinct from p_employee or a.brief is distinct from p_brief
    or refs<>(select coalesce(jsonb_agg(v order by v->>'revisionId'),'[]'::jsonb) from jsonb_array_elements(p_inputs) v)
    then raise exception 'operation key reused'; end if;
  return to_jsonb(a);
end $$;

create function public.guard_robyn_assignment_scope() returns trigger language plpgsql set search_path=public as $$
begin
  if
    (new.workspace_id,new.project_id,new.employee_id,new.request_key,new.brief,new.app_id,new.allowed_app_ids,new.execution_model,new.start_mode)
    is distinct from
    (old.workspace_id,old.project_id,old.employee_id,old.request_key,old.brief,old.app_id,old.allowed_app_ids,old.execution_model,old.start_mode)
    then raise exception 'task scope immutable'; end if;
  if new.workstation_profile is not null and (new.execution_model<>'robyn' or new.employee_generation is null
    or new.workstation_profile<>'robyn-'||replace(new.id::text,'-','')||'-'||new.employee_generation::text)
    then raise exception 'invalid workstation profile'; end if;
  return new;
end $$;
create trigger studio_robyn_task_scope before update on public.studio_assignments
  for each row execute function public.guard_robyn_assignment_scope();
revoke all on function public.guard_robyn_assignment_scope() from public,anon,authenticated;

create or replace function public.claim_studio_assignment(p_workspace uuid,p_user uuid,p_assignment uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare a public.studio_assignments%rowtype; e public.studio_employees%rowtype; generation bigint;
begin
  perform 1 from public.workspaces where id=p_workspace and owner_id=p_user for no key update;
  if not found then raise exception 'not found'; end if;
  select * into a from public.studio_assignments where workspace_id=p_workspace and id=p_assignment for update;
  if not found then raise exception 'not found'; end if;
  select * into e from public.studio_employees where id=a.employee_id and workspace_id=p_workspace for update;
  if a.state<>'queued' or a.execution_model<>'robyn' or e.retired_at is not null or e.employee_key<>'robyn'
    or e.browser_control<>'agent' or not exists(select 1 from public.studio_projects where id=a.project_id and status='active')
    then return jsonb_build_object('claimed',false,'assignment',to_jsonb(a)); end if;
  if exists(select 1 from public.studio_assignments where workspace_id=p_workspace and id<>a.id
      and (state in ('running','cancelling') or dispatch_state in ('dispatching','dispatched','uncertain')))
    or exists(select 1 from public.studio_assignments where workspace_id=p_workspace and execution_model='robyn'
      and state='queued' and (created_at,id)<(a.created_at,a.id))
    or exists(select 1 from public.studio_media_jobs where workspace_id=p_workspace and
      (state in ('preparing','submitting','running','processing','uploading','uncertain')
       or (operation='generate' and not billing_settled and (reserved_micros>0 or provider_job_id is not null))))
    then return jsonb_build_object('claimed',false,'assignment',to_jsonb(a)); end if;
  update public.studio_employees set assignment_generation=assignment_generation+1 where id=e.id
    returning assignment_generation into generation;
  update public.studio_assignments set state='running',started_at=now(),run_attempt=gen_random_uuid(),
    session_id=replace(gen_random_uuid()::text,'-',''),employee_generation=generation,
    workstation_profile='robyn-'||replace(id::text,'-','')||'-'||generation::text
    where id=a.id returning * into a;
  return jsonb_build_object('claimed',true,'assignment',to_jsonb(a));
end $$;

create or replace function public.studio_employee_scope(p_hash text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare assignment uuid; scope jsonb;
begin
  select assignment_id into assignment from public.studio_employee_tokens where token_hash=p_hash;
  if not found then raise exception 'employee access denied'; end if;
  perform 1 from public.studio_assignments where id=assignment for update;
  select jsonb_build_object('workspaceId',a.workspace_id,'projectId',a.project_id,'assignmentId',a.id,'employeeId',e.id,
    'appId',a.app_id,'appIdHint',a.app_id,'allowedAppIds',to_jsonb(a.allowed_app_ids),
    'kind',case when a.execution_model='robyn' then 'robyn' else e.kind end,'userId',w.owner_id,
    'instanceId',t.instance_id,'brief',a.brief,'role',e.role,'startMode',a.start_mode,
    'generation',a.employee_generation,'profile',a.workstation_profile)
    into scope from public.studio_employee_tokens t join public.studio_assignments a on a.id=t.assignment_id
    join public.studio_employees e on e.id=a.employee_id join public.workspaces w on w.id=a.workspace_id
    join public.studio_projects p on p.id=a.project_id and p.workspace_id=a.workspace_id
    where t.token_hash=p_hash and t.revoked_at is null and t.expires_at>now() and a.state='running'
      and e.retired_at is null and e.browser_control='agent' and not a.browser_paused
      and e.instance_id=t.instance_id and e.provision_state='ready' and p.status='active'
      and (a.execution_model='legacy' or (e.employee_key='robyn' and a.employee_generation=e.assignment_generation
        and t.employee_generation=a.employee_generation and t.workstation_profile=a.workstation_profile
        and a.workstation_profile='robyn-'||replace(a.id::text,'-','')||'-'||a.employee_generation::text));
  if scope is null then raise exception 'employee access denied'; end if;
  return scope;
end $$;

create function public.employee_create_asset(p_hash text,p_operation uuid,p_name text,p_app text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare s jsonb; old public.studio_employee_operations%rowtype; asset public.studio_assets%rowtype;
  app text; args jsonb; result jsonb;
begin
  s:=public.studio_employee_scope(p_hash);
  if s->>'startMode'='plan' then raise exception 'planning only: production requires a new creator request'; end if;
  if s->>'kind'='robyn' then
    app:=p_app;
    if app is null or (app<>'research' and not (s->'allowedAppIds') ? app) then raise exception 'employee access denied'; end if;
    args:=jsonb_build_object('name',p_name,'appId',app);
  elsif s->>'kind'='specialist' then
    app:=s->>'appId';if p_app is not null and p_app<>app then raise exception 'employee access denied'; end if;
    args:=jsonb_build_object('name',p_name);
  else raise exception 'employee access denied'; end if;
  select * into old from public.studio_employee_operations where assignment_id=(s->>'assignmentId')::uuid and operation_id=p_operation;
  if found then
    if old.method<>'create_asset' or old.arguments<>args then raise exception 'operation key reused'; end if;
    return old.result;
  end if;
  insert into public.studio_assets(workspace_id,project_id,app_id,name,created_by)
    values((s->>'workspaceId')::uuid,(s->>'projectId')::uuid,app,p_name,(s->>'userId')::uuid) returning * into asset;
  result:=jsonb_build_object('assetId',asset.id,'name',asset.name,'appId',asset.app_id);
  insert into public.studio_employee_operations(assignment_id,operation_id,method,arguments,result)
    values((s->>'assignmentId')::uuid,p_operation,'create_asset',args,result);
  return result;
end $$;
create or replace function public.employee_create_asset(p_hash text,p_operation uuid,p_name text)
returns jsonb language plpgsql security definer set search_path=public as $$
begin return public.employee_create_asset(p_hash,p_operation,p_name,null); end $$;

create or replace function public.employee_begin_revision(p_hash text,p_operation uuid,p_asset uuid,p_base uuid,p_package jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
declare s jsonb; old public.studio_employee_operations%rowtype; args jsonb; revision uuid; ref jsonb; result jsonb; app text;
begin
  s:=public.studio_employee_scope(p_hash);
  if s->>'startMode'='plan' then raise exception 'planning only: production requires a new creator request'; end if;
  select app_id into app from public.studio_assets where id=p_asset and workspace_id=(s->>'workspaceId')::uuid
    and project_id=(s->>'projectId')::uuid;
  if not found or not ((s->>'kind'='robyn' and (app='research' or (s->'allowedAppIds') ? app))
    or (s->>'kind'='specialist' and app=s->>'appId')) then raise exception 'not found'; end if;
  args:=jsonb_build_object('assetId',p_asset,'base',p_base,'package',p_package);
  select * into old from public.studio_employee_operations where assignment_id=(s->>'assignmentId')::uuid and operation_id=p_operation;
  if found then
    if old.method<>'begin_revision' or old.arguments<>args then raise exception 'operation key reused'; end if;
    return old.result;
  end if;
  for ref in select * from jsonb_array_elements(p_package->'dependencies') loop
    if not exists(select 1 from public.studio_assets where workspace_id=(s->>'workspaceId')::uuid
      and project_id=(s->>'projectId')::uuid and id=(ref->>'assetId')::uuid) then raise exception 'dependency unavailable'; end if;
  end loop;
  revision:=public.begin_studio_revision((s->>'workspaceId')::uuid,(s->>'userId')::uuid,p_asset,p_base,p_package);
  update public.studio_revisions set author_employee_id=(s->>'employeeId')::uuid,assignment_id=(s->>'assignmentId')::uuid where id=revision;
  result:=jsonb_build_object('revisionId',revision,'status','uploading');
  insert into public.studio_employee_operations(assignment_id,operation_id,method,arguments,result)
    values((s->>'assignmentId')::uuid,p_operation,'begin_revision',args,result);
  return result;
end $$;

create or replace function public.employee_commit_revision(p_hash text,p_revision uuid,p_verified_files jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
declare s jsonb;
begin
  s:=public.studio_employee_scope(p_hash);
  if s->>'startMode'='plan' then raise exception 'planning only: production requires a new creator request'; end if;
  if not exists(select 1 from public.studio_revisions r join public.studio_assets a on a.id=r.asset_id
    where r.id=p_revision and r.workspace_id=(s->>'workspaceId')::uuid and r.assignment_id=(s->>'assignmentId')::uuid
      and r.author_employee_id=(s->>'employeeId')::uuid and a.project_id=(s->>'projectId')::uuid
      and ((s->>'kind'='robyn' and (a.app_id='research' or (s->'allowedAppIds') ? a.app_id))
        or (s->>'kind'='specialist' and a.app_id=s->>'appId'))) then raise exception 'not found'; end if;
  return public.commit_studio_revision((s->>'workspaceId')::uuid,(s->>'userId')::uuid,p_revision,p_verified_files);
end $$;

-- Provisioning always targets the new identity. Historical attempts and
-- bindings remain evidence; these entrypoints cannot resurrect them.
create or replace function public.claim_studio_employee_provision(p_workspace uuid,p_user uuid,p_employee uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare e public.studio_employees%rowtype;
begin
  perform 1 from public.workspaces where id=p_workspace and owner_id=p_user for no key update;
  if not found then raise exception 'not found'; end if;
  select * into e from public.studio_employees where workspace_id=p_workspace and id=p_employee
    and employee_key='robyn' and retired_at is null for update;
  if not found then raise exception 'not found'; end if;
  if e.instance_id is null and e.provision_attempt is null then
    update public.studio_employees set provision_state='provisioning',provision_attempt=gen_random_uuid(),provision_error=null
      where id=e.id returning * into e;
  end if;
  return to_jsonb(e);
end $$;
create or replace function public.claim_studio_employee_creation(p_workspace uuid,p_user uuid,p_employee uuid,p_attempt uuid)
returns boolean language plpgsql security definer set search_path=public as $$
begin
  perform 1 from public.workspaces where id=p_workspace and owner_id=p_user for no key update;
  if not found then raise exception 'not found'; end if;
  update public.studio_employees set provision_create_started_at=now()
    where workspace_id=p_workspace and id=p_employee and employee_key='robyn' and retired_at is null
      and p_attempt is not null and provision_attempt=p_attempt and instance_id is null
      and provision_state='provisioning' and provision_create_started_at is null;
  return found;
end $$;
create or replace function public.bind_studio_employee_instance(p_workspace uuid,p_user uuid,p_employee uuid,p_attempt uuid,p_instance text,p_template text,p_resources jsonb)
returns boolean language plpgsql security definer set search_path=public as $$
declare e public.studio_employees%rowtype;
begin
  if p_instance is null or char_length(p_instance) not between 1 and 200 then raise exception 'invalid instance'; end if;
  perform 1 from public.workspaces where id=p_workspace and owner_id=p_user for no key update;
  if not found then raise exception 'not found'; end if;
  select * into e from public.studio_employees where workspace_id=p_workspace and id=p_employee
    and employee_key='robyn' and retired_at is null for update;
  if not found then raise exception 'not found'; end if;
  if p_attempt is null or e.provision_attempt is distinct from p_attempt then return false; end if;
  if e.instance_id is not null then return e.instance_id=p_instance; end if;
  if e.provision_state<>'provisioning' or e.provision_create_started_at is null then return false; end if;
  if exists(select 1 from public.agents where agent37_id=p_instance and workspace_id<>p_workspace) then raise exception 'not found'; end if;
  insert into public.agents(agent37_id,workspace_id,name,template,cpu,memory,disk,created_by)
    values(p_instance,p_workspace,e.role,p_template,(p_resources->>'cpu')::numeric,(p_resources->>'memory')::numeric,(p_resources->>'disk')::numeric,p_user)
    on conflict(agent37_id) do nothing;
  update public.studio_employees set instance_id=p_instance where id=e.id;
  return true;
end $$;
create or replace function public.ready_studio_employee(p_workspace uuid,p_user uuid,p_employee uuid,p_instance text)
returns boolean language plpgsql security definer set search_path=public as $$
begin
  perform 1 from public.workspaces where id=p_workspace and owner_id=p_user for no key update;
  if not found then raise exception 'not found'; end if;
  update public.studio_employees set provision_state='ready',provision_error=null
    where workspace_id=p_workspace and id=p_employee and instance_id=p_instance and employee_key='robyn' and retired_at is null;
  return found;
end $$;

create or replace function public.claim_studio_assignment_dispatch(p_workspace uuid,p_user uuid,p_assignment uuid,p_workflow text,p_attempt uuid)
returns boolean language plpgsql security definer set search_path=public as $$
declare a public.studio_assignments%rowtype;
begin
  perform 1 from public.workspaces where id=p_workspace and owner_id=p_user for no key update;
  if not found then raise exception 'not found'; end if;
  select * into a from public.studio_assignments where workspace_id=p_workspace and id=p_assignment for update;
  if not found then raise exception 'not found'; end if;
  if p_workflow is null or p_attempt is null or a.workflow_id is distinct from p_workflow or a.run_attempt is distinct from p_attempt
    or a.state<>'running' or a.dispatch_state<>'idle' or a.execution_model<>'robyn' or a.browser_paused then return false; end if;
  if exists(select 1 from public.studio_assignments where workspace_id=p_workspace and id<>a.id
      and (state in ('running','cancelling') or dispatch_state in ('dispatching','dispatched','uncertain')))
    or exists(select 1 from public.studio_workstation_upgrades where employee_id=a.employee_id and state in ('pending','dispatched'))
    or exists(select 1 from public.studio_media_jobs where workspace_id=p_workspace and assignment_id is distinct from a.id
      and (state in ('preparing','submitting','running','processing','uploading','uncertain')
        or (operation='generate' and not billing_settled and (reserved_micros>0 or provider_job_id is not null)))) then return false; end if;
  if not exists(select 1 from public.studio_employees e join public.studio_projects p on p.workspace_id=e.workspace_id
    where e.id=a.employee_id and e.employee_key='robyn' and e.retired_at is null and e.instance_id is not null
      and e.provision_state='ready' and e.browser_control='agent' and e.assignment_generation=a.employee_generation
      and a.workstation_profile='robyn-'||replace(a.id::text,'-','')||'-'||a.employee_generation::text
      and p.id=a.project_id and p.status='active') then return false; end if;
  update public.studio_assignments set dispatch_state='dispatching',dispatch_started_at=now() where id=a.id;
  return true;
end $$;

create or replace function public.finish_studio_assignment(p_workspace uuid,p_user uuid,p_assignment uuid,p_workflow text,p_attempt uuid,p_response text,p_outcome text,p_text text,p_error text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare a public.studio_assignments%rowtype; next_state text; next_error text; employee_kind text;
begin
  if p_outcome is null or p_outcome not in ('completed','failed','cancelled') then raise exception 'invalid outcome'; end if;
  perform 1 from public.workspaces where id=p_workspace and owner_id=p_user for no key update;
  if not found then raise exception 'not found'; end if;
  select * into a from public.studio_assignments where workspace_id=p_workspace and id=p_assignment for update;
  if not found then raise exception 'not found'; end if;
  if p_workflow is null or p_attempt is null or a.workflow_id is distinct from p_workflow or a.run_attempt is distinct from p_attempt then return null; end if;
  if a.browser_paused and a.state='running' then return null; end if;
  if a.dispatch_state='finished' then return to_jsonb(a); end if;
  if a.state not in ('running','cancelling') then return null; end if;
  if p_response is null then
    if a.terminal_history_at is null and (a.dispatch_state<>'idle' or p_outcome='completed') then return null; end if;
  elsif a.response_id is distinct from p_response then return null; end if;
  select kind into employee_kind from public.studio_employees where id=a.employee_id;
  next_error:=left(p_error,100);
  if a.state='cancelling' or p_outcome='cancelled' then next_state:='cancelled';
  elsif p_outcome='failed' then next_state:='failed';
  elsif ((a.execution_model='robyn' and a.start_mode<>'plan' and (a.app_id is not null or a.start_mode='draft'))
      or (a.execution_model='legacy' and employee_kind='specialist'))
    and not exists(select 1 from public.studio_revisions r join public.studio_assets asset on asset.id=r.asset_id
      where r.workspace_id=p_workspace and r.assignment_id=a.id and r.state='committed'
        and (a.execution_model='legacy' or (asset.asset_kind='native' and (a.app_id is null or asset.app_id=a.app_id))))
    then next_state:='failed';next_error:='no_committed_deliverable';
  elsif a.execution_model='legacy' and a.purpose='campaign_step' and exists(select 1 from public.studio_revisions where assignment_id=a.id and state='conflict')
    then next_state:='failed';next_error:='deliverable_conflict';
  elsif a.execution_model='legacy' and (a.purpose='campaign_step' or exists(select 1 from public.studio_campaigns where root_assignment_id=a.id))
    then next_state:='completed';
  else next_state:='awaiting_review'; end if;
  update public.studio_assignments set state=next_state,dispatch_state='finished',finished_at=now(),result_text=left(p_text,65536),error_code=next_error
    where id=a.id returning * into a;
  update public.studio_employee_tokens set revoked_at=coalesce(revoked_at,now()) where assignment_id=a.id;
  insert into public.studio_activity(workspace_id,project_id,actor_user_id,kind,details)
    values(a.workspace_id,a.project_id,p_user,'assignment.'||next_state,jsonb_build_object('assignmentId',a.id,'employeeId',a.employee_id));
  return to_jsonb(a);
end $$;

create or replace function public.review_studio_assignment(p_workspace uuid,p_user uuid,p_assignment uuid,p_request uuid,p_decision text,p_feedback text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare a public.studio_assignments%rowtype; r public.studio_assignment_reviews%rowtype; inputs jsonb; next_task jsonb; next_brief text;
begin
  if p_request is null or p_decision is null or p_decision not in ('approved','changes_requested') or p_feedback is null or char_length(p_feedback)>10000
    or (p_decision='changes_requested' and char_length(trim(p_feedback))=0) then raise exception 'invalid review'; end if;
  perform 1 from public.workspaces where id=p_workspace and owner_id=p_user for no key update;
  if not found then raise exception 'not found'; end if;
  select * into a from public.studio_assignments where workspace_id=p_workspace and id=p_assignment for update;
  if not found then raise exception 'not found'; end if;
  select * into r from public.studio_assignment_reviews where assignment_id=a.id;
  if found then
    if r.request_key<>p_request or r.decision<>p_decision or r.feedback<>p_feedback then raise exception 'review already recorded'; end if;
    return to_jsonb(r);
  end if;
  if a.state<>'awaiting_review' then raise exception 'assignment not ready for review'; end if;
  if p_decision='changes_requested' then
    if a.execution_model<>'robyn' then raise exception 'historical assignment requires a new Robyn request'; end if;
    select coalesce(jsonb_agg(jsonb_build_object('assetId',asset_id,'revisionId',id)),'[]'::jsonb) into inputs
      from (select distinct on(asset_id) asset_id,id from public.studio_revisions where assignment_id=a.id and workspace_id=p_workspace
        and state='committed' order by asset_id,finalized_at desc,id desc) latest;
    if jsonb_array_length(inputs)=0 then
      select coalesce(jsonb_agg(jsonb_build_object('assetId',asset_id,'revisionId',revision_id)),'[]'::jsonb) into inputs
        from public.studio_assignment_inputs where assignment_id=a.id;
    end if;
    next_brief:='Continue the exact supplied revisions. Preserve existing work except where these requested changes require it.'||chr(10)
      ||p_feedback||chr(10)||'Original brief: '||left(a.brief,9000);
    next_task:=public.create_robyn_assignment(p_workspace,p_user,a.project_id,a.employee_id,p_request,next_brief,inputs,
      a.app_id,to_jsonb(a.allowed_app_ids),a.start_mode);
  end if;
  insert into public.studio_assignment_reviews(assignment_id,workspace_id,request_key,decision,feedback,reviewed_by,followup_assignment_id)
    values(a.id,p_workspace,p_request,p_decision,p_feedback,p_user,(next_task->>'id')::uuid) returning * into r;
  update public.studio_assignments set state='completed' where id=a.id;
  insert into public.studio_activity(workspace_id,project_id,actor_user_id,kind,details)
    values(p_workspace,a.project_id,p_user,'assignment.'||p_decision,jsonb_build_object('assignmentId',a.id,'followupAssignmentId',r.followup_assignment_id));
  return to_jsonb(r);
end $$;

-- The public name remains compatible with existing browser-control receipts;
-- the browser is now a tool on the canonical workstation.
create or replace function public.control_studio_research(p_workspace uuid,p_user uuid,p_employee uuid,p_control uuid,p_action text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare e public.studio_employees%rowtype; a public.studio_assignments%rowtype;
begin
  if p_control is null or p_action is null or p_action not in ('request','confirm','return') then raise exception 'invalid browser control'; end if;
  perform 1 from public.workspaces where id=p_workspace and owner_id=p_user for no key update;
  if not found then raise exception 'not found'; end if;
  select * into e from public.studio_employees where id=p_employee and workspace_id=p_workspace
    and employee_key='robyn' and retired_at is null for update;
  if not found or e.instance_id is null or e.provision_state<>'ready' then raise exception 'browser unavailable'; end if;
  if p_action='request' then
    if e.browser_control<>'agent' then
      if e.browser_control_id is distinct from p_control then raise exception 'browser already controlled'; end if;
    else
      select * into a from public.studio_assignments where employee_id=e.id and state in ('running','cancelling') order by created_at limit 1 for update;
      if a.id is not null then update public.studio_assignments set browser_paused=true where id=a.id; end if;
      update public.studio_employees set browser_control='requesting',browser_control_id=p_control,browser_assignment_id=a.id
        where id=e.id returning * into e;
    end if;
  elsif p_action='confirm' then
    if e.browser_control_id is distinct from p_control or e.browser_control='agent' then raise exception 'browser control changed'; end if;
    update public.studio_employees set browser_control='human' where id=e.id returning * into e;
  else
    if e.browser_control='agent' and e.browser_control_id=p_control then return to_jsonb(e); end if;
    if e.browser_control_id is distinct from p_control or e.browser_control<>'human' then raise exception 'browser control changed'; end if;
    select * into a from public.studio_assignments where id=e.browser_assignment_id for update;
    if a.id is not null and a.state='running' and a.browser_paused then
      update public.studio_assignments set
        browser_turns=browser_turns||jsonb_build_array(jsonb_build_object('sessionId',session_id,'responseId',response_id,
          'workflowId',workflow_id,'runAttempt',run_attempt,'generation',employee_generation,'profile',workstation_profile,
          'returnedAt',now(),'controlId',p_control)),
        browser_paused=false,state='queued',workflow_id=null,run_attempt=null,session_id=null,response_id=null,
        dispatch_state='idle',dispatch_started_at=null,terminal_history_at=null,employee_generation=null,workstation_profile=null,error_code=null
        where id=a.id;
      update public.studio_employee_tokens set revoked_at=coalesce(revoked_at,now()) where assignment_id=a.id;
    elsif a.id is not null then update public.studio_assignments set browser_paused=false where id=a.id;
    end if;
    update public.studio_employees set browser_control='agent' where id=e.id returning * into e;
  end if;
  return to_jsonb(e);
end $$;

create or replace function public.resume_studio_assignment_budget(p_workspace uuid,p_user uuid,p_assignment uuid,p_workflow text,p_attempt uuid)
returns boolean language plpgsql security definer set search_path=public as $$
declare a public.studio_assignments%rowtype; generation bigint;
begin
  perform 1 from public.workspaces where id=p_workspace and owner_id=p_user for no key update;
  if not found then raise exception 'not found'; end if;
  select * into a from public.studio_assignments where workspace_id=p_workspace and id=p_assignment for update;
  if not found then raise exception 'not found'; end if;
  if p_workflow is null or p_attempt is null or a.workflow_id is distinct from p_workflow or a.run_attempt is distinct from p_attempt
    or a.state<>'running' or a.execution_model<>'robyn' or not a.budget_paused or a.dispatch_state<>'dispatched'
    or a.response_id is null or a.browser_paused then return false; end if;
  if not exists(select 1 from public.studio_employees where id=a.employee_id and employee_key='robyn'
      and retired_at is null and browser_control='agent')
    or exists(select 1 from public.studio_assignments where workspace_id=p_workspace and id<>a.id
      and (state in ('running','cancelling') or dispatch_state in ('dispatching','dispatched','uncertain')))
    or exists(select 1 from public.studio_media_jobs where workspace_id=p_workspace and assignment_id is distinct from a.id
      and (state in ('preparing','submitting','running','processing','uploading','uncertain')
        or (operation='generate' and not billing_settled and (reserved_micros>0 or provider_job_id is not null)))) then return false; end if;
  update public.studio_employees set assignment_generation=assignment_generation+1 where id=a.employee_id
    returning assignment_generation into generation;
  update public.studio_assignments set
    budget_turns=budget_turns||jsonb_build_array(jsonb_build_object('sessionId',session_id,'responseId',response_id,
      'generation',employee_generation,'profile',workstation_profile,'pausedAt',now())),
    budget_paused=false,error_code=null,session_id=replace(gen_random_uuid()::text,'-',''),response_id=null,
    dispatch_state='idle',dispatch_started_at=null,terminal_history_at=null,employee_generation=generation,
    workstation_profile='robyn-'||replace(id::text,'-','')||'-'||generation::text where id=a.id;
  update public.studio_employee_tokens set revoked_at=coalesce(revoked_at,now()) where assignment_id=a.id;
  return true;
end $$;

-- The recurring allowance is separate from the current provider cap. A fixed
-- rollover intent serializes its external PATCH against owner policy changes.
alter table public.studio_managed_budgets add column cap_sync jsonb
  check(cap_sync is null or jsonb_typeof(cap_sync)='object');
drop function public.claim_studio_budget_change(uuid,uuid,uuid,jsonb,uuid,bigint,jsonb);
create function public.claim_studio_budget_change(p_workspace uuid,p_user uuid,p_operation uuid,p_request jsonb,p_lease uuid,p_current_limit bigint,p_current_allocations jsonb,p_expected_operation uuid default null)
returns jsonb language plpgsql security definer set search_path=public as $$
declare b public.studio_managed_budgets%rowtype;
begin
  perform 1 from public.workspaces where id=p_workspace and owner_id=p_user for no key update;
  if not found then raise exception 'not found'; end if;
  insert into public.studio_media_budgets(workspace_id) values(p_workspace) on conflict do nothing;
  perform 1 from public.studio_media_budgets where workspace_id=p_workspace for update;
  if exists(select 1 from public.studio_employees where workspace_id=p_workspace and retired_at is null and provision_state='provisioning')
    then raise exception 'workstation setup in progress'; end if;
  if p_operation is null or p_lease is null or jsonb_typeof(p_request) is distinct from 'object' then raise exception 'invalid budget request'; end if;
  select * into b from public.studio_managed_budgets where workspace_id=p_workspace for update;
  if found then
    if b.operation_id=p_operation and b.pending_request<>p_request then raise exception 'operation key reused'; end if;
    if b.operation_id=p_operation and b.sync_state='synced' then return jsonb_build_object('claimed',false,'saved',true); end if;
    if b.cap_sync is not null and (b.operation_id<>p_operation
      or b.cap_sync->>'ownerOperationId' is distinct from p_operation::text) then raise exception 'studio budget cap synchronization in progress'; end if;
    if b.sync_state<>'synced' and b.operation_id<>p_operation then raise exception 'studio budget update requires exact pending operation recovery'; end if;
    if b.operation_id<>p_operation and b.operation_id is distinct from p_expected_operation then raise exception 'studio budget request stale'; end if;
    if b.sync_state='applying' and b.lease_expires_at>now() then raise exception 'studio budget update in progress'; end if;
    update public.studio_managed_budgets set operation_id=p_operation,pending_request=p_request,sync_state='applying',
      lease_id=p_lease,lease_expires_at=now()+interval '10 minutes',last_error=null,updated_at=now() where workspace_id=p_workspace;
  else
    if p_expected_operation is not null then raise exception 'studio budget request stale'; end if;
    insert into public.studio_managed_budgets(workspace_id,monthly_limit_micros,allocation_mode,allocations,sync_state,operation_id,pending_request,lease_id,lease_expires_at)
      values(p_workspace,p_current_limit,'custom',p_current_allocations,'applying',p_operation,p_request,p_lease,now()+interval '10 minutes');
  end if;
  return jsonb_build_object('claimed',true,'saved',false);
end $$;
create or replace function public.stage_studio_budget_change(p_workspace uuid,p_user uuid,p_operation uuid,p_lease uuid,p_limit bigint,p_mode text,p_allocations jsonb)
returns boolean language plpgsql security definer set search_path=public as $$
declare employee uuid;
begin
  perform 1 from public.workspaces where id=p_workspace and owner_id=p_user for no key update;
  if not found then raise exception 'not found'; end if;
  select id into employee from public.studio_employees where workspace_id=p_workspace and employee_key='robyn' and retired_at is null;
  if employee is null or p_mode is null or p_mode not in ('automatic','custom') or p_limit is null or p_limit not between 0 and 9007199254740991
    or p_allocations is distinct from jsonb_build_object(employee::text,p_limit) then raise exception 'invalid studio allocations'; end if;
  update public.studio_managed_budgets set monthly_limit_micros=p_limit,allocation_mode=p_mode,allocations=p_allocations,
    lease_expires_at=now()+interval '10 minutes',updated_at=now()
    where workspace_id=p_workspace and operation_id=p_operation and lease_id=p_lease and sync_state='applying'
      and (pending_request->>'monthlyLimitMicros')::bigint=p_limit
      and (cap_sync is null or (cap_sync->>'ownerOperationId'=p_operation::text and cap_sync->>'confirmed'='true'));
  if not found then raise exception 'studio budget lease lost'; end if;
  return true;
end $$;
create or replace function public.finish_studio_budget_change(p_workspace uuid,p_user uuid,p_operation uuid,p_lease uuid,p_error text default null)
returns boolean language plpgsql security definer set search_path=public as $$
declare b public.studio_managed_budgets%rowtype; employee uuid;
begin
  perform 1 from public.workspaces where id=p_workspace and owner_id=p_user for no key update;
  if not found then raise exception 'not found'; end if;
  select * into b from public.studio_managed_budgets where workspace_id=p_workspace and operation_id=p_operation and lease_id=p_lease for update;
  if not found or b.sync_state<>'applying' then raise exception 'studio budget lease lost'; end if;
  if b.cap_sync is not null and (b.cap_sync->>'ownerOperationId' is distinct from p_operation::text
    or (p_error is null and b.cap_sync->>'confirmed' is distinct from 'true')) then raise exception 'studio budget provider write unresolved'; end if;
  if p_error is null then
    if b.monthly_limit_micros is distinct from (b.pending_request->>'monthlyLimitMicros')::bigint
      then raise exception 'studio budget policy not staged'; end if;
    select id into employee from public.studio_employees where workspace_id=p_workspace and employee_key='robyn' and retired_at is null;
    if employee is null or b.allocations is distinct from jsonb_build_object(employee::text,b.monthly_limit_micros)
      then raise exception 'invalid studio allocations'; end if;
    update public.studio_employees set monthly_cap_micros=b.monthly_limit_micros where id=employee;
  end if;
  update public.studio_managed_budgets set sync_state=case when p_error is null then 'synced' else 'failed' end,
    last_error=left(p_error,1000),lease_id=null,lease_expires_at=null,
    cap_sync=case when p_error is null then null else cap_sync end,updated_at=now() where workspace_id=p_workspace;
  return true;
end $$;

create or replace function public.guard_studio_budget_provision() returns trigger language plpgsql set search_path=public as $$
begin
  if new.provision_state='provisioning' and old.provision_state<>'provisioning' then
    if new.retired_at is not null or new.employee_key<>'robyn' then raise exception 'historical workstation is retired'; end if;
    insert into public.studio_media_budgets(workspace_id) values(new.workspace_id) on conflict do nothing;
    perform 1 from public.studio_media_budgets where workspace_id=new.workspace_id for update;
    if exists(select 1 from public.studio_managed_budgets where workspace_id=new.workspace_id
      and (sync_state in ('applying','failed') or cap_sync is not null)) then raise exception 'studio budget update in progress'; end if;
  end if;
  return new;
end $$;
revoke all on function public.guard_studio_budget_provision() from public,anon,authenticated;

-- An explicit owner change has one external cap target. Its receipt stays on
-- the operation until successful owner completion, including lost replies.
-- Reclaiming an expired owner lease never grants a second provider PATCH.
create function public.claim_studio_budget_provider_write(p_workspace uuid,p_user uuid,p_operation uuid,p_lease uuid,
  p_employee uuid,p_instance text,p_period text,p_observed_cap bigint,p_target_cap bigint)
returns jsonb language plpgsql security definer set search_path=public as $$
declare b public.studio_managed_budgets%rowtype; intent jsonb; requested_limit bigint;
begin
  perform 1 from public.workspaces where id=p_workspace and owner_id=p_user for no key update;
  if not found then raise exception 'not found'; end if;
  select * into b from public.studio_managed_budgets where workspace_id=p_workspace for update;
  if not found or b.operation_id is distinct from p_operation or b.lease_id is distinct from p_lease
    or b.sync_state<>'applying' then raise exception 'studio budget lease lost'; end if;
  requested_limit:=(b.pending_request->>'monthlyLimitMicros')::bigint;
  if p_lease is null or p_employee is null or p_instance is null or p_period is null
    or p_period !~ '^[0-9]{4}-(0[1-9]|1[0-2])$' or p_observed_cap is null or p_observed_cap<0
    or requested_limit is null or requested_limit not between 0 and 9007199254740991
    or p_target_cap is null or p_target_cap<0 or p_target_cap>requested_limit
    or not exists(select 1 from public.studio_employees where workspace_id=p_workspace and id=p_employee
      and employee_key='robyn' and retired_at is null and instance_id=p_instance)
    then raise exception 'budget cap identity changed'; end if;
  intent:=jsonb_build_object('ownerOperationId',p_operation,'employeeId',p_employee,'instanceId',p_instance,'period',p_period,
    'monthlyLimitMicros',requested_limit,'observedCapMicros',p_observed_cap,'targetCapMicros',p_target_cap);
  if b.cap_sync is not null then
    if (b.cap_sync-array['leaseId','error','confirmed']) is distinct from intent
      then raise exception 'budget provider write requires exact pending recovery'; end if;
    return jsonb_build_object('claimed',false,'intent',b.cap_sync);
  end if;
  if p_period<>to_char(now() at time zone 'UTC','YYYY-MM') then raise exception 'budget cap period changed'; end if;
  intent:=intent||jsonb_build_object('leaseId',p_lease,'confirmed',false);
  update public.studio_managed_budgets set cap_sync=intent,updated_at=now() where workspace_id=p_workspace;
  return jsonb_build_object('claimed',true,'intent',intent);
end $$;
create function public.finish_studio_budget_provider_write(p_workspace uuid,p_user uuid,p_operation uuid,p_lease uuid,
  p_employee uuid,p_instance text,p_period text,p_observed_cap bigint,p_target_cap bigint,p_write_lease uuid,p_error text default null)
returns boolean language plpgsql security definer set search_path=public as $$
declare b public.studio_managed_budgets%rowtype; intent jsonb; requested_limit bigint;
begin
  perform 1 from public.workspaces where id=p_workspace and owner_id=p_user for no key update;
  if not found then raise exception 'not found'; end if;
  select * into b from public.studio_managed_budgets where workspace_id=p_workspace for update;
  if not found or b.operation_id is distinct from p_operation or b.lease_id is distinct from p_lease
    or b.sync_state<>'applying' then raise exception 'studio budget lease lost'; end if;
  requested_limit:=(b.pending_request->>'monthlyLimitMicros')::bigint;
  intent:=jsonb_build_object('ownerOperationId',p_operation,'employeeId',p_employee,'instanceId',p_instance,'period',p_period,
    'monthlyLimitMicros',requested_limit,'observedCapMicros',p_observed_cap,'targetCapMicros',p_target_cap,'leaseId',p_write_lease);
  if (b.cap_sync-array['error','confirmed']) is distinct from intent then raise exception 'budget provider write lease lost'; end if;
  if b.cap_sync->>'confirmed'='true' then return true; end if;
  if p_error is not null then
    update public.studio_managed_budgets set cap_sync=cap_sync||jsonb_build_object('error',left(p_error,1000)),updated_at=now()
      where workspace_id=p_workspace;
    return false;
  end if;
  update public.studio_employees set budget_cap_period=p_period,budget_cap_micros=p_target_cap
    where workspace_id=p_workspace and id=p_employee and employee_key='robyn' and retired_at is null and instance_id=p_instance;
  if not found then raise exception 'budget cap identity changed'; end if;
  update public.studio_managed_budgets set cap_sync=(cap_sync-'error')||jsonb_build_object('confirmed',true),updated_at=now()
    where workspace_id=p_workspace;
  return true;
end $$;

create function public.claim_studio_budget_cap_sync(p_workspace uuid,p_employee uuid,p_instance text,p_period text,p_limit bigint,
  p_observed_cap bigint,p_target_cap bigint,p_lease uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare b public.studio_managed_budgets%rowtype; intent jsonb;
begin
  perform 1 from public.workspaces where id=p_workspace for no key update;
  if not found then raise exception 'not found'; end if;
  select * into b from public.studio_managed_budgets where workspace_id=p_workspace for update;
  if not found or b.sync_state<>'synced' then raise exception 'studio budget update in progress'; end if;
  if p_lease is null or p_period is null or p_period !~ '^[0-9]{4}-(0[1-9]|1[0-2])$'
    or p_limit is null or p_limit<0 or p_observed_cap is null or p_observed_cap<0 or p_target_cap is null
    or p_target_cap<0 or p_target_cap>p_limit or b.monthly_limit_micros<>p_limit
    or not exists(select 1 from public.studio_employees where workspace_id=p_workspace and id=p_employee
      and employee_key='robyn' and retired_at is null and instance_id=p_instance) then raise exception 'budget cap identity changed'; end if;
  intent:=jsonb_build_object('employeeId',p_employee,'instanceId',p_instance,'period',p_period,'monthlyLimitMicros',p_limit,
    'observedCapMicros',p_observed_cap,'targetCapMicros',p_target_cap);
  if b.cap_sync is not null then
    if (b.cap_sync-array['leaseId','error']) is distinct from intent then raise exception 'budget cap synchronization requires exact pending recovery'; end if;
    return jsonb_build_object('claimed',false,'intent',b.cap_sync);
  end if;
  if p_period<>to_char(now() at time zone 'UTC','YYYY-MM') or p_observed_cap=p_target_cap
    then raise exception 'budget cap period or target unchanged'; end if;
  intent:=intent||jsonb_build_object('leaseId',p_lease);
  update public.studio_managed_budgets set cap_sync=intent,updated_at=now() where workspace_id=p_workspace;
  return jsonb_build_object('claimed',true,'intent',intent);
end $$;
create function public.finish_studio_budget_cap_sync(p_workspace uuid,p_employee uuid,p_instance text,p_period text,p_limit bigint,
  p_observed_cap bigint,p_target_cap bigint,p_lease uuid,p_error text default null)
returns boolean language plpgsql security definer set search_path=public as $$
declare b public.studio_managed_budgets%rowtype; intent jsonb;
begin
  perform 1 from public.workspaces where id=p_workspace for no key update;
  if not found then raise exception 'not found'; end if;
  select * into b from public.studio_managed_budgets where workspace_id=p_workspace for update;
  intent:=jsonb_build_object('employeeId',p_employee,'instanceId',p_instance,'period',p_period,'monthlyLimitMicros',p_limit,
    'observedCapMicros',p_observed_cap,'targetCapMicros',p_target_cap,'leaseId',p_lease);
  if not found or b.sync_state<>'synced' or (b.cap_sync-'error') is distinct from intent
    then raise exception 'budget cap lease lost'; end if;
  if p_error is not null then
    update public.studio_managed_budgets set cap_sync=cap_sync||jsonb_build_object('error',left(p_error,1000)),updated_at=now()
      where workspace_id=p_workspace;
    return false;
  end if;
  update public.studio_employees set budget_cap_period=p_period,budget_cap_micros=p_target_cap
    where workspace_id=p_workspace and id=p_employee and employee_key='robyn' and retired_at is null and instance_id=p_instance;
  if not found then raise exception 'budget cap identity changed'; end if;
  update public.studio_managed_budgets set cap_sync=null,updated_at=now() where workspace_id=p_workspace;
  return true;
end $$;

-- Admissions share the assignment workspace lock. Progress, cancellation and
-- settlement deliberately do not require a free slot: an admitted child must
-- remain pollable while its parent holds the assignment lease.
create function public.studio_media_admission_available(p_workspace uuid,p_assignment uuid,p_job uuid)
returns boolean language sql stable security definer set search_path=public as $$
  select not exists(select 1 from public.studio_assignments where workspace_id=p_workspace and id is distinct from p_assignment
      and (state in ('running','cancelling') or dispatch_state in ('dispatching','dispatched','uncertain')))
    and not exists(select 1 from public.studio_media_jobs where workspace_id=p_workspace and id is distinct from p_job
      and (state in ('preparing','submitting','running','processing','uploading','uncertain')
        or (operation='generate' and not billing_settled and (reserved_micros>0 or provider_job_id is not null))));
$$;
create or replace function public.claim_media_job(p_workspace uuid,p_user uuid,p_job uuid,p_workflow text)
returns boolean language plpgsql security definer set search_path=public as $$
declare j public.studio_media_jobs%rowtype; admitted boolean;
begin
  perform 1 from public.workspaces where id=p_workspace and owner_id=p_user for no key update;
  if not found then raise exception 'not found'; end if;
  select * into j from public.studio_media_jobs where workspace_id=p_workspace and created_by=p_user and id=p_job for update;
  if not found then raise exception 'not found'; end if;
  if j.state in ('completed','failed','cancelled') and not
    (j.operation='generate' and not j.billing_settled and (j.reserved_micros>0 or j.provider_job_id is not null)) then return false; end if;
  if p_workflow is null or (j.workflow_id is not null and j.workflow_id<>p_workflow) then return false; end if;
  if j.state in ('queued','preparing','waiting_budget','waiting_capacity') and j.provider_job_id is null then
    admitted:=public.studio_media_admission_available(p_workspace,j.assignment_id,j.id);
    update public.studio_media_jobs set workflow_id=p_workflow,
      state=case when admitted then 'preparing' else 'waiting_capacity' end,
      error_code=case when admitted then null else 'media_capacity' end,updated_at=now() where id=j.id;
  else
    update public.studio_media_jobs set workflow_id=p_workflow,updated_at=now() where id=j.id;
  end if;
  return true;
end $$;
create or replace function public.begin_media_dispatch(p_workspace uuid,p_user uuid,p_job uuid,p_workflow text)
returns boolean language plpgsql security definer set search_path=public as $$
declare j public.studio_media_jobs%rowtype;
begin
  perform 1 from public.workspaces where id=p_workspace and owner_id=p_user for no key update;
  if not found then raise exception 'not found'; end if;
  select * into j from public.studio_media_jobs where workspace_id=p_workspace and created_by=p_user and id=p_job;
  if not found then return false; end if;
  if j.employee_token_hash is not null then perform public.studio_employee_scope(j.employee_token_hash); end if;
  select * into j from public.studio_media_jobs where id=j.id for update;
  if j.workflow_id is distinct from p_workflow or p_workflow is null or j.state not in ('preparing','queued')
    or not exists(select 1 from public.studio_projects where id=j.project_id and status='active')
    or (j.operation='generate' and j.reserved_micros<1) then return false; end if;
  if not public.studio_media_admission_available(p_workspace,j.assignment_id,j.id) then
    update public.studio_media_jobs set state='waiting_capacity',error_code='media_capacity',updated_at=now() where id=j.id;
    return false;
  end if;
  update public.studio_media_jobs set state='running',updated_at=now() where id=j.id;
  return true;
end $$;
create or replace function public.reserve_media_charge(p_workspace uuid,p_user uuid,p_job uuid,p_workflow text,p_available bigint,p_required bigint)
returns bigint language plpgsql security definer set search_path=public as $$
declare j public.studio_media_jobs%rowtype; held bigint; amount bigint; legacy_limit bigint; next_state text;
begin
  perform 1 from public.workspaces where id=p_workspace and owner_id=p_user for no key update;
  if not found then raise exception 'not found'; end if;
  select * into j from public.studio_media_jobs where workspace_id=p_workspace and created_by=p_user and id=p_job;
  if not found then raise exception 'not found'; end if;
  if j.employee_token_hash is not null then perform public.studio_employee_scope(j.employee_token_hash); end if;
  perform 1 from public.studio_media_budgets where workspace_id=p_workspace for update;
  select * into j from public.studio_media_jobs where id=j.id for update;
  if j.workflow_id is distinct from p_workflow or p_workflow is null or j.operation<>'generate'
    or not exists(select 1 from public.studio_projects where id=j.project_id and status='active') then raise exception 'not found'; end if;
  if not exists(select 1 from public.studio_employees where workspace_id=p_workspace and id=j.budget_employee_id
    and employee_key='robyn' and retired_at is null and instance_id=j.instance_id) then raise exception 'media budget owner unavailable'; end if;
  if j.state not in ('preparing','waiting_budget','waiting_capacity') then return j.reserved_micros; end if;
  if not public.studio_media_admission_available(p_workspace,j.assignment_id,j.id) then
    update public.studio_media_jobs set state='waiting_capacity',error_code='media_capacity',updated_at=now() where id=j.id;
    return 0;
  end if;
  select coalesce(sum(reserved_micros),0) into held from public.studio_media_jobs
    where workspace_id=p_workspace and instance_id=j.instance_id and id<>j.id and not billing_settled;
  if p_required is null or p_required not between 1 and 10000000 then raise exception 'invalid media estimate'; end if;
  if exists(select 1 from public.studio_managed_budgets where workspace_id=p_workspace and (sync_state<>'synced' or cap_sync is not null)) then p_available:=0; end if;
  amount:=case when greatest(coalesce(p_available,0)-held,0)>=p_required then p_required else 0 end;
  legacy_limit:=(j.request->>'maxCostMicros')::bigint;
  if legacy_limit>0 then amount:=least(amount,legacy_limit); end if;
  next_state:=case when amount=0 then 'waiting_budget' else 'preparing' end;
  update public.studio_media_jobs set reserved_micros=amount,state=next_state,actual_micros=null,billing_settled=false,
    error_code=case when amount=0 then 'director_budget_required' else null end,updated_at=now() where id=j.id;
  return amount;
end $$;

-- Every new entrypoint is private, including overloads and internal helpers.
do $$ declare fn regprocedure; begin
  for fn in select oid::regprocedure from pg_proc where pronamespace='public'::regnamespace and proname in (
    'initialize_studio','create_robyn_assignment','create_studio_assignment','claim_studio_assignment','studio_employee_scope',
    'employee_create_asset','employee_begin_revision','employee_commit_revision','claim_studio_employee_provision',
    'claim_studio_employee_creation','bind_studio_employee_instance','ready_studio_employee','claim_studio_assignment_dispatch',
    'finish_studio_assignment','review_studio_assignment','control_studio_research','resume_studio_assignment_budget',
    'claim_studio_budget_change','stage_studio_budget_change','finish_studio_budget_change','claim_studio_budget_cap_sync',
    'claim_studio_budget_provider_write','finish_studio_budget_provider_write',
    'finish_studio_budget_cap_sync','studio_media_admission_available','claim_media_job','begin_media_dispatch','reserve_media_charge'
  ) loop
    execute format('revoke all on function %s from public,anon,authenticated',fn);
    execute format('grant execute on function %s to service_role',fn);
  end loop;
end $$;

-- Queueing does not consume the one execution slot or block a running task's
-- own media children behind unrelated manual requests.
create or replace function public.create_media_job(p_workspace uuid,p_user uuid,p_project uuid,p_operation uuid,p_request jsonb,p_hash text default null)
returns public.studio_media_jobs language plpgsql security definer set search_path=public as $$
declare j public.studio_media_jobs; s jsonb; d public.studio_media_discoveries; ref jsonb;
begin
  perform 1 from public.workspaces where id=p_workspace and owner_id=p_user for no key update;
  if not found then raise exception 'not found'; end if;
  if not exists(select 1 from public.workspaces w join public.studio_projects p on p.workspace_id=w.id
    where w.id=p_workspace and w.owner_id=p_user and p.id=p_project and p.status='active') then raise exception 'not found'; end if;
  if p_hash is not null then
    s:=public.studio_employee_scope(p_hash);
    if s->>'workspaceId'<>p_workspace::text or s->>'projectId'<>p_project::text or s->>'userId'<>p_user::text then raise exception 'employee access denied'; end if;
  end if;
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
  for ref in select * from jsonb_array_elements(coalesce(p_request->'inputs','[]')) loop
    if not exists(select 1 from public.studio_assets a join public.studio_revisions r on r.asset_id=a.id
      where a.workspace_id=p_workspace and a.project_id=p_project and a.id=(ref->>'assetId')::uuid and r.id=(ref->>'revisionId')::uuid and r.state='committed') then raise exception 'dependency unavailable'; end if;
  end loop;
  insert into public.studio_media_jobs(workspace_id,project_id,created_by,assignment_id,employee_id,employee_token_hash,operation_id,operation,provider,kind,name,request,discovery_id,reserved_micros)
    values(p_workspace,p_project,p_user,(s->>'assignmentId')::uuid,(s->>'employeeId')::uuid,p_hash,p_operation,p_request->>'operation',p_request->>'provider',p_request->>'kind',p_request->>'name',p_request,d.id,0) returning * into j;
  return j;
end $$;


-- Keep publication lock order consistent with admission and token rotation.
create or replace function public.prepare_media_package(p_workspace uuid,p_user uuid,p_job uuid,p_package jsonb,p_provenance jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
declare j public.studio_media_jobs; a uuid; r uuid; f jsonb; ref jsonb;
begin
  perform 1 from public.workspaces where id=p_workspace and owner_id=p_user for no key update;
  if not found then raise exception 'not found'; end if;
  select * into j from public.studio_media_jobs where workspace_id=p_workspace and created_by=p_user and id=p_job for update;
  if not found then raise exception 'not found'; end if;
  if j.revision_id is not null then
    if j.package<>p_package then raise exception 'operation key reused'; end if;
    return jsonb_build_object('assetId',j.asset_id,'revisionId',j.revision_id);
  end if;
  if j.state not in ('processing','uploading') then raise exception 'media job not ready'; end if;
  if j.assignment_id is not null then
    perform 1 from public.studio_assignments where id=j.assignment_id and state='running' for update;
    if not found then raise exception 'employee access denied'; end if;
    perform 1 from public.studio_employee_tokens where token_hash=j.employee_token_hash for update;
    perform public.studio_employee_scope(j.employee_token_hash);
  end if;
  if not exists(select 1 from public.studio_projects where id=j.project_id and status='active') then raise exception 'not found'; end if;
  if jsonb_typeof(p_package->'files')<>'array' or jsonb_array_length(p_package->'files') not between 1 and 10
    or (select count(*) from jsonb_array_elements(p_package->'files') candidate where candidate->>'role'='master' and candidate->>'mimeType' like j.kind||'/%')<>1
    or p_provenance->>'provider' is distinct from j.provider then raise exception 'invalid media package'; end if;
  insert into public.studio_assets(workspace_id,project_id,app_id,asset_kind,name,created_by) values(p_workspace,j.project_id,null,j.kind,j.name,p_user) returning id into a;
  insert into public.studio_revisions(workspace_id,asset_id,author_user_id,author_employee_id,assignment_id,provenance,message)
    values(p_workspace,a,p_user,j.employee_id,j.assignment_id,p_provenance,'Acquired source media') returning id into r;
  for f in select * from jsonb_array_elements(p_package->'files') loop
    insert into public.studio_package_files(workspace_id,revision_id,path,role,mime_type,bytes,sha256,storage_key)
      values(p_workspace,r,f->>'path',f->>'role',f->>'mimeType',(f->>'bytes')::bigint,f->>'sha256',p_workspace::text||'/'||j.project_id::text||'/'||a::text||'/'||r::text||'/'||gen_random_uuid()::text);
  end loop;
  for ref in select * from jsonb_array_elements(coalesce(j.request->'inputs','[]')) loop
    insert into public.studio_revision_dependencies values(p_workspace,r,(ref->>'assetId')::uuid,(ref->>'revisionId')::uuid);
  end loop;
  update public.studio_media_jobs set asset_id=a,revision_id=r,package=p_package,state='uploading',updated_at=now() where id=p_job;
  return jsonb_build_object('assetId',a,'revisionId',r);
end $$;


-- Keep publication lock order consistent with admission and token rotation.
create or replace function public.complete_media_job(p_workspace uuid,p_user uuid,p_job uuid,p_verified jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
declare j public.studio_media_jobs; result jsonb;
begin
  perform 1 from public.workspaces where id=p_workspace and owner_id=p_user for no key update;
  if not found then raise exception 'not found'; end if;
  select * into j from public.studio_media_jobs where workspace_id=p_workspace and created_by=p_user and id=p_job for update;
  if not found then raise exception 'not found'; end if;
  if j.state='completed' then return jsonb_build_object('assetId',j.asset_id,'revisionId',j.revision_id,'status','committed'); end if;
  if j.state<>'uploading' then raise exception 'media job not ready'; end if;
  if j.assignment_id is not null then
    perform 1 from public.studio_assignments where id=j.assignment_id and state='running' for update;
    if not found then raise exception 'employee access denied'; end if;
    perform 1 from public.studio_employee_tokens where token_hash=j.employee_token_hash for update;
    perform public.studio_employee_scope(j.employee_token_hash);
  end if;
  if not exists(select 1 from public.studio_projects where id=j.project_id and status='active') then raise exception 'not found'; end if;
  result:=public.commit_studio_revision(p_workspace,p_user,j.revision_id,p_verified);
  update public.studio_media_jobs set state='completed',updated_at=now() where id=p_job;
  return result;
end $$;

