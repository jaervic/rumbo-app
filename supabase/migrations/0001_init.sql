-- ============================================================================
-- Fase 1 · Esquema inicial del marketplace
-- ============================================================================
-- Tablas: profiles, drivers, driver_tariffs, reviews, plans, subscriptions.
-- Seguridad: RLS activada en TODAS las tablas (deny by default). Las políticas
-- siguen el principio de "cada uno escribe lo suyo"; lo público (perfiles de
-- conductores visibles y sus reseñas) es de solo lectura para el resto.
--
-- Datos sensibles: la ubicación exacta del conductor NO se expone directamente;
-- la columna `location` se leerá solo a través de una función RPC que la
-- aproxima (Fase 3), nunca con un SELECT del cliente.
-- ============================================================================

create extension if not exists postgis with schema extensions;

-- ----------------------------------------------------------------------------
-- Tipos
-- ----------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'user_role') then
    create type public.user_role as enum ('driver', 'customer');
  end if;
  if not exists (select 1 from pg_type where typname = 'subscription_status') then
    create type public.subscription_status as enum ('inactive', 'pending', 'active', 'expired');
  end if;
  if not exists (select 1 from pg_type where typname = 'vehicle_type') then
    create type public.vehicle_type as enum ('moto', 'sedan', 'suv', 'van');
  end if;
end $$;

-- ----------------------------------------------------------------------------
-- profiles
-- ----------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  role public.user_role not null default 'customer',
  full_name text not null default '',
  phone text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- drivers (perfil público del conductor)
