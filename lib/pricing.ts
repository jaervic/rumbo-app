/**
 * Motor de precios (Fase 5): convierte la ruta de OSRM en un precio estimado.
 *
 * ¿Por qué un módulo aparte de lib/routing.ts? La ruta (minutos y metros por calle) y el precio
 * (tarifas que fija el negocio) cambian por motivos distintos y con frecuencia distinta. Aquí
 * vive SOLO lo tarifario:
 *
 *   bruto  = bandera + (km × tarifaKm) + (minAjustados × tarifaMin) + recargoPasajeros
 *   bruto *= recargoNocturno × factorClima
 *   medio  = max(bruto, viajeMínimo)
 *   rango  = medio × (1 ± 12 %)   ← el mínimo nunca queda por debajo del viaje mínimo
 *
 * ¿Por qué un rango y no un precio único? Un número exacto se lee como contrato y cualquier
 * diferencia en la calle se convierte en discusión; un rango (±12 %) deja margen al conductor
 * para negociar según la demanda real y sigue siendo orientativo.
 *
 * Moneda: USD ("divisa"). Es la unidad en la que hoy cotizan los conductores independientes en
 * Venezuela y no se devalúa entre que se cotiza y se cobra.
 * TODO (Fase 7+): convertir a bolívares con la tasa BCV del día desde UNA sola fuente de verdad y
 * mostrar ambas cifras (el formateo `es-VE` debe hacerse a mano, como `formatDistance` en
 * components/PriceCard.tsx, para no romper la hidratación).
 *
 * ⚠️ ESTO ES UNA ESTIMACIÓN, NO UN CONTRATO. Los valores de VEHICLE_TARIFFS son referencias de
 * mercado iniciales, elegidas para que un viaje urbano corto caiga en el rango que hoy se cobra
 * en Venezuela y que un viaje intermunicipal no quede absurdo por ninguno de los dos lados.
 * TODO (Fase 7+): calibrar la tabla con los viajes reales de Supabase (precio finalmente acordado
 * por corredor) en lugar de mantener números escritos a mano.
 *
 * Factores aplicados (cada uno documentado junto a su constante):
 * 1. Duración: OSRM devuelve la duración IDEAL (sin tráfico, por diseño; ver lib/routing.ts); el
 *    motor la ajusta con `getTrafficFactor` antes de tarificar el tiempo.
 * 2. Tráfico: franja horaria de Venezuela (pico AM/PM, mediodía, madrugada). Heurística estática:
 *    no hay API de tráfico en esta fase.
 * 3. Clima: `WEATHER_FACTOR` = 1 (no hay API de clima en esta fase; el gancho ya estaba previsto
 *    en lib/routing.ts).
 * 4. Nocturno: recargo sobre el subtotal cuando el viaje arranca de noche (22:00–06:00).
 *
 * Todo el cálculo tarifario de `estimatePrice` es puro y sin red (se puede probar y reutilizar
 * desde un Server Component); `calculatePrice` es la versión orquestada que resuelve la ruta.
 *
 * Quién usa qué (Fase 6, precio en vivo):
 * - La UI (app/page.tsx) llama a `estimatePrice` con la ruta que ya tiene de `useRoute`, dentro de
 *   un `useMemo`: cambiar de vehículo o de pasajeros recalcula el precio al instante y sin red.
 * - `calculatePrice` queda para cuando NO hay ruta previa (p. ej. desde un Route Handler en la
 *   Fase 7, o desde una cotización guardada). No se usa en la UI para no pedir dos veces la ruta.
 *
 * Fase 6.2 (IMPLEMENTADO): las tarifas propias del conductor (Nivel 1: bandera, km, minuto y mínimo)
 * entran por `PricingInput.tariffOverride` (lib/driverProfile.ts) y pisan esos cuatro valores de la
 * tabla del vehículo. Lo demás (pasajeros, capacidad, tráfico, nocturno, clima y el rango ±12 %) no
 * cambia: la tarifa propia ajusta CUÁNTO se cobra por concepto, no cómo se modela el viaje.
 *
 * TODO (Fase 6.2): factor por ANTIGÜEDAD del vehículo. `QuoteRequest.vehicle` (marca, modelo y año;
 * catálogo en lib/vehicleCatalog.ts) ya llega hasta aquí, y el catálogo expone `getVehicleModelYears`
 * y `describeVehicle`, así que el factor se puede añadir sin tocar el formulario ni el flujo de
 * datos: `PricingInput` recibiría la selección, el factor se aplicaría al subtotal y PriceCard
 * añadiría su fila al desglose. NO se implementa todavía porque ningún dato dice cuánto pesa la
 * antigüedad: sin eso sería un número inventado moviendo el precio (ver la nota de calibración).
 *
 * TODO (Fase 9): instalar Vitest y convertir en suite permanente las comprobaciones que se hicieron
 * a mano para validar este motor (duración ajustada, viaje mínimo, recargo nocturno, rango ±12 %,
 * desglose que suma exacto y los casos que deben devolver `null`). Hoy el proyecto no tiene runner.
 */

