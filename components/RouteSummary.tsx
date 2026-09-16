import { Loader2, Route as RouteIcon, TriangleAlert } from "lucide-react";
import type { RouteResult } from "@/lib/routing";

export interface RouteSummaryProps {
  route: RouteResult | null;
  loading: boolean;
  error: boolean;
  /** true solo con origen Y destino elegidos: distingue "aún no hay datos" de "falló". */
  hasCoords: boolean;
}

/**
 * Kilómetros con 2 decimales y coma decimal (es-VE).
 * Se formatea a mano en lugar de con toLocaleString para que el HTML del servidor y el
 * del cliente coincidan: si el ICU del navegador elige otro separador, React reporta un
 * error de hidratación.
 */
function formatDistance(distanceKm: number): string {
  return distanceKm.toFixed(2).replace(".", ",");
}

/**
 * Resumen discreto de la ruta calculada por OSRM. Se coloca debajo del mapa, en la misma
 * columna: en móvil queda justo tras el mapa y en desktop cierra la columna derecha.
 *
 * El contenedor reserva un alto mínimo (`min-h-5`) para que el texto al aparecer no
 * empuje el resto de la página (evita saltos de layout en móvil).
 *
 * TODO (Fase 5): mostrar aquí el precio estimado (mínimo, promedio y máximo).
 */
export default function RouteSummary({
  route,
  loading,
  error,
  hasCoords,
}: RouteSummaryProps) {
  return (
    <div
      aria-live="polite"
      className="mt-3 flex min-h-5 flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground sm:mt-4 sm:text-sm"
    >
      {loading ? (
        <>
          <Loader2 className="size-3.5 shrink-0 animate-spin" aria-hidden="true" />
          <span>Calculando ruta...</span>
        </>
      ) : route ? (
        <>
          <RouteIcon className="size-3.5 shrink-0" aria-hidden="true" />
          {/* Un único <span> envolviendo la frase: si el texto fueran hijos sueltos del
              contenedor flex, cada fragmento sería un ítem y el gap los separaría. */}
          <span title="Duración ideal calculada por OSRM, sin tráfico.">
            Distancia:{" "}
            <span className="font-medium text-foreground">
              {formatDistance(route.distanceKm)}
            </span>{" "}
            km <span aria-hidden="true">·</span> Duración:{" "}
            <span className="font-medium text-foreground">{route.durationMin}</span> min
          </span>
        </>
      ) : error ? (
        <>
          <TriangleAlert className="size-3.5 shrink-0 text-destructive" aria-hidden="true" />
          <span>No se pudo calcular la ruta</span>
        </>
      ) : (
        <span>
          {hasCoords
            ? "No se pudo calcular la ruta"
            : "Elige origen y destino para ver la distancia."}
        </span>
      )}
    </div>
  );
}
