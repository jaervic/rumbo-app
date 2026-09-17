/**
 * Catálogo de vehículos (Fase 6.1): marca + modelo + año.
 *
 * ¿Por qué existe? El formulario solo pedía el TIPO de vehículo (sedán, SUV…) y con eso ya se tarifa,
 * pero no se puede identificar el carro real del conductor. La marca, el modelo y el año son los
 * datos que hacen falta para lo que viene después: guardar el viaje con el vehículo que lo hizo,
 * avisar de restricciones por año y calibrar tarifas por gama con datos reales. Esta fase entrega el
 * catálogo como DATOS: la selección viaja en `QuoteRequest.vehicle` (types/index.ts) y el precio
 * sigue dependiendo solo del tipo y de los pasajeros.
 *
 * ⚠️ El AÑO todavía NO cambia el precio: ver el TODO (Fase 6.2) en lib/pricing.ts.
 *
 * ¿Por qué una tabla local y no una API? Igual que lib/popularPlaces.ts: el parque venezolano es
 * corto y estable (unas decenas de modelos cubren la mayoría de los viajes), todavía no hay base de
 * datos y una lista local no depende de red, ni de API key, ni de cuotas de uso. Cuando exista
 * Supabase, esta tabla pasa a ser la semilla de `vehicle_models` y los ids de aquí
 * (`toyota-corolla`) sirven de clave estable para no reescribir las cotizaciones guardadas.
 *
 * Los años son el RANGO EN EL QUE EL MODELO SE VENDIÓ (concesionario o importación informal), no el
 * año de cada facelift: `yearTo === null` significa "sigue a la venta" y su lista de años llega
 * hasta MAX_VEHICLE_YEAR. No es un adorno: evita ofrecer el "Corolla 1994" de un modelo que llegó en
 * 2005 y deja listo el dato de antigüedad para cuando la Fase 6.2 lo necesite.
 * TODO: verificar los rangos con los concesionarios año por año. El de las motos es el más flojo (y
 * su lista, la más corta: faltan marcas como Vento, Ryan o Motomel).
 *
 * Categorías: `sedan` es "carro particular" e incluye hatchback y city cars (Spark, Picanto, Getz):
 * lo que manda es la categoría con la que se cotiza, no la silueta. Las pick-up de doble cabina
 * (Hilux, F-150, D-Max…) van en `suv` por capacidad y consumo.
 *
 * Orden: marcas y modelos van en orden de PREVALENCIA en el parque venezolano, no alfabético (es el
 * orden en el que aparecen en el Select). Primero los carros y al final las motos: quien cotiza en
 * moto baja un poco en la lista, pero así el caso más frecuente queda arriba.
 */

import type { VehicleSelection, VehicleType } from "@/types";

/** Modelo concreto de una marca, ya resuelto (id y alias se generan desde la semilla). */
export interface VehicleModel {
  /** id estable, p. ej. "toyota-land-cruiser-prado". Es la clave que se guardará en Supabase. */
  id: string;
  /** Nombre visible dentro de su marca, p. ej. "Land Cruiser Prado". */
  name: string;
  /** Tipo del motor tarifario que le corresponde (es lo que se DEDUCE de la selección). */
  type: VehicleType;
  /** Primer año en el que el modelo se vendió aquí. */
  yearFrom: number;
  /** Último año de venta; `null` = sigue a la venta (se corta en MAX_VEHICLE_YEAR). */
  yearTo: number | null;
  /** Variantes de escritura para la búsqueda por texto (Fase 6.2). */
  aliases: string[];
}

/** Marca del catálogo con sus modelos. */
export interface VehicleBrand {
  id: string;
  name: string;
  models: VehicleModel[];
}

/**
 * Semilla compacta de un modelo: [nombre, tipo, primer año, último año (null = sigue a la venta)].
 *
 * La tabla se escribe así para que cada modelo ocupe una línea y se revise de un vistazo; el id y
 * los alias se derivan del nombre al construir el catálogo (ver `VEHICLE_BRANDS`).
 */
type ModelSeed = readonly [name: string, type: VehicleType, yearFrom: number, yearTo: number | null];

interface BrandSeed {
  readonly id: string;
  readonly name: string;
  readonly models: readonly ModelSeed[];
}

