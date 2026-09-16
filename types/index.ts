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