import { PASSENGER_CAPACITY } from "@/types";
import type { Coords, QuoteRequest, QuoteResult, VehicleType } from "@/types";
// Tipo solamente: el módulo del perfil toca localStorage y aquí NO se importa nada suyo en runtime
// (el motor tiene que seguir siendo usable desde el servidor).
import type { DriverTariffConfig } from "./driverProfile";
import { getRoute, type RouteResult } from "./routing";

/** Moneda de los precios calculados. Ver la nota de moneda en la cabecera del módulo. */
export type QuoteCurrency = "USD";

/**
 * Tarifas de un tipo de vehículo, en USD.
 *
 * Se declaran por vehículo (y no como un multiplicador sobre una tarifa base única) porque cada
 * tipo tiene su propia estructura de coste: una moto no gasta lo mismo por km que una van, y una
 * van necesita un viaje mínimo bastante mayor que una moto para que el viaje salga a cuenta. La
 * tabla es equivalente a un multiplicador, pero cada número se puede ajustar sin tocar la fórmula.
 */
export interface VehicleTariff {
  /** Bandera de bajada: se cobra en todo viaje, aunque sea de 300 metros. */
  baseFare: number;
  /** Tarifa por kilómetro recorrido (distancia por carretera de OSRM). */
  perKm: number;
  /** Tarifa por minuto, aplicada sobre la duración AJUSTADA por tráfico. */
  perMin: number;
  /** Recargo por cada pasajero adicional (el primero no paga recargo). */
  perExtraPassenger: number;
  /** Piso del viaje: si el cálculo da menos, se cobra este mínimo. */
  minimumFare: number;
  /**
   * Pasajeros que caben (sin contar al conductor): cotizar más es una combinación imposible.
   * Se lee de `PASSENGER_CAPACITY` (types/index.ts) para que el límite que permite el formulario y
   * el que valida el motor sean el MISMO número.
   */
  maxPassengers: number;
}

/**
 * Tarifas por tipo de vehículo (ver la nota de calibración en la cabecera del módulo).
 *
 * Órdenes de magnitud que producen estas tarifas (verificados con la ejecución del motor, hora
 * valle, viaje de 5 km con 25 min ideales → 26 min ajustados):
 * moto 1 pax ≈ 4,05 USD · sedán 1 pax ≈ 6,33 USD · SUV 1 pax ≈ 8,61 USD · van 1 pax ≈ 10,89 USD
 * (van con 6 pax ≈ 13,89 USD).
 */
