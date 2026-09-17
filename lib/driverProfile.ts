/**
 * Perfil del conductor (Fase 6.2): nombre, vehículo y TARIFAS PROPIAS (Nivel 1), guardados en el
 * navegador del conductor.
 *
 * ¿Por qué localStorage? Porque hoy no hay login: el conductor debe poder configurar sus tarifas sin
 * cuenta, y localStorage sobrevive a recargas y a cerrar el navegador sin exigir backend. Cuando haya
 * Supabase con autenticación, este módulo pasa a ser la caché local de lo que haya en la nube.
 * TODO (Fase 7): sincronizar DriverProfile con Supabase cuando haya login.
 * TODO (Fase 7): permitir múltiples vehículos por conductor (hoy el perfil guarda UNO, el que se usa
 * por defecto al cotizar).
 * TODO (Fase 8): comparar tarifa del conductor con el promedio de la app, para avisar cuando está
 * muy por debajo o muy por encima del mercado.
 *
 * Alcance del Nivel 1: los CUATRO valores que el conductor controla son bandera, costo por km, costo
 * por minuto y tarifa mínima. El resto del modelo (recargo por pasajero, tráfico, nocturno, clima y
 * el rango ±12 %) sigue siendo del motor: ver `PricingInput.tariffOverride` en lib/pricing.ts.
 * TODO (Nivel 2): exponer factores avanzados (pasajeros, nocturno, rango).
 *
 * ⚠️ MÓDULO DE CLIENTE: toca `window.localStorage`. Todo acceso está guardado con
 * `typeof window === "undefined"`, y el hook que lo consume (hooks/useDriverProfile.ts) está hecho
 * para hidratar sin desajustes.
 */

import type { Vehicle } from "@/types/vehicle";

/** Tarifas propias del conductor, en USD (Nivel 1). */
export interface DriverTariffConfig {
  /** Bandera de bajada: se cobra en todo viaje, aunque sea de 300 metros. */
  baseFare: number;
  /** Costo por kilómetro recorrido. */
  costPerKm: number;
  /** Costo por minuto (se aplica sobre la duración ajustada por tráfico). */
  costPerMin: number;
  /** Piso del viaje: si el cálculo da menos, se cobra este mínimo. */
  minFare: number;
}

/** Perfil completo del conductor, tal y como se guarda en localStorage. */
export interface DriverProfile {
  /** Nombre del conductor (mínimo 2 caracteres, ver `isValidName`). */
  name: string;
  /** Vehículo con el que cotiza por defecto (Fase 6.1: marca, modelo, año y tipo). */
  vehicle: Vehicle;
  /** Tarifas propias (Nivel 1). */
  tariff: DriverTariffConfig;
  /** Fecha ISO del último guardado: sirve para ordenar caché y futuras sincronizaciones. */
  updatedAt: string;
}

/**
 * Clave de localStorage. Lleva versión (`v1`) a propósito: si cambia la forma del perfil se sube a
 * `v2` y el `v1` se ignora, en lugar de intentar migrarlo a ciegas.
 */
export const STORAGE_KEY = "cotizador.driverProfile.v1";

/**
 * Tarifas por defecto del editor, en USD.
 *
 * Parten de las del sedán (`VEHICLE_TARIFFS.sedan` en lib/pricing.ts) para que quien no toque nada
 * cotice como hasta ahora; el único cambio es el viaje mínimo, que baja de 2,50 a 2,00 (el mínimo que
 * acepta el editor y un número que el conductor de ciudad reconoce).
 */
export const DEFAULT_TARIFF: DriverTariffConfig = {
  baseFare: 1.5,
  costPerKm: 0.55,
  costPerMin: 0.08,
  minFare: 2,
};

