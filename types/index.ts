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
 * Vehículo concreto elegido del catálogo de la Fase 6.1 (marca + modelo + año).
 *
 * Los ids son los del catálogo local (`lib/vehicleCatalog.ts`), no nombres legibles: el texto se
 * resuelve con `describeVehicle` al pintarlo, así que renombrar "Chevrolet" a "Chevy" mañana no
 * invalida las selecciones ya guardadas.
 *
 * TODO (Fase 6.2): hoy esta selección NO cambia el precio — el motor sigue tarifando por
 * `vehicleType`, que se DEDUCE del modelo con `getVehicleTypeFromSelection` —. Cuando llegue el
 * factor por antigüedad, `year` es el dato que lo alimenta.
 */
export interface VehicleSelection {
  /** id de marca del catálogo, p. ej. "toyota". */
  brandId: string;
  /** id de modelo del catálogo, p. ej. "toyota-corolla". */
  modelId: string;
  /** Año del modelo, dentro del rango de venta que declara el catálogo. */
  year: number;
}

export interface QuoteRequest {
  origin: string;
  destination: string;
  passengers: number;
  vehicleType: VehicleType;
  /**
   * Vehículo del catálogo (Fase 6.1). `null` = no lo eligió o su carro no está en la lista ("Otra
   * marca"): en ese caso manda `vehicleType`, que sigue siendo el único dato que tarifa el precio.
   */
  vehicle: VehicleSelection | null;
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

