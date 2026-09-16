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
import { distanceKm, distanceMeters, type GeoPoint } from "./distance";

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
 * Punto de sesgo geográfico por defecto: centro de Caracas. Photon prioriza los resultados
 * cercanos a este punto, que es donde se concentra la población y la operación inicial.
 *
 * Fase 3.5g: si el usuario comparte su ubicación (botón "Usar mi ubicación actual"), su
 * posición sustituye a este punto tanto en el sesgo de Photon como en el orden de la lista
 * local. Sin permiso, se mantiene Caracas (comportamiento anterior).
 */
const DEFAULT_BIAS: GeoPoint = { lat: 10.48, lng: -66.9 };
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
 * Boost por cercanía al usuario, en dos umbrales (km). Ver cómo se aplica en
 * scoreAndSortResults: NO se suma al score, se usa como clave secundaria de orden.
 */
const SCORE_PROXIMITY_CLOSE = 25;
const SCORE_PROXIMITY_NEAR = 15;
const PROXIMITY_CLOSE_KM = 5;
const PROXIMITY_NEAR_KM = 10;

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
 * - Con `userLocation`, y SOLO como segunda clave de orden, +25 si el resultado está a
 *   menos de 5 km y +15 si está a menos de 10 km. La cercanía desempata, no suma puntos:
 *   sumarlos permitiría a un resultado cercano con peor coincidencia de nombre adelantar a
 *   uno con coincidencia de prefijo o con el boost de región central, que es justo lo que
 *   la fase pide evitar. Photon ya aplica el sesgo geográfico en su propio orden.
 *
 * Los empates conservan el orden original de Photon (que ya aplica su propio score y
 * recibe el sesgo de Caracas); el desempate se hace por índice, así no dependemos de
 * la estabilidad de Array#sort.
 */
