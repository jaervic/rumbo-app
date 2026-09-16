/**
 * Cliente de geocoding sobre la API pública de Nominatim (OpenStreetMap).
 * Gratis y sin API key. Se respeta la política de uso:
 * - Máximo 1 petición por segundo (ver MIN_INTERVAL_MS y la cola serializada).
 * - Identificación de la aplicación vía header User-Agent.
 *
 * ⚠️ Los navegadores NO permiten sobrescribir el header `User-Agent`
 * (es un "forbidden header" de la spec Fetch), por lo que ese header solo
 * tiene efecto si esta función se ejecuta en el servidor (p. ej. desde un
 * Route Handler). En el cliente, Nominatim identifica la app por Referer/Origin.
 */

export interface GeocodeResult {
  lat: number;
  lng: number;
  displayName: string;
}

const NOMINATIM_SEARCH_URL = "https://nominatim.openstreetmap.org/search";
const USER_AGENT = "cotizador-transporte/0.1 (dev)";

/** Intervalo mínimo entre peticiones reales a Nominatim (1 req/seg). */
const MIN_INTERVAL_MS = 1000;
/** Longitud mínima de la consulta para intentar geocodificar. */
export const MIN_QUERY_LENGTH = 3;
const REQUEST_TIMEOUT_MS = 8000;

/**
 * Cache en memoria para no repetir consultas idénticas.
 * También cachea los resultados nulos ("no encontrado") para no reintentar en vano.
 */
const cache = new Map<string, GeocodeResult | null>();

/** Cola que serializa las peticiones para respetar el límite de 1 req/seg. */
let requestChain: Promise<void> = Promise.resolve();
let lastRequestAt = 0;

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function normalizeQuery(query: string): string {
  return query.trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * Type guard de un item de la respuesta de Nominatim.
 * Nominatim devuelve lat/lon como strings; validamos antes de convertirlos.
 */
function isNominatimPlace(
  value: unknown
): value is { lat: string; lon: string; display_name: string } {
  if (typeof value !== "object" || value === null) return false;

  const place = value as Record<string, unknown>;

  return (
    typeof place.lat === "string" &&
    typeof place.lon === "string" &&
    typeof place.display_name === "string"
  );
}

async function fetchPlace(query: string): Promise<GeocodeResult | null> {
  try {
    const url = new URL(NOMINATIM_SEARCH_URL);
    url.searchParams.set("format", "json");
    url.searchParams.set("q", query);
    url.searchParams.set("limit", "1");
    url.searchParams.set("countrycodes", "ve"); // Restringido a Venezuela
    url.searchParams.set("accept-language", "es");

    const response = await fetch(url.toString(), {
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    if (!response.ok) return null;

    const data: unknown = await response.json();
    if (!Array.isArray(data) || data.length === 0) return null;

    const first: unknown = data[0];
    if (!isNominatimPlace(first)) return null;

    const lat = Number.parseFloat(first.lat);
    const lng = Number.parseFloat(first.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

    return { lat, lng, displayName: first.display_name };
  } catch {
    // Errores de red, CORS, timeout o JSON inválido: la UI no se rompe.
    return null;
  }
}

/** Encola la petición respetando el intervalo mínimo entre llamadas a Nominatim. */
async function scheduleFetch(query: string): Promise<GeocodeResult | null> {
  const run = requestChain.then(async () => {
    const elapsed = Date.now() - lastRequestAt;
    const waitFor = MIN_INTERVAL_MS - elapsed;
    if (waitFor > 0) await wait(waitFor);

    lastRequestAt = Date.now();
    return fetchPlace(query);
  });

  // La cola no debe romperse si una petición falla.
  requestChain = run.then(
    () => undefined,
    () => undefined
  );

  return run;
}

/**
 * Convierte una dirección de texto en coordenadas (solo Venezuela).
 *
 * @param query Dirección escrita por el usuario (ej: "Altamira, Caracas").
 * @returns Coordenadas + nombre normalizado, o null si no se encontró / hubo error.
 */
export async function geocodeAddress(query: string): Promise<GeocodeResult | null> {
  const normalized = normalizeQuery(query);
  if (normalized.length < MIN_QUERY_LENGTH) return null;

  const cached = cache.get(normalized);
  if (cached !== undefined) return cached;

  const result = await scheduleFetch(normalized);
  cache.set(normalized, result);

  return result;
}
