"use client";

import { useCallback, useEffect, useState } from "react";
import type { GeoPoint } from "@/lib/distance";

/** Ubicación del usuario: `null` mientras no se conozca (sin permiso, denegado o fallo). */
export type UserLocation = GeoPoint | null;

/**
 * Estado del permiso de geolocalización.
 * "unknown" = la Permissions API no está disponible o no soporta "geolocation"
 * (caso de Safari/iOS), no que el permiso esté sin decidir.
 */
export type LocationPermissionState = PermissionState | "unknown";

export interface UseUserLocationResult {
  location: UserLocation;
  /** Pide la ubicación AL LLAMARLO (nunca al montar: ver decisiones de diseño abajo). */
  requestLocation: () => void;
  /**
   * Deja de usar la ubicación (Fase 3.7): la olvida de memoria y de sessionStorage. La app
   * vuelve al sesgo por defecto (Caracas) y el marcador del mapa desaparece.
   */
  clearLocation: () => void;
  loading: boolean;
  /** Motivo legible del fallo (null = sin error). La UI decide el texto que muestra. */
  error: string | null;
  permissionState: LocationPermissionState;
}

const STORAGE_KEY = "cotizador:user-location";
/** TTL de la posición guardada en sessionStorage (5 min, como pide la fase). */
const STORAGE_TTL_MS = 5 * 60 * 1000;
/** Timeout duro de la petición al navegador. */
export const GEOLOCATION_TIMEOUT_MS = 5000;

/**
 * Precisión: NO hace falta GPS fino. El sesgo de Photon funciona a escala de ciudad, y
 * `enableHighAccuracy: true` tarda más y gasta más batería en móvil. `maximumAge` permite
 * que el navegador reutilice una posición reciente sin volver a localizar.
 */
const GEOLOCATION_OPTIONS: PositionOptions = {
  timeout: GEOLOCATION_TIMEOUT_MS,
  enableHighAccuracy: false,
  maximumAge: STORAGE_TTL_MS,
};

/** Posición guardada en sessionStorage (añade la marca de tiempo al GeoPoint). */
interface StoredLocation extends GeoPoint {
  savedAt: number;
}

function isStoredLocation(value: unknown): value is StoredLocation {
  if (typeof value !== "object" || value === null) return false;

  const candidate = value as Record<string, unknown>;

  return (
    typeof candidate.lat === "number" &&
    typeof candidate.lng === "number" &&
    typeof candidate.savedAt === "number" &&
    Number.isFinite(candidate.lat) &&
    Number.isFinite(candidate.lng) &&
    Number.isFinite(candidate.savedAt)
  );
}

/**
 * Última posición guardada, si sigue dentro del TTL.
 *
 * ⚠️ Acceder a sessionStorage puede LANZAR (modo privado de Safari, cookies de terceros
 * bloqueadas, storage lleno), por eso todo va en try/catch: sin storage la geolocalización
 * sigue funcionando igual, solo se pierde el atajo de los 5 minutos.
 */
function readStoredLocation(): UserLocation {
  if (typeof window === "undefined") return null;

  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (raw === null) return null;

    const parsed: unknown = JSON.parse(raw);
    if (!isStoredLocation(parsed)) return null;

    if (Date.now() - parsed.savedAt > STORAGE_TTL_MS) {
      window.sessionStorage.removeItem(STORAGE_KEY);
      return null;
    }

    return { lat: parsed.lat, lng: parsed.lng };
  } catch {
    return null;
  }
}

function writeStoredLocation(location: GeoPoint): void {
  if (typeof window === "undefined") return;

  try {
    const stored: StoredLocation = { lat: location.lat, lng: location.lng, savedAt: Date.now() };
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
  } catch {
    // Sin storage disponible: la ubicación vive solo en memoria.
  }
}

/**
 * Olvida la posición guardada. Se usa al "dejar de usar la ubicación": sin borrarla, el
 * siguiente clic en el GPS reutilizaría la posición de los últimos 5 minutos y parecería que
 * el usuario no puede desactivarla.
 */
