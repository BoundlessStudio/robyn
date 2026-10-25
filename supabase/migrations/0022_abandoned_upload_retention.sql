-- Explicitly abandoned creator uploads only. Never infer abandonment from age.
-- Keep manifests/tombstones for recovery identity; remove bytes through Storage,
-- not by deleting storage.objects rows. Seven days exceeds signed/TUS lifetimes.
create table public.studio_storage_retirements (
  workspace_id uuid not null references public.workspaces(id),
  storage_key text not null,
  revision_id uuid not null,
  bytes bigint not null check(bytes > 0),
  state text not null default 'quarantined' check(state in ('quarantined','deleting','deleted')),
  requested_at timestamptz not null default now(),
  not_before timestamptz not null default now() + interval '7 days',
  claim_token uuid,
  lease_until timestamptz,
  deleted_at timestamptz,
  primary key(workspace_id,storage_key),
  foreign key(workspace_id,revision_id) references public.studio_revisions(workspace_id,id),
  check(left(storage_key,37)=workspace_id::text||'/')
);
alter table public.studio_storage_retirements enable row level security;
revoke all on public.studio_storage_retirements from public,anon,authenticated;
grant select,insert,update,delete on public.studio_storage_retirements to service_role;
create index studio_storage_retirements_ready on public.studio_storage_retirements(workspace_id,not_before) where state<>'deleted';
create index studio_package_storage_references on public.studio_package_files(storage_key);

-- Serialize newly copied references against retirement, including restores and
-- forks on another asset. A tombstoned key can never become a new saved object.
create function public.guard_retired_studio_object() returns trigger
language plpgsql set search_path=public as $$
begin
  perform pg_advisory_xact_lock(hashtextextended(new.storage_key,22022));
  if exists(select 1 from public.studio_storage_retirements where storage_key=new.storage_key) then
    raise exception 'retired storage object is immutable';
  end if;
  return new;
end $$;
create trigger studio_files_retirement_guard before insert or update on public.studio_package_files
  for each row execute function public.guard_retired_studio_object();

create or replace function public.protect_final_studio_revision()
returns trigger language plpgsql set search_path=public as $$
begin
  if old.state in ('committed','conflict','abandoned') and new is distinct from old then
    raise exception 'finalized revisions are immutable';
  end if;
  return new;
end $$;

create or replace function public.protect_final_studio_package()
returns trigger language plpgsql set search_path=public as $$
begin
  if exists(select 1 from public.studio_revisions where id=new.revision_id and state in ('committed','conflict','abandoned')) then
    raise exception 'finalized revision packages are immutable';
  end if;
  if tg_op='UPDATE' and exists(select 1 from public.studio_revisions where id=old.revision_id and state in ('committed','conflict','abandoned')) then
    raise exception 'finalized revision packages are immutable';
  end if;
  return new;
end $$;

create function public.studio_revision_has_recovery_reference(p_revision uuid)
returns boolean language sql stable set search_path=public as $$
  select exists(select 1 from public.studio_assets where current_revision_id=p_revision)
    or exists(select 1 from public.studio_revisions where base_revision_id=p_revision or restored_from_id=p_revision)
    or exists(select 1 from public.studio_revision_dependencies where dependency_revision_id=p_revision)
    or exists(select 1 from public.studio_assignment_inputs where revision_id=p_revision)
    or exists(select 1 from public.studio_assignment_deliverables where revision_id=p_revision)
    or exists(select 1 from public.studio_employee_operations where result->>'revisionId'=p_revision::text)
    or exists(select 1 from public.studio_media_jobs where revision_id=p_revision);
$$;

