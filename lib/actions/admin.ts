"use server";

/**
 * Server Actions de moderación (T). Solo el rol admin (marcado con `profiles.is_admin`) puede
 * resolver reportes o banear. La comprobación se hace en el SERVIDOR y la RLS la respalda
 * (`profiles_update_admin`, `reports_update_admin`, `audit_insert_admin`).
 */

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import {
  banInputSchema,
  driverBanInputSchema,
  resolveReportInputSchema,
} from "@/lib/validation";
import type { ActionResult } from "@/types";

/** Resuelve la sesión y si es admin. Devuelve el cliente para reutilizarlo. */
async function requireAdmin() {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();

  if (auth.user === null) return { supabase, userId: null as string | null, isAdmin: false };

  const { data: profile } = await supabase
    .from("profiles")
    .select("is_admin")
    .eq("id", auth.user.id)
    .maybeSingle();

  return { supabase, userId: auth.user.id, isAdmin: profile?.is_admin === true };
}

/** Marca un reporte como resuelto o descartado. */
export async function resolveReport(input: unknown): Promise<ActionResult> {
  if (!isSupabaseConfigured) return { ok: false, error: "Supabase no está configurado." };

  const parsed = resolveReportInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Datos inválidos." };

  const { supabase, userId, isAdmin } = await requireAdmin();
  if (userId === null) return { ok: false, error: "Debes iniciar sesión." };
  if (!isAdmin) return { ok: false, error: "No autorizado." };

  const { error } = await supabase
    .from("reports")
    .update({
      status: parsed.data.status,
      resolved_by: userId,
      resolved_at: new Date().toISOString(),
    })
    .eq("id", parsed.data.reportId);

  if (error !== null) return { ok: false, error: "No se pudo actualizar el reporte." };

  await supabase.from("audit_log").insert({
    actor_id: userId,
    action: `report_${parsed.data.status}`,
    target_type: "report",
    target_id: parsed.data.reportId,
  });

  revalidatePath("/admin");
  return { ok: true };
}

/** Banea o desbanea al conductor dueño de una ficha (resuelve su `profile_id` en el servidor). */
export async function setDriverBan(input: unknown): Promise<ActionResult> {
  if (!isSupabaseConfigured) return { ok: false, error: "Supabase no está configurado." };

  const parsed = driverBanInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Datos inválidos." };

  const { supabase, userId, isAdmin } = await requireAdmin();
  if (userId === null) return { ok: false, error: "Debes iniciar sesión." };
  if (!isAdmin) return { ok: false, error: "No autorizado." };

  const { data: driver } = await supabase
    .from("drivers")
    .select("profile_id")
    .eq("id", parsed.data.driverId)
    .maybeSingle();

  if (driver === undefined || driver === null) {
    return { ok: false, error: "No se encontró el conductor." };
  }

  return setBan({ profileId: driver.profile_id, banned: parsed.data.banned });
}

/** Banea o desbanea un perfil. */
export async function setBan(input: unknown): Promise<ActionResult> {
  if (!isSupabaseConfigured) return { ok: false, error: "Supabase no está configurado." };

  const parsed = banInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Datos inválidos." };

  const { supabase, userId, isAdmin } = await requireAdmin();
  if (userId === null) return { ok: false, error: "Debes iniciar sesión." };
  if (!isAdmin) return { ok: false, error: "No autorizado." };

  // Un admin no debería banearse a sí mismo (evita bloqueos accidentales).
  if (parsed.data.profileId === userId && parsed.data.banned) {
    return { ok: false, error: "No puedes suspender tu propia cuenta." };
  }

  const { error } = await supabase
    .from("profiles")
    .update({ banned: parsed.data.banned })
    .eq("id", parsed.data.profileId);

  if (error !== null) return { ok: false, error: "No se pudo actualizar la cuenta." };

  await supabase.from("audit_log").insert({
    actor_id: userId,
    action: parsed.data.banned ? "ban" : "unban",
    target_type: "profile",
    target_id: parsed.data.profileId,
  });

  revalidatePath("/admin");
  revalidatePath("/conductores");
  return { ok: true };
}