-- ----------------------------------------------------------------------------
create table if not exists public.drivers (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null unique references public.profiles (id) on delete cascade,
  bio text not null default '',
  photo_url text,
  vehicle_brand text not null default '',
  vehicle_model text not null default '',
  vehicle_year int,
  vehicle_type public.vehicle_type not null default 'sedan',
  is_active boolean not null default false,
  is_visible boolean not null default false,
  location extensions.geography(point, 4326),
  last_seen_at timestamptz,
  city text,
  rating_avg numeric(3, 2) not null default 0,
  rating_count int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists drivers_location_idx on public.drivers using gist (location);
create index if not exists drivers_visible_idx on public.drivers (is_visible) where is_visible;

-- ----------------------------------------------------------------------------
-- driver_tariffs (las cuatro tarifas propias del conductor)
-- ----------------------------------------------------------------------------
create table if not exists public.driver_tariffs (
  driver_id uuid primary key references public.drivers (id) on delete cascade,
  base_fare numeric(6, 2) not null,
  cost_per_km numeric(6, 2) not null,
  cost_per_min numeric(6, 2) not null,
  min_fare numeric(6, 2) not null,
  updated_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- reviews (reseñas de clientes a conductores)
-- ----------------------------------------------------------------------------
create table if not exists public.reviews (
  id uuid primary key default gen_random_uuid(),
  driver_id uuid not null references public.drivers (id) on delete cascade,
  customer_id uuid not null references public.profiles (id) on delete cascade,
  rating int not null check (rating between 1 and 5),
  comment text not null default '' check (char_length(comment) <= 1000),
  created_at timestamptz not null default now(),
  -- Una reseña por cliente y conductor.
  unique (driver_id, customer_id)
);

create index if not exists reviews_driver_id_idx on public.reviews (driver_id, created_at desc);

-- ----------------------------------------------------------------------------
-- plans y subscriptions (esquema listo; sin cobro hasta validar)
-- ----------------------------------------------------------------------------
create table if not exists public.plans (
  id text primary key,
  name text not null,
  price_usd numeric(8, 2) not null,
  interval text not null default 'month',
  features jsonb not null default '[]'::jsonb,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  driver_id uuid not null unique references public.drivers (id) on delete cascade,
  plan_id text references public.plans (id),
  status public.subscription_status not null default 'inactive',
  provider text not null default 'manual',
  provider_ref text,
  current_period_end timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================================================
-- Row Level Security
-- ============================================================================
alter table public.profiles enable row level security;
alter table public.drivers enable row level security;
alter table public.driver_tariffs enable row level security;
alter table public.reviews enable row level security;
alter table public.plans enable row level security;
alter table public.subscriptions enable row level security;

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------
drop policy if exists "profiles_select_own_or_public_driver" on public.profiles;
create policy "profiles_select_own_or_public_driver"
  on public.profiles for select
  using (
    id = auth.uid()
    or exists (
      select 1 from public.drivers d
      where d.profile_id = profiles.id and d.is_visible
    )
  );

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own"
  on public.profiles for insert
  with check (id = auth.uid());

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
  on public.profiles for update
  using (id = auth.uid())
  with check (id = auth.uid());
-- Sin política de delete: se borra en cascada desde auth.users.

-- ---------------------------------------------------------------------------
-- drivers
-- ---------------------------------------------------------------------------
drop policy if exists "drivers_select_visible_or_own" on public.drivers;
create policy "drivers_select_visible_or_own"
  on public.drivers for select
  using (is_visible or profile_id = auth.uid());

drop policy if exists "drivers_insert_own" on public.drivers;
create policy "drivers_insert_own"
  on public.drivers for insert
  with check (profile_id = auth.uid());

drop policy if exists "drivers_update_own" on public.drivers;
create policy "drivers_update_own"
  on public.drivers for update
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid());

drop policy if exists "drivers_delete_own" on public.drivers;
create policy "drivers_delete_own"
  on public.drivers for delete
  using (profile_id = auth.uid());

-- ---------------------------------------------------------------------------
-- driver_tariffs (dueño o conductor visible)
-- ---------------------------------------------------------------------------
drop policy if exists "driver_tariffs_select_visible_or_own" on public.driver_tariffs;
create policy "driver_tariffs_select_visible_or_own"
  on public.driver_tariffs for select
  using (
    exists (
      select 1 from public.drivers d
      where d.id = driver_tariffs.driver_id and (d.is_visible or d.profile_id = auth.uid())
    )
  );

drop policy if exists "driver_tariffs_write_own" on public.driver_tariffs;
create policy "driver_tariffs_write_own"
  on public.driver_tariffs for all
  using (
    exists (
      select 1 from public.drivers d
      where d.id = driver_tariffs.driver_id and d.profile_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.drivers d
      where d.id = driver_tariffs.driver_id and d.profile_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- reviews (lectura pública de conductores visibles; escribe el propio cliente)
-- ---------------------------------------------------------------------------
drop policy if exists "reviews_select_public_or_own" on public.reviews;
create policy "reviews_select_public_or_own"
  on public.reviews for select
  using (
    customer_id = auth.uid()
    or exists (
      select 1 from public.drivers d
      where d.id = reviews.driver_id and d.is_visible
    )
  );

drop policy if exists "reviews_insert_own" on public.reviews;
create policy "reviews_insert_own"
  on public.reviews for insert
  with check (
    customer_id = auth.uid()
    -- No se puede reseñar un conductor inactivo, ni reseñarse a uno mismo.
    and exists (
      select 1 from public.drivers d
      where d.id = reviews.driver_id and d.is_active and d.profile_id <> auth.uid()
    )
  );

drop policy if exists "reviews_update_own" on public.reviews;
create policy "reviews_update_own"
  on public.reviews for update
  using (customer_id = auth.uid())
  with check (customer_id = auth.uid());

drop policy if exists "reviews_delete_own" on public.reviews;
create policy "reviews_delete_own"
  on public.reviews for delete
  using (customer_id = auth.uid());

-- ---------------------------------------------------------------------------
-- plans (lectura pública de planes activos; escribe solo service_role)
-- ---------------------------------------------------------------------------
drop policy if exists "plans_select_active" on public.plans;
create policy "plans_select_active"
  on public.plans for select
  using (is_active);

-- ---------------------------------------------------------------------------
-- subscriptions (solo el dueño puede LEER; escribe solo service_role/webhook)
-- ---------------------------------------------------------------------------
drop policy if exists "subscriptions_select_own" on public.subscriptions;
create policy "subscriptions_select_own"
  on public.subscriptions for select
  using (
    exists (
      select 1 from public.drivers d
      where d.id = subscriptions.driver_id and d.profile_id = auth.uid()
    )
  );

-- ============================================================================
-- Triggers
-- ============================================================================

-- updated_at automático
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_updated_at on public.profiles;
create trigger set_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

drop trigger if exists set_updated_at on public.drivers;
create trigger set_updated_at before update on public.drivers
  for each row execute function public.set_updated_at();

drop trigger if exists set_updated_at on public.driver_tariffs;
create trigger set_updated_at before update on public.driver_tariffs
  for each row execute function public.set_updated_at();

drop trigger if exists set_updated_at on public.subscriptions;
create trigger set_updated_at before update on public.subscriptions
  for each row execute function public.set_updated_at();

-- Perfil automático al crear el usuario en auth
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, avatar_url)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    new.raw_user_meta_data ->> 'avatar_url'
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Recalcular rating_avg / rating_count del conductor tras cada reseña
create or replace function public.refresh_driver_rating()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_driver uuid;
begin
  if (tg_op = 'DELETE') then
    target_driver := old.driver_id;
  else
    target_driver := new.driver_id;
  end if;

  update public.drivers d
  set
    rating_avg = coalesce(
      (select round(avg(rating)::numeric, 2) from public.reviews where driver_id = target_driver),
      0
    ),
    rating_count = (
      select count(*) from public.reviews where driver_id = target_driver
    )
  where d.id = target_driver;

  return null;
end;
$$;

drop trigger if exists reviews_refresh_rating on public.reviews;
create trigger reviews_refresh_rating
  after insert or update or delete on public.reviews
  for each row execute function public.refresh_driver_rating();

-- ============================================================================
-- Datos iniciales: planes (sin cobro activo todavía)
-- ============================================================================
insert into public.plans (id, name, price_usd, interval, features)
values
  (
    'basico',
    'Básico',
    0,
    'month',
    '["Perfil público","Aparecer en la búsqueda de cercanos"]'::jsonb
  ),
  (
    'pro',
    'Pro',
    0,
    'month',
    '["Todo lo de Básico","Insignia destacada","Estadísticas"]'::jsonb
  )
on conflict (id) do nothing;
