-- The creator's starting intent travels with the durable assignment, including
-- reconnects and review continuations. Planning never grants production access.
alter table public.studio_assignments add column start_mode text not null default 'work'
  check (start_mode in ('work','draft','plan'));

create function public.create_studio_start_assignment(p_workspace uuid,p_user uuid,p_project uuid,p_employee uuid,p_request uuid,p_brief text,p_inputs jsonb,p_mode text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare a public.studio_assignments%rowtype; result jsonb; replay boolean;
begin
  if p_mode is null or p_mode not in ('work','draft','plan') then raise exception 'invalid starting mode'; end if;
  perform 1 from public.workspaces where id=p_workspace and owner_id=p_user for no key update;
  if not found then raise exception 'not found'; end if;
  if p_mode<>'work' and not exists(select 1 from public.studio_employees where workspace_id=p_workspace and id=p_employee and kind='director') then
    raise exception 'starting brief requires Director';
  end if;
  select * into a from public.studio_assignments where workspace_id=p_workspace and request_key=p_request;
  replay:=found;
  if replay and a.start_mode<>p_mode then raise exception 'operation key reused'; end if;
  result:=public.create_studio_assignment(p_workspace,p_user,p_project,p_employee,p_request,p_brief,p_inputs);
  update public.studio_assignments set start_mode=p_mode where id=(result->>'id')::uuid returning * into a;
  if p_mode<>'work' and not replay then
    update public.studio_projects set brief=p_brief,updated_at=now() where workspace_id=p_workspace and id=p_project and brief='';
  end if;
  return to_jsonb(a);
end $$;

-- A blank document and its first revision share one retry identity. Lost replies
-- cannot leave duplicate documents or a different template under the same ID.
create function public.begin_studio_blank(p_workspace uuid,p_user uuid,p_project uuid,p_creation uuid,p_app text,p_name text,p_template text,p_package jsonb)
returns uuid language plpgsql security definer set search_path=public as $$
declare a public.studio_assets; r public.studio_revisions; created uuid; revision uuid; requested jsonb; prior jsonb;
begin
  if not exists(select 1 from public.workspaces where id=p_workspace and owner_id=p_user)
    or not exists(select 1 from public.studio_projects where id=p_project and workspace_id=p_workspace and status='active') then raise exception 'not found'; end if;
  if p_app is null or length(trim(p_name)) not between 1 and 160 or p_template is null
    or jsonb_typeof(p_package->'files') is distinct from 'array' or jsonb_array_length(p_package->'files') not between 1 and 200
    or coalesce(p_package->'dependencies','[]'::jsonb)<>'[]'::jsonb then raise exception 'invalid blank document'; end if;
  insert into public.studio_assets(id,workspace_id,project_id,app_id,asset_kind,name,created_by)
    values(p_creation,p_workspace,p_project,p_app,'native',p_name,p_user)
    on conflict(id) do nothing returning id into created;
  select * into a from public.studio_assets where id=p_creation and workspace_id=p_workspace and project_id=p_project and created_by=p_user for update;
  if not found or a.app_id is distinct from p_app or a.asset_kind<>'native' then raise exception 'blank identity reused'; end if;
  if created is null then
    select * into r from public.studio_revisions where asset_id=a.id and workspace_id=p_workspace and provenance->>'origin'='blank' order by created_at,id limit 1;
    if not found or r.state not in ('uploading','committed') or r.provenance->>'template' is distinct from p_template then raise exception 'blank identity reused'; end if;
    select jsonb_agg(jsonb_build_object('path',path,'role',role,'mimeType',mime_type,'bytes',bytes,'sha256',sha256) order by path) into prior
      from public.studio_package_files where revision_id=r.id and workspace_id=p_workspace;
    select jsonb_agg(f order by f->>'path') into requested from jsonb_array_elements(p_package->'files') f;
    if prior is distinct from requested then raise exception 'blank identity reused'; end if;
    return r.id;
  end if;
  revision:=public.begin_studio_revision(p_workspace,p_user,p_creation,null,p_package||jsonb_build_object('message','Started a blank document'));
  update public.studio_revisions set provenance=jsonb_build_object('origin','blank','template',p_template) where id=revision and state='uploading';
  return revision;
end $$;
revoke all on function public.begin_studio_blank(uuid,uuid,uuid,uuid,text,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.begin_studio_blank(uuid,uuid,uuid,uuid,text,text,text,jsonb) to service_role;
revoke all on function public.create_studio_start_assignment(uuid,uuid,uuid,uuid,uuid,text,jsonb,text) from public,anon,authenticated;
grant execute on function public.create_studio_start_assignment(uuid,uuid,uuid,uuid,uuid,text,jsonb,text) to service_role;

-- Review feedback continues the same permission boundary. This runs inside the
-- review transaction, before a follow-up can be observed by its workflow.
create function public.continue_studio_start_mode() returns trigger language plpgsql set search_path=public as $$
begin
  if new.followup_assignment_id is not null then
    update public.studio_assignments child set start_mode=parent.start_mode
      from public.studio_assignments parent where parent.id=new.assignment_id and parent.workspace_id=new.workspace_id
        and child.id=new.followup_assignment_id and child.workspace_id=new.workspace_id;
  end if;
  return new;
end $$;
create trigger studio_review_start_mode after insert on public.studio_assignment_reviews
  for each row execute function public.continue_studio_start_mode();

create function public.guard_studio_planning_write() returns trigger language plpgsql set search_path=public as $$
declare assignment uuid;
begin
  if tg_table_name='studio_campaigns' then assignment:=new.root_assignment_id;
  else assignment:=new.assignment_id; end if;
  if exists(select 1 from public.studio_assignments where id=assignment and start_mode='plan') then
    raise exception 'planning only: production requires a new creator request';
  end if;
  return new;
end $$;
create trigger studio_planning_campaign before insert on public.studio_campaigns
  for each row execute function public.guard_studio_planning_write();
create trigger studio_planning_media before insert on public.studio_media_jobs
  for each row execute function public.guard_studio_planning_write();
create trigger studio_planning_revision before insert on public.studio_revisions
  for each row execute function public.guard_studio_planning_write();
revoke all on function public.continue_studio_start_mode(),public.guard_studio_planning_write() from public,anon,authenticated;

create or replace function public.studio_employee_scope(p_hash text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_id uuid; v_scope jsonb;
begin
  select assignment_id into v_id from public.studio_employee_tokens where token_hash=p_hash;
  if not found then raise exception 'employee access denied'; end if;
  perform 1 from public.studio_assignments where id=v_id for update;
  select jsonb_build_object('workspaceId',a.workspace_id,'projectId',a.project_id,'assignmentId',a.id,'employeeId',e.id,'appId',e.app_id,'kind',e.kind,'userId',w.owner_id,'instanceId',t.instance_id,'brief',a.brief,'role',e.role,'startMode',a.start_mode)
    into v_scope from public.studio_employee_tokens t join public.studio_assignments a on a.id=t.assignment_id
    join public.studio_employees e on e.id=a.employee_id join public.workspaces w on w.id=a.workspace_id
    join public.studio_projects p on p.id=a.project_id
    where t.token_hash=p_hash and t.revoked_at is null and t.expires_at>now() and a.state='running' and e.browser_control='agent' and not a.browser_paused
      and e.instance_id=t.instance_id and e.provision_state='ready' and p.status='active';
  if v_scope is null then raise exception 'employee access denied'; end if;
  return v_scope;
end $$;
