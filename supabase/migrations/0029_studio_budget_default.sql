-- New studios start with a $20 monthly AI allowance. Preserve every existing
-- owner's allowance, including an explicit $0 opt-out and historical budgets.
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
        coalesce(profile->>'instructions','Work within this project and save editable results through the private studio tools.'),20000000);
  elsif profile is not null and e.manifest_version is distinct from profile->>'version' then
    update public.studio_employees set manifest_version=profile->>'version',instructions=profile->>'instructions',role='Robyn'
      where id=e.id;
  end if;
  return w;
end $$;
