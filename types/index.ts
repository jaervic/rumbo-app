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
