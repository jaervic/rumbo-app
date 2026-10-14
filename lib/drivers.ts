/**
 * Capa de datos de conductores (Fase 2). Solo se ejecuta en el SERVIDOR (Server Components y Server
 * Actions): usa el cliente con cookies. Las políticas RLS garantizan que recordar aquí solo devuelve
 * lo que el visitante puede ver.
 *
 * ¿Por qué no se usan los selects anidados de PostgREST (`profiles(full_name)`)? Porque la inferencia
 * de tipos de `supabase-js` para joins es frágil con tipos escritos a mano. En su lugar se hacen
 * consultas planas y se combinan en memoria: más código, pero sin `as` ni `any`.
 */

import { createClient } from "@/lib/supabase/server";
import type { DbVehicleType, DriverTariff } from "@/types/database";

/** Ficha pública resumida (listado). */
export interface PublicDriverSummary {
  id: string;
  name: string;
  bio: string;
  city: string | null;
  photoUrl: string | null;
  vehicleBrand: string;
  vehicleModel: string;
  vehicleYear: number | null;
  vehicleType: DbVehicleType;
  ratingAvg: number;
  ratingCount: number;
}

/** Ficha pública completa (detalle), con tarifas y fecha de actividad. */
export interface PublicDriverDetail extends PublicDriverSummary {
  lastSeenAt: string | null;
  tariff: DriverTariff | null;
}

/** Reseña pública con el nombre del cliente que la escribió. */
export interface PublicReview {
  id: string;
  rating: number;
  comment: string;
  createdAt: string;
  customerName: string;
}

/** El conductor propio (para el panel), con su tarifa y su estado de visibilidad. */
export interface MyDriver {
  id: string;
  fullName: string;
  bio: string;
  city: string;
  vehicleBrand: string;
  vehicleModel: string;
  vehicleYear: number | null;
  vehicleType: DbVehicleType;
  isVisible: boolean;
  isActive: boolean;
  tariff: DriverTariff | null;
}

/** Nombre a mostrar cuando el perfil no tiene `full_name`. */
const FALLBACK_NAME = "Conductor";

function toNumber(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

/** Conductores visibles y activos, ordenados por mejor valoración y luego por número de reseñas. */
export async function listVisibleDrivers(limit = 60): Promise<PublicDriverSummary[]> {
  const supabase = await createClient();

  const { data: drivers, error } = await supabase
    .from("drivers")
    .select(
      "id, profile_id, bio, city, photo_url, vehicle_brand, vehicle_model, vehicle_year, vehicle_type, rating_avg, rating_count"
    )
    .eq("is_visible", true)
    .eq("is_active", true)
    .order("rating_avg", { ascending: false })
    .order("rating_count", { ascending: false })
    .limit(limit);

  if (error !== null || drivers === null) return [];

  const profileIds = [...new Set(drivers.map((driver) => driver.profile_id))];
  const nameById = new Map<string, string>();

  if (profileIds.length > 0) {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, full_name")
      .in("id", profileIds);

    for (const profile of profiles ?? []) {
      nameById.set(profile.id, profile.full_name.trim());
    }
  }

  return drivers.map((driver) => ({
    id: driver.id,
    name: nameById.get(driver.profile_id) || FALLBACK_NAME,
    bio: driver.bio,
    city: driver.city,
    photoUrl: driver.photo_url,
    vehicleBrand: driver.vehicle_brand,
    vehicleModel: driver.vehicle_model,
    vehicleYear: driver.vehicle_year,
    vehicleType: driver.vehicle_type,
    ratingAvg: toNumber(driver.rating_avg),
    ratingCount: driver.rating_count,
  }));
}

/** Detalle público de un conductor visible. `null` si no existe o no es visible. */
export async function getPublicDriver(id: string): Promise<PublicDriverDetail | null> {
  const supabase = await createClient();

  const { data: driver, error } = await supabase
    .from("drivers")
    .select(
      "id, profile_id, bio, city, photo_url, vehicle_brand, vehicle_model, vehicle_year, vehicle_type, rating_avg, rating_count, last_seen_at"
    )
    .eq("id", id)
    .eq("is_visible", true)
    .maybeSingle();

  if (error !== null || driver === null) return null;

  const [{ data: profile }, { data: tariff }] = await Promise.all([
    supabase.from("profiles").select("full_name").eq("id", driver.profile_id).maybeSingle(),
    supabase.from("driver_tariffs").select("*").eq("driver_id", driver.id).maybeSingle(),
  ]);

  return {
    id: driver.id,
    name: profile?.full_name.trim() || FALLBACK_NAME,
    bio: driver.bio,
    city: driver.city,
    photoUrl: driver.photo_url,
    vehicleBrand: driver.vehicle_brand,
    vehicleModel: driver.vehicle_model,
    vehicleYear: driver.vehicle_year,
    vehicleType: driver.vehicle_type,
    ratingAvg: toNumber(driver.rating_avg),
    ratingCount: driver.rating_count,
    lastSeenAt: driver.last_seen_at,
    tariff: tariff ?? null,
  };
}

/** Reseñas de un conductor, de la más reciente a la más antigua. */
export async function listDriverReviews(driverId: string, limit = 50): Promise<PublicReview[]> {
  const supabase = await createClient();

  const { data: reviews, error } = await supabase
    .from("reviews")
    .select("id, rating, comment, created_at, customer_id")
    .eq("driver_id", driverId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error !== null || reviews === null) return [];

  const customerIds = [...new Set(reviews.map((review) => review.customer_id))];
  const nameById = new Map<string, string>();

  if (customerIds.length > 0) {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, full_name")
      .in("id", customerIds);

    for (const profile of profiles ?? []) {
      nameById.set(profile.id, profile.full_name.trim());
    }
  }

  return reviews.map((review) => ({
    id: review.id,
    rating: review.rating,
    comment: review.comment,
    createdAt: review.created_at,
    customerName: nameById.get(review.customer_id) || "Cliente",
  }));
}

/** El conductor del usuario autenticado (panel). `null` si aún no creó su ficha. */
export async function getMyDriver(profileId: string): Promise<MyDriver | null> {
  const supabase = await createClient();

  const { data: driver, error } = await supabase
    .from("drivers")
    .select(
      "id, bio, city, vehicle_brand, vehicle_model, vehicle_year, vehicle_type, is_visible, is_active"
    )
    .eq("profile_id", profileId)
    .maybeSingle();

  if (error !== null || driver === null) return null;

  const [{ data: profile }, { data: tariff }] = await Promise.all([
    supabase.from("profiles").select("full_name").eq("id", profileId).maybeSingle(),
    supabase.from("driver_tariffs").select("*").eq("driver_id", driver.id).maybeSingle(),
  ]);

  return {
    id: driver.id,
    fullName: profile?.full_name ?? "",
    bio: driver.bio,
    city: driver.city ?? "",
    vehicleBrand: driver.vehicle_brand,
    vehicleModel: driver.vehicle_model,
    vehicleYear: driver.vehicle_year,
    vehicleType: driver.vehicle_type,
    isVisible: driver.is_visible,
    isActive: driver.is_active,
    tariff: tariff ?? null,
  };
}
