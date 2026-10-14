"use server";

/**
 * Server Actions de conductores y reseñas (Fase 2).
 *
 * Reglas de seguridad aplicadas en todas:
 * 1. `isSupabaseConfigured`: sin backend no se intenta nada.
 * 2. Validación con Zod del input (`unknown`) ANTES de tocar la base.
 * 3. La sesión se resuelve en el SERVIDOR (`auth.getUser`), nunca se confía en un id del cliente.
 * 4. Los errores de Postgres se traducen a mensajes genéricos: no se filtran detalles internos.
 * 5. RLS en la base es la última barrera (defensa en profundidad).
 */

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { driverProfileInputSchema, reviewInputSchema } from "@/lib/validation";
import type { ActionResult } from "@/types";

/** Guarda (crea o actualiza) la ficha pública del conductor autenticado. */
export async function saveDriverProfile(input: unknown): Promise<ActionResult> {
  if (!isSupabaseConfigured) {
    return { ok: false, error: "Supabase no está configurado." };
  }

  const parsed = driverProfileInputSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  }

  const data = parsed.data;
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();

  if (auth.user === null) {
    return { ok: false, error: "Debes iniciar sesión." };
  }

  // 1) Rol y nombre en el perfil. Upsert por si el trigger de alta no existía al registrarse.
  const { error: profileError } = await supabase
    .from("profiles")
    .upsert({ id: auth.user.id, role: "driver", full_name: data.fullName }, { onConflict: "id" });

  if (profileError !== null) {
    return { ok: false, error: "No se pudo guardar tu perfil." };
  }

  // 2) Ficha del conductor. `is_active` sigue a `is_visible` en este MVP (publicar = activo).
  const { data: driver, error: driverError } = await supabase
    .from("drivers")
    .upsert(
      {
        profile_id: auth.user.id,
        bio: data.bio,
        city: data.city.length > 0 ? data.city : null,
        vehicle_brand: data.vehicleBrand,
        vehicle_model: data.vehicleModel,
        vehicle_year: data.vehicleYear,
        vehicle_type: data.vehicleType,
        is_visible: data.isVisible,
        is_active: data.isVisible,
        last_seen_at: new Date().toISOString(),
      },
      { onConflict: "profile_id" }
    )
    .select("id")
    .single();

  if (driverError !== null || driver === null) {
    return { ok: false, error: "No se pudo guardar tu perfil de conductor." };
  }

  // 3) Tarifas propias (una fila por conductor).
  const { error: tariffError } = await supabase
    .from("driver_tariffs")
    .upsert(
      {
        driver_id: driver.id,
        base_fare: data.tariff.baseFare,
        cost_per_km: data.tariff.costPerKm,
        cost_per_min: data.tariff.costPerMin,
        min_fare: data.tariff.minFare,
      },
      { onConflict: "driver_id" }
    );

  if (tariffError !== null) {
    return { ok: false, error: "No se pudieron guardar tus tarifas." };
  }

  revalidatePath("/panel");
  revalidatePath("/conductores");
  revalidatePath(`/conductores/${driver.id}`);

  return { ok: true };
}

/** Publica una reseña del cliente autenticado sobre un conductor. */
export async function submitReview(input: unknown): Promise<ActionResult> {
  if (!isSupabaseConfigured) {
    return { ok: false, error: "Supabase no está configurado." };
  }

  const parsed = reviewInputSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  }

  const data = parsed.data;
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();

  if (auth.user === null) {
    return { ok: false, error: "Debes iniciar sesión." };
  }

  // La RLS comprueba que el conductor esté activo y que no te estés reseñando a ti mismo.
  const { error } = await supabase.from("reviews").insert({
    driver_id: data.driverId,
    customer_id: auth.user.id,
    rating: data.rating,
    comment: data.comment,
  });

  if (error !== null) {
    // Conflicto por el `unique (driver_id, customer_id)`: ya existe una reseña tuya.
    if (error.code === "23505") {
      return { ok: false, error: "Ya dejaste una reseña para este conductor." };
    }
    return { ok: false, error: "No se pudo publicar la reseña." };
  }

  revalidatePath(`/conductores/${data.driverId}`);
  revalidatePath("/conductores");

  return { ok: true };
}
