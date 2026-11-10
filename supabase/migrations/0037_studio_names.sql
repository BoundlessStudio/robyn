-- Use the invited owner's account email for default studio names. Apply the
-- same rule to the old placeholder; other studio names are creator choices.
create function public.studio_default_name(p_email text)
returns text language sql immutable set search_path=pg_catalog as $$
  select coalesce(nullif(rtrim(left(initcap(btrim(regexp_replace(
    split_part(split_part(p_email,'@',1),'+',1), '[^[:alnum:]]+', ' ', 'g'
  ))),111)), '') || '''s Studio', 'My creative studio');
$$;
revoke all on function public.studio_default_name(text) from public, anon, authenticated;

update public.workspaces w set name=public.studio_default_name(u.email)
  from auth.users u where w.owner_id=u.id and w.name='My creative studio'
  and public.studio_default_name(u.email) <> w.name;

create or replace function public.initialize_studio(p_owner uuid,p_profiles jsonb)
returns uuid language plpgsql security definer set search_path=public as $$
declare w uuid; profile jsonb; e public.studio_employees%rowtype;
begin
  if jsonb_typeof(p_profiles) is distinct from 'array' or jsonb_array_length(p_profiles)>100 then raise exception 'invalid profiles'; end if;
  insert into public.workspaces(name,owner_id)
    values(public.studio_default_name((select email from auth.users where id=p_owner)),p_owner)
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