/**
 * Un campo de la tarifa: cómo se llama, qué rango acepta y de cuánto en cuánto sube el input.
 *
 * Es la ÚNICA tabla con los rangos: `validateTariff` los aplica y `TariffEditor` los usa para el
 * texto de ayuda ("$0,50 – $10,00") y el `step`. El motor de precios NO la lee (ver la nota de
 * `PricingInput.tariffOverride`): así los rangos se ajustan en un solo sitio.
 */
export const TARIFF_FIELDS: Record<
  keyof DriverTariffConfig,
  { label: string; min: number; max: number; step: number }
> = {
  baseFare: { label: "Bandera de bajada", min: 0.5, max: 10, step: 0.05 },
  costPerKm: { label: "Costo por km", min: 0.1, max: 3, step: 0.05 },
  costPerMin: { label: "Costo por minuto", min: 0.02, max: 0.5, step: 0.01 },
  minFare: { label: "Tarifa mínima", min: 1, max: 20, step: 0.5 },
};

/**
 * Claves de la tarifa, en el orden en el que se muestran.
 *
 * El cast es seguro: `TARIFF_FIELDS` es un `Record` con exactamente esas claves, así que `Object.keys`
 * solo pierde el tipo. No se toca ningún valor sin comprobarlo antes.
 */
export const TARIFF_KEYS = Object.keys(TARIFF_FIELDS) as (keyof DriverTariffConfig)[];

/** Resultado de `validateTariff`: `valid` para el botón de guardar y un mensaje por campo. */
export interface TariffValidation {
  valid: boolean;
  errors: Partial<Record<keyof DriverTariffConfig, string>>;
}

/**
 * Dólares con 2 decimales y coma decimal (es-VE): "$0,50".
 *
 * A mano (igual que en PriceCard) y NO con `Intl`/`toLocaleString`: el mismo texto se pinta en el
 * servidor y en el cliente, y un formato que dependa del equipo rompería la hidratación.
 */
function formatUsd(value: number): string {
  return `$${value.toFixed(2).replace(".", ",")}`;
}

/**
 * Valida la tarifa completa contra `TARIFF_FIELDS`.
 *
 * Devuelve TODOS los errores (no solo el primero) porque el editor los muestra campo a campo mientras
 * el conductor escribe. Un valor no finito (campo vacío, texto pegado, `NaN`) es error: sin número no
 * hay precio, y guardarlo dejaría al motor cayendo siempre a las tarifas sugeridas sin que el
 * conductor entienda por qué su tarifa no hace nada.
 */
export function validateTariff(tariff: DriverTariffConfig): TariffValidation {
  const errors: Partial<Record<keyof DriverTariffConfig, string>> = {};

  for (const key of TARIFF_KEYS) {
    const field = TARIFF_FIELDS[key];
    const value = tariff[key];

    if (!Number.isFinite(value)) {
      errors[key] = "Escribe un número";
    } else if (value < field.min || value > field.max) {
      errors[key] = `Debe estar entre ${formatUsd(field.min)} y ${formatUsd(field.max)}`;
    }
  }

  return { valid: Object.keys(errors).length === 0, errors };
}

/**
 * ¿El nombre del conductor es usable? (el panel pide mínimo 2 caracteres).
 *
 * Vive aquí y no en el componente porque también lo necesita la validación del perfil guardado: un
 * perfil con el nombre en blanco no puede contar como "configurado".
 */
export function isValidName(name: string): boolean {
  return name.trim().length >= 2;
}

/** ¿Lo que había en localStorage tiene forma de perfil? (schema básico, sin `any`). */
function isDriverProfile(value: unknown): value is DriverProfile {
  if (typeof value !== "object" || value === null) return false;

  const candidate = value as Record<string, unknown>;
  const vehicle = candidate.vehicle as Record<string, unknown> | null;
  const tariff = candidate.tariff as Record<string, unknown> | null;
  const numericKeys = ["baseFare", "costPerKm", "costPerMin", "minFare"] as const;

  return (
    typeof candidate.name === "string" &&
    typeof candidate.updatedAt === "string" &&
    typeof vehicle === "object" &&
    vehicle !== null &&
    typeof vehicle.brand === "string" &&
    typeof vehicle.model === "string" &&
    typeof vehicle.year === "number" &&
    typeof vehicle.vehicleType === "string" &&
    typeof tariff === "object" &&
    tariff !== null &&
    numericKeys.every((key) => typeof tariff[key] === "number")
  );
}

