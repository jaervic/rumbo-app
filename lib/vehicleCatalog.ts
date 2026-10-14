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
 *
 * Fase 6.1a (FILTRO POR TIPO): cada marca declara los tipos a los que aplica (`vehicleTypes`), que se
 * DEDUCEN de sus modelos, y `getBrandsByVehicleType` es lo que usa el selector para no ofrecer
 * "Toyota" a quien está cotizando una moto. El comodín "Otro" (`OTHER_OPTION`) declara los cuatro
 * tipos y va al final de la tabla, así que queda como última opción de todas las listas.
 * TODO (Fase 6.2): usar `VehicleSelector` en el perfil del conductor (NO en el QuoteForm: ahí sigue
 * el picker de la Fase 6.1, que no necesita filtrar por tipo).
 */

import type { VehicleType } from "@/types";

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
  /**
   * Tipos de vehículo a los que aplica esta marca (Fase 6.1a: filtro del selector).
   *
   * Se DEDUCE de los modelos (cada uno declara su `type`), así que no puede desincronizarse: una
   * marca está en la lista de motos porque tiene motos, no porque alguien la apuntó en dos sitios.
   * La excepción son las marcas SIN modelos cargados ("Otro", "Voge", "Vento"): esas declaran sus
   * tipos a mano, porque de una lista de modelos vacía no se deduce nada.
   */
  vehicleTypes: VehicleType[];
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
  /**
   * Tipos de la marca cuando NO se pueden deducir de sus modelos (marcas sin modelos cargados): lo
   * usan el comodín "Otro" (los cuatro tipos) y "Voge"/"Vento" (solo moto). Ver `getBrandsByVehicleType`.
   */
  readonly vehicleTypes?: readonly VehicleType[];
}

/**
 * Año más nuevo que ofrece el catálogo.
 *
 * Es una constante escrita a mano (y no `new Date().getFullYear()`) a propósito: con la fecha del
 * sistema, el HTML del servidor y el del cliente podrían diferir (cambio de año, zona horaria) y
 * React reportaría un error de hidratación. Subirlo una vez al año es un cambio deliberado.
 */
const MAX_VEHICLE_YEAR = 2026;

/**
 * Opción comodín de marca y modelo: "Otro" (Fase 6.1a).
 *
 * Vale para los DOS selects: en Marca entra como una opción más del catálogo (el comodín declara
 * los cuatro tipos de vehículo) y en Modelo se ofrece junto a los modelos de la marca elegida. Al
 * elegirla, el selector cambia a un campo de texto libre (marca o modelo que todavía no están en la
 * tabla).
 * TODO (Fase 7): enviar estas marcas/modelos personalizados a Supabase con los flags
 * `is_custom_brand` / `is_custom_model` para poder revisarlos y, si se repiten, promoverlos a la
 * tabla (ver el TODO de la cabecera del módulo).
 */
export const OTHER_OPTION = "Otro";