create function public.abandon_studio_upload(p_workspace uuid,p_user uuid,p_revision uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare r public.studio_revisions; f record; queued integer:=0; shared integer:=0;
begin
  if not exists(select 1 from public.workspaces where id=p_workspace and owner_id=p_user) then raise exception 'not found'; end if;
  select * into r from public.studio_revisions where workspace_id=p_workspace and id=p_revision;
  if not found then raise exception 'not found'; end if;
  -- Same lock order as commit/restore. A racing commit wins or sees abandoned.
  perform 1 from public.studio_assets where id=r.asset_id for update;
  select * into r from public.studio_revisions where id=p_revision for update;
  if r.state not in ('uploading','abandoned') then raise exception 'saved revision cannot be abandoned'; end if;
  if r.author_employee_id is not null or r.assignment_id is not null
    or public.studio_revision_has_recovery_reference(p_revision) then raise exception 'revision retained for recovery'; end if;
  if r.state='abandoned' then
    return jsonb_build_object('revisionId',r.id,'state',r.state,'alreadyAbandoned',true);
  end if;
  update public.studio_revisions set state='abandoned',finalized_at=now() where id=r.id;
  for f in select storage_key,max(bytes) as bytes from public.studio_package_files
    where revision_id=r.id group by storage_key order by storage_key loop
    perform pg_advisory_xact_lock(hashtextextended(f.storage_key,22022));
    -- Preserve ANY other manifest reference, even another unfinished upload.
    -- Saved forks/restores can share keys and must never be deleted by age.
    if exists(select 1 from public.studio_package_files where storage_key=f.storage_key and revision_id<>r.id) then
      shared:=shared+1;
    else
      insert into public.studio_storage_retirements(workspace_id,storage_key,revision_id,bytes)
        values(p_workspace,f.storage_key,r.id,f.bytes) on conflict do nothing;
      queued:=queued+1;
    end if;
  end loop;
  insert into public.studio_activity(workspace_id,project_id,actor_user_id,kind,details)
    select p_workspace,project_id,p_user,'revision.abandoned',jsonb_build_object('revisionId',r.id,'quarantinedFiles',queued,'sharedFilesRetained',shared)
    from public.studio_assets where id=r.asset_id;
  return jsonb_build_object('revisionId',r.id,'state','abandoned','quarantinedFiles',queued,'sharedFilesRetained',shared,'notBefore',now()+interval '7 days');
end $$;

-- Check again AFTER signing transfers. Delayed Storage responses cannot hand
-- a fresh token to a caller after the revision has been explicitly abandoned.
create function public.assert_studio_upload_open(p_workspace uuid,p_revision uuid)
returns boolean language plpgsql security definer set search_path=public as $$
begin
  perform 1 from public.studio_revisions where workspace_id=p_workspace and id=p_revision and state='uploading' for share;
  if not found then raise exception 'revision is not open'; end if;
  return true;
end $$;

create function public.claim_studio_storage_retirement(p_workspace uuid,p_user uuid,p_limit integer default 50)
returns jsonb language plpgsql security definer set search_path=public as $$
declare f public.studio_storage_retirements; token uuid; claimed jsonb:='[]'::jsonb;
begin
  if not exists(select 1 from public.workspaces where id=p_workspace and owner_id=p_user) then raise exception 'not found'; end if;
  if p_limit is null or p_limit not between 1 and 100 then raise exception 'invalid cleanup limit'; end if;
  for f in select * from public.studio_storage_retirements
    where workspace_id=p_workspace and state<>'deleted' and not_before<=now()
      and (lease_until is null or lease_until<now())
    order by storage_key limit p_limit for update skip locked loop
    perform pg_advisory_xact_lock(hashtextextended(f.storage_key,22022));
    if not exists(select 1 from public.studio_revisions where id=f.revision_id and state='abandoned' and assignment_id is null and author_employee_id is null)
      or public.studio_revision_has_recovery_reference(f.revision_id)
      or exists(select 1 from public.studio_package_files where storage_key=f.storage_key and revision_id<>f.revision_id) then
      continue;
    end if;
    token:=gen_random_uuid();
    update public.studio_storage_retirements set state='deleting',claim_token=token,lease_until=now()+interval '15 minutes'
      where workspace_id=p_workspace and storage_key=f.storage_key;
    claimed:=claimed||jsonb_build_array(jsonb_build_object('storageKey',f.storage_key,'bytes',f.bytes,'claimToken',token));
  end loop;
  return claimed;
end $$;

create function public.finish_studio_storage_retirement(p_workspace uuid,p_user uuid,p_key text,p_claim uuid)
returns boolean language plpgsql security definer set search_path=public as $$
declare f public.studio_storage_retirements;
begin
  if not exists(select 1 from public.workspaces where id=p_workspace and owner_id=p_user) then raise exception 'not found'; end if;
  select * into f from public.studio_storage_retirements where workspace_id=p_workspace and storage_key=p_key for update;
  if not found or f.claim_token is distinct from p_claim or p_claim is null then return false; end if;
  if f.state='deleted' then return true; end if;
  if f.state<>'deleting' then return false; end if;
  update public.studio_storage_retirements set state='deleted',deleted_at=now(),lease_until=null where workspace_id=p_workspace and storage_key=p_key;
  return true;
end $$;

create function public.read_studio_storage_retention(p_workspace uuid,p_user uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare inventory jsonb;
begin
  if not exists(select 1 from public.workspaces where id=p_workspace and owner_id=p_user) then raise exception 'not found'; end if;
  select jsonb_build_object('manifestReferences',count(*),'manifestBytes',coalesce(sum(bytes),0)) into inventory
    from public.studio_package_files where workspace_id=p_workspace;
  return inventory||jsonb_build_object(
    'uniqueReferencedBytes',(select coalesce(sum(bytes),0) from (select max(f.bytes) as bytes from public.studio_package_files f
      where f.workspace_id=p_workspace and not exists(select 1 from public.studio_storage_retirements t where t.workspace_id=p_workspace and t.storage_key=f.storage_key and t.state='deleted') group by f.storage_key) distinct_files),
    'openCreatorUploads',(select count(*) from public.studio_revisions where workspace_id=p_workspace and state='uploading' and author_employee_id is null and assignment_id is null),
    'quarantinedBytes',(select coalesce(sum(bytes),0) from public.studio_storage_retirements where workspace_id=p_workspace and state='quarantined'),
    'pendingDeletionBytes',(select coalesce(sum(bytes),0) from public.studio_storage_retirements where workspace_id=p_workspace and state='deleting'),
    'deletedManifestBytes',(select coalesce(sum(bytes),0) from public.studio_storage_retirements where workspace_id=p_workspace and state='deleted'),
    'readyFiles',(select count(*) from public.studio_storage_retirements where workspace_id=p_workspace and state<>'deleted' and not_before<=now() and (lease_until is null or lease_until<now())));
end $$;

revoke all on function public.studio_revision_has_recovery_reference(uuid),public.abandon_studio_upload(uuid,uuid,uuid),public.assert_studio_upload_open(uuid,uuid),public.claim_studio_storage_retirement(uuid,uuid,integer),public.finish_studio_storage_retirement(uuid,uuid,text,uuid),public.read_studio_storage_retention(uuid,uuid) from public,anon,authenticated;
grant execute on function public.studio_revision_has_recovery_reference(uuid),public.abandon_studio_upload(uuid,uuid,uuid),public.assert_studio_upload_open(uuid,uuid),public.claim_studio_storage_retirement(uuid,uuid,integer),public.finish_studio_storage_retirement(uuid,uuid,text,uuid),public.read_studio_storage_retention(uuid,uuid) to service_role;