export const VEHICLE_TARIFFS: Record<VehicleType, VehicleTariff> = {
  // Moto: lo más barato de operar y de mantener, y con UNA sola plaza de pasajero (Fase 5.3: moto
  // = 1). El recargo por pasajero adicional queda inerte (nunca hay un segundo pasajero) y se deja
  // en 0 a propósito: es un número que hoy no se podría cobrar. Si la moto admitiera acompañante,
  // el cambio serían dos líneas: `PASSENGER_CAPACITY.moto` y este `perExtraPassenger`.
  moto: {
    baseFare: 1,
    perKm: 0.35,
    perMin: 0.05,
    perExtraPassenger: 0,
    minimumFare: 1.5,
    maxPassengers: PASSENGER_CAPACITY.moto,
  },
  // Sedán: la referencia del mercado (4 puertas, hasta 5 pasajeros).
  sedan: {
    baseFare: 1.5,
    perKm: 0.55,
    perMin: 0.08,
    perExtraPassenger: 0.35,
    minimumFare: 2.5,
    maxPassengers: PASSENGER_CAPACITY.sedan,
  },
  // SUV: más confort y maletero, consumo mayor.
  suv: {
    baseFare: 2,
    perKm: 0.75,
    perMin: 0.11,
    perExtraPassenger: 0.45,
    minimumFare: 3.5,
    maxPassengers: PASSENGER_CAPACITY.suv,
  },
  // Van: hasta 6 pasajeros o equipaje voluminoso (aeropuerto, grupos, encomiendas).
  van: {
    baseFare: 2.5,
    perKm: 0.95,
    perMin: 0.14,
    perExtraPassenger: 0.6,
    minimumFare: 4.5,
    maxPassengers: PASSENGER_CAPACITY.van,
  },
};

/** Orden canónico de los tipos de vehículo (el del formulario y el de la tabla de tarifas). */
export const VEHICLE_TYPES: readonly VehicleType[] = ["moto", "sedan", "suv", "van"];

/**
 * Nombre visible de cada vehículo. Vive aquí, junto a su tarifa y su capacidad, para que la
 * etiqueta del formulario, la del desglose del precio y la capacidad no puedan desincronizarse
 * (si mañana `suv` pasa a llamarse "Camioneta", se cambia en un solo sitio).
 */
export const VEHICLE_LABELS: Record<VehicleType, string> = {
  moto: "Moto",
  sedan: "Sedán",
  suv: "SUV",
  van: "Van",
};

/**
 * Etiqueta de un tipo de vehículo para MOSTRAR: `"sedan"` → `"Sedán"` (Fase 8.1).
 *
 * El valor interno NO se toca nunca: `"sedan"` (minúsculas y sin tilde) sigue siendo la clave de
 * `VEHICLE_TARIFFS`, de `PASSENGER_CAPACITY` y del `<Select>`; formatear es SOLO presentación y por eso
 * vive en una función aparte en vez de cambiar la tabla. Delega en `VEHICLE_LABELS` para que exista una
 * única lista de nombres (si mañana `suv` pasa a llamarse "Camioneta", se cambia en un solo sitio).
 *
 * ⚠️ Es la etiqueta SUELTA ("Sedán · 3 pasajeros"). Dentro de una frase van los nombres en minúscula
 * que necesita la concordancia del español ("Máximo 1 pasajero para moto"): eso es UI y vive en
 * `VEHICLE_SENTENCE_NAMES` (components/QuoteForm.tsx).
 */
export function formatVehicleType(vehicleType: VehicleType): string {
  return VEHICLE_LABELS[vehicleType];
}

/**
 * Capacidad de pasajeros de un vehículo (sin contar al conductor).
 *
 * Es la MISMA tabla que usa el campo "Pasajeros" del formulario (`PASSENGER_CAPACITY`), así que el
 * límite de la UI y el que acepta el motor no pueden divergir.
 */
export function getVehicleCapacity(vehicleType: VehicleType): number {
  return VEHICLE_TARIFFS[vehicleType].maxPassengers;
}

/**
 * ¿La combinación vehículo/pasajeros tiene sentido? El motor rechaza cotizarla si no
 * (p. ej. 2 pasajeros en una moto): es mejor no dar precio que dar uno imposible de cumplir.
 */
