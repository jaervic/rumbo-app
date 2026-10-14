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

/**
 * Normaliza la URL del proyecto: el SDK espera SOLO el dominio (`https://<ref>.supabase.co`).
 * Es frecuente pegar por error la URL de la API (`.../rest/v1/`); recortarla aquí evita que todas
 * las llamadas salgan con una ruta duplicada. También quita barras finales.
 */
function normalizeUrl(raw: string): string {
  return raw.trim().replace(/\/+$/, "").replace(/\/rest\/v1$/, "");
}

export const SUPABASE_URL = normalizeUrl(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "");
export const SUPABASE_ANON_KEY = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "").trim();

export const isSupabaseConfigured = SUPABASE_URL.length > 0 && SUPABASE_ANON_KEY.length > 0;
