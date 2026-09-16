/**
 * Cliente de autocompletado de direcciones sobre la API pública de Photon (OpenStreetMap).
 * Gratis y sin API key. Photon hace prefix matching y encuentra POIs, por lo que es
 * el motor adecuado para sugerencias mientras el usuario escribe.
 *
 * Se respeta su política de uso: máximo 1 petición por segundo (ver MIN_INTERVAL_MS).
 *
 * ⚠️ Los navegadores NO permiten sobrescribir el header `User-Agent`
 * (es un "forbidden header" de la spec Fetch), por lo que ese header solo
 * tiene efecto si estas funciones se ejecutan en el servidor (p. ej. desde un
 * Route Handler). En el cliente, Photon identifica la app por Referer/Origin.
 *
 * ⚠️ Photon NO soporta `lang=es` (solo de|en|fr|it): con `lang=es` responde HTTP 400.
 * Por eso no se envía `lang`; el valor por defecto devuelve los nombres locales,
 * que para Venezuela ya vienen en español.
 */

export interface GeocodeResult {
  lat: number;
  lng: number;
  /** Nombre legible completo, p. ej. "Centro Comercial Sambil, Caracas, Miranda, Venezuela". */
  displayName: string;
  /** Nombre corto del lugar (name de OSM), p. ej. "Centro Comercial Sambil". */
  shortName: string;
  /** Línea secundaria para la lista de sugerencias: ciudad/distrito + estado, p. ej. "Chacao, Miranda". */
  secondaryText: string;
  /** Campos estructurados (cadena vacía cuando la fuente no los aporta). */
  city: string;
  state: string;
  country: string;
  /** osm_value: tipo de lugar (mall, restaurant, city, suburb, station...). */
  osmValue: string;
}

const PHOTON_API_URL = "https://photon.komoot.io/api/";
/** bbox de Venezuela para Photon: minLon,minLat,maxLon,maxLat. */
const VENEZUELA_BBOX = "-73.5,0.6,-59.5,12.5";
const USER_AGENT = "cotizador-transporte/0.1 (dev)";

/** Intervalo mínimo entre peticiones reales a Photon (1 req/seg). */
const MIN_INTERVAL_MS = 1000;
/** Longitud mínima de la consulta para intentar geocodificar. */
export const MIN_QUERY_LENGTH = 3;
/**
 * Sugerencias que muestra el formulario (y límite por defecto de la API pública).
 * Son 6 para que una coincidencia "contiene" pueda entrar aunque haya 5 coincidencias
 * que empiecen por la consulta (caso medido: "sambil" -> "Centro Comercial Sambil").
 */
export const MAX_SUGGESTION_LIMIT = 6;
/**
 * Candidatos que se le piden a Photon en cada consulta. Es mayor que las sugerencias
 * mostradas por dos motivos: se descartan los resultados que no son de Venezuela
 * (el bbox incluye Curaçao y Bonaire) y hace falta un pool amplio para que
 * scoreAndSortResults pueda reordenar antes de recortar a MAX_SUGGESTION_LIMIT.
 */
const PHOTON_FETCH_LIMIT = 20;
const REQUEST_TIMEOUT_MS = 8000;

/**
 * Crea un limitador de tasa: serializa las tareas y garantiza un intervalo mínimo
 * entre peticiones reales (así se respeta el 1 req/seg de cada servicio).
 */