export function isVehicleSuitable(vehicleType: VehicleType, passengers: number): boolean {
  return Number.isInteger(passengers) && passengers >= 1 && passengers <= getVehicleCapacity(vehicleType);
}
/**
 * Franja horaria de tráfico en Venezuela → factor sobre la duración IDEAL de OSRM.
 *
 * Es una heurística estática (no hay API de tráfico en esta fase): el objetivo no es acertar al
 * minuto, sino que el precio del tiempo no trate igual un viaje a las 8:00 en la Francisco de
 * Miranda que el mismo viaje a las 4:00. Los valores están basados en el patrón de horas pico de
 * Caracas y Maracaibo; en ciudades medias el tráfico es bastante más suave y estos factores
 * pecan de prudentes.
 * TODO (Fase 7+): sustituir por tráfico real (TomTom/HERE/Google) o por un perfil histórico
 * construido con las duraciones observadas en Supabase, por corredor y hora.
 */
export interface TrafficBand {
  /** Hora de inicio (inclusive), en hora local de Venezuela. */
  fromHour: number;
  /** Hora de fin (exclusiva). */
  toHour: number;
  /** Multiplicador de la duración ideal. */
  factor: number;
}

const TRAFFIC_BANDS: TrafficBand[] = [
  { fromHour: 0, toHour: 5, factor: 0.85 }, // madrugada: vías casi vacías
  { fromHour: 5, toHour: 7, factor: 1.1 }, // arranque de la mañana
  { fromHour: 7, toHour: 10, factor: 1.35 }, // pico AM
  { fromHour: 10, toHour: 12, factor: 1.05 },
  { fromHour: 12, toHour: 14, factor: 1.2 }, // mediodía (almuerzo)
  { fromHour: 14, toHour: 16, factor: 1.05 },
  { fromHour: 16, toHour: 20, factor: 1.35 }, // pico PM
  { fromHour: 20, toHour: 22, factor: 1 },
  { fromHour: 22, toHour: 24, factor: 0.9 }, // noche: vuelve a fluir
];

/**
 * Respaldo si `getVenezuelaHour` no puede resolver la hora por franjas (no debería ocurrir:
 * TRAFFIC_BANDS cubre las 24 horas). Se elige >1 para no regalar tiempo de forma silenciosa.
 */
const DEFAULT_TRAFFIC_FACTOR = 1.1;

/**
 * Recargo nocturno sobre el subtotal. Es una práctica estándar entre conductores (menos oferta y
 * más riesgo), y por eso va aparte del factor de tráfico: el tráfico cambia MINUTOS y esto cambia
 * el PRECIO, que es lo que el usuario ve.
 */
export const NIGHT_SURCHARGE_FACTOR = 1.15;
/** La noche empieza a las 22:00 y termina a las 06:00 (hora de Venezuela). */
const NIGHT_START_HOUR = 22;
const NIGHT_END_HOUR = 6;

/**
 * Factor de clima. Por ahora neutro: no se consulta ninguna API de clima. La implementación
 * original de lib/routing.ts ya dejaba este factor previsto para la Fase 5, pero integrar un
 * proveedor de clima arrastra decisiones propias (¿lluvia en origen, en destino o en toda la ruta?).
 * TODO (Fase 7+): Open-Meteo (gratis, sin API key) sobre el punto de origen y una hora de salida;
 * lluvia → ~1,2.
 */
export const WEATHER_FACTOR = 1;

/**
 * Amplitud del rango de precio (±12 %).
 *
 * El rango es deliberadamente amplio: cubre lo que puede variar el viaje real (una vía cerrada,
 * una parada extra, esperar al pasajero) sin que el conductor tenga que renegociar el precio en
 * mitad del viaje.
 */
export const PRICE_SPREAD = 0.12;

/** Zona horaria de referencia para los factores por hora: Venezuela no cambia de hora. */
const VENEZUELA_TIME_ZONE = "America/Caracas";

/** Redondeo monetario a céntimos, evitando los residuos binarios del `toFixed`. */
function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Formateador de horas en zona horaria de Venezuela. Se crea una sola vez (construir un
 * Intl.DateTimeFormat es caro y esto se llama en cada cotización) y puede fallar en entornos sin
 * datos de zona horaria: por eso se guarda también el intento fallido y hay respaldo.
 */
