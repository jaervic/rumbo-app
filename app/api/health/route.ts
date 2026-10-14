import { NextResponse } from "next/server";
import { createPublicClient } from "@/lib/supabase/public";
import { isSupabaseConfigured } from "@/lib/supabase/config";

/**
 * Endpoint de salud (P8): comprobación rápida para uptime/monitorización sin dependencias externas.
 * Devuelve el estado del proceso y si la base responde. No expone datos.
 *
 * `force-dynamic` evita que Next lo prerenderice: debe ejecutarse en cada petición.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  let database: "ok" | "error" | "not_configured" = "not_configured";

  if (isSupabaseConfigured) {
    try {
      const supabase = createPublicClient();
      // Consulta mínima (head): solo interesa si hay respuesta, no los datos.
      const { error } = await supabase
        .from("drivers")
        .select("id", { count: "exact", head: true });
      database = error === null ? "ok" : "error";
    } catch {
      database = "error";
    }
  }

  return NextResponse.json({
    status: "ok",
    database,
    timestamp: new Date().toISOString(),
  });
}
