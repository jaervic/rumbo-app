-- ============================================================================
-- P1 · Se retira el modelo de suscripción
-- ============================================================================
-- El proyecto pasa a ser open source con donaciones voluntarias: no hay cobro
-- ni planes. Se eliminan `subscriptions` y `plans` (creadas en 0001) y el enum
-- `subscription_status`, que dejan de tener uso.
--
-- Nota: `subscriptions` referencia a `plans`, así que se elimina primero.
-- ============================================================================

drop table if exists public.subscriptions;
drop table if exists public.plans;
drop type if exists public.subscription_status;
