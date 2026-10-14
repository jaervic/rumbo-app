"use client";

/**
 * Límite de error de la app (App Router). Sin esto, un fallo en el render dejaba al usuario con la
 * pantalla en blanco y sin forma de recuperarse.
 *
 * Es un Client Component por contrato de Next (necesita `reset`), y no expone el mensaje técnico:
 * en producción `error.message` puede contener detalles internos; el `digest` es lo único seguro de
 * mostrar para poder buscarlo en los logs.
 */

import { useEffect } from "react";
import { RotateCcw, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Un punto único de registro: aquí se engancharía un monitor (Sentry) cuando exista.
    console.error(error);
  }, [error]);

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-background px-6 text-center">
      <TriangleAlert className="size-8 text-destructive" aria-hidden="true" />
      <div className="space-y-1">
        <h1 className="text-lg font-semibold text-foreground">Algo salió mal</h1>
        <p className="text-sm text-muted-foreground">
          Ocurrió un error inesperado. Puedes intentar de nuevo.
        </p>
        {error.digest !== undefined && (
          <p className="text-xs text-muted-foreground">Referencia: {error.digest}</p>
        )}
      </div>
      <Button type="button" onClick={reset} className="min-h-11">
        <RotateCcw className="size-4" aria-hidden="true" />
        Reintentar
      </Button>
    </main>
  );
}
