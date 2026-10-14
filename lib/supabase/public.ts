import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { isSupabaseConfigured, SUPABASE_ANON_KEY, SUPABASE_URL } from "./config";

/**
 * Cliente de Supabase SIN sesión ni cookies (D5), para contextos del servidor FIERA de la petición:
 * `sitemap.ts` y `robots.ts` se generan sin usuario y no pueden usar `cookies()`.
 *
 * Usa la `anon key` (pública) y `persistSession: false`: solo puede leer lo que las políticas RLS
 * permitan a `anon` (los perfiles de conductores visibles), nunca datos privados.
 */
export function createPublicClient() {
  if (!isSupabaseConfigured) {
    throw new Error("Supabase no está configurado.");
  }

  return createClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