/**
 * Año más nuevo que ofrece el catálogo.
 *
 * Es una constante escrita a mano (y no `new Date().getFullYear()`) a propósito: con la fecha del
 * sistema, el HTML del servidor y el del cliente podrían diferir (cambio de año, zona horaria) y
 * React reportaría un error de hidratación. Subirlo una vez al año es un cambio deliberado.
 */
const MAX_VEHICLE_YEAR = 2026;

const BRAND_SEEDS: readonly BrandSeed[] = [
  // --- Toyota: la marca más común del parque; Corolla y Land Cruiser Prado son omnipresentes.
  { id: "toyota", name: "Toyota", models: [
    ["Corolla", "sedan", 1990, null],
    ["Camry", "sedan", 1990, null],
    ["Yaris", "sedan", 2000, null],
    ["RAV4", "suv", 1996, null],
    ["Fortuner", "suv", 2005, null],
    ["4Runner", "suv", 1990, null],
    ["Land Cruiser Prado", "suv", 1990, null],
    ["Land Cruiser", "suv", 1990, null],
    ["Hilux", "suv", 1990, null],
    ["Hiace", "van", 1990, null],
  ]},

  // --- Chevrolet: la otra mitad del parque; Aveo y Optra fueron los carros de entrada más vendidos.
  { id: "chevrolet", name: "Chevrolet", models: [
    ["Aveo", "sedan", 2005, 2018],
    ["Optra", "sedan", 2004, 2012],
    ["Cruze", "sedan", 2010, 2019],
    ["Spark", "sedan", 2005, null],
    ["Cavalier", "sedan", 2016, null],
    ["Malibu", "sedan", 1997, 2015],
    ["Grand Blazer", "suv", 1995, 2010],
    ["Captiva", "suv", 2007, 2015],
    ["Orlando", "suv", 2011, 2015],
    ["Tahoe", "suv", 1995, null],
    ["Silverado", "suv", 2000, null],
    ["Express Van", "van", 1996, null],
  ]},

  // --- Hyundai: Accent y Getz son los más vistos; la H1 es la van de grupos por excelencia.
  { id: "hyundai", name: "Hyundai", models: [
    ["Accent", "sedan", 1995, null],
    ["Elantra", "sedan", 1991, null],
    ["Getz", "sedan", 2002, 2010],
    ["Grand i10", "sedan", 2014, null],
    ["Sonata", "sedan", 1990, null],
    ["Tucson", "suv", 2004, null],
    ["Santa Fe", "suv", 2001, null],
    ["Veracruz", "suv", 2007, 2015],
    ["H1 (Starex)", "van", 1997, null],
  ]},

  // --- Kia: mismo público que Hyundai; Rio, Sportage y Carnival (van familiar) son muy comunes.
  { id: "kia", name: "Kia", models: [
    ["Picanto", "sedan", 2004, null],
    ["Rio", "sedan", 2000, null],
    ["Cerato", "sedan", 2004, null],
    ["Optima", "sedan", 2000, null],
    ["Sportage", "suv", 1995, null],
    ["Sorento", "suv", 2002, null],
    ["Seltos", "suv", 2019, null],
    ["Carnival", "van", 1998, null],
    ["Pregio", "van", 1995, 2012],
  ]},

  // --- Ford: Fiesta/Focus para el día a día y Explorer/F-150 para familia y carga.
  { id: "ford", name: "Ford", models: [
    ["Fiesta", "sedan", 2002, 2019],
    ["Focus", "sedan", 2000, 2018],
    ["Fusion", "sedan", 2006, 2020],
    ["EcoSport", "suv", 2003, null],
    ["Escape", "suv", 2001, null],
    ["Explorer", "suv", 1991, null],
    ["Expedition", "suv", 1997, null],
    ["F-150", "suv", 1990, null],
    ["Econoline", "van", 1990, 2014],
  ]},

  // --- Mitsubishi: Lancer y Montero son dos nombres que llevan décadas en el país.
  { id: "mitsubishi", name: "Mitsubishi", models: [
    ["Lancer", "sedan", 1990, 2017],
    ["Mirage", "sedan", 2013, null],
    ["Montero", "suv", 1990, null],
    ["Montero Sport", "suv", 1996, null],
    ["Outlander", "suv", 2003, null],
    ["L200", "suv", 1990, null],
  ]},

  // --- Honda: Civic/Accord de turismo y CR-V de familia. Las motos van en el mismo bloque porque
  // el usuario busca una marca, no una división.
  { id: "honda", name: "Honda", models: [
    ["Civic", "sedan", 1990, null],
    ["Accord", "sedan", 1990, null],
    ["Fit", "sedan", 2002, null],
    ["City", "sedan", 1996, null],
    ["CR-V", "suv", 1997, null],
    ["HR-V", "suv", 1998, null],
    ["Pilot", "suv", 2003, null],
    ["C90", "moto", 1990, 2005],
    ["Elite 125", "moto", 2010, null],
    ["Tornado XR250", "moto", 2003, null],
    ["Biz 125", "moto", 2010, null],
  ]},

  // --- Nissan: Sentra y Versa de uso diario; la Urvan es la van de carga y personal.
  { id: "nissan", name: "Nissan", models: [
    ["Sentra", "sedan", 1990, null],
    ["Versa", "sedan", 2007, null],
    ["Tiida", "sedan", 2004, 2016],
    ["Altima", "sedan", 1993, null],
    ["X-Trail", "suv", 2001, null],
    ["Pathfinder", "suv", 1990, null],
    ["Frontier", "suv", 1998, null],
    ["Urvan", "van", 1990, null],
  ]},

  // --- Renault: Logan y Sandero fueron los carros de entrada más vendidos; el Duster es de los SUV
  // más vistos en el país.
  { id: "renault", name: "Renault", models: [
    ["Logan", "sedan", 2005, null],
    ["Sandero", "sedan", 2009, null],
    ["Symbol", "sedan", 2001, 2015],
    ["Megane", "sedan", 1996, 2015],
    ["Duster", "suv", 2011, null],
    ["Koleos", "suv", 2008, null],
    ["Kangoo", "van", 1998, 2015],
  ]},

  // --- Suzuki: Grand Vitara y Swift en carros; GN125, AX100 y Gixxer son motos de trabajo y diarias.
  { id: "suzuki", name: "Suzuki", models: [
    ["Swift", "sedan", 1990, null],
    ["Grand Vitara", "suv", 1999, null],
    ["Vitara", "suv", 2015, null],
    ["Jimny", "suv", 1990, null],
    ["SX4", "suv", 2006, 2015],
    ["AX100", "moto", 1990, 2010],
    ["GN125", "moto", 1995, null],
    ["EN125", "moto", 2005, null],
    ["Gixxer 150", "moto", 2015, null],
  ]},

  // --- Mazda: sus carros se nombran por número ("Mazda 3", "Mazda 6") y las camionetas llevan CX.
  { id: "mazda", name: "Mazda", models: [
    ["2", "sedan", 2003, null],
    ["3", "sedan", 2003, null],
    ["6", "sedan", 2002, null],
    ["CX-5", "suv", 2012, null],
    ["CX-7", "suv", 2007, 2012],
    ["CX-9", "suv", 2007, null],
    ["BT-50", "suv", 2006, null],
  ]},

  // --- Volkswagen: Golf/Jetta de turismo, Tiguan/Touareg de familia y la Transporter como van.
  { id: "volkswagen", name: "Volkswagen", models: [
    ["Gol", "sedan", 1990, 2015],
    ["Golf", "sedan", 1990, null],
    ["Jetta", "sedan", 1990, null],
    ["Passat", "sedan", 1990, null],
    ["Vento", "sedan", 2012, null],
    ["Tiguan", "suv", 2008, null],
    ["Touareg", "suv", 2003, null],
    ["Amarok", "suv", 2010, null],
    ["Transporter", "van", 1990, 2013],
  ]},

  // --- Jeep: 4x4 de toda la vida; Grand Cherokee y Wrangler son los más pedidos.
  { id: "jeep", name: "Jeep", models: [
    ["Grand Cherokee", "suv", 1993, null],
    ["Cherokee", "suv", 1990, null],
    ["Wrangler", "suv", 1990, null],
    ["Compass", "suv", 2007, null],
    ["Liberty", "suv", 2002, 2013],
  ]},

  // --- Chery: los primeros chinos que se popularizaron (Orinoco y Arauca se ensamblaron aquí).
  { id: "chery", name: "Chery", models: [
    ["Orinoco", "sedan", 2006, 2015],
    ["Arauca", "sedan", 2006, 2013],
    ["QQ", "sedan", 2005, 2015],
    ["Tiggo", "suv", 2006, null],
    ["Grand Tiggo", "suv", 2015, null],
  ]},

  // --- MG: relanzada como marca china asequible; ZS y HS son los modelos más vistos.
  { id: "mg", name: "MG", models: [
    ["3", "sedan", 2013, null],
    ["5", "sedan", 2013, null],
    ["ZS", "suv", 2018, null],
    ["HS", "suv", 2019, null],
    ["RX5", "suv", 2019, null],
  ]},

  // --- Fiat: Uno, Palio y Siena dominaron el mercado popular de los 2000; el Ducato sigue siendo van.
  { id: "fiat", name: "Fiat", models: [
    ["Uno", "sedan", 1990, 2013],
    ["Palio", "sedan", 1997, 2015],
    ["Siena", "sedan", 1997, 2015],
    ["Ducato", "van", 1990, null],
  ]},

  // --- Mercedes-Benz: turismo de gama alta, camionetas y la Sprinter (van de grupos y de carga).
  { id: "mercedes-benz", name: "Mercedes-Benz", models: [
    ["Clase C", "sedan", 1993, null],
    ["Clase E", "sedan", 1990, null],
    ["Clase ML", "suv", 1997, 2015],
    ["GLC", "suv", 2015, null],
    ["GLE", "suv", 2015, null],
    ["Sprinter", "van", 1995, null],
  ]},

  // --- Great Wall: pick-up y SUV chinos, muy presentes en obra y campo.
  { id: "great-wall", name: "Great Wall", models: [
    ["Wingle", "suv", 2010, null],
    ["Haval H6", "suv", 2013, null],
    ["Poer", "suv", 2020, null],
  ]},

  // --- JAC: carros, camionetas y la van Sunray, de precio bajo y comunes en transporte ejecutivo.
  { id: "jac", name: "JAC", models: [
    ["S2", "suv", 2015, null],
    ["S3", "suv", 2014, null],
    ["S5", "suv", 2014, null],
    ["T6", "suv", 2015, null],
    ["Sunray", "van", 2015, null],
  ]},

  // --- Isuzu: la D-Max es pick-up de trabajo por excelencia; el Trooper, un 4x4 de los 90.
  { id: "isuzu", name: "Isuzu", models: [
    ["D-Max", "suv", 2002, null],
    ["Trooper", "suv", 1991, 2002],
  ]},

  // --- Motos: el parque más grande del país, entre marcas locales (Bera, Empire) y asiáticas. Es la
  // lista más corta del catálogo: ver el TODO de la cabecera (faltan Vento, Ryan, Motomel...).
  { id: "yamaha", name: "Yamaha", models: [
    ["Crypton", "moto", 1996, null],
    ["FZ", "moto", 2008, null],
    ["XTZ 125", "moto", 2005, null],
    ["Fazer 250", "moto", 2010, null],
  ]},
  { id: "bera", name: "Bera", models: [
    ["BR 150", "moto", 2012, null],
  ]},
  { id: "empire", name: "Empire", models: [
    ["Owyn 150", "moto", 2013, null],
  ]},
  { id: "bajaj", name: "Bajaj", models: [
    ["Pulsar 180", "moto", 2005, null],
    ["Boxer CT 100", "moto", 2008, null],
    ["Discover 125", "moto", 2010, null],
  ]},
  { id: "haojue", name: "Haojue", models: [
    ["MD 110", "moto", 2010, null],
    ["MD 150", "moto", 2008, null],
  ]},
  { id: "um", name: "UM", models: [
    ["150", "moto", 2014, null],
    ["Xtreet 200", "moto", 2015, null],
  ]},
];

