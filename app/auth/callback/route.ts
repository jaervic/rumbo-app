import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";

/**
 * Callback del enlace mágico (Fase 1): canjea el `code` por una sesión y redirige.
 *
 * Seguridad: el parámetro `next` se valida contra un open redirect. Solo se aceptan rutas internas
 * (que empiecen por "/" y NO por "//", que sería un host externo). Cualquier otra cosa cae a "/".
 *
 * Sin Supabase configurado o sin `code` válido, se vuelve al login con un aviso, sin exponer el error
 * técnico.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");

  const requestedNext = searchParams.get("next") ?? "/";
  const safeNext =
    requestedNext.startsWith("/") && !requestedNext.startsWith("//") ? requestedNext : "/";

  if (!isSupabaseConfigured) {
    return NextResponse.redirect(`${origin}/login?error=config`);
  }

  if (code !== null) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      return NextResponse.redirect(`${origin}${safeNext}`);
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth`);
}
