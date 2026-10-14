"use client";

/**
 * Formulario de reseña (Fase 2). Solo se muestra a usuarios con sesión; el servidor vuelve a validar
 * y la RLS impide reseñarse a uno mismo o al conductor inactivo.
 *
 * La estrella se elige con botones (accesibles por teclado) y el texto es opcional. El envío usa
 * `useTransition` para no bloquear la UI mientras la Server Action responde.
 */

import { useState, useTransition } from "react";
import Link from "next/link";
import { Loader2, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { submitReview } from "@/lib/actions/drivers";

export interface ReviewFormProps {
  driverId: string;
  isAuthenticated: boolean;
}

const STARS = [1, 2, 3, 4, 5];

export default function ReviewForm({ driverId, isAuthenticated }: ReviewFormProps) {
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [succeeded, setSucceeded] = useState(false);
  const [pending, startTransition] = useTransition();

  if (!isAuthenticated) {
    return (
      <p className="rounded-lg border border-border bg-muted/40 px-3 py-2.5 text-sm text-muted-foreground">
        <Link href="/login" className="font-medium text-foreground underline underline-offset-4">
          Inicia sesión
        </Link>{" "}
        para dejar una reseña.
      </p>
    );
  }

  if (succeeded) {
    return (
      <p className="rounded-lg border border-success/30 bg-success/10 px-3 py-2.5 text-sm text-success">
        ¡Gracias! Tu reseña se publicó.
      </p>
    );
  }

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    setMessage(null);

    startTransition(async () => {
      const result = await submitReview({ driverId, rating, comment });

      if (result.ok) {
        setSucceeded(true);
        return;
      }

      setMessage(result.error ?? "No se pudo publicar la reseña.");
    });
  };

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-3">
      <div className="grid gap-1.5">
        <span className="text-sm font-medium text-foreground">Tu valoración</span>
        <div className="flex items-center gap-1" role="radiogroup" aria-label="Puntuación">
          {STARS.map((value) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={rating === value}
              aria-label={`${value} ${value === 1 ? "estrella" : "estrellas"}`}
              onClick={() => setRating(value)}
              className="rounded-md p-1 outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              <Star
                className={cn(
                  "size-6",
                  value <= rating ? "fill-warning text-warning" : "text-muted-foreground/40"
                )}
                aria-hidden="true"
              />
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-1.5">
        <label htmlFor="review-comment" className="text-sm font-medium text-foreground">
          Comentario (opcional)
        </label>
        <textarea
          id="review-comment"
          value={comment}
          onChange={(event) => setComment(event.target.value)}
          maxLength={1000}
          rows={3}
          placeholder="¿Cómo fue tu experiencia?"
          className="w-full resize-y rounded-lg border border-input bg-transparent px-2.5 py-2 text-base outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm dark:bg-input/30"
        />
      </div>

      {message !== null && (
        <p className="text-xs text-destructive" role="alert">
          {message}
        </p>
      )}

      <Button type="submit" className="min-h-11 w-full font-semibold" disabled={pending}>
        {pending ? (
          <>
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            Publicando…
          </>
        ) : (
          "Publicar reseña"
        )}
      </Button>
    </form>
  );
}
