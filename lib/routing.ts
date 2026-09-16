/**
 * Cliente de rutas sobre la API pública de OSRM (router.project-osrm.org).
 *
 * ¿Por qué OSRM? Devuelve la distancia REAL por calles (no en línea recta) y una
 * duración estimada, es gratis, sin API key y con CORS abierto para el navegador.
 *
 * Reglas de uso del servidor de demostración, respetadas aquí:
 * - Máximo ~1 petición por segundo -> todas las llamadas pasan por `scheduleOsrm`.
 * - No repetir consultas -> caché en memoria (`routeCache`), y las peticiones que el
 *   usuario ya canceló (AbortSignal) ni siquiera llegan a la red.
 *
 * ⚠️ TRÁFICO Y CLIMA (Fase 5, AÚN NO IMPLEMENTADO):
 * `durationMin` es la duración IDEAL de la ruta: OSRM no modela tráfico ni clima. En
 * esta fase no se integra ninguna API de tráfico (TomTom, HERE, Google) ni de clima
 * (Open-Meteo). El motor de precios de la Fase 5 aplicará:
 *   duración ajustada = durationMin × factorTráfico(hora del día) × factorClima
 *
 * TODO (Fase 5): exponer la duración ideal en un campo propio (`durationIdealMin`, sin
 * renombrar `durationMin` para no romper consumidores) y añadir el campo ya ajustado
 * (`durationAdjustedMin`) para que el motor de precios elija sin ambigüedad.
 * TODO (Fase 7+): mover estas peticiones a un Route Handler para poder enviar
 * User-Agent (prohibido desde el navegador) y centralizar una caché persistente.
 */

import type { Coords } from "@/types";
import { createRateLimiter } from "./rateLimiter";

export interface RouteResult {
  /** Distancia por carretera en kilómetros, redondeada a 2 decimales. */
  distanceKm: number;
  /**
   * Duración base en minutos (entero), SIN tráfico: es la ruta ideal que calcula OSRM.
   * TODO (Fase 5): ajustar con el factor de tráfico por hora del día y el factor de
   * clima antes de alimentar el motor de precios.
   */
  durationMin: number;
  /** Trazo completo de la ruta (coordenadas GeoJSON en orden [lng, lat]) para el mapa. */
  geometry: GeoJSON.LineString;
}

/** Endpoint del servidor de demostración de OSRM (perfil de conducción). */
const OSRM_BASE_URL = "https://router.project-osrm.org/route/v1/driving";
/** Intervalo mínimo entre peticiones reales: 1 req/seg, límite del servidor demo. */
const MIN_INTERVAL_MS = 1000;
/**
 * Timeout de la petición. Una ruta que no responde no debe dejar el resumen en
 * "Calculando ruta..." indefinidamente.
 */
const REQUEST_TIMEOUT_MS = 8000;
/** Rutas guardadas en memoria antes de descartar la más antigua (evita crecer sin límite). */
const MAX_CACHE_ENTRIES = 100;
const USER_AGENT = "cotizador-transporte/0.1 (dev)";

/** Cola propia de OSRM (independiente de la de Photon: cada servicio tiene su cupo). */
const scheduleOsrm = createRateLimiter(MIN_INTERVAL_MS);

/**
 * Caché en memoria de rutas ya calculadas: al alternar entre pares de direcciones (o al
 * repetir un viaje) no se vuelve a molestar al servidor público.
 * La clave redondea a 4 decimales (~11 m): suficiente para considerar el mismo punto.
 */
const routeCache = new Map<string, RouteResult>();

/** Clave de caché: `lat1,lng1-lat2,lng2` con 4 decimales. */
function buildCacheKey(origin: Coords, destination: Coords): string {
  const [originLat, originLng] = origin;
  const [destinationLat, destinationLng] = destination;

  return `${originLat.toFixed(4)},${originLng.toFixed(4)}-${destinationLat.toFixed(4)},${destinationLng.toFixed(4)}`;
}

/** OSRM espera `lng,lat` (al revés que Coords, que es [lat, lng]). */
function formatPoint([lat, lng]: Coords): string {
  return `${lng},${lat}`;
}

/** Objeto plano no nulo: evita `any` al leer JSON de una API externa. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Valida que el valor sea un LineString GeoJSON con al menos 2 puntos numéricos. */
function isLineStringGeometry(value: unknown): value is GeoJSON.LineString {
  if (!isRecord(value) || value.type !== "LineString") return false;

  const coordinates = value.coordinates;
  if (!Array.isArray(coordinates) || coordinates.length < 2) return false;

  return coordinates.every(
    (point) =>
      Array.isArray(point) &&
      point.length >= 2 &&
      typeof point[0] === "number" &&
      typeof point[1] === "number"
  );
}

