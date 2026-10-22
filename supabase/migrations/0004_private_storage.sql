insert into storage.buckets(id, name, public, file_size_limit)
  values ('studio-assets', 'studio-assets', false, 10737418240)
  on conflict (id) do update set public = false;

-- Signed transfers are authorized by the server. No browser JWT may reach the
-- private bucket through a permissive policy another app may have installed.
drop policy if exists robyn_private_bucket on storage.objects;
create policy robyn_private_bucket on storage.objects as restrictive for all to anon, authenticated
  using (bucket_id <> 'studio-assets') with check (bucket_id <> 'studio-assets');
