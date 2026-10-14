import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import type { Database } from "@/types/database";
import { isSupabaseConfigured, SUPABASE_ANON_KEY, SUPABASE_URL } from "./config";

type ServerClient = ReturnType<typeof createServerClient<Database>>;

/**
 * Cliente de Supabase para el SERVIDOR (Server Components, Route Handlers y Server Actions).
 *
 * Debe crearse por petición (no es singleton): depende de las cookies de ESA petición, que es donde
 * vive la sesión. `cookies()` en Next 16 es asíncrono.
 *
 * `setAll` puede lanzar cuando se llama desde un Server Component (las cookies son de solo lectura
 * en el render). Se ignora ese caso: el refresco real de la sesión lo hace el middleware, así que
 * tragarse el error aquí no deja la sesión sin renovar.
 */
export async function createClient(): Promise<ServerClient> {
  if (!isSupabaseConfigured) {
    throw new Error(
      "Supabase no está configurado: define NEXT_PUBLIC_SUPABASE_URL y NEXT_PUBLIC_SUPABASE_ANON_KEY en .env.local"
    );
  }

  const cookieStore = await cookies();

  return createServerClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Llamado desde un Server Component: el middleware ya refresca la sesión.
        }
      },
    },
  });
}