let venezuelaHourFormatter: Intl.DateTimeFormat | null = null;

function getVenezuelaHourFormatter(): Intl.DateTimeFormat | null {
  if (venezuelaHourFormatter !== null) return venezuelaHourFormatter;

  try {
    venezuelaHourFormatter = new Intl.DateTimeFormat("en-US", {
      timeZone: VENEZUELA_TIME_ZONE,
      hour: "numeric",
      // hourCycle "h23" en vez de hour12:false: con hour12:false algunos ICU devuelven "24" a
      // medianoche, que no es una hora válida para TRAFFIC_BANDS.
      hourCycle: "h23",
    });
  } catch {
    // Navegador sin ICU completo o sin la zona horaria: se usará la hora del dispositivo.
    return null;
  }

  return venezuelaHourFormatter;
}

/**
 * Hora local de Venezuela (0–23) del momento dado.
 *
 * Se calcula con Intl y NO con `date.getHours()` porque un conductor que cotiza desde otro país
 * (o un dispositivo con la zona mal puesta) cotizaría con la franja horaria equivocada. Si Intl no
 * está disponible, se cae a la hora del dispositivo, que para un usuario en Venezuela es UTC−4.
 */
export function getVenezuelaHour(date: Date): number {
  const formatter = getVenezuelaHourFormatter();

  if (formatter !== null) {
    const hourPart = formatter.formatToParts(date).find((part) => part.type === "hour");
    const hour = hourPart === undefined ? Number.NaN : Number.parseInt(hourPart.value, 10);

    if (Number.isInteger(hour) && hour >= 0 && hour <= 23) return hour;
  }

  return date.getHours();
}

/** Factor de tráfico de una hora concreta (en hora local de Venezuela). */
export function getTrafficFactor(hour: number): number {
  return TRAFFIC_BANDS.find((band) => hour >= band.fromHour && hour < band.toHour)?.factor ?? DEFAULT_TRAFFIC_FACTOR;
}

/** ¿La hora pertenece a la ventana nocturna con recargo? [22:00, 06:00) */
function isNightHour(hour: number): boolean {
  return hour >= NIGHT_START_HOUR || hour < NIGHT_END_HOUR;
}

/** Datos que necesita el cálculo tarifario puro (todo viene de la ruta + el formulario). */
export interface PricingInput {
  /** Distancia por carretera en kilómetros (la de OSRM). */
  distanceKm: number;
  /** Duración IDEAL en minutos (la de OSRM, sin tráfico). Se ajusta dentro del motor. */
  durationIdealMin: number;
  vehicleType: VehicleType;
  /** Pasajeros del viaje, sin contar al conductor (1–capacidad del vehículo). */
  passengers: number;
  /**
   * Tarifas propias del conductor (Fase 6.2, Nivel 1) que SUSTITUYEN a las del vehículo en los cuatro
   * valores que él controla: bandera, costo por km, costo por minuto y tarifa mínima.
   *
   * Lo que NO cambia: el recargo por pasajero adicional y la capacidad (siguen saliendo del vehículo),
   * ni los factores de tráfico, nocturno, clima y el rango ±12 % (fijan el modelo del viaje, no el
   * precio por concepto).
   *
   * ⚠️ Rangos: el motor NO valida contra `TARIFF_FIELDS` (lib/driverProfile.ts) para no duplicar esa
   * tabla. Solo descarta lo que no puede producir un precio (no finito o <= 0) y cae a las tarifas del
   * vehículo; los rangos "de negocio" son cosa del editor, que no deja guardar fuera de ellos. Si otra
   * vía (Supabase, Fase 7) alimenta esto, debe validar ANTES de llamar.
   */
  tariffOverride?: DriverTariffConfig;
  /**
   * Momento de salida previsto. Por defecto, ahora: una cotización es para un viaje inmediato,
   * así que el factor de tráfico y el recargo nocturno deben usar la hora actual.
   */
  departureAt?: Date;
}

