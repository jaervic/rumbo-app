-- ============================================================================
-- P3 · Privacidad de la ubicación del conductor
-- ============================================================================
-- La RLS de Postgres es por FILA, no por columna: la política de `drivers`
-- permite a `anon` leer las filas visibles, pero eso incluiría `location` (la
-- coordenada exacta). Un `GET /rest/v1/drivers?select=location` la expondría.
--
-- Dos capas:
--   1. Se revoca el privilegio de SELECT sobre la columna `location` para los
--      roles públicos. El código de la app nunca selecciona esa columna (lista
--      columnas explícitas), así que no se rompe nada.
--   2. Una vista `public_drivers` con la superficie pública permitida y sin la
--      columna sensible, por si en el futuro se consulta por REST.
--
-- La cercanía (Fase 3) leerá `location` desde una función RPC con `security
-- definer` que devolverá una coordenada APROXIMADA, nunca la exacta.
-- ============================================================================

-- 1) El rol público no puede leer la coordenada exacta ni directamente.
revoke select (location) on public.drivers from anon, authenticated;

-- 2) Vista pública sin `location`. `security_invoker` hace que respete la RLS de
--    la tabla base (el rol que consulta solo ve lo que sus políticas permiten) y
--    añade el filtro de visibilidad/actividad.
drop view if exists public.public_drivers;
create view public.public_drivers
with (security_invoker = true) as
select
  id,
  profile_id,
  bio,
  photo_url,
  vehicle_brand,
  vehicle_model,
  vehicle_year,
  vehicle_type,
  city,
  rating_avg,
  rating_count,
  last_seen_at,
  created_at,
  updated_at
from public.drivers
where is_visible and is_active;

grant select on public.public_drivers to anon, authenticated;
