/**
 * Lista local curada de lugares populares de Venezuela.
 *
 * ¿Por qué existe? Photon ordena por coincidencia de nombre, no por popularidad: para
 * "el marq" devuelve la urbanización "El Marqués" antes que el "Centro Comercial El
 * Marqués". Los conductores buscan lugares conocidos (centros comerciales, aeropuertos,
 * terminales, hospitales, universidades), así que esta lista se consulta ANTES de Photon
 * y sus resultados van SIEMPRE primero en las sugerencias.
 *
 * Coordenadas: verificadas contra OpenStreetMap/Photon para El Marqués, CCCT, Sambil
 * Chacao, Sambil La Candelaria, Sambil Valencia, Sambil Margarita, Aeropuerto Maiquetía,
 * Terminal La Bandera, Tolón, Plaza Venezuela y Parque Central. El resto son aproximadas
 * al centro urbano de cada ciudad.
 *
 * TODO: revisar las coordenadas exactas de los lugares no verificados (los aproximados).
 * TODO (fase posterior): añadir las cadenas con muchas sedes y sus sedes más buscadas:
 * Farmatodo, Farmacias SAAS, Farmacias Bicentenario, Locatel, Automercados Plaza's...
 * Photon ya devuelve varias sedes, pero no las ordena por popularidad ni trae siempre la
 * urbanización; con la lista local se puede fijar directamente la sede de cada ciudad y
 * su `shortName` distintivo (ver buildDisplayName en lib/geocoding.ts, que es lo que hace
 * legibles las sedes que sí llegan de Photon).
 * TODO (Fase 7+): ampliar esta lista con analytics de búsquedas reales desde Supabase
 * (qué escriben de verdad los usuarios y qué eligen de la lista de sugerencias).
 */

export type PopularPlaceType =
  | "mall"
  | "airport"
  | "hospital"
  | "university"
  | "terminal"
  | "landmark";

export interface PopularPlace {
  /** Nombre completo y legible, p. ej. "Centro Comercial El Marqués". */
  name: string;
  /** Nombre corto para la lista de sugerencias, p. ej. "CC El Marqués". */
  shortName: string;
  /** Variantes que el usuario puede escribir (sin acentos, en minúsculas). */
  aliases: string[];
  lat: number;
  lng: number;
  city: string;
  state: string;
  type: PopularPlaceType;
}

/** Máximo de lugares populares que devuelve una búsqueda. */
const MAX_POPULAR_RESULTS = 3;

