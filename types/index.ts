import type { Vehicle } from "./vehicle";

export type VehicleType = "moto" | "sedan" | "suv" | "van";

/**
 * Pasajeros máximos por vehículo (SIN contar al conductor): es la ÚNICA tabla con estos números.
 *
 * La capacidad tiene dos consumidores y los dos leen aquí: el `max` del campo "Pasajeros" del
 * formulario (components/QuoteForm.tsx) y `VEHICLE_TARIFFS.maxPassengers` de lib/pricing.ts, que es
 * lo que valida el motor (`isVehicleSuitable`). Una divergencia no daría un error de tipos: daría un
 * formulario que deja pedir 2 pasajeros en una moto y un motor que devuelve `null` sin explicar por
 * qué. Por eso estos números viven en un solo sitio.
 *
 * Criterio de cada valor:
 * - `moto`: 1. Un solo pasajero detrás del conductor (conductor + 1 = 2 personas sobre la moto).
 * - `sedan`: 5. Tres plazas atrás y dos delante con el conductor: la capacidad de un turismo.
 * - `suv`: 6. Muchas son de 5, pero hay 7 plazas (Prado, Fortuner, Tahoe); 6 cubre esos casos sin
 *   prometer la tercera fila completa.
 * - `van`: 6. Hiace, Sprinter o Carnival con asientos corridos.
 *
 * ⚠️ Es un dato de NEGOCIO (hasta dónde se puede cotizar), no una preferencia de la UI: por eso vive
 * aquí, junto a `VehicleType`, y no dentro del componente.
 */
export const PASSENGER_CAPACITY: Record<VehicleType, number> = {
  moto: 1,
  sedan: 5,
  suv: 6,
  van: 6,
};

/**
 * Type guard de `VehicleType` para datos que llegan de FUERA del compilador (localStorage,
 * Supabase, JSON...).
 *
 * ¿Por qué existe? `PASSENGER_CAPACITY[vehicleType]` y `VEHICLE_TARIFFS[vehicleType].maxPassengers`
 * asumen que la clave es válida; un `vehicleType` corrupto (p. ej. un perfil manipulado en
 * localStorage) haría que `estimatePrice` intentara leer `.maxPassengers` de `undefined` y lanzara
 * un `TypeError`. Validar en la frontera con este guard evita que un dato malo tumbe el cálculo.
 *
 * La comprobación se apoya en `PASSENGER_CAPACITY` para que la lista de tipos válidos siga viviendo
 * en un solo sitio: si mañana se añade un tipo, hay que añadirlo a `VehicleType` y a esta tabla.
 */
export function isVehicleType(value: unknown): value is VehicleType {
  // `hasOwnProperty` y no `value in PASSENGER_CAPACITY` ni un indexado directo: así "toString",
  // "constructor" y demás claves heredadas de `Object.prototype` NO cuentan como tipos válidos.
  return (
    typeof value === "string" &&
    Object.prototype.hasOwnProperty.call(PASSENGER_CAPACITY, value)
  );
}

export interface QuoteRequest {
  origin: string;
  destination: string;
  passengers: number;
  vehicleType: VehicleType;
  /**
   * Vehículo concreto elegido en el catálogo (marca + modelo + año), o `null` si no se especificó.
   * El tipo lo fija `vehicleType` (el selector filtra el catálogo por él), así que la ficha y el
   * precio no pueden contradecirse.
   */
  vehicle: Vehicle | null;
}

/**
 * Resultado de una cotización (Fase 5: motor de precios, lib/pricing.ts).
 *
 * Los importes van en USD ("divisa"): es la unidad en la que hoy cotizan los conductores
 * independientes en Venezuela y no se devalúa entre que se cotiza y se cobra.
 * TODO (Fase 7+): añadir la conversión a bolívares con la tasa BCV del día.
 *
 * `priceMin`/`priceMax` forman un rango (±12 % sobre `priceAvg`) en lugar de un precio exacto: es
 * una estimación para que el conductor decida y negocie, no un contrato. La forma extendida con el
 * desglose (bandera, km, tiempo, recargos y factores aplicados) es `PriceEstimate` en lib/pricing.ts.
 */
export interface QuoteResult {
  /** Distancia por carretera en kilómetros (la que devuelve OSRM). */
  distanceKm: number;
  /**
   * Duración AJUSTADA en minutos: la ideal de OSRM multiplicada por el factor de tráfico de la hora
   * de salida. Es la que se usó para tarificar el tiempo (`PriceEstimate.durationIdealMin` conserva
   * la duración ideal sin ajustar).
   */
  durationMin: number;
  /** Piso del rango: lo mínimo que conviene pedir. Nunca por debajo del viaje mínimo del vehículo. */
  priceMin: number;
  /** Estimación central (la recomendada). */
  priceAvg: number;
  /** Techo del rango: margen para negociar en zonas de alta demanda. */
  priceMax: number;
}

/** Par de coordenadas [latitud, longitud]. */
export type Coords = [number, number];

/**
 * Resultado de una Server Action (Fase 2). `error` es un mensaje apto para mostrar al usuario: nunca
 * incluye detalles técnicos de la base de datos.
 */
export interface ActionResult {
  ok: boolean;
  error?: string;
}

/** Coordenadas geocodificadas de origen y destino (null = aún no resuelto). */
export interface QuoteCoords {
  origin: Coords | null;
  destination: Coords | null;
}

/**
 * Campo del viaje que se puede fijar tocando el mapa (Fase 3.5h).
 * null = el mapa no está en modo "fijar" y los toques no hacen nada.
 */
export type MapSelectionMode = "origin" | "destination";