function scoreAndSortResults(
  results: GeocodeResult[],
  query: string,
  userLocation?: GeoPoint
): GeocodeResult[] {
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

  const proximityBonusOf = (result: GeocodeResult): number => {
    if (userLocation === undefined) return 0;

    const km = distanceKm(userLocation.lat, userLocation.lng, result.lat, result.lng);
    if (km < PROXIMITY_CLOSE_KM) return SCORE_PROXIMITY_CLOSE;
    if (km < PROXIMITY_NEAR_KM) return SCORE_PROXIMITY_NEAR;

    return 0;
  };

  return results
    .map((result, index) => ({
      result,
      index,
      score: scoreOf(result),
      proximityBonus: proximityBonusOf(result),
    }))
    // `score` manda; la cercanía solo desempata (ver el doc de la función).
    .sort(
      (a, b) => b.score - a.score || b.proximityBonus - a.proximityBonus || a.index - b.index
    )
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

/** Objeto plano no nulo: evita `any` al leer JSON de una API externa. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
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
async function fetchPhotonPlaces(
  query: string,
  limit: number,
  bias: GeoPoint | undefined
): Promise<GeocodeResult[]> {
  try {
    const url = new URL(PHOTON_API_URL);
    url.searchParams.set("q", query);
    url.searchParams.set("limit", String(limit));
    url.searchParams.set("bbox", VENEZUELA_BBOX);
    // Sesgo geográfico: la ubicación real del usuario si la compartió y, si no, Caracas.
    // Photon PRIORIZA lo cercano a este punto, no filtra: los resultados lejanos siguen
    // apareciendo, así que una ubicación imprecisa (IP/Wi-Fi en desktop) no oculta nada.
    const { lat, lng } = bias ?? DEFAULT_BIAS;
    url.searchParams.set("lat", String(lat));
    url.searchParams.set("lon", String(lng));
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
 * Clave del sesgo para la caché.
 *
 * ⚠️ Sin esto la caché (indexada por consulta) devolvería los resultados sesgados a Caracas
 * después de que el usuario comparta su GPS, y al contrario: "farmatodo" al cambiar de
 * ciudad mostraría la lista anterior.
 */
function biasCacheKey(bias: GeoPoint | undefined): string {
  return bias === undefined ? "default" : `${bias.lat.toFixed(3)},${bias.lng.toFixed(3)}`;
}

/**
 * Envuelve el buscador con: longitud mínima de consulta, cache por consulta exacta +
 * sesgo (incluye "sin resultados"), dedupe de peticiones en vuelo y limitador de tasa.
 * Siempre se piden PHOTON_FETCH_LIMIT resultados al motor para compartir una única
 * entrada de cache, y aquí solo se recorta lo que se devuelve.
 */
function createCachedSearch(
  fetchResults: (query: string, bias: GeoPoint | undefined) => Promise<GeocodeResult[]>,
  schedule: <T>(task: () => Promise<T>) => Promise<T>
): (query: string, limit: number, bias?: GeoPoint) => Promise<GeocodeResult[]> {
  const cache = new Map<string, GeocodeResult[]>();
  const inFlight = new Map<string, Promise<GeocodeResult[]>>();

  return async (query, limit, bias) => {
    const normalized = normalizeQuery(query);
    if (normalized.length < MIN_QUERY_LENGTH) return [];

    const cacheKey = `${normalized}|${biasCacheKey(bias)}`;

    const cached = cache.get(cacheKey);
    if (cached !== undefined) return cached.slice(0, limit);

    let running = inFlight.get(cacheKey);
    if (running === undefined) {
      running = schedule(() => fetchResults(normalized, bias)).then((results) => {
        inFlight.delete(cacheKey);
        return results;
      });
      inFlight.set(cacheKey, running);
    }

    const results = await running;
    cache.set(cacheKey, results);

    return results.slice(0, limit);
  };
}

/** Búsqueda con cache de Photon (consulta + sesgo, y dedupe de peticiones en vuelo). */
const searchPhoton = createCachedSearch(
  (query, bias) => fetchPhotonPlaces(query, PHOTON_FETCH_LIMIT, bias),
  schedulePhoton
);

/**
 * Distancias: `distanceMeters` vive ahora en lib/distance.ts porque la comparten también
 * popularPlaces.ts (orden por cercanía) y el scoring. Ver la nota del ciclo de imports allí.
 */

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

/** Opciones del autocompletado. */
export interface AutocompleteOptions {
  /** Número máximo de sugerencias a devolver (por defecto MAX_SUGGESTION_LIMIT). */
  limit?: number;
  /**
   * Ubicación del usuario (GPS). Sesga Photon y ordena por cercanía la lista curada y los
   * candidatos. Sin ella se usa el sesgo por defecto (centro de Caracas), como antes.
   */
  userLocation?: GeoPoint;
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
 * 4. Si llega `options.userLocation` (Fase 3.5g), su posición sustituye a Caracas en el
 *    sesgo de Photon, ordena la lista curada por cercanía y desempata los candidatos por
 *    distancia. Sin ubicación, el comportamiento es idéntico al de la fase anterior.
 *
 * TODO (fase posterior): añadir cadenas con muchas sedes (Farmatodo, Farmacias SAAS,
 * Farmacias Bicentenario...) a lib/popularPlaces.ts, ver el TODO de SCORE_LOCATION_TOKEN_BONUS.
 *
 * @param query Texto parcial escrito por el usuario (ej: "el marq", "ccct", "sambil").
 * @param options Límite de sugerencias y ubicación del usuario (ambos opcionales).
 * @returns Lugares populares primero y luego los de Photon.
 */
export async function autocompleteAddress(
  query: string,
  options: AutocompleteOptions = {}
): Promise<GeocodeResult[]> {
  const { limit = MAX_SUGGESTION_LIMIT, userLocation } = options;

  const popularResults = searchPopularPlaces(query, { userLocation }).map(popularPlaceToResult);

  const candidates = await searchPhoton(query, PHOTON_FETCH_LIMIT, userLocation);
  const photonResults = scoreAndSortResults(candidates, query, userLocation).filter(
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

/** Endpoint de geocodificación inversa (dirección de un punto) de Photon. */
const PHOTON_REVERSE_URL = "https://photon.komoot.io/reverse";
/** Decimales de las coordenadas en la etiqueta de respaldo: 5 (~1 m) ya es preciso. */
const FALLBACK_COORD_DECIMALS = 5;
/** Máximo de puntos recordados en la caché de geocodificación inversa. */
const MAX_REVERSE_CACHE_ENTRIES = 100;

export interface ReverseGeocodeResult {
  displayName: string;
  shortName: string;
}

/**
 * Etiqueta de respaldo para un punto sin dirección conocida.
 *
 * Se exporta porque la usan dos sitios: reverseGeocode (cuando Photon responde sin datos) y
 * app/page.tsx (cuando la petición falla del todo). Una sola definición = un solo formato.
 */
export function buildFallbackLocation(lat: number, lng: number): ReverseGeocodeResult {
  return {
    displayName: `Ubicación seleccionada (${lat.toFixed(FALLBACK_COORD_DECIMALS)}, ${lng.toFixed(
      FALLBACK_COORD_DECIMALS
    )})`,
    shortName: "Ubicación",
  };
}

/**
 * Caché de geocodificación inversa por coordenada redondeada a 4 decimales (~11 m): tocar dos
 * veces el mismo punto (o casi) no vuelve a molestar al servidor público.
 */
const reverseCache = new Map<string, ReverseGeocodeResult>();

function reverseCacheKey(lat: number, lng: number): string {
  return `${lat.toFixed(4)},${lng.toFixed(4)}`;
}

/** Propiedades de interés de un feature de /reverse (todas pueden faltar). */
interface PhotonReverseProperties {
  name: string;
  street: string;
  housenumber: string;
  suburb: string;
  district: string;
  city: string;
  state: string;
}

/**
 * Etiqueta legible de un punto tocado en el mapa.
 *
 * Formato pedido: `${name || street}, ${suburb || city}`, con dos matices avisados:
 * - Si no hay `name` y sí dirección con número, se usa "street housenumber"
 *   ("Avenida Blandín 5, La Castellana"), que es lo único que identifica el punto.
 * - El segundo tramo es `suburb || district || city`: en los datos de Venezuela `suburb`
 *   casi siempre falta y la urbanización/sector viene en `district` (medido en la Fase 3.5f),
 *   así que sin él un punto en Las Mercedes quedaría como "…, Caracas" y se perdería el dato
 *   que de verdad orienta al conductor.
 */
function buildReverseDisplayName(properties: PhotonReverseProperties): string {
  const streetPart = [properties.street, properties.housenumber]
    .filter((part) => part.length > 0)
    .join(" ");
  const primary = properties.name.length > 0 ? properties.name : streetPart;
  const secondary = properties.suburb || properties.district || properties.city;

  return joinUnique([primary, secondary]);
}

/** Nombre corto del resultado: lo más específico disponible (para etiquetas compactas). */
function buildReverseShortName(properties: PhotonReverseProperties): string {
  if (properties.name.length > 0) return properties.name;
  if (properties.street.length > 0) return properties.street;

  return properties.suburb || properties.district || properties.city || "Ubicación";
}

/**
 * Convierte la respuesta de /reverse (`unknown`) al DTO de la app.
 * Sin features, sin `properties` o sin datos útiles devuelve la etiqueta de respaldo, como
 * pide la fase: el input del formulario nunca se queda vacío.
 */
function parseReverseResponse(
  payload: unknown,
  lat: number,
  lng: number
): ReverseGeocodeResult {
  if (!isRecord(payload)) return buildFallbackLocation(lat, lng);

  const features = payload.features;
  if (!Array.isArray(features) || features.length === 0) return buildFallbackLocation(lat, lng);

  const firstFeature = features[0];
  if (!isRecord(firstFeature) || !isRecord(firstFeature.properties)) {
    return buildFallbackLocation(lat, lng);
  }

  const raw = firstFeature.properties;
  const properties: PhotonReverseProperties = {
    name: readString(raw, "name"),
    street: readString(raw, "street"),
    housenumber: readString(raw, "housenumber"),
    suburb: readString(raw, "suburb"),
    district: readString(raw, "district"),
    city: readString(raw, "city"),
    state: readString(raw, "state"),
  };

  const displayName = buildReverseDisplayName(properties);
  if (displayName.length === 0) return buildFallbackLocation(lat, lng);

  return { displayName, shortName: buildReverseShortName(properties) };
}

/**
 * Petición real a /reverse (una sola: el llamador no debe invocarla directamente).
 *
 * Sin `lang` a propósito: Photon solo soporta de|en|fr|it y con `lang=es` responde HTTP 400
 * (ver la cabecera del módulo); para Venezuela los nombres locales ya vienen en español.
 */
async function fetchReverseGeocode(
  lat: number,
  lng: number
): Promise<ReverseGeocodeResult | null> {
  const url = new URL(PHOTON_REVERSE_URL);
  url.searchParams.set("lat", String(lat));
  url.searchParams.set("lon", String(lng));

  const response = await fetch(url.toString(), {
    // ⚠️ Los navegadores no permiten sobrescribir `User-Agent` (header prohibido por la spec
    // Fetch); solo tiene efecto si esto se ejecutase en el servidor.
    headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  if (!response.ok) return null;

  const payload: unknown = await response.json();

  return parseReverseResponse(payload, lat, lng);
}

/**
 * Geocodificación inversa: dirección legible de un punto tocado en el mapa (Fase 3.5h).
 *
 * Comparte `schedulePhoton` con el autocompletado: es el mismo servicio y el mismo límite de
 * 1 petición por segundo.
 *
 * @param lat Latitud del punto tocado.
 * @param lng Longitud del punto tocado.
 * @returns Dirección legible —o `buildFallbackLocation(lat, lng)` si Photon responde sin
 *   datos—, y `null` si la petición falla (red, timeout, HTTP !== 200 o JSON inválido: el
 *   servidor público de /reverse devuelve 503 con frecuencia). Nunca lanza.
 */
export async function reverseGeocode(
  lat: number,
  lng: number
): Promise<ReverseGeocodeResult | null> {
  const cacheKey = reverseCacheKey(lat, lng);
  const cached = reverseCache.get(cacheKey);
  if (cached !== undefined) return cached;

  try {
    const result = await schedulePhoton(() => fetchReverseGeocode(lat, lng));
    if (result === null) return null;

    if (reverseCache.size >= MAX_REVERSE_CACHE_ENTRIES) {
      // Map conserva el orden de inserción: la primera clave es la más antigua.
      const oldestKey = reverseCache.keys().next().value;
      if (oldestKey !== undefined) reverseCache.delete(oldestKey);
    }
    reverseCache.set(cacheKey, result);

    return result;
  } catch {
    // Los fallos NO se cachean: el siguiente toque en el mismo punto reintenta.
    return null;
  }
}