export const POPULAR_PLACES: PopularPlace[] = [
  // Caracas - Centros comerciales
  { name: "Centro Comercial El Marqués", shortName: "CC El Marqués", aliases: ["el marques", "cc el marques", "marques", "marquez"], lat: 10.4956, lng: -66.8110, city: "Caracas", state: "Miranda", type: "mall" },
  { name: "Sambil Chacao", shortName: "Sambil Chacao", aliases: ["sambil", "sambil chacao"], lat: 10.4890, lng: -66.8543, city: "Caracas", state: "Miranda", type: "mall" },
  { name: "Sambil La Candelaria", shortName: "Sambil La Candelaria", aliases: ["sambil candelaria", "sambil la candelaria"], lat: 10.5048, lng: -66.9015, city: "Caracas", state: "Distrito Capital", type: "mall" },
  { name: "Centro Ciudad Comercial Tamanaco", shortName: "CCCT", aliases: ["ccct", "tamanaco"], lat: 10.4854, lng: -66.8550, city: "Caracas", state: "Miranda", type: "mall" },
  { name: "Centro Comercial Plaza Las Américas", shortName: "CC Plaza Las Américas", aliases: ["plaza las americas", "las americas"], lat: 10.489, lng: -66.842, city: "Caracas", state: "Miranda", type: "mall" },
  { name: "Tolón Fashion Mall", shortName: "Tolón", aliases: ["tolon", "tolon fashion mall"], lat: 10.4807, lng: -66.8607, city: "Caracas", state: "Miranda", type: "mall" },
  { name: "Centro Comercial Paseo Las Mercedes", shortName: "Paseo Las Mercedes", aliases: ["paseo las mercedes"], lat: 10.485, lng: -66.861, city: "Caracas", state: "Miranda", type: "mall" },
  { name: "Centro Comercial El Recreo", shortName: "CC El Recreo", aliases: ["el recreo", "recreo sabana grande"], lat: 10.494, lng: -66.876, city: "Caracas", state: "Distrito Capital", type: "mall" },
  { name: "Centro Comercial San Ignacio", shortName: "CC San Ignacio", aliases: ["san ignacio", "cc san ignacio"], lat: 10.497, lng: -66.849, city: "Caracas", state: "Miranda", type: "mall" },
  { name: "Centro Comercial Concresa", shortName: "Concresa", aliases: ["concresa"], lat: 10.469, lng: -66.855, city: "Caracas", state: "Miranda", type: "mall" },
  { name: "Centro Comercial Millennium Mall", shortName: "Millennium Mall", aliases: ["millennium", "milenium"], lat: 10.487, lng: -66.841, city: "Caracas", state: "Miranda", type: "mall" },

  // Caracas - Aeropuerto y terminales
  { name: "Aeropuerto Internacional Simón Bolívar", shortName: "Aeropuerto Maiquetía", aliases: ["maiquetia", "aeropuerto caracas", "aeropuerto internacional"], lat: 10.6031, lng: -66.9967, city: "Maiquetía", state: "La Guaira", type: "airport" },
  { name: "Terminal de Pasajeros de Caracas", shortName: "Terminal La Bandera", aliases: ["la bandera", "terminal caracas", "terminal la bandera"], lat: 10.4759, lng: -66.8993, city: "Caracas", state: "Distrito Capital", type: "terminal" },

  // Caracas - Hospitales
  { name: "Hospital Universitario de Caracas", shortName: "Hospital Universitario", aliases: ["hospital universitario", "huc"], lat: 10.488, lng: -66.893, city: "Caracas", state: "Distrito Capital", type: "hospital" },
  { name: "Clínica La Trinidad", shortName: "Clínica La Trinidad", aliases: ["la trinidad", "trinidad"], lat: 10.497, lng: -66.853, city: "Caracas", state: "Miranda", type: "hospital" },

  // Caracas - Universidades y landmarks
  { name: "Universidad Central de Venezuela", shortName: "UCV", aliases: ["ucv", "universidad central"], lat: 10.490, lng: -66.891, city: "Caracas", state: "Distrito Capital", type: "university" },
  { name: "Universidad Simón Bolívar", shortName: "USB", aliases: ["usb", "universidad simon bolivar"], lat: 10.410, lng: -66.884, city: "Caracas", state: "Miranda", type: "university" },
  { name: "Universidad Metropolitana", shortName: "Unimet", aliases: ["unimet"], lat: 10.477, lng: -66.813, city: "Caracas", state: "Miranda", type: "university" },
  { name: "Plaza Venezuela", shortName: "Plaza Venezuela", aliases: ["plaza venezuela"], lat: 10.4969, lng: -66.8857, city: "Caracas", state: "Distrito Capital", type: "landmark" },
  { name: "Parque Central", shortName: "Parque Central", aliases: ["parque central"], lat: 10.4979, lng: -66.9021, city: "Caracas", state: "Distrito Capital", type: "landmark" },

  // Valencia / Carabobo
  { name: "Sambil Valencia", shortName: "Sambil Valencia", aliases: ["sambil valencia"], lat: 10.2390, lng: -68.0001, city: "Valencia", state: "Carabobo", type: "mall" },
  { name: "Centro Comercial Metrópolis Valencia", shortName: "CC Metrópolis", aliases: ["metropolis", "cc metropolis"], lat: 10.180, lng: -68.006, city: "Valencia", state: "Carabobo", type: "mall" },
  { name: "Centro Comercial La Viña", shortName: "CC La Viña", aliases: ["la viña", "cc la viña"], lat: 10.170, lng: -68.015, city: "Valencia", state: "Carabobo", type: "mall" },
  { name: "Aeropuerto Internacional Arturo Michelena", shortName: "Aeropuerto Valencia", aliases: ["aeropuerto valencia", "arturo michelena"], lat: 10.150, lng: -67.928, city: "Valencia", state: "Carabobo", type: "airport" },
  { name: "Terminal Big Low Center", shortName: "Terminal Big Low", aliases: ["big low", "terminal valencia"], lat: 10.184, lng: -68.008, city: "Valencia", state: "Carabobo", type: "terminal" },

  // Maracay / Aragua
  { name: "Centro Comercial Las Américas", shortName: "CC Las Américas", aliases: ["las americas maracay", "cc las americas"], lat: 10.246, lng: -67.596, city: "Maracay", state: "Aragua", type: "mall" },
  { name: "Centro Comercial Paseo Las Delicias", shortName: "CC Paseo Las Delicias", aliases: ["paseo las delicias", "las delicias"], lat: 10.246, lng: -67.600, city: "Maracay", state: "Aragua", type: "mall" },

  // Barquisimeto / Lara
  { name: "Sambil Barquisimeto", shortName: "Sambil Barquisimeto", aliases: ["sambil barquisimeto"], lat: 10.073, lng: -69.296, city: "Barquisimeto", state: "Lara", type: "mall" },
  { name: "Centro Comercial Las Trinitarias", shortName: "CC Las Trinitarias", aliases: ["las trinitarias", "trinitarias"], lat: 10.065, lng: -69.322, city: "Barquisimeto", state: "Lara", type: "mall" },
  { name: "Terminal de Pasajeros de Barquisimeto", shortName: "Terminal Barquisimeto", aliases: ["terminal barquisimeto"], lat: 10.064, lng: -69.293, city: "Barquisimeto", state: "Lara", type: "terminal" },

  // Maracaibo / Zulia
  { name: "Sambil Maracaibo", shortName: "Sambil Maracaibo", aliases: ["sambil maracaibo"], lat: 10.654, lng: -71.649, city: "Maracaibo", state: "Zulia", type: "mall" },
  { name: "Centro Comercial Doral Center", shortName: "Doral Center", aliases: ["doral", "doral center"], lat: 10.654, lng: -71.610, city: "Maracaibo", state: "Zulia", type: "mall" },
  { name: "Aeropuerto Internacional La Chinita", shortName: "Aeropuerto La Chinita", aliases: ["la chinita", "aeropuerto maracaibo"], lat: 10.558, lng: -71.727, city: "Maracaibo", state: "Zulia", type: "airport" },

  // Lechería / Anzoátegui
  { name: "Centro Comercial Plaza Mayor", shortName: "CC Plaza Mayor", aliases: ["plaza mayor", "cc plaza mayor"], lat: 10.187, lng: -64.686, city: "Lechería", state: "Anzoátegui", type: "mall" },
  { name: "Aeropuerto Internacional General José Antonio Anzoátegui", shortName: "Aeropuerto Barcelona", aliases: ["aeropuerto barcelona", "aeropuerto anzoatagui"], lat: 10.107, lng: -64.689, city: "Barcelona", state: "Anzoátegui", type: "airport" },

  // Margarita / Nueva Esparta
  { name: "Sambil Margarita", shortName: "Sambil Margarita", aliases: ["sambil margarita"], lat: 10.9969, lng: -63.8126, city: "Pampatar", state: "Nueva Esparta", type: "mall" },
  { name: "Aeropuerto Internacional del Caribe Santiago Mariño", shortName: "Aeropuerto Margarita", aliases: ["aeropuerto margarita", "santiago mariño"], lat: 10.912, lng: -63.966, city: "Porlamar", state: "Nueva Esparta", type: "airport" },

  // Puerto Ordaz / Bolívar
  { name: "Orinokia Mall", shortName: "Orinokia Mall", aliases: ["orinokia"], lat: 8.290, lng: -62.725, city: "Puerto Ordaz", state: "Bolívar", type: "mall" },
  { name: "Aeropuerto Internacional Manuel Carlos Piar", shortName: "Aeropuerto Puerto Ordaz", aliases: ["aeropuerto puerto ordaz", "manuel carlos piar"], lat: 8.288, lng: -62.760, city: "Puerto Ordaz", state: "Bolívar", type: "airport" },

  // San Cristóbal / Táchira
  { name: "Sambil San Cristóbal", shortName: "Sambil San Cristóbal", aliases: ["sambil san cristobal"], lat: 7.775, lng: -72.219, city: "San Cristóbal", state: "Táchira", type: "mall" },

  // Mérida
  { name: "Centro Comercial Alto Prado", shortName: "CC Alto Prado", aliases: ["alto prado", "cc alto prado"], lat: 8.595, lng: -71.154, city: "Mérida", state: "Mérida", type: "mall" },
  { name: "Aeropuerto Alberto Carnevalli", shortName: "Aeropuerto Mérida", aliases: ["aeropuerto merida"], lat: 8.582, lng: -71.161, city: "Mérida", state: "Mérida", type: "airport" },
];

