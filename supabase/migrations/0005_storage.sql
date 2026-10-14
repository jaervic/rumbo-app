-- ============================================================================
-- P4 · Fotos de conductor (Supabase Storage)
-- ============================================================================
-- Bucket público `driver-photos`: lectura libre (la foto se muestra en el perfil
-- público), escritura SOLO del dueño. El primer segmento de la ruta es el uid del
-- conductor, y las políticas lo comprueban con `storage.foldername(name)`.
-- ============================================================================

insert into storage.buckets (id, name, public)
values ('driver-photos', 'driver-photos', true)
on conflict (id) do update set public = true;

-- Lectura pública (anon y authenticated).
drop policy if exists "driver_photos_public_read" on storage.objects;
create policy "driver_photos_public_read"
  on storage.objects for select
  using (bucket_id = 'driver-photos');

-- Escritura solo del dueño: la carpeta raíz es su uid.
drop policy if exists "driver_photos_insert_own" on storage.objects;
create policy "driver_photos_insert_own"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'driver-photos'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  );

drop policy if exists "driver_photos_update_own" on storage.objects;
create policy "driver_photos_update_own"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'driver-photos'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  );

drop policy if exists "driver_photos_delete_own" on storage.objects;
create policy "driver_photos_delete_own"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'driver-photos'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  );
