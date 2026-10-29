-- Hosted Supabase may enable safeupdate. Keep credential replacement atomic
-- while explicitly scoping session revocation to the sole admin account.
create or replace function public.configure_beta_admin(p_username text, p_password_hash text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  insert into public.studio_beta_admin(singleton, username, password_hash) values (true, p_username, p_password_hash)
    on conflict (singleton) do update set username = excluded.username, password_hash = excluded.password_hash, updated_at = now();
  delete from public.studio_beta_admin_sessions where admin = true;
end;
$$;
revoke all on function public.configure_beta_admin(text,text) from public, anon, authenticated;
grant execute on function public.configure_beta_admin(text,text) to service_role;