/** Normaliza para comparar: sin acentos, minúsculas y sin espacios extremos. */
function normalizeForSearch(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

/**
 * Busca en la lista local de lugares populares.
 * Coincide si el nombre, el nombre corto o algún alias EMPIEZA por la consulta.
 * Ordena primero las coincidencias exactas y, entre iguales, el orden de la lista
 * curada (que es su orden de popularidad).
 *
 * @param query Texto escrito por el usuario (ej: "el marq", "ccct", "maiquetia").
 * @returns Hasta MAX_POPULAR_RESULTS lugares.
 */
export function searchPopularPlaces(query: string): PopularPlace[] {
  const needle = normalizeForSearch(query);
  if (needle.length === 0) return [];

  const matches: { place: PopularPlace; index: number; isExact: boolean }[] = [];

  POPULAR_PLACES.forEach((place, index) => {
    const fields = [place.name, place.shortName, ...place.aliases].map(normalizeForSearch);

    if (!fields.some((field) => field.startsWith(needle))) return;

    matches.push({
      place,
      index,
      isExact: fields.some((field) => field === needle),
    });
  });

  return matches
    .sort((a, b) => Number(b.isExact) - Number(a.isExact) || a.index - b.index)
    .slice(0, MAX_POPULAR_RESULTS)
    .map((match) => match.place);
}