/**
 * Convierte la respuesta JSON de OSRM (`unknown`) al DTO de la app.
 * Devuelve null si la forma no es la esperada: mejor "sin ruta" que datos a medias.
 */
function parseRouteResponse(payload: unknown): RouteResult | null {
  if (!isRecord(payload) || payload.code !== "Ok") return null;

  const routes = payload.routes;
  if (!Array.isArray(routes) || routes.length === 0) return null;

  const firstRoute = routes[0];
  if (!isRecord(firstRoute)) return null;

  const { distance, duration, geometry } = firstRoute;
  if (typeof distance !== "number" || typeof duration !== "number") return null;
  if (!Number.isFinite(distance) || !Number.isFinite(duration)) return null;
  if (!isLineStringGeometry(geometry)) return null;

  return {
    // metros -> km con 2 decimales; segundos -> minutos enteros.
    distanceKm: Math.round((distance / 1000) * 100) / 100,
    durationMin: Math.round(duration / 60),
    geometry,
  };
}

/**
 * Petición real a OSRM (una sola: el llamador no debe invocarla directamente).
 *
 * El AbortController interno combina el timeout con la cancelación del llamador,
 * porque `fetch` acepta una sola señal y `AbortSignal.any` no está disponible en
 * navegadores móviles antiguos.
 */
async function fetchRoute(
  origin: Coords,
  destination: Coords,
  signal?: AbortSignal
): Promise<RouteResult | null> {
  const url = new URL(
    `${OSRM_BASE_URL}/${formatPoint(origin)};${formatPoint(destination)}`
  );
  url.searchParams.set("overview", "full"); // trazo completo, no simplificado
  url.searchParams.set("geometries", "geojson");

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const abortFromCaller = () => controller.abort();
  signal?.addEventListener("abort", abortFromCaller);

  try {
    const response = await fetch(url.toString(), {
      // ⚠️ Los navegadores no permiten sobrescribir `User-Agent` (header prohibido por
      // la spec Fetch); solo tiene efecto si esto se ejecuta en el servidor.
      headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
      signal: controller.signal,
    });

    if (!response.ok) return null;

    const payload: unknown = await response.json();

    return parseRouteResponse(payload);
  } catch {
    // Red caída, timeout, cancelación o JSON inválido: la UI se queda sin ruta.
    return null;
  } finally {
    clearTimeout(timeoutId);
    signal?.removeEventListener("abort", abortFromCaller);
  }
}

/**
 * Calcula la ruta por carretera entre dos coordenadas ([lat, lng] cada una).
 *
 * @param origin Coordenadas de origen.
 * @param destination Coordenadas de destino.
 * @param signal Señal opcional de cancelación: la usa useRoute cuando el usuario cambia
 *   de dirección antes de que termine el cálculo. La firma sigue siendo válida como
 *   `getRoute(origin, destination)` para quien no necesite cancelar.
 * @returns Ruta con distancia, duración y geometría, o `null` si falla o no hay ruta.
 *   Nunca lanza: un fallo de red no debe romper la UI.
 */
export async function getRoute(
  origin: Coords,
  destination: Coords,
  signal?: AbortSignal
): Promise<RouteResult | null> {
  const cacheKey = buildCacheKey(origin, destination);
  const cached = routeCache.get(cacheKey);
  if (cached !== undefined) return cached;

  try {
    const result = await scheduleOsrm(() => {
      // Si el usuario ya cambió de dirección mientras esperaba turno en la cola, no se
      // gasta una petición del cupo del servidor público.
      if (signal?.aborted) return Promise.resolve<RouteResult | null>(null);

      return fetchRoute(origin, destination, signal);
    });

    if (result === null) return null;

    if (routeCache.size >= MAX_CACHE_ENTRIES) {
      // Map conserva el orden de inserción: la primera clave es la más antigua.
      const oldestKey = routeCache.keys().next().value;
      if (oldestKey !== undefined) routeCache.delete(oldestKey);
    }
    routeCache.set(cacheKey, result);

    return result;
  } catch {
    // Solo se cachean rutas exitosas: un fallo se reintentará la próxima vez.
    return null;
  }
}
