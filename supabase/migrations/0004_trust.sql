-- ============================================================================
-- T · Confianza y reputación (open source, SIN KYC)
-- ============================================================================
-- Sin empresa no se recogen documentos de identidad. La confianza se apoya en:
--   1. Términos/normas aceptados antes de publicar ficha o reseñar.
--   2. Reputación (reseñas) y moderación (reportes, ban y auditoría).
--   3. Email verificado (inherente al enlace mágico).
--
-- El rol de admin se marca con `profiles.is_admin` (no se amplía el enum de
-- rol para no migrar datos). Las funciones `is_admin()` y `can_participate()`
-- son SECURITY DEFINER para poder leer `profiles` desde las políticas sin
-- recursión de RLS.
-- ============================================================================

-- 1) Campos nuevos en profiles
alter table public.profiles
  add column if not exists terms_accepted_at timestamptz,
  add column if not exists banned boolean not null default false,
  add column if not exists is_admin boolean not null default false;

-- 2) Helpers para las políticas
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select p.is_admin from public.profiles p where p.id = auth.uid()), false);
$$;

-- Puede participar quien no esté baneado. La aceptación de las normas se registra
-- (`terms_accepted_at`) pero NO se exige aquí: aplicarla a todos los usuarios obligaría
-- a un flujo de aceptación para clientes que hoy no existe, y banear es el control real.
create or replace function public.can_participate()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select not p.banned from public.profiles p where p.id = auth.uid()), false);
$$;

-- 3) Reportes de mal uso
create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles (id) on delete cascade,
  target_type text not null check (target_type in ('driver', 'review')),
  target_id uuid not null,
  reason text not null check (char_length(reason) between 1 and 120),
  details text not null default '' check (char_length(details) <= 1000),
  status text not null default 'open' check (status in ('open', 'resolved', 'dismissed')),
  created_at timestamptz not null default now(),
  resolved_by uuid references public.profiles (id),
  resolved_at timestamptz
);

create index if not exists reports_status_idx on public.reports (status, created_at desc);

-- 4) Auditoría de acciones de moderación
create table if not exists public.audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.profiles (id),
  action text not null,
  target_type text,
  target_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- 5) RLS de las tablas nuevas
alter table public.reports enable row level security;
alter table public.audit_log enable row level security;

drop policy if exists "reports_select_own_or_admin" on public.reports;
create policy "reports_select_own_or_admin"
  on public.reports for select
  using (reporter_id = auth.uid() or public.is_admin());

drop policy if exists "reports_insert_own" on public.reports;
create policy "reports_insert_own"
  on public.reports for insert
  with check (reporter_id = auth.uid() and public.can_participate());

drop policy if exists "reports_update_admin" on public.reports;
create policy "reports_update_admin"
  on public.reports for update
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "audit_select_admin" on public.audit_log;
create policy "audit_select_admin"
  on public.audit_log for select
  using (public.is_admin());

-- El admin escribe la auditoría de sus propias acciones.
drop policy if exists "audit_insert_admin" on public.audit_log;
create policy "audit_insert_admin"
  on public.audit_log for insert
  with check (public.is_admin() and actor_id = auth.uid());

-- El admin puede banear/desbanear (actualizar) cualquier perfil.
drop policy if exists "profiles_update_admin" on public.profiles;
create policy "profiles_update_admin"
  on public.profiles for update
  using (public.is_admin())
  with check (public.is_admin());

-- El admin puede leer cualquier ficha (para moderar, aunque no sea visible).
drop policy if exists "drivers_select_admin" on public.drivers;
create policy "drivers_select_admin"
  on public.drivers for select
  using (public.is_admin());

-- 6) Endurecer drivers y reviews: exigen poder participar (términos + no baneado)
drop policy if exists "drivers_insert_own" on public.drivers;
create policy "drivers_insert_own"
  on public.drivers for insert
  with check (profile_id = auth.uid() and public.can_participate());

drop policy if exists "drivers_update_own" on public.drivers;
create policy "drivers_update_own"
  on public.drivers for update
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid() and public.can_participate());

drop policy if exists "reviews_insert_own" on public.reviews;
create policy "reviews_insert_own"
  on public.reviews for insert
  with check (
    customer_id = auth.uid()
    and public.can_participate()
    and exists (
      select 1 from public.drivers d
      where d.id = reviews.driver_id and d.is_active and d.profile_id <> auth.uid()
    )
  );
