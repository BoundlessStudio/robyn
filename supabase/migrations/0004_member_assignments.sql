begin;

alter table public.memberships drop constraint if exists memberships_role_check;
alter table public.memberships add constraint memberships_role_check check (role in ('admin', 'member'));
alter table public.invitations drop constraint if exists invitations_role_check;
alter table public.invitations add constraint invitations_role_check check (role in ('admin', 'member'));
alter table public.invitations alter column role set default 'member';

-- Assignment is separate from the creator audit field. Existing agents stay accessible to
-- admins; assign them to their creator where that user still belongs to the workspace.
alter table public.agents add column if not exists assigned_user_id uuid;
-- Run this backfill only on the first application, so replaying setup cannot reassign
-- agents whose assignee has since left the workspace.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'agents_assigned_membership_fkey' and conrelid = 'public.agents'::regclass) then
    update public.agents a set assigned_user_id = a.created_by
    where a.assigned_user_id is null and exists (
      select 1 from public.memberships m where m.workspace_id = a.workspace_id and m.user_id = a.created_by
    );
    alter table public.agents add constraint agents_assigned_membership_fkey
      foreign key (workspace_id, assigned_user_id) references public.memberships (workspace_id, user_id)
      on delete set null (assigned_user_id);
  end if;
end;
$$;
create index if not exists agents_assignment_idx on public.agents (workspace_id, assigned_user_id);

-- Return a display name with the existing member fields. Only the server may call this RPC.
create or replace function public.get_workspace_members_with_names(p_workspace uuid)
returns table (user_id uuid, email text, name text, role text, created_at timestamptz)
language sql security definer set search_path = public
as $$
  select m.user_id, u.email::text,
    coalesce(nullif(trim(u.raw_user_meta_data->>'full_name'), ''), nullif(trim(u.raw_user_meta_data->>'name'), '')),
    m.role, m.created_at
  from public.memberships m join auth.users u on u.id = m.user_id
  where m.workspace_id = p_workspace order by m.created_at;
$$;
revoke all on function public.get_workspace_members_with_names(uuid) from public, anon, authenticated;
grant execute on function public.get_workspace_members_with_names(uuid) to service_role;
revoke all on function public.get_workspace_members(uuid) from public, anon, authenticated;

-- Reusing an invite must not change an existing role (especially the owner's admin role).
create or replace function public.accept_invitation(p_token uuid, p_user uuid)
returns uuid language plpgsql security definer set search_path = public
as $$
declare v_inv public.invitations%rowtype;
begin
  select * into v_inv from public.invitations where token = p_token for update;
  if not found then raise exception 'invitation not found'; end if;
  if v_inv.expires_at < now() then raise exception 'invitation expired'; end if;
  insert into public.memberships (workspace_id, user_id, role)
    values (v_inv.workspace_id, p_user, v_inv.role)
    on conflict (workspace_id, user_id) do nothing;
  delete from public.invitations where token = p_token;
  return v_inv.workspace_id;
end;
$$;
revoke all on function public.accept_invitation(uuid, uuid) from public, anon, authenticated;
grant execute on function public.accept_invitation(uuid, uuid) to service_role;

drop policy if exists agents_select on public.agents;
create policy agents_select on public.agents for select using (
  public.is_workspace_admin(workspace_id) or
  (public.is_workspace_member(workspace_id) and assigned_user_id = auth.uid())
);

-- The BFF is the authorization boundary. Keep browser access to table data disabled;
-- an admin's display controls and a member's agent controls both use server routes.
revoke all on public.workspaces, public.memberships, public.invitations, public.agents
  from public, anon, authenticated;

commit;
