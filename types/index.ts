export type VehicleType = "moto" | "sedan" | "suv" | "van";

export interface QuoteRequest {
  origin: string;
  destination: string;
  passengers: number;
  vehicleType: VehicleType;
}

export interface QuoteResult {
  distanceKm: number;
  durationMin: number;
  priceMin: number;
  priceAvg: number;
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

