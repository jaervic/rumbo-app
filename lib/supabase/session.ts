import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import type { Database } from "@/types/database";
import { isSupabaseConfigured, SUPABASE_ANON_KEY, SUPABASE_URL } from "./config";

/**
 * Mantiene viva la sesión de Supabase en cada petición.
 *
 * ¿Por qué hace falta? Las cookies de sesión caducan; sin refrescarlas en el middleware, un usuario
 * con sesión válida empezaría a fallar en peticiones del servidor tras el primer expirado. El
 * patrón es el oficial de `@supabase/ssr`: se crea el cliente sobre las cookies de la petición y
 * `getUser()` provoca el refresco, que el cliente escribe en la respuesta.
 *
 * Sin Supabase configurado es un no-op: la app sigue siendo estática y funcional sin `.env.local`.
 */
export async function updateSession(request: NextRequest): Promise<NextResponse> {
  if (!isSupabaseConfigured) return NextResponse.next({ request });

  let response = NextResponse.next({ request });

  const supabase = createServerClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        // Las cookies nuevas se escriben tanto en la petición (para el handler actual) como en la
        // respuesta (para el navegador).
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }

        response = NextResponse.next({ request });

        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  // No quitar: fuerza el refresco de la sesión y valida el usuario en el servidor.
  await supabase.auth.getUser();

  return response;
}