function clearStoredLocation(): void {
  if (typeof window === "undefined") return;

  try {
    window.sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // Sin storage disponible: no hay nada que borrar.
  }
}

/** Motivo legible a partir del error del navegador. */
function describeError(positionError: GeolocationPositionError): string {
  if (positionError.code === positionError.PERMISSION_DENIED) return "Permiso de ubicación denegado";
  if (positionError.code === positionError.TIMEOUT) return "No hubo respuesta a tiempo";

  return "Tu ubicación no está disponible";
}

/**
 * Ubicación del usuario para sesgar las sugerencias de direcciones.
 *
 * Decisiones de diseño:
 * - NUNCA se pide la ubicación al cargar la página: el navegador exige un gesto del usuario
 *   para mostrar el prompt y un aviso inesperado se rechaza casi siempre. Se pide solo desde
 *   `requestLocation()` (botón "Usar mi ubicación actual").
 * - Fallo silencioso: si el usuario niega o algo falla, `location` queda en null y la app
 *   sigue con el sesgo por defecto (Caracas).
 * - `permissionState` se consulta con la Permissions API si existe (consulta sin prompt).
 *   ⚠️ Safari/iOS no la soporta para "geolocation": allí queda en "unknown" y el botón sigue
 *   funcionando, porque `getCurrentPosition` es quien pide el permiso de verdad.
 * - No se restaura la posición guardada al montar: mostrar "Usando tu ubicación" sin que el
 *   usuario toque nada sería confuso (y leer sessionStorage durante el primer render daría
 *   HTML distinto al del servidor). El atajo de los 5 minutos se aplica al pulsar el botón.
 *
 * TODO: en producción, evaluar cachear la ubicación con TTL más largo (ej: 15 min) y
 * expirar al cerrar la pestaña. No persistir a disco sin consentimiento explícito.
 */
export function useUserLocation(): UseUserLocationResult {
  const [location, setLocation] = useState<UserLocation>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [permissionState, setPermissionState] = useState<LocationPermissionState>("unknown");

  // Estado del permiso SIN pedirlo. Los setState van en callbacks asíncronos o de evento,
  // nunca en el cuerpo del efecto (regla react-hooks/set-state-in-effect).
  useEffect(() => {
    if (typeof navigator === "undefined" || !("permissions" in navigator)) return;

    let cancelled = false;
    let status: PermissionStatus | null = null;

    const handleChange = () => {
      if (cancelled || status === null) return;

      setPermissionState(status.state);
    };

    void navigator.permissions
      .query({ name: "geolocation" })
      .then((result) => {
        if (cancelled) return;

        status = result;
        setPermissionState(result.state);
        result.addEventListener("change", handleChange);
      })
      // Algunos navegadores lanzan si el descriptor no está soportado (o si la página va
      // dentro de un iframe sin allow="geolocation"): se ignora y queda "unknown".
      .catch(() => undefined);

    return () => {
      cancelled = true;
      status?.removeEventListener("change", handleChange);
    };
  }, []);

  const requestLocation = useCallback(() => {
    // Sin API (navegador antiguo o entorno sin DOM): fallo silencioso.
    if (typeof navigator === "undefined" || !("geolocation" in navigator)) {
      setError("Este navegador no soporta geolocalización");
      return;
    }

    // Posición de hace menos de 5 minutos: se reutiliza sin volver a llamar al navegador
    // (evita un segundo prompt y una localización innecesaria).
    const stored = readStoredLocation();
    if (stored !== null) {
      setLocation(stored);
      setError(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const next: GeoPoint = { lat: position.coords.latitude, lng: position.coords.longitude };
        writeStoredLocation(next);
        setLocation(next);
        setLoading(false);
      },
      (positionError) => {
        // Fallback silencioso hacia arriba: la app sigue con el sesgo por defecto (Caracas).
        setLocation(null);
        setError(describeError(positionError));
        setLoading(false);
      },
      GEOLOCATION_OPTIONS
    );
  }, []);

  const clearLocation = useCallback(() => {
    clearStoredLocation();
    setLocation(null);
    setError(null);
    setLoading(false);
  }, []);

  return { location, requestLocation, clearLocation, loading, error, permissionState };
}

