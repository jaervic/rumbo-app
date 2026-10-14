import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/session";

/**
 * Proxy raíz (Fase 1): refresca la sesión de Supabase en cada navegación.
 *
 * Nota: en Next 16 el archivo se llama `proxy.ts` y la función `proxy` (el antiguo `middleware`).
 * Aquí hace de frontera de red para mantener las cookies de sesión al día.
 *
 * El matcher EXCLUYE los assets estáticos y las imágenes de Next: no tienen sesión que refrescar y
 * el proxy solo añadiría latencia. `_next/static`, `_next/image` y el favicon quedan fuera.
 */
export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