function createRateLimiter(minIntervalMs: number) {
  let chain: Promise<void> = Promise.resolve();
  let lastRunAt = 0;

  return async function schedule<T>(task: () => Promise<T>): Promise<T> {
    const run = chain.then(async () => {
      const waitFor = minIntervalMs - (Date.now() - lastRunAt);
      if (waitFor > 0) await wait(waitFor);

      lastRunAt = Date.now();
      return task();
    });

    // La cola no debe romperse si una tarea falla.
    chain = run.then(
      () => undefined,
      () => undefined
    );

    return run;
  };
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function normalizeQuery(query: string): string {
  return query.trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * Normaliza texto para COMPARAR (no se usa para consultar a Photon, para no alterar
 * lo que enviamos): quita acentos, pasa a minúsculas y recorta extremos.
 * Ej: "Mérida" -> "merida".
 */
function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

/** Prioridades de coincidencia (mayor = más relevante). */
const SCORE_NAME_PREFIX = 100;
const SCORE_NAME_CONTAINS = 80;
const SCORE_DISPLAY_PREFIX = 60;
const SCORE_DISPLAY_CONTAINS = 40;
/**
 * Pequeño extra para POIs comerciales cuando la coincidencia NO es por prefijo:
 * "Centro Comercial Sambil" (80 + 15 = 95) adelanta a los locales vecinos (80) sin
 * llegar a superar a los nombres que empiezan por la consulta (100).
 */
const SCORE_COMMERCIAL_BOOST = 15;
const COMMERCIAL_OSM_VALUES = new Set(["mall", "commercial", "retail"]);

/**
 * TODO (fase de geolocalización): priorizar por proximidad geográfica del usuario.
 * Cuando el navegador aporte su posición se puede (a) enviar `lat`/`lon` a Photon para
 * sesgar su propio ranking y (b) sumar aquí un bonus por distancia (haversine).
 * Hoy no hay geolocalización, así que el orden es únicamente textual.
 */
function boostCommercialScore(score: number, result: GeocodeResult): number {
  return COMMERCIAL_OSM_VALUES.has(normalize(result.osmValue))
    ? score + SCORE_COMMERCIAL_BOOST
    : score;
}

/**
 * Reordena los candidatos de Photon por relevancia respecto a la consulta:
 * shortName que empieza por ella (100) > shortName que la contiene (80) >
 * displayName que empieza por ella (60) > displayName que la contiene (40) > resto (0).
 * Las coincidencias por "contiene" en POIs comerciales (mall/commercial/retail) suman
 * un pequeño extra para que un centro comercial gane a los locales de su interior.
 *
 * Los empates conservan el orden original de Photon (que ya aplica su propio score);
 * el desempate se hace por índice, así no dependemos de la estabilidad de Array#sort.
 */
function scoreAndSortResults(results: GeocodeResult[], query: string): GeocodeResult[] {
  const needle = normalize(query);
  if (needle.length === 0) return [...results];

  const scoreOf = (result: GeocodeResult): number => {
    const shortName = normalize(result.shortName);
    const displayName = normalize(result.displayName);

    if (shortName.startsWith(needle)) return SCORE_NAME_PREFIX;
    if (shortName.includes(needle)) return boostCommercialScore(SCORE_NAME_CONTAINS, result);
    if (displayName.startsWith(needle)) return SCORE_DISPLAY_PREFIX;
    if (displayName.includes(needle)) return boostCommercialScore(SCORE_DISPLAY_CONTAINS, result);

    return 0;
  };

  return results
    .map((result, index) => ({ result, index, score: scoreOf(result) }))
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map((entry) => entry.result);
}

/** Une las partes no vacías y sin duplicados: ["A", "B", "", "A"] -> "A, B". */
function joinUnique(parts: string[]): string {
  return parts
    .map((part) => part.trim())
    .filter((part, index, all) => part.length > 0 && all.indexOf(part) === index)
    .join(", ");
}

/** Lee una propiedad de texto de un objeto JSON desconocido (sin `any`). */
function readString(source: Record<string, unknown>, key: string): string {
  const value = source[key];

  return typeof value === "string" ? value.trim() : "";
}

/** Limitador de tasa del autocompletado (máximo 1 petición por segundo a Photon). */
const schedulePhoton = createRateLimiter(MIN_INTERVAL_MS);

/** Type guard de un feature de Photon (geometry.coordinates = [lng, lat]). */
function isPhotonFeature(
  value: unknown
): value is { properties: Record<string, unknown>; geometry: { coordinates: unknown } } {
  if (typeof value !== "object" || value === null) return false;

  const feature = value as Record<string, unknown>;
  const geometry = feature.geometry;
  if (typeof geometry !== "object" || geometry === null) return false;

  const coordinates = (geometry as Record<string, unknown>).coordinates;
  if (!Array.isArray(coordinates) || coordinates.length < 2) return false;
  if (typeof coordinates[0] !== "number" || typeof coordinates[1] !== "number") return false;

  return typeof feature.properties === "object" && feature.properties !== null;
}

/**
 * Autocompletado con Photon: hace prefix matching ("chaca" -> Chacao) y encuentra
 * POIs ("sambil" -> Centros Comerciales Sambil). Las coordenadas llegan como
 * [lng, lat] (¡al revés que el resto de la app!) y se normalizan aquí.
 */
async function fetchPhotonPlaces(query: string, limit: number): Promise<GeocodeResult[]> {
  try {
    const url = new URL(PHOTON_API_URL);
    url.searchParams.set("q", query);
    url.searchParams.set("limit", String(limit));
    url.searchParams.set("bbox", VENEZUELA_BBOX);
    // Sin `lang`: Photon no soporta `es` (HTTP 400) y el valor por defecto ya
    // devuelve el nombre local, que para Venezuela está en español.

    const response = await fetch(url.toString(), {
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    if (!response.ok) return [];

    const data: unknown = await response.json();
    if (typeof data !== "object" || data === null) return [];

    const features = (data as Record<string, unknown>).features;
    if (!Array.isArray(features)) return [];

    const results: GeocodeResult[] = [];

    for (const item of features) {
      if (!isPhotonFeature(item)) continue;

      const coordinates = item.geometry.coordinates;
      if (!Array.isArray(coordinates)) continue;

      const lng = coordinates[0];
      const lat = coordinates[1];
      if (typeof lng !== "number" || typeof lat !== "number") continue;
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;

      const properties = item.properties;
      const name = readString(properties, "name");
      const city = readString(properties, "city");
      const district = readString(properties, "district");
      const state = readString(properties, "state");
      const country = readString(properties, "country");
      const countryCode = readString(properties, "countrycode").toUpperCase();
      const osmValue = readString(properties, "osm_value");

      // El bbox de Venezuela incluye Curaçao/Bonaire (Países Bajos): se descartan.
      if (countryCode !== "VE" && country.toLowerCase() !== "venezuela") continue;

      const shortName = name.length > 0 ? name : joinUnique([district, city]);
      if (shortName.length === 0) continue; // Sin nombre no hay nada que mostrar

      results.push({
        lat,
        lng,
        displayName: joinUnique([shortName, city || district, state, country]),
        shortName,
        secondaryText: joinUnique([city || district, state]),
        city,
        state,
        country,
        osmValue,
      });
    }

    return results;
  } catch {
    // Errores de red, CORS, timeout o JSON inválido: la UI no se rompe.
    return [];
  }
}

/**
 * Envuelve el buscador con: longitud mínima de consulta, cache por consulta exacta
 * (incluye "sin resultados"), dedupe de peticiones en vuelo y limitador de tasa.
 * Siempre se piden PHOTON_FETCH_LIMIT resultados al motor para compartir una única
 * entrada de cache, y aquí solo se recorta lo que se devuelve.
 */
function createCachedSearch(
  fetchResults: (query: string) => Promise<GeocodeResult[]>,
  schedule: <T>(task: () => Promise<T>) => Promise<T>
): (query: string, limit: number) => Promise<GeocodeResult[]> {
  const cache = new Map<string, GeocodeResult[]>();
  const inFlight = new Map<string, Promise<GeocodeResult[]>>();

  return async (query, limit) => {
    const normalized = normalizeQuery(query);
    if (normalized.length < MIN_QUERY_LENGTH) return [];

    const cached = cache.get(normalized);
    if (cached !== undefined) return cached.slice(0, limit);

    let running = inFlight.get(normalized);
    if (running === undefined) {
      running = schedule(() => fetchResults(normalized)).then((results) => {
        inFlight.delete(normalized);
        return results;
      });
      inFlight.set(normalized, running);
    }

    const results = await running;
    cache.set(normalized, results);

    return results.slice(0, limit);
  };
}

/** Búsqueda con cache de Photon (consulta exacta + dedupe de peticiones en vuelo). */
const searchPhoton = createCachedSearch(
  (query) => fetchPhotonPlaces(query, PHOTON_FETCH_LIMIT),
  schedulePhoton
);

/**
 * Autocompletado de direcciones con Photon (solo Venezuela).
 * Photon busca por texto libre (no solo por prefijo), así que se pide un pool amplio
 * de candidatos (PHOTON_FETCH_LIMIT) y se reordena por relevancia antes de recortar
 * a `limit`: así las coincidencias en cualquier parte del nombre ganan terreno frente
 * a los POIs "relacionados" que Photon devuelve con score bajo.
 *
 * @param query Texto parcial escrito por el usuario (ej: "chaca", "sambil", "centro").
 * @param limit Número máximo de sugerencias a devolver (por defecto 5).
 * @returns Lista ordenada por relevancia (vacía si no hay coincidencias o si hubo error).
 */
export async function autocompleteAddress(
  query: string,
  limit: number = MAX_SUGGESTION_LIMIT
): Promise<GeocodeResult[]> {
  const candidates = await searchPhoton(query, PHOTON_FETCH_LIMIT);

  return scoreAndSortResults(candidates, query).slice(0, limit);
}
