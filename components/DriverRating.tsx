import { Star } from "lucide-react";
import { cn } from "@/lib/utils";

export interface DriverRatingProps {
  /** Promedio (0–5). */
  value: number;
  /** Número de reseñas que forman el promedio. */
  count: number;
  className?: string;
}

/**
 * Valoración en estrellas (Fase 2). Presentacional y sin estado: se usa en el listado y en el detalle.
 * El número se formatea con `toFixed(1)` (sin `Intl`) para que el HTML del servidor y el del cliente
 * coincidan y no haya desajuste de hidratación.
 */
export default function DriverRating({ value, count, className }: DriverRatingProps) {
  const filled = Math.round(value);
  const hasReviews = count > 0;

  return (
    <span className={cn("inline-flex items-center gap-1.5", className)}>
      <span className="inline-flex" aria-hidden="true">
        {[1, 2, 3, 4, 5].map((position) => (
          <Star
            key={position}
            className={cn(
              "size-3.5",
              position <= filled ? "fill-amber-400 text-amber-400" : "text-muted-foreground/30"
            )}
          />
        ))}
      </span>
      <span className="text-xs text-muted-foreground">
        {hasReviews ? `${value.toFixed(1)} (${count})` : "Sin reseñas"}
      </span>
    </span>
  );
}