/**
 * Cotización completa: los cinco campos de `QuoteResult` más el desglose que explica de dónde
 * sale cada céntimo.
 *
 * Extiende `QuoteResult` a propósito: la UI (y cualquier consumidor futuro, p. ej. el guardado en
 * Supabase) puede usar la forma estable de `QuoteResult` sin renunciar al detalle para depurar o
 * para explicar "bandera + km + tiempo" cuando el usuario pregunte por qué le sale ese precio.
 *
 * Nota: `durationMin` (heredado) es la duración AJUSTADA, la que se usó para tarificar el tiempo.
 * La duración ideal sin ajustar sigue disponible en `durationIdealMin`, y la diferencia entre
 * ambas explica por qué a las 8:00 el mismo viaje cuesta más que a las 16:00.
 */
export interface PriceEstimate extends QuoteResult {
  /** Moneda de los importes (ver la nota de moneda en la cabecera del módulo). */
  currency: QuoteCurrency;
  /** Duración ideal de OSRM, antes de tráfico (minutos). */
  durationIdealMin: number;
  /** Duración usada para tarificar (minutos, entero ≥ 1). */
  durationAdjustedMin: number;
  /** Factor de tráfico aplicado a la duración (ver TRAFFIC_BANDS). */
  trafficFactor: number;
  /** Factor de clima aplicado (hoy siempre WEATHER_FACTOR = 1). */
  weatherFactor: number;
  /** Recargo nocturno aplicado al subtotal (1 = sin recargo). */
  nightSurchargeFactor: number;
  /** Bandera de bajada del vehículo. */
  baseFare: number;
  /** Importe por distancia (km × tarifa del vehículo). */
  distanceFare: number;
  /** Importe por tiempo (minutos ajustados × tarifa del vehículo). */
  timeFare: number;
  /** Recargo por pasajeros adicionales al primero. */
  passengerSurcharge: number;
  /** Importe del recargo nocturno (0 cuando el viaje no arranca de noche). */
  nightSurcharge: number;
  /**
   * Suma de los cuatro conceptos MÁS el recargo nocturno (y el clima, hoy 1), todavía SIN aplicar el
   * viaje mínimo. Es el importe que debe dar la suma de las filas del desglose de PriceCard.
   */
  subtotal: number;
  /** Amplitud del rango aplicado (±12 %, ver PRICE_SPREAD). */
  priceSpread: number;
  /** Viaje mínimo del vehículo con el que se comparó el cálculo. */
  minimumFare: number;
  /** `true` cuando el cálculo dio menos que el viaje mínimo del vehículo. */
  minimumFareApplied: boolean;
}
/**
 * Calcula el precio estimado con datos ya resueltos: sin red y determinista salvo por el reloj.
 *
 * Composición (cabecera del módulo para la fórmula completa):
 * 1. Duración ajustada = ideal × factor de tráfico, mínimo 1 minuto (OSRM puede devolver 0 minutos
 *    en un tramo de 200 m, y un viaje de 0 minutos no es un viaje).
 * 2. Conceptos: bandera + km + minutos + pasajeros adicionales.
 * 3. Factores sobre el subtotal: recargo nocturno × clima.
 * 4. Viaje mínimo del vehículo: si el subtotal no llega, se cobra el mínimo.
 * 5. Rango: medio ± 12 %, con el mínimo nunca por debajo del viaje mínimo.
 *
 * Cada concepto se redondea a céntimos ANTES de sumar, para que el desglose que se le muestre al
 * conductor sume exactamente el subtotal (una suma que no cuadra por un céntimo destruye la
 * confianza en el número).
 *
 * @param input Distancia, duración ideal, vehículo, pasajeros y hora de salida.
 * @returns Cotización con desglose, o `null` si la entrada no permite un precio honesto (valores no
 *   finitos o negativos, pasajeros inválidos o más pasajeros que la capacidad del vehículo). Nunca
 *   lanza: el llamador decide qué mostrar cuando no hay precio.
 */
