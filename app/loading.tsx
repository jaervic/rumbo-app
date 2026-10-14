/**
 * Estado de carga de la app (App Router). Se muestra mientras el segmento se resuelve en el
 * servidor; mantiene el mismo layout centrado que las páginas de error para que el cambio no salte.
 */

import { Loader2 } from "lucide-react";

export default function Loading() {
  return (
    <main className="flex min-h-dvh items-center justify-center gap-2 bg-background text-muted-foreground">
      <Loader2 className="size-4 animate-spin" aria-hidden="true" />
      <span className="text-sm">Cargando…</span>
    </main>
  );
}