const BRAND_SEEDS: readonly BrandSeed[] = [
  // --- Toyota: la marca más común del parque; Corolla y Land Cruiser Prado son omnipresentes.
  { id: "toyota", name: "Toyota", models: [
    ["Corolla", "sedan", 1990, null],
    ["Camry", "sedan", 1990, null],
    ["Yaris", "sedan", 2000, null],
    // Modelos de los 80/90: siguen circulando en el país y muchos conductores los registran así.
    ["Starlet", "sedan", 1980, 1990],
    ["Tercel", "sedan", 1980, 1999],
    ["Corona", "sedan", 1980, 1998],
    ["Cressida", "sedan", 1980, 1992],
    ["RAV4", "suv", 1996, null],
    ["Fortuner", "suv", 2005, null],
    ["4Runner", "suv", 1990, null],
    ["Land Cruiser Prado", "suv", 1990, null],
    ["Land Cruiser", "suv", 1990, null],
    ["Hilux", "suv", 1990, null],
    // Autana: el 4Runner/Surf que se ensambló en Venezuela (Cumaná), nombre de calle obligatorio.
    ["Autana", "suv", 1993, 2005],
    ["Highlander", "suv", 2001, null],
    // Serie 40/60/70/80/100 del Land Cruiser: "Land Cruiser" (arriba) cubre la 200/300 moderna.
    ["Land Cruiser FJ40", "suv", 1980, 1984],
    ["Land Cruiser FJ60", "suv", 1980, 1990],
    ["Land Cruiser FJ70", "suv", 1985, null],
    ["Land Cruiser FJ80", "suv", 1990, 1998],
    ["Land Cruiser FJ100", "suv", 1998, 2007],
    ["Hiace", "van", 1990, null],
  ]},

  // --- Chevrolet: la otra mitad del parque; Aveo y Optra fueron los carros de entrada más vendidos.
  { id: "chevrolet", name: "Chevrolet", models: [
    ["Aveo", "sedan", 2005, 2018],
    ["Optra", "sedan", 2004, 2012],
    ["Cruze", "sedan", 2010, 2019],
    ["Spark", "sedan", 2005, null],
    // El nombre del Cavalier se usó en dos épocas (1982-2005 y desde 2016), de ahí el rango abierto.
    ["Cavalier", "sedan", 1982, null],
    ["Malibu", "sedan", 1997, 2015],
    ["Chevette", "sedan", 1980, 1995],
    ["Caprice", "sedan", 1980, 1996],
    ["Celebrity", "sedan", 1982, 1990],
    ["Corsa", "sedan", 1994, 2012],
    ["Meriva", "sedan", 2002, 2012],
    ["Monza", "sedan", 1982, 1996],
    ["Grand Blazer", "suv", 1995, 2010],
    ["Captiva", "suv", 2007, 2015],
    ["Orlando", "suv", 2011, 2015],
    ["Tahoe", "suv", 1995, null],
    ["Silverado", "suv", 2000, null],
    // La pick-up Luv D-Max se vendió con el logo de Chevrolet, no de Isuzu (ver Isuzu D-Max).
    ["Luv D-Max", "suv", 1990, null],
    ["Blazer", "suv", 1980, 2005],
    ["Trailblazer", "suv", 2002, null],
    ["Suburban", "suv", 1980, null],
    ["Trooper", "suv", 1980, 2002],
    ["Rodeo", "suv", 1988, 2004],
    ["Express Van", "van", 1996, null],
  ]},

  // --- Hyundai: Accent y Getz son los más vistos; la H1 es la van de grupos por excelencia.
  { id: "hyundai", name: "Hyundai", models: [
    ["Accent", "sedan", 1995, null],
    ["Elantra", "sedan", 1991, null],
    ["Excel", "sedan", 1986, 1995],
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
    ["Spectra", "sedan", 2001, 2009],
    ["Sephia", "sedan", 1993, 2001],
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
    ["Ka", "sedan", 1997, 2015],
    ["Laser", "sedan", 1981, 1999],
    ["Sierra", "sedan", 1983, 1993],
    ["Fairmont", "sedan", 1980, 1986],
    ["Maverick", "sedan", 1980, 1986],
    ["Orion", "sedan", 1983, 1993],
    ["Escort", "sedan", 1981, 2003],
    ["EcoSport", "suv", 2003, null],
    ["Escape", "suv", 2001, null],
    ["Explorer", "suv", 1991, null],
    ["Expedition", "suv", 1997, null],
    ["F-150", "suv", 1990, null],
    // Bronco y Wagoneer tuvieron un hueco de décadas (volvieron en 2021/2022): un rango abierto es más
    // útil para el conductor que dos entradas con el mismo nombre.
    ["Bronco", "suv", 1980, null],
    ["F-100", "suv", 1980, 1998],
    ["Ranger", "suv", 1998, null],
    ["Sport Trac", "suv", 2001, 2010],
    ["Econoline", "van", 1990, 2014],
  ]},

  // --- Mitsubishi: Lancer y Montero son dos nombres que llevan décadas en el país.
  { id: "mitsubishi", name: "Mitsubishi", models: [
    ["Lancer", "sedan", 1990, 2017],
    ["Mirage", "sedan", 2013, null],
    ["Galant", "sedan", 1980, 2012],
    // Signo: el Lancer que se ensambló en Venezuela (Mitsubishi-NAVEN), muy común en los 2000.
    ["Signo", "sedan", 1999, 2006],
    ["Tredia", "sedan", 1982, 1990],
    ["Montero", "suv", 1990, null],
    ["Montero Sport", "suv", 1996, null],
    ["Outlander", "suv", 2003, null],
    ["L200", "suv", 1990, null],
    // Nativa: el Montero Sport de los 90/2000; Endeavor, el SUV mediano de los 2000.
    ["Nativa", "suv", 1997, 2004],
    ["Endeavor", "suv", 2003, 2011],
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
    ["Storm", "moto", 2013, null],
    ["XR 150", "moto", 2014, null],
    ["CB 190", "moto", 2016, null],
  ]},

  // --- Nissan: Sentra y Versa de uso diario; la Urvan es la van de carga y personal.
  { id: "nissan", name: "Nissan", models: [
    ["Sentra", "sedan", 1990, null],
    ["Versa", "sedan", 2007, null],
    ["Tiida", "sedan", 2004, 2016],
    ["Altima", "sedan", 1993, null],
    ["Sunny", "sedan", 1980, 2006],
    ["Tsuru", "sedan", 1984, 2017],
    ["Almera", "sedan", 1995, 2006],
    ["X-Trail", "suv", 2001, null],
    ["Pathfinder", "suv", 1990, null],
    ["Frontier", "suv", 1998, null],
    ["Kicks", "suv", 2016, null],
    // Patrol: una sola entrada cubre las generaciones Y60 (1990-1998) y Y61 (1998+), que es como se
    // busca ("patrol" + año). Igual criterio que "Land Cruiser" frente a sus series FJ.
    ["Patrol", "suv", 1980, null],
    ["Terrano", "suv", 1986, 2006],
    ["Urvan", "van", 1990, null],
  ]},

  // --- Renault: Logan y Sandero fueron los carros de entrada más vendidos; el Duster es de los SUV
  // más vistos en el país.
  { id: "renault", name: "Renault", models: [
    ["Logan", "sedan", 2005, null],
    ["Sandero", "sedan", 2009, null],
    ["Symbol", "sedan", 2001, 2015],
    ["Megane", "sedan", 1996, 2015],
    ["Clio", "sedan", 1991, 2012],
    ["Laguna", "sedan", 1994, 2007],
    // Los "R9/R11/R19" se nombran por número: "Renault 9", "Renault 11", "Renault 19".
    ["9", "sedan", 1982, 1996],
    ["11", "sedan", 1983, 1996],
    ["19", "sedan", 1988, 1996],
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
    ["Samurai", "suv", 1985, 1998],
    ["AX100", "moto", 1990, 2010],
    ["GN125", "moto", 1995, null],
    ["EN125", "moto", 2005, null],
    ["Gixxer 150", "moto", 2015, null],
    ["DR 150", "moto", 2008, null],
    ["DR 200", "moto", 2009, null],
  ]},

  // --- Mazda: sus carros se nombran por número ("Mazda 3", "Mazda 6") y las camionetas llevan CX.
  { id: "mazda", name: "Mazda", models: [
    ["2", "sedan", 2003, null],
    ["3", "sedan", 2003, null],
    ["6", "sedan", 2002, null],
    ["323", "sedan", 1980, 2003],
    ["626", "sedan", 1980, 2002],
    ["Protegé", "sedan", 1990, 2003],
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
    ["Escarabajo", "sedan", 1980, 2003],
    ["Pointer", "sedan", 2003, 2010],
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
    ["CJ", "suv", 1980, 1986],
    ["Wagoneer", "suv", 1980, null],
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
    ["Brava", "sedan", 1996, 2002],
    ["Marea", "sedan", 1997, 2002],
    ["Tempra", "sedan", 1990, 1996],
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

  // --- Marcas europeas y coreanas que entraron sobre todo por importación (80/90/2000): hoy se ven
  // menos, pero siguen cotizándose. Van agrupadas al final de los autos para no romper el orden de
  // prevalencia del resto.
  { id: "peugeot", name: "Peugeot", models: [
    ["205", "sedan", 1983, 1998],
    ["206", "sedan", 1998, 2012],
    ["207", "sedan", 2006, 2014],
    ["306", "sedan", 1993, 2002],
    ["307", "sedan", 2001, 2008],
    ["405", "sedan", 1987, 1998],
  ]},
  { id: "daewoo", name: "Daewoo", models: [
    ["Lanos", "sedan", 1997, 2002],
    ["Racer", "sedan", 1986, 1994],
    ["Espero", "sedan", 1994, 1999],
    ["Nubira", "sedan", 1997, 2003],
    ["Leganza", "sedan", 1997, 2002],
    ["Matiz", "sedan", 1998, 2010],
  ]},
  { id: "dodge", name: "Dodge", models: [
    ["Neon", "sedan", 1994, 2005],
    ["Spirit", "sedan", 1989, 1995],
    ["Shadow", "sedan", 1987, 1994],
  ]},

  // --- Motos: el parque más grande del país, entre marcas locales (Bera, Empire) y asiáticas. Es la
  // lista más corta del catálogo: ver el TODO de la cabecera (faltan Vento, Ryan, Motomel...).
  { id: "yamaha", name: "Yamaha", models: [
    ["Crypton", "moto", 1996, null],
    ["FZ", "moto", 2008, null],
    ["XTZ 125", "moto", 2005, null],
    ["Fazer 250", "moto", 2010, null],
    ["YBR 125", "moto", 2005, null],
    ["RX100", "moto", 1985, 2000],
    ["Libero", "moto", 2000, 2010],
  ]},
  { id: "bera", name: "Bera", models: [
    ["BR 150", "moto", 2012, null],
    ["BR 200", "moto", 2014, null],
    ["BR 250", "moto", 2016, null],
  ]},
  { id: "empire", name: "Empire", models: [
    ["Owyn 150", "moto", 2013, null],
    ["Arsen", "moto", 2015, null],
    ["Krypton", "moto", 2016, null],
    ["Titan", "moto", 2017, null],
    ["Horse", "moto", 2016, null],
  ]},
  { id: "bajaj", name: "Bajaj", models: [
    ["Pulsar 180", "moto", 2005, null],
    ["Boxer CT 100", "moto", 2008, null],
    ["Discover 125", "moto", 2010, null],
    ["Pulsar 200", "moto", 2012, null],
  ]},
  // Haojue es la marca matriz, pero en Venezuela este modelo se conoce y se pide como "MD": el
  // nombre de marca que ve el usuario manda (los ids estables son `md-150`, etc.).
  { id: "md", name: "MD", models: [
    ["110", "moto", 2010, null],
    ["150", "moto", 2008, null],
    ["200", "moto", 2016, null],
    ["250", "moto", 2018, null],
  ]},
  { id: "um", name: "UM", models: [
    ["150", "moto", 2014, null],
    ["Xtreet 200", "moto", 2015, null],
  ]},

  // --- Marcas de moto que pidió la Fase 6.1a (Keeway, Skygo y AKT se venden aquí sobre todo en
  // motos de trabajo y de reparto).
  { id: "keeway", name: "Keeway", models: [
    ["RKS 150", "moto", 2015, null],
    ["K-Light", "moto", 2016, null],
    ["Superlight", "moto", 2017, null],
    ["Krypton", "moto", 2016, null],
  ]},
  { id: "skygo", name: "Skygo", models: [
    ["SG 150", "moto", 2014, null],
    ["SG 200", "moto", 2016, null],
  ]},
  { id: "akt", name: "AKT", models: [
    ["AK 125", "moto", 2013, null],
    ["NKD 125", "moto", 2015, null],
    ["Dynamic", "moto", 2012, null],
    ["CR4", "moto", 2016, null],
  ]},

  // --- Marcas de moto conocidas del parque pero SIN modelos cargados (Fase 6.1a no traía lista):
  // se declaran para que aparezcan en el filtro de motos y el modelo se escribe a mano al elegir
  // "Otro" en el selector. TODO: cargar sus modelos (Voge 300R/500DS…, Vento Rocket/Screamer…) con
  // datos verificados; hasta entonces, dejar la lista vacía es más honesto que inventarla.
  { id: "voge", name: "Voge", vehicleTypes: ["moto"], models: [] },
  { id: "vento", name: "Vento", vehicleTypes: ["moto"], models: [] },

  // --- Comodín: va SIEMPRE al final de la tabla (es la última opción de la lista y significa "mi
  // marca no está"). No tiene modelos y declara sus tipos a mano: aplica a los cuatro.
  { id: "otro", name: OTHER_OPTION, vehicleTypes: ["sedan", "suv", "van", "moto"], models: [] },
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
  // Tipos a los que aplica la marca: los declarados (comodín) + los deducidos de sus modelos. El
  // `Set` los deja sin repetir y en orden de aparición.
  vehicleTypes: [...new Set([...(seed.vehicleTypes ?? []), ...seed.models.map(([, type]) => type)])],
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
 * Nombres de las marcas que ofrecen modelos del tipo pedido (Fase 6.1a: filtro del selector).
 *
 * El comodín "Otro" sale en TODAS las listas porque declara los cuatro tipos, y va al final de la
 * tabla, así que también va al final de cada lista: es la última opción, no la primera.
 */
export function getBrandsByVehicleType(vehicleType: VehicleType): string[] {
  return VEHICLE_BRANDS.filter((brand) => brand.vehicleTypes.includes(vehicleType)).map(
    (brand) => brand.name
  );
}

/**
 * ¿La marca sigue sirviendo para este tipo de vehículo? Es lo que decide si el borrador del
 * selector se descarta al cambiar de tipo (Fase 6.1a: "de sedan a moto se resetean marca y modelo").
 */
export function isBrandAvailableForType(brandName: string, vehicleType: VehicleType): boolean {
  const brand = BRAND_BY_NAME.get(normalizeForSearch(brandName));
  return brand !== undefined && brand.vehicleTypes.includes(vehicleType);
}

/**
 * Modelos de una marca, en el orden de la tabla, o [] si la marca no existe.
 * Compara sin acentos ni mayúsculas: getModelsByBrand("toyota") == getModelsByBrand("Toyota").
 */
export function getModelsByBrand(brandName: string): string[] {
  const brand = BRAND_BY_NAME.get(normalizeForSearch(brandName));
  return brand === undefined ? [] : brand.models.map((model) => model.name);
}

/**
 * ¿Existe esta marca en el catálogo? "Otro" cuenta como conocida (está en la tabla): lo que no
 * tiene es modelos, así que `isKnownModel("Otro", ...)` siempre es `false`.
 */
export function isKnownBrand(brandName: string): boolean {
  return BRAND_BY_NAME.has(normalizeForSearch(brandName));
}

/** ¿La marca existe y el modelo está entre los suyos? Sin acentos ni mayúsculas. */
export function isKnownModel(brandName: string, modelName: string): boolean {
  const brand = BRAND_BY_NAME.get(normalizeForSearch(brandName));
  if (brand === undefined) return false;

  const needle = normalizeForSearch(modelName);
  return brand.models.some(
    (model) => normalizeForSearch(model.name) === needle || model.aliases.includes(needle)
  );
}

/**
 * TODO (Fase 6.2 / 7): considerar un factor de precio por antigüedad del vehículo o por gama del
 * modelo (económico / estándar / premium), con datos reales.
 *
 * Hoy el catálogo no marca gamas: habría que añadirlas a la semilla (`ModelSeed`) y llevarlas al
 * motor (`lib/pricing.ts`), que ya tiene su propio TODO para el factor por antigüedad. Se decide con
 * viajes reales de Supabase, no a ojo.
 */

/**
 * Año del sistema (Fase 6.1a: hasta dónde llega el selector de año).
 *
 * ⚠️ Se evalúa al importar el módulo. La página `/` se prerenderiza estáticamente, así que el HTML
 * del servidor congela la lista de años en la fecha del build: un cliente que cargue en otro año
 * calcularía otra lista y React avisaría de un desajuste de hidratación. Solo puede pasar en el
 * salto de año; si aparece, la corrección es una constante escrita a mano, como `MAX_VEHICLE_YEAR`.
 */
export const CURRENT_YEAR = new Date().getFullYear();

/** Primer año que ofrece el selector de año: los 80 también circulan (y se cotizan) en el país. */
const FIRST_YEAR = 1980;

/**
 * Años ofrecibles en el selector de año, del más nuevo al más viejo: de `CURRENT_YEAR + 1` (los
 * modelos del año que entra ya se venden) hasta 1980: en el parque venezolano todavía se cotizan
 * carros de esa época. Devuelve 48 años hoy: 2027..1980.
 */
export function getYears(): number[] {
  const years: number[] = [];
  for (let year = CURRENT_YEAR + 1; year >= FIRST_YEAR; year -= 1) {
    years.push(year);
  }
  return years;
}

/**
 * Índice por NOMBRE normalizado: el selector trabaja con los nombres que ve el usuario ("Toyota"),
 * no con los ids estables de los modelos ("toyota-corolla"), que son para la Fase 7.
 */
const BRAND_BY_NAME: ReadonlyMap<string, VehicleBrand> = new Map(
  VEHICLE_BRANDS.map((brand) => [normalizeForSearch(brand.name), brand] as const)
);