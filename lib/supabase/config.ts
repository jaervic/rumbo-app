/**
 * Configuración de Supabase (Fase 1).
 *
 * Las dos variables son `NEXT_PUBLIC_*` porque el SDK de Supabase también corre en el navegador
 * (auth por enlace mágico). La `anon key` es PÚBLICA por diseño: no da acceso a nada que las
 * políticas RLS no permitan. La `service_role` NUNCA se pone en el cliente.
 *
 * `isSupabaseConfigured` permite que la app siga funcionando sin backend: el cotizador no debe
 * romperse por no tener `.env.local`. Middleware y clientes comprueban esta bandera antes de usar
 * el SDK, así que sin variables no hay errores ni pantallas rotas.
 */

export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
export const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

export const isSupabaseConfigured = SUPABASE_URL.length > 0 && SUPABASE_ANON_KEY.length > 0;
