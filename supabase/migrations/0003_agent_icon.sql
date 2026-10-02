-- Display identity belongs to Robyn's tenant-scoped agent mirror.
alter table public.agents add column if not exists icon text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'agents_icon_check' and conrelid = 'public.agents'::regclass
  ) then
    alter table public.agents add constraint agents_icon_check check (
      icon is null or icon in ('bot', 'brain', 'sparkles', 'book', 'code', 'flask', 'leaf', 'compass', 'heart', 'shield', 'rocket', 'music')
    );
  end if;
end;
$$;
-- Existing service-role table grants cover this column. Browser roles have no table access.
