/**
 * Distancias geográficas compartidas (fórmula de Haversine).
 *
 * ¿Por qué un módulo propio? Antes vivía (privada) en lib/geocoding.ts. Ahora la necesitan
 * también lib/popularPlaces.ts (ordenar por cercanía al usuario) y el scoring por
 * ubicación, y popularPlaces.ts NO puede importar de geocoding.ts: geocoding ya importa
 * popularPlaces, así que sería un ciclo de imports.
 *
 * Haversine asume tierra esférica: el error frente a la fórmula geodésica es < 0,5 %, de
 * sobra para desempatar sugerencias o decidir si dos resultados son el mismo sitio.
 */

/** Punto geográfico en grados decimales (nótese: objeto `{lat,lng}`, no `[lat,lng]`). */
export interface GeoPoint {
  lat: number;
  lng: number;
}

const EARTH_RADIUS_M = 6_371_000;

/** Distancia aproximada en METROS entre dos coordenadas. */
export function distanceMeters(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const toRadians = (degrees: number) => (degrees * Math.PI) / 180;

  const deltaLat = toRadians(bLat - aLat);
  const deltaLng = toRadians(bLng - aLng);
  const haversine =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(toRadians(aLat)) * Math.cos(toRadians(bLat)) * Math.sin(deltaLng / 2) ** 2;

  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(haversine)));
}

/** Distancia aproximada en KILÓMETROS entre dos coordenadas. */
export function distanceKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  return distanceMeters(lat1, lng1, lat2, lng2) / 1000;
}
