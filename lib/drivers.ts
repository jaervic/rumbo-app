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
import type {
  DbVehicleType,
  DriverTariff,
  ReportStatus,
  ReportTargetType,
} from "@/types/database";

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

/** El conductor propio (para el panel), con su tarifa y su estado. */
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
  /** T: ya aceptó las normas. */
  termsAccepted: boolean;
  /** T: cuenta suspendida. */
  banned: boolean;
}

/** Reporte para el panel de moderación (T). */
export interface AdminReport {
  id: string;
  targetType: ReportTargetType;
  targetId: string;
  reason: string;
  details: string;
  createdAt: string;
  reporterName: string;
}

/** El perfil del usuario autenticado (o `null`). Sirve para saber si es admin. */
export async function getCurrentProfile(): Promise<{
  id: string;
  fullName: string;
  isAdmin: boolean;
} | null> {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (auth.user === null) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, full_name, is_admin")
    .eq("id", auth.user.id)
    .maybeSingle();

  if (profile === null) return { id: auth.user.id, fullName: "", isAdmin: false };

  return { id: profile.id, fullName: profile.full_name, isAdmin: profile.is_admin };
}

/** Reportes abiertos, para el panel de moderación. */
export async function listOpenReports(limit = 100): Promise<AdminReport[]> {
  const supabase = await createClient();

  const { data: reports, error } = await supabase
    .from("reports")
    .select("id, target_type, target_id, reason, details, created_at, reporter_id")
    .eq("status", "open")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error !== null || reports === null) return [];

  const reporterIds = [...new Set(reports.map((report) => report.reporter_id))];
  const nameById = new Map<string, string>();

  if (reporterIds.length > 0) {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, full_name")
      .in("id", reporterIds);

    for (const profile of profiles ?? []) {
      nameById.set(profile.id, profile.full_name.trim());
    }
  }

  return reports.map((report) => ({
    id: report.id,
    targetType: report.target_type as ReportTargetType,
    targetId: report.target_id,
    reason: report.reason,
    details: report.details,
    createdAt: report.created_at,
    reporterName: nameById.get(report.reporter_id) || "Usuario",
  }));
}

/** Estado de reporte (reexportado para la UI). */
export type { ReportStatus };

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
    supabase
      .from("profiles")
      .select("full_name, banned, terms_accepted_at")
      .eq("id", profileId)
      .maybeSingle(),
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
    termsAccepted: profile?.terms_accepted_at != null,
    banned: profile?.banned === true,
  };
}
