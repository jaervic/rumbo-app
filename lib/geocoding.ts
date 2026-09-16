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

import { searchPopularPlaces, PopularPlace } from "./popularPlaces";
import { createRateLimiter } from "./rateLimiter";

export interface GeocodeResult {
  lat: number;
  lng: number;
  /**
   * Nombre legible y DISTINGUIBLE entre sedes de la misma cadena:
   * `${name} — ${street, suburb, district, city}` (las partes vacías se omiten).
   * Ej: "Farmatodo — Avenida José María Vargas, Santa Fe, Caracas".
   *
   * Antes era `name, city, state`, con lo que todas las sedes de una cadena en la misma
   * ciudad quedaban idénticas ("Farmatodo, Caracas, Miranda") y era imposible elegir.
   */
  displayName: string;
  /** Nombre corto del lugar (name de OSM), p. ej. "Centro Comercial Sambil". */
  shortName: string;
  /**
   * Ciudad/distrito + estado, p. ej. "Caracas, Miranda". Ya no es la segunda línea del
   * dropdown (ahora se muestra `displayName`), pero se sigue usando para puntuar
   * coincidencias por entidad, p. ej. "sambil margarita" (Margarita = estado).
   */
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
/**
 * Punto de sesgo geográfico: centro de Caracas. Photon prioriza los resultados cercanos
 * a este punto, que es donde se concentra la población y la operación inicial de la app.
 *
 * TODO (fase de geolocalización): reemplazar este punto fijo por la posición real del
 * usuario (`navigator.geolocation`) en lugar del centro de Caracas.
 */
const BIAS_LATITUDE = "10.48";
const BIAS_LONGITUDE = "-66.90";
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
/**
 * Radio (metros) bajo el cual un resultado de Photon se considera el MISMO lugar que uno
 * de la lista local y se descarta, para no mostrar dos veces el mismo sitio.
 */
const DEDUPE_RADIUS_METERS = 150;
/**
 * Radio (metros) bajo el cual dos sugerencias con el MISMO nombre se consideran el mismo
 * sitio y se descarta la peor posicionada (ver dedupeByProximity).
 */
const DEDUPE_PROXIMITY_METERS = 50;
const REQUEST_TIMEOUT_MS = 8000;

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

/** Estados de la región central: donde vive la mayor parte de la población y operará la app. */
const CENTRAL_REGION_STATES = [
  "miranda",
  "distrito capital",
  "aragua",
  "carabobo",
  "la guaira",
  "vargas", // nombre anterior del estado La Guaira
];
/** Extra por pertenecer a la región central (comparado sin acentos ni mayúsculas). */
const SCORE_CENTRAL_REGION_BOOST = 20;

const COMMERCIAL_OSM_VALUES = new Set(["mall", "commercial", "retail"]);
/**
 * Extra para centros comerciales en coincidencias por "contiene". Es mayor que el de
 * región a propósito: medido con Photon, "Sambilito" (parking en Carabobo) es prefijo +
 * región (100 + 20 = 120), así que con un extra menor los malls quedarían por detrás.
 * Con 25: "Centro Comercial Sambil" (80 + 20 + 25 = 125) gana a ese parking (120).
 */
const SCORE_COMMERCIAL_BOOST = 25;

/**
 * Extra cuando un token "de ubicación" de la consulta (a partir del segundo) aparece en
 * los datos de lugar del resultado (calle, urbanización, ciudad, estado...).
 *
 * Por qué: con "farmatodo chacao" la comparación de nombre falla en TODOS los candidatos
 * (ningún POI se llama "farmatodo chacao"), así que todos puntuaban 0 y el orden quedaba
 * en manos de Photon, que devuelve primero sedes de La Castellana o Los Palos Grandes.
 * Con este extra la sede de Chacao (district="Chacao") pasa al frente.
 *
 * TODO (fase posterior): sumar a lib/popularPlaces.ts las cadenas con muchas sedes
 * (Farmatodo, Farmacias SAAS, Farmacias Bicentenario, Locatel...). Photon las encuentra,
 * pero ni las ordena por popularidad ni trae siempre la urbanización, y una lista local
 * permitiría además fijar la sede más buscada de cada ciudad.
 */

const SCORE_LOCATION_TOKEN_BONUS = 30;

/**
 * TODO (fase de geolocalización): sustituir el sesgo fijo de Caracas (BIAS_LATITUDE /
 * BIAS_LONGITUDE, ya enviado a Photon) por la posición real del usuario y, si hace falta,
 * sumar aquí un bonus por distancia (haversine) en vez del boost fijo por estado.
 */

/** ¿El resultado está en la región central de Venezuela? Compara sin acentos ni mayúsculas. */
function isInCentralRegion(result: GeocodeResult): boolean {
  const state = normalize(result.state);
  if (state.length === 0) return false;

  // `includes` cubre variantes tipo "Estado Miranda".
  return CENTRAL_REGION_STATES.some((centralState) => state.includes(centralState));
}

/** ¿Es un POI comercial (centro comercial)? */
function isCommercialPlace(result: GeocodeResult): boolean {
  return COMMERCIAL_OSM_VALUES.has(normalize(result.osmValue));
}

/**
 * Reordena los candidatos de Photon por relevancia respecto a la consulta.
 * Puntuación = categoría de coincidencia + bonuses:
 * - categoría: shortName empieza por la query (100) > shortName la contiene (80) > texto
 *   de lugar empieza por ella (60) > texto de lugar la contiene (40) > resto (0).
 * - +20 si el lugar está en la región central (Miranda, Distrito Capital, Aragua,
 *   Carabobo, La Guaira/Vargas): desempata dentro de la misma categoría y hace que
 *   "Sambil Margarita" (100) caiga frente a opciones de la zona central.
 * - +25 si la coincidencia es por "contiene" y el POI es comercial (mall/commercial/
 *   retail): así "Centro Comercial Sambil" (125) gana a "Sambilito" (parking, 120) y
 *   a "Sambil Margarita" (prefijo fuera de la región, 100).
 * - +30 por cada token de ubicación de la consulta ("chacao" en "farmatodo chacao") que
 *   aparezca en la calle/urbanización/ciudad/estado del resultado: es lo que desempata
 *   entre sedes de una misma cadena, donde el nombre no puede ayudar (ver
 *   SCORE_LOCATION_TOKEN_BONUS).
 *
 * Los empates conservan el orden original de Photon (que ya aplica su propio score y
 * recibe el sesgo de Caracas); el desempate se hace por índice, así no dependemos de
 * la estabilidad de Array#sort.
 */
function scoreAndSortResults(results: GeocodeResult[], query: string): GeocodeResult[] {
  const needle = normalize(query);
  if (needle.length === 0) return [...results];

  // Tokens posteriores al primero ("farmatodo CHACAO"): no forman parte del nombre del
  // lugar, así que se usan para desempatar por ubicación.
  const locationTokens = needle
    .split(" ")
    .filter((token) => token.length > 0)
    .slice(1);

  const scoreOf = (result: GeocodeResult): number => {
    const shortName = normalize(result.shortName);
    // Texto de comparación = calle/urbanización/ciudad (displayName) + ciudad/estado
    // (secondaryText). El estado sigue contando aunque ya no esté en displayName, así
    // "sambil margarita" (Margarita = estado) no pierde relevancia.
    const placeText = normalize(`${result.displayName} ${result.secondaryText}`);
    const regionBonus = isInCentralRegion(result) ? SCORE_CENTRAL_REGION_BOOST : 0;

    if (shortName.startsWith(needle)) return SCORE_NAME_PREFIX + regionBonus;
    if (shortName.includes(needle)) {
      const commercialBonus = isCommercialPlace(result) ? SCORE_COMMERCIAL_BOOST : 0;
      return SCORE_NAME_CONTAINS + regionBonus + commercialBonus;
    }
    if (placeText.startsWith(needle)) return SCORE_DISPLAY_PREFIX + regionBonus;
    if (placeText.includes(needle)) return SCORE_DISPLAY_CONTAINS + regionBonus;

    // Sin coincidencia de nombre: decide la ubicación que escribió el usuario.
    return locationTokens.reduce(
      (total, token) => (placeText.includes(token) ? total + SCORE_LOCATION_TOKEN_BONUS : total),
      0
    );
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

/**
 * Campos de ubicación de un resultado de Photon. Todos pueden venir vacíos: en los datos
 * de Venezuela `suburb` casi siempre falta y la urbanización/sector viene en `district`.
 */
interface PhotonLocality {
  street: string;
  suburb: string;
  district: string;
  city: string;
}

/**
 * Construye el nombre legible y DISTINGUIBLE de una sugerencia:
 *   `${name} — ${[street, suburb, district, city].filter(Boolean).join(", ")}`
 *
 * Por qué: Photon no mete la urbanización en `name`, así que todas las sedes de una cadena
 * quedaban como "Farmatodo, Caracas, Miranda": idénticas e imposibles de elegir. La calle
 * y la urbanización son lo que diferencia una sede de otra.
 *
 * El encadenado de partes cubre los huecos de datos: si no hay `street` se muestra
 * `suburb`; si tampoco, `district`. Si no hay ninguna ubicación, se devuelve solo el
 * nombre (sin dejar un " — " colgando).
 *
 * Verificado contra la API real: "farmatodo" en Caracas ->
 * "Farmatodo — Avenida José María Vargas, Santa Fe, Caracas".
 */
function buildDisplayName(name: string, locality: PhotonLocality): string {
  const place = joinUnique([
    locality.street,
    locality.suburb,
    locality.district,
    locality.city,
  ]);

  return place.length > 0 ? `${name} — ${place}` : name;
}

/** Lee una propiedad de texto de un objeto JSON desconocido (sin `any`). */
function readString(source: Record<string, unknown>, key: string): string {
  const value = source[key];

  return typeof value === "string" ? value.trim() : "";
}

/**
 * Limitador de tasa del autocompletado (máximo 1 petición por segundo a Photon).
 * La implementación vive en lib/rateLimiter.ts y se comparte con el cliente de rutas
 * (lib/routing.ts); esta es la cola propia de Photon.
 */
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
    // Sesgo hacia Caracas: Photon prioriza lo cercano a este punto (ver BIAS_LATITUDE).
    url.searchParams.set("lat", BIAS_LATITUDE);
    url.searchParams.set("lon", BIAS_LONGITUDE);
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
      // Calle y urbanización: imprescindibles para distinguir sedes de la misma cadena.
      const street = readString(properties, "street");
      const suburb = readString(properties, "suburb");
      const district = readString(properties, "district");
      const city = readString(properties, "city");
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
        displayName: buildDisplayName(shortName, { street, suburb, district, city }),
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
 * Distancia aproximada en metros entre dos coordenadas (haversine).
 * Suficiente para decidir si dos resultados apuntan al mismo lugar.
 */
function distanceMeters(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const EARTH_RADIUS_M = 6_371_000;
  const toRadians = (degrees: number) => (degrees * Math.PI) / 180;

  const deltaLat = toRadians(bLat - aLat);
  const deltaLng = toRadians(bLng - aLng);
  const haversine =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(toRadians(aLat)) * Math.cos(toRadians(bLat)) * Math.sin(deltaLng / 2) ** 2;

  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(haversine)));
}

/** Mismo nombre corto y mismo texto completo: el usuario no puede distinguirlos. */
function hasSameLabel(a: GeocodeResult, b: GeocodeResult): boolean {
  return a.shortName === b.shortName && a.displayName === b.displayName;
}

/**
 * Quita de una lista de sugerencias los duplicados del MISMO sitio.
 *
 * Photon devuelve a veces el mismo local dos veces con coordenadas ligeramente distintas:
 * medido con "farmatodo chacao", "Farmatodo — Avenida Francisco de Miranda, Chacao, Caracas"
 * aparece dos veces a ~11 m de distancia.
 *
 * Dos resultados se consideran el mismo sitio cuando comparten `shortName` y, además:
 * - están a menos de `thresholdMeters` entre sí (el mismo POI mapeado dos veces), o
 * - tienen EXACTAMENTE el mismo `displayName`, así que el usuario no puede distinguirlos ni
 *   con la segunda línea del dropdown (caso medido: "Farmatodo — Avenida Libertador, Sector
 *   Estado Leal, Caracas" duplicado a ~90 m, fuera del radio de 50 m).
 *
 * Se conserva SIEMPRE el primero, que es el mejor posicionado: los lugares curados van
 * delante y los de Photon ya vienen ordenados por relevancia.
 *
 * @param results Sugerencias ya ordenadas por relevancia.
 * @param thresholdMeters Distancia bajo la cual dos coincidencias se consideran el mismo sitio.
 */
export function dedupeByProximity(
  results: GeocodeResult[],
  thresholdMeters = DEDUPE_PROXIMITY_METERS
): GeocodeResult[] {
  const unique: GeocodeResult[] = [];

  for (const candidate of results) {
    const isDuplicate = unique.some(
      (kept) =>
        kept.shortName === candidate.shortName &&
        (hasSameLabel(kept, candidate) ||
          distanceMeters(kept.lat, kept.lng, candidate.lat, candidate.lng) < thresholdMeters)
    );

    if (!isDuplicate) unique.push(candidate);
  }

  return unique;
}

/**
 * Convierte un lugar de la lista local curada al DTO común de geocodificación.
 * `osmValue` se reutiliza aquí para llevar el tipo curado (mall, airport, hospital...).
 */
function popularPlaceToResult(place: PopularPlace): GeocodeResult {
  return {
    lat: place.lat,
    lng: place.lng,
    displayName: joinUnique([place.name, place.city, place.state, "Venezuela"]),
    shortName: place.shortName,
    secondaryText: joinUnique([place.city, place.state]),
    city: place.city,
    state: place.state,
    country: "Venezuela",
    osmValue: place.type,
  };
}

/**
 * Autocompletado de direcciones: lugares populares curados + Photon (solo Venezuela).
 *
 * 1. Los lugares de POPULAR_PLACES que coincidan van SIEMPRE primero: Photon prioriza
 *    por nombre, no por popularidad (para "el marq" devuelve la urbanización antes que
 *    el centro comercial).
 * 2. Después van los candidatos de Photon ordenados por relevancia, descartando los que
 *    estén a menos de DEDUPE_RADIUS_METERS de un lugar local para no duplicar el sitio.
 * 3. Por último, dedupeByProximity quita los duplicados que Photon devuelve de sí mismo
 *    (mismo local dos veces con coordenadas casi iguales), que se verían como filas idénticas.
 *
 * TODO (fase posterior): añadir cadenas con muchas sedes (Farmatodo, Farmacias SAAS,
 * Farmacias Bicentenario...) a lib/popularPlaces.ts, ver el TODO de SCORE_LOCATION_TOKEN_BONUS.
 *
 * @param query Texto parcial escrito por el usuario (ej: "el marq", "ccct", "sambil").
 * @param limit Número máximo de sugerencias a devolver (por defecto MAX_SUGGESTION_LIMIT).
 * @returns Lugares populares primero y luego los de Photon.
 */
export async function autocompleteAddress(
  query: string,
  limit: number = MAX_SUGGESTION_LIMIT
): Promise<GeocodeResult[]> {
  const popularResults = searchPopularPlaces(query).map(popularPlaceToResult);

  const candidates = await searchPhoton(query, PHOTON_FETCH_LIMIT);
  const photonResults = scoreAndSortResults(candidates, query).filter(
    (candidate) =>
      !popularResults.some(
        (popular) =>
          distanceMeters(popular.lat, popular.lng, candidate.lat, candidate.lng) <
          DEDUPE_RADIUS_METERS
      )
  );

  // El dedupe va ANTES de recortar: si no, un duplicado invisible gasta uno de los 6 huecos
  // y se pierde una sugerencia útil.
  const suggestions = dedupeByProximity([...popularResults, ...photonResults]);

  return suggestions.slice(0, limit);
}
