-- ============================================================================
-- P6 · Conductores cercanos (PostGIS)
-- ============================================================================
-- RPC `nearby_drivers`: devuelve conductores VISIBLES y ACTIVOS dentro de un
-- radio, ordenados por distancia. Es `security definer` porque necesita leer la
-- columna `location` (que para `anon` quedó revocada en 0003) y porque el
-- visitante puede no tener sesión.
--
-- PRIVACIDAD: nunca devuelve la coordenada exacta; la redondea a 2 decimales
-- (~1,1 km) y devuelve la DISTANCIA real. Así se puede ubicar al conductor en un
-- mapa aproximado sin exponer su posición precisa.
-- ============================================================================

create or replace function public.nearby_drivers(
  p_lat double precision,
  p_lng double precision,
  p_radius_km double precision default 10,
  p_limit int default 50
)
returns table (
  id uuid,
  name text,
  bio text,
  city text,
  photo_url text,
  vehicle_brand text,
  vehicle_model text,
  vehicle_year int,
  vehicle_type public.vehicle_type,
  rating_avg numeric,
  rating_count int,
  distance_km double precision,
  latitude double precision,
  longitude double precision
)
language sql
stable
security definer
set search_path = public
as $$
  select
    d.id,
    coalesce(nullif(p.full_name, ''), 'Conductor') as name,
    d.bio,
    d.city,
    d.photo_url,
    d.vehicle_brand,
    d.vehicle_model,
    d.vehicle_year,
    d.vehicle_type,
    d.rating_avg,
    d.rating_count,
    round(st_distance(d.location, st_makepoint(p_lng, p_lat)::geography)::numeric / 1000.0, 2)::double precision
      as distance_km,
    -- Coordenada APROXIMADA (2 decimales ≈ 1,1 km), nunca la exacta.
    round(st_y(d.location::geometry)::numeric, 2)::double precision as latitude,
    round(st_x(d.location::geometry)::numeric, 2)::double precision as longitude
  from public.drivers d
  join public.profiles p on p.id = d.profile_id
  where d.is_visible
    and d.is_active
    and not p.banned
    and d.location is not null
    and st_dwithin(d.location, st_makepoint(p_lng, p_lat)::geography, p_radius_km * 1000)
  order by distance_km asc
  limit greatest(1, least(p_limit, 100));
$$;

grant execute on function public.nearby_drivers(double precision, double precision, double precision, int)
  to anon, authenticated;