/**
 * Lee el perfil de localStorage. Devuelve `null` si no hay nada, si el JSON está corrupto o si la
 * forma no cuadra: un perfil a medias es peor que ningún perfil (el motor cotizaría con basura).
 *
 * El try/catch es obligatorio: en modo privado (y con la cuota llena) `localStorage` lanza al leer, y
 * un error aquí dejaría la página en blanco.
 */
export function loadProfile(): DriverProfile | null {
  if (typeof window === "undefined") return null;

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw === null) return null;

    const parsed: unknown = JSON.parse(raw);
    return isDriverProfile(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * Guarda el perfil y avisa a los componentes suscritos.
 *
 * Un fallo al escribir (modo privado, cuota llena) no se propaga: lo que se puede validar ya lo avisa
 * la UI, y romper el guardado por una restricción del navegador sería peor que no guardar.
 */
export function saveProfile(profile: DriverProfile): void {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
  } catch {
    return;
  }

  cachedProfile = profile;
  cacheReady = true;
  emitChange();
}

/** Borra el perfil guardado (el conductor vuelve a las tarifas sugeridas del motor). */
export function clearProfile(): void {
  if (typeof window !== "undefined") {
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      // Si no se pudo borrar no se toca la caché: el perfil sigue ahí y la UI debe seguir
      // mostrándolo (decir "borrado" sin haberlo borrado sería peor que no hacer nada).
      return;
    }
  }

  cachedProfile = null;
  cacheReady = true;
  emitChange();
}

/* --- Store mínimo para `useSyncExternalStore` --------------------------------- */

/**
 * `useSyncExternalStore` exige que `getSnapshot` devuelva SIEMPRE la misma referencia mientras nada
 * haya cambiado: si devolviera un objeto nuevo en cada llamada, React entraría en un bucle de
 * renders. De ahí esta caché y los listeners: las tres formas de cambiar el perfil (guardar, borrar y
 * el evento `storage` de otra pestaña) actualizan la caché y avisan a los suscriptores.
 */
let cachedProfile: DriverProfile | null = null;
let cacheReady = false;
const listeners = new Set<() => void>();

function emitChange(): void {
  for (const listener of listeners) listener();
}

/** Snapshot de CLIENTE: la primera llamada lee localStorage y a partir de ahí sirve la caché. */
export function getProfileSnapshot(): DriverProfile | null {
  if (!cacheReady) {
    cachedProfile = loadProfile();
    cacheReady = true;
  }

  return cachedProfile;
}

/**
 * Snapshot del SERVIDOR (y del render de hidratación): `undefined` = "todavía no sé si hay perfil".
 * Es lo que evita el desajuste de hidratación: el HTML del servidor no puede leer localStorage.
 */
export function getServerProfileSnapshot(): undefined {
  return undefined;
}

/**
 * Suscribe un componente a los cambios del perfil y devuelve la función para desuscribirse (lo que
 * espera `useSyncExternalStore`).
 */
export function subscribeToProfile(listener: () => void): () => void {
  listeners.add(listener);

  // Otra pestaña puede cambiar el perfil (el mismo conductor en dos ventanas): el evento `storage`
  // solo llega a las demás pestañas, que es justo lo que hace falta.
  const handleStorage = (event: StorageEvent): void => {
    if (event.key !== null && event.key !== STORAGE_KEY) return;

    cachedProfile = loadProfile();
    cacheReady = true;
    emitChange();
  };

  window.addEventListener("storage", handleStorage);

  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", handleStorage);
  };
}
