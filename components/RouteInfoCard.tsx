import { Clock, Loader2, Ruler, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import type { RouteResult } from "@/lib/routing";

export interface RouteInfoCardProps {
  route: RouteResult | null;
  loading: boolean;
  error: boolean;
  /** true solo con origen Y destino elegidos: distingue "aún no hay datos" de "falló". */
  hasCoords: boolean;
  /** Clases de posición/orden (la página la pone debajo del mapa en móvil y arriba en desktop). */
  className?: string;
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
 * Tarjeta compacta con distancia y duración de la ruta (Fase 3.7; sustituye al resumen en
 * texto suelto de la Fase 4, que era difícil de leer de un vistazo al volante).
 *
 * - En móvil ocupa el ancho completo; desde `md` se limita a `max-w-md`.
 * - `aria-live="polite"`: al aparecer el resultado se anuncia sin interrumpir.
 *
 * TODO (Fase 5): añadir el precio estimado (mínimo, promedio y máximo) a esta misma tarjeta.
 */
export default function RouteInfoCard({
  route,
  loading,
  error,
  hasCoords,
  className,
}: RouteInfoCardProps) {
  return (
    <div
      aria-live="polite"
      className={cn(
        "w-full rounded-lg border border-border bg-card p-3 text-sm shadow-sm md:max-w-md",
        className
      )}
    >
      {loading ? (
        <p className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="size-4 shrink-0 animate-spin" aria-hidden="true" />
          Calculando...
        </p>
      ) : route ? (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <p className="flex items-center gap-1.5" title="Distancia por carretera (OSRM).">
            <Ruler className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            <span className="font-semibold text-foreground">
              {formatDistance(route.distanceKm)}
            </span>
            <span className="text-muted-foreground">km</span>
          </p>
          <p
            className="flex items-center gap-1.5"
            title="Duración ideal calculada por OSRM, sin tráfico."
          >
            <Clock className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            <span className="font-semibold text-foreground">{route.durationMin}</span>
            <span className="text-muted-foreground">min</span>
          </p>
        </div>
      ) : error ? (
        <p className="flex items-center gap-2 text-destructive">
          <TriangleAlert className="size-4 shrink-0" aria-hidden="true" />
          No se pudo calcular la ruta
        </p>
      ) : (
        <p className="text-muted-foreground">
          {hasCoords
            ? "No se pudo calcular la ruta"
            : "Elige origen y destino para ver la distancia."}
        </p>
      )}
    </div>
  );
}
