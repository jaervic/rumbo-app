import { QuoteRequest, QuoteResult } from "@/types";

/**
 * Calcula un precio estimado basado en la solicitud de cotización.
 * 
 * TODO: Implementar lógica real basada en:
 * - Distancia obtenida de OSRM
 * - Factor multiplicador por tipo de vehículo
 * - Tarifas base y por kilómetro
 * 
 * @param request Datos de la cotización (origen, destino, pasajeros, vehículo)
 * @returns QuoteResult con distancia, duración y precios estimados
 */
export function calculatePrice(request: QuoteRequest): QuoteResult {
  // TODO: Integrar con el servicio de rutas (OSRM)
  
  return {
    distanceKm: 0,
    durationMin: 0,
    priceMin: 0,
    priceAvg: 0,
    priceMax: 0,
  };
}
