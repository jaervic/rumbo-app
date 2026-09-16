"use client";

import { useEffect, useState } from "react";
import { getRoute, RouteResult } from "@/lib/routing";
import { Coords } from "@/types";

export interface UseRouteResult {
  /** Ruta calculada para las coordenadas actuales (null mientras no haya o si falló). */
  route: RouteResult | null;
  /** Hay una petición en curso para las coordenadas actuales. */
  loading: boolean;
  /** La petición de las coordenadas actuales terminó sin ruta. */
  error: boolean;
}

/** Petición ya resuelta: se compara su clave con la de las coordenadas actuales. */
interface ResolvedRoute {
  key: string;
  route: RouteResult | null;
}

/**
 * Identidad del par de coordenadas para saber a qué petición corresponde un resultado.
 * (La clave de caché real vive en lib/routing.ts; aquí solo hace falta distinguir pares.)
 */
function buildRequestKey(origin: Coords, destination: Coords): string {
  return `${origin.join(",")}|${destination.join(",")}`;
}

/**
 * Calcula la ruta por carretera entre origen y destino con OSRM.
 *
 * - Solo lanza la petición cuando AMBAS coordenadas existen.
 * - Cancela con AbortController la petición anterior si el usuario cambia de dirección
 *   antes de que termine (evita respuestas viejas pisando a las nuevas).
 * - `loading` y `error` se DERIVAN comparando la clave pedida con la resuelta, así que
 *   no hay setState sincrónico dentro del efecto (react-hooks/set-state-in-effect) ni
 *   estados intermedios inconsistentes.
 */
export function useRoute(
  origin?: Coords | null,
  destination?: Coords | null
): UseRouteResult {
  const [resolved, setResolved] = useState<ResolvedRoute | null>(null);

  // Clave de la petición que corresponde a las coordenadas ACTUALES (null = falta una).
  const currentOrigin = origin ?? null;
  const currentDestination = destination ?? null;
  const requestKey =
    currentOrigin !== null && currentDestination !== null
      ? buildRequestKey(currentOrigin, currentDestination)
      : null;

  useEffect(() => {
    if (!origin || !destination) return;

    const controller = new AbortController();
    const key = buildRequestKey(origin, destination);

    // El setState ocurre en el callback asíncrono (getRoute resuelve como mínimo en el
    // siguiente microtask, incluso con caché): nunca en el cuerpo del efecto.
    void getRoute(origin, destination, controller.signal).then((route) => {
      // Petición cancelada por un cambio de coordenadas: no se toca el estado.
      if (controller.signal.aborted) return;

      setResolved({ key, route });
    });

    return () => controller.abort();
  }, [origin, destination]);

  const isCurrent = resolved !== null && resolved.key === requestKey;

  return {
    // Los datos solo se exponen si corresponden a las coordenadas actuales.
    route: resolved !== null && resolved.key === requestKey ? resolved.route : null,
    loading: requestKey !== null && !isCurrent,
    error: isCurrent && resolved !== null && resolved.route === null,
  };
}
