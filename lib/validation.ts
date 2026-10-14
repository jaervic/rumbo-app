/**
 * Validación con Zod (Fase 2).
 *
 * Toda entrada que llega del cliente a una Server Action pasa por aquí ANTES de tocar la base de
 * datos. La UI valida para dar buena experiencia, pero el servidor NO confía en ella: estos esquemas
 * son la frontera de seguridad, junto con las políticas RLS de Postgres.
 *
 * Los rangos de las tarifas se leen de `TARIFF_FIELDS` (lib/driverProfile.ts) para que la validación
 * del servidor y la del editor sean la MISMA tabla: si mañana cambia un rango, cambia en un sitio.
 */

import { z } from "zod";
import { TARIFF_FIELDS } from "@/lib/driverProfile";

/** Tipos de vehículo válidos (espejo del enum `vehicle_type` de Postgres y de `VehicleType`). */
const VEHICLE_TYPES = ["moto", "sedan", "suv", "van"] as const;

/** Año mínimo cotizable (igual que el catálogo) y máximo: el próximo año (modelos por salir). */
const MIN_VEHICLE_YEAR = 1980;
const MAX_VEHICLE_YEAR = new Date().getFullYear() + 1;

export const tariffInputSchema = z.object({
  baseFare: z.number().finite().min(TARIFF_FIELDS.baseFare.min).max(TARIFF_FIELDS.baseFare.max),
  costPerKm: z.number().finite().min(TARIFF_FIELDS.costPerKm.min).max(TARIFF_FIELDS.costPerKm.max),
  costPerMin: z
    .number()
    .finite()
    .min(TARIFF_FIELDS.costPerMin.min)
    .max(TARIFF_FIELDS.costPerMin.max),
  minFare: z.number().finite().min(TARIFF_FIELDS.minFare.min).max(TARIFF_FIELDS.minFare.max),
});

export const driverProfileInputSchema = z.object({
  fullName: z.string().trim().min(2, "Escribe al menos 2 caracteres").max(80),
  bio: z.string().trim().max(500).default(""),
  city: z.string().trim().max(60).default(""),
  vehicleBrand: z.string().trim().min(1).max(40),
  vehicleModel: z.string().trim().min(1).max(40),
  vehicleYear: z.number().int().min(MIN_VEHICLE_YEAR).max(MAX_VEHICLE_YEAR),
  vehicleType: z.enum(VEHICLE_TYPES),
  isVisible: z.boolean(),
  tariff: tariffInputSchema,
  /** Aceptación de las normas (T): sin esto no se puede publicar ni reseñar. */
  acceptTerms: z.boolean(),
  /** URL pública de la foto en el Storage (P4); vacío = sin foto. Se muestra con `next/image`,
   *  que solo permite orígenes del `remotePatterns` de `next.config.ts`. */
  photoUrl: z.string().trim().max(500).default(""),
});

export const reviewInputSchema = z.object({
  driverId: z.uuid(),
  rating: z.number().int().min(1).max(5),
  comment: z.string().trim().max(1000).default(""),
});

export const reportInputSchema = z.object({
  targetType: z.enum(["driver", "review"]),
  targetId: z.uuid(),
  reason: z.string().trim().min(1).max(120),
  details: z.string().trim().max(1000).default(""),
});

export const resolveReportInputSchema = z.object({
  reportId: z.uuid(),
  status: z.enum(["resolved", "dismissed"]),
});

export const banInputSchema = z.object({
  profileId: z.uuid(),
  banned: z.boolean(),
});

export const driverBanInputSchema = z.object({
  driverId: z.uuid(),
  banned: z.boolean(),
});

export type DriverProfileInput = z.infer<typeof driverProfileInputSchema>;
export type ReviewInput = z.infer<typeof reviewInputSchema>;
export type ReportInput = z.infer<typeof reportInputSchema>;
export type ResolveReportInput = z.infer<typeof resolveReportInputSchema>;
export type BanInput = z.infer<typeof banInputSchema>;