/**
 * ¿La tarifa propia trae los cuatro valores usables (finitos y mayores que 0)?
 *
 * Es un guardián de seguridad, no una validación de negocio: con un 0 la bandera desaparecería del
 * precio sin que nadie se diera cuenta, y con `NaN` el importe entero se volvería `NaN`. Cualquier
 * valor fuera de rango se rechaza aquí y se cotiza con las tarifas del vehículo.
 */
function hasUsableTariff(override: DriverTariffConfig | undefined): override is DriverTariffConfig {
  if (override === undefined) return false;

  return (
    Number.isFinite(override.baseFare) &&
    override.baseFare > 0 &&
    Number.isFinite(override.costPerKm) &&
    override.costPerKm > 0 &&
    Number.isFinite(override.costPerMin) &&
    override.costPerMin > 0 &&
    Number.isFinite(override.minFare) &&
    override.minFare > 0
  );
}

export function estimatePrice(input: PricingInput): PriceEstimate | null {
  const { distanceKm, durationIdealMin, vehicleType, passengers, departureAt, tariffOverride } = input;
  const vehicleTariff = VEHICLE_TARIFFS[vehicleType];
  // Fase 6.2: la tarifa del conductor pisa los cuatro valores de Nivel 1 y deja intacto lo demás
  // (`perExtraPassenger` y `maxPassengers` siguen viniendo del vehículo). Mantener el nombre `tariff`
  // deja el resto del cálculo igual que antes de esta fase.
  const tariff: VehicleTariff = hasUsableTariff(tariffOverride)
    ? {
        ...vehicleTariff,
        baseFare: tariffOverride.baseFare,
        perKm: tariffOverride.costPerKm,
        perMin: tariffOverride.costPerMin,
        minimumFare: tariffOverride.minFare,
      }
    : vehicleTariff;

  // Entradas imposibles: mejor no dar precio que dar uno inventado.
  if (!Number.isFinite(distanceKm) || distanceKm < 0) return null;
  if (!Number.isFinite(durationIdealMin) || durationIdealMin < 0) return null;
  if (!isVehicleSuitable(vehicleType, passengers)) return null;

  const hour = getVenezuelaHour(departureAt ?? new Date());
  const trafficFactor = getTrafficFactor(hour);
  const durationAdjustedMin = Math.max(1, Math.round(durationIdealMin * trafficFactor));
  const nightSurchargeFactor = isNightHour(hour) ? NIGHT_SURCHARGE_FACTOR : 1;

  const baseFare = roundMoney(tariff.baseFare);
  const distanceFare = roundMoney(tariff.perKm * distanceKm);
  const timeFare = roundMoney(tariff.perMin * durationAdjustedMin);
  const passengerSurcharge = roundMoney(tariff.perExtraPassenger * Math.max(0, passengers - 1));

  // Suma de conceptos ANTES de factores y viaje mínimo: es la base del cálculo y la que debe
  // poder reconstruir la UI sumando las filas del desglose (conceptos + recargo nocturno).
  const concepts = roundMoney(baseFare + distanceFare + timeFare + passengerSurcharge);
  const subtotal = roundMoney(concepts * nightSurchargeFactor * WEATHER_FACTOR);
  const nightSurcharge = roundMoney(subtotal - concepts);
  const minimumFare = roundMoney(tariff.minimumFare);

  const minimumFareApplied = subtotal < minimumFare;
  const priceAvg = roundMoney(Math.max(subtotal, minimumFare));
  // El mínimo del rango nunca queda por debajo del viaje mínimo: si el cálculo ya está en el piso,
  // el rango se comprime hacia arriba en vez de ofrecer un precio que no se puede cobrar.
  const priceMin = roundMoney(Math.max(priceAvg * (1 - PRICE_SPREAD), minimumFare));
  const priceMax = roundMoney(priceAvg * (1 + PRICE_SPREAD));

  return {
    currency: "USD",
    distanceKm,
    // Heredado de QuoteResult: la duración AJUSTADA, que es con la que se tarificó el tiempo.
    durationMin: durationAdjustedMin,
    priceMin,
    priceAvg,
    priceMax,
    durationIdealMin,
    durationAdjustedMin,
    trafficFactor,
    weatherFactor: WEATHER_FACTOR,
    nightSurchargeFactor,
    baseFare,
    distanceFare,
    timeFare,
    passengerSurcharge,
    nightSurcharge,
    subtotal,
    priceSpread: PRICE_SPREAD,
    minimumFare,
    minimumFareApplied,
  };
}

