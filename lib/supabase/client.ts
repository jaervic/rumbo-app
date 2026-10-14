import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@/types/database";
import { isSupabaseConfigured, SUPABASE_ANON_KEY, SUPABASE_URL } from "./config";

/**
 * Cliente de Supabase para el NAVEGADOR (Client Components).
 *
 * Se guarda en un singleton para no crear una instancia nueva en cada render: el cliente de auth
 * mantiene estado (sesión, listeners) y duplicarlo causaría parpadeos y suscripciones repetidas.
 *
 * Lanza si falta configuración a propósito: si un componente llegó aquí sin `.env.local`, es un
 * error de montaje que interesa ver, no algo que deba fallar en silencio.
 */
type BrowserClient = ReturnType<typeof createBrowserClient<Database>>;

let browserClient: BrowserClient | null = null;

export function createClient(): BrowserClient {
  if (!isSupabaseConfigured) {
    throw new Error(
      "Supabase no está configurado: define NEXT_PUBLIC_SUPABASE_URL y NEXT_PUBLIC_SUPABASE_ANON_KEY en .env.local"
    );
  }

  if (browserClient === null) {
    browserClient = createBrowserClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY);
  }

  return browserClient;
}
