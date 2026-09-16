export type VehicleType = "moto" | "sedan" | "suv" | "van";

export interface QuoteRequest {
  origin: string;
  destination: string;
  passengers: number;
  vehicleType: VehicleType;
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