/** Cómo resolver la ruta que alimenta el precio (ver `calculatePrice`). */
export interface CalculatePriceOptions {
  /** Coordenadas de origen ([lat, lng]). Obligatorias si no se pasa `route`. */
  origin?: Coords | null;
  /** Coordenadas de destino ([lat, lng]). Obligatorias si no se pasa `route`. */
  destination?: Coords | null;
  /**
   * Ruta YA calculada (la que devuelve `useRoute` en app/page.tsx). Es la vía preferida: evita
   * volver a llamar a OSRM cuando la ruta ya está en pantalla. Si falta, se pide con `getRoute`.
   */
  route?: RouteResult | null;
  /** Momento de salida previsto (por defecto, ahora). Ver `PricingInput.departureAt`. */
  departureAt?: Date;
  /**
   * Tarifas propias del conductor (Fase 6.2). Se reenvían tal cual a `estimatePrice`: sirve para
   * cotizar desde fuera de la UI (Route Handler de la Fase 7) con la tarifa guardada del conductor.
   */
  tariffOverride?: DriverTariffConfig;
  /** Cancelación de la petición de ruta (la usa el llamador cuando el usuario cambia de dirección). */
  signal?: AbortSignal;
}

/**
 * Cotiza un viaje: resuelve la ruta (la recibida o una nueva de OSRM) y aplica el motor tarifario.
 *
 * Es la versión orquestada de `estimatePrice`. Se mantiene `async` porque la distancia por calle
 * NUNCA se puede estimar a partir de direcciones de texto: hace falta la ruta de OSRM. Sin
 * coordenadas ni ruta previa no hay precio, y devolver `null` es más honesto que inventar una
 * distancia en línea recta (un valor en línea recta se queda corto entre 20 % y 40 % en ciudad,
 * justo en el sentido que perjudica al conductor).
 *
 * `request.origin`/`request.destination` (el TEXTO que escribió el usuario) NO se usan a propósito:
 * las coordenadas ya se resolvieron en el autocompletado o tocando el mapa. Volver a geocodificar
 * aquí abriría la puerta a cotizar un punto distinto del que el usuario ve en el mapa.
 * TODO (Fase 7+): en el servidor, aceptar las direcciones como respaldo cuando el cliente no
 * consiga coordenadas (geocodificación con Photon en el Route Handler).
 *
 * @param request Cotización del formulario (vehículo y pasajeros son los datos que se tarifan).
 * @param options Ruta ya calculada o coordenadas para pedirla.
 * @returns Cotización con desglose, o `null` si no se pudo obtener la ruta o la combinación
 *   vehículo/pasajeros es imposible. Nunca lanza (ni `getRoute` ni `estimatePrice` lanzan).
 */
export async function calculatePrice(
  request: QuoteRequest,
  options: CalculatePriceOptions = {}
): Promise<PriceEstimate | null> {
  const { route = null, origin = null, destination = null, departureAt, tariffOverride, signal } = options;

  const resolvedRoute =
    route ?? (origin !== null && destination !== null ? await getRoute(origin, destination, signal) : null);

  if (resolvedRoute === null) return null;

  return estimatePrice({
    distanceKm: resolvedRoute.distanceKm,
    durationIdealMin: resolvedRoute.durationMin,
    vehicleType: request.vehicleType,
    passengers: request.passengers,
    departureAt,
    tariffOverride,
  });
}





