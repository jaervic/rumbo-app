import { Star } from "lucide-react";
import { cn } from "@/lib/utils";
import type { PublicReview } from "@/lib/drivers";

/**
 * Lista de reseñas (Fase 2). Presentacional y sin estado; se renderiza en el servidor.
 *
 * La fecha se formatea a mano desde el ISO (`YYYY-MM-DD` -> `DD/MM/YYYY`) para no depender de `Intl`
 * ni de la zona horaria del servidor.
 */
function formatDate(iso: string): string {
  const [year, month, day] = iso.slice(0, 10).split("-");
  return year !== undefined && month !== undefined && day !== undefined
    ? `${day}/${month}/${year}`
    : iso;
}

export default function ReviewList({ reviews }: { reviews: PublicReview[] }) {
  if (reviews.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Este conductor todavía no tiene reseñas. Sé el primero en dejar una.
      </p>
    );
  }

  return (
    <ul className="space-y-3">
      {reviews.map((review) => (
        <li key={review.id} className="rounded-lg border border-border bg-card p-3">
          <div className="flex items-center justify-between gap-3">
            <p className="truncate text-sm font-medium text-foreground">{review.customerName}</p>
            <span className="shrink-0 text-xs text-muted-foreground">
              {formatDate(review.createdAt)}
            </span>
          </div>
          <span className="mt-1 inline-flex" aria-label={`${review.rating} de 5`}>
            {[1, 2, 3, 4, 5].map((position) => (
              <Star
                key={position}
                className={cn(
                  "size-3.5",
                  position <= review.rating
                    ? "fill-amber-400 text-amber-400"
                    : "text-muted-foreground/30"
                )}
                aria-hidden="true"
              />
            ))}
          </span>
          {review.comment.length > 0 && (
            <p className="mt-1.5 text-sm text-muted-foreground">{review.comment}</p>
          )}
        </li>
      ))}
    </ul>
  );
}