// --- API pública del catálogo: lo que consumen la UI hoy y, en la Fase 6.2, el motor de precios.

/**
 * Normaliza texto para comparar y para generar ids: "Mérida" → "merida".
 *
 * Es la misma idea que `normalize` en lib/geocoding.ts y `normalizeForSearch` en
 * lib/popularPlaces.ts. Cada módulo mantiene la suya porque son privadas y de una línea: sacarlas a
 * un helper compartido obligaría a exportar una utilidad que no es del dominio de ninguno.
 */
function normalizeForSearch(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

/** id estable de modelo a partir del nombre: "Land Cruiser Prado" → "land-cruiser-prado". */
function slugify(value: string): string {
  return normalizeForSearch(value)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Catálogo completo, con ids y alias ya generados desde la semilla.
 *
 * Se construye UNA vez al importar el módulo (los gestos del usuario no recorren la tabla) y se
 * expone `readonly`: para quien lo consume, el catálogo es de solo lectura.
 */
export const VEHICLE_BRANDS: readonly VehicleBrand[] = BRAND_SEEDS.map((seed) => ({
  id: seed.id,
  name: seed.name,
  models: seed.models.map(([name, type, yearFrom, yearTo]) => ({
    id: `${seed.id}-${slugify(name)}`,
    name,
    type,
    yearFrom,
    yearTo,
    // Alias para la búsqueda por texto de la Fase 6.2 ("corola" → Corolla). Hoy es el nombre
    // normalizado; si hiciera falta, se añaden los apodos de calle en la semilla.
    aliases: [normalizeForSearch(name)],
  })),
}));

/** Índices por id: los gestos del usuario no recorren la tabla. */
const BRAND_BY_ID: ReadonlyMap<string, VehicleBrand> = new Map(
  VEHICLE_BRANDS.map((brand) => [brand.id, brand] as const)
);
const MODEL_BY_ID: ReadonlyMap<string, VehicleModel> = new Map(
  VEHICLE_BRANDS.flatMap((brand) => brand.models.map((model) => [model.id, model] as const))
);
const BRAND_BY_MODEL_ID: ReadonlyMap<string, VehicleBrand> = new Map(
  VEHICLE_BRANDS.flatMap((brand) => brand.models.map((model) => [model.id, brand] as const))
);

/** Modelos de una marca, en el orden de la tabla (prevalencia). [] si la marca no existe. */
export function getVehicleModelsByBrand(brandId: string): VehicleModel[] {
  const brand = BRAND_BY_ID.get(brandId);
  return brand === undefined ? [] : [...brand.models];
}

/**
 * Años seleccionables de un modelo, DEL MÁS NUEVO AL MÁS VIEJO (el orden que se ve en el Select).
 *
 * `yearTo === null` ("sigue a la venta") se corta en `MAX_VEHICLE_YEAR`, y no en el año del sistema:
 * así el HTML del servidor y el del cliente son idénticos y no hay parpadeo ni error de hidratación
 * (el mismo motivo por el que PriceCard formatea los números a mano). Devuelve [] si no hay modelo.
 */
export function getVehicleModelYears(
  modelId: string,
  lastYear: number = MAX_VEHICLE_YEAR
): number[] {
  const model = MODEL_BY_ID.get(modelId);
  if (model === undefined) return [];

  const newest = Math.min(model.yearTo ?? lastYear, lastYear);
  if (newest < model.yearFrom) return [];

  const years: number[] = [];
  for (let year = newest; year >= model.yearFrom; year -= 1) {
    years.push(year);
  }
  return years;
}

/**
 * Tipo de vehículo que implica una selección del catálogo: es lo que TARIFA el precio.
 *
 * Devuelve `null` si el modelo no existe o si no pertenece a esa marca (una selección manipulada no
 * debe colar un tipo distinto). El llamador conserva entonces el tipo que ya tenía, en lugar de
 * quedarse sin `vehicleType` y sin precio.
 */
export function getVehicleTypeFromSelection(selection: VehicleSelection): VehicleType | null {
  const model = MODEL_BY_ID.get(selection.modelId);
  if (model === undefined) return null;

  const brand = BRAND_BY_MODEL_ID.get(selection.modelId);
  return brand !== undefined && brand.id === selection.brandId ? model.type : null;
}

/**
 * "Toyota Corolla 2015" a partir de la selección, o `null` si los ids no cuadran.
 *
 * El texto se compone aquí (y no en cada componente) para que el formulario, la tarjeta del precio y
 * la futura cotización guardada digan exactamente lo mismo. No usa `Intl`: el año es un número sin
 * separadores, así que no hay formato local que pueda romper la hidratación.
 */
export function describeVehicle(selection: VehicleSelection): string | null {
  const model = MODEL_BY_ID.get(selection.modelId);
  const brand = BRAND_BY_MODEL_ID.get(selection.modelId);
  if (model === undefined || brand === undefined || brand.id !== selection.brandId) return null;

  return `${brand.name} ${model.name} ${selection.year}`;
}
