/**
 * Página 404 de la app. Server Component: no necesita estado ni efectos.
 */

import Link from "next/link";
import { MapPinOff } from "lucide-react";

export default function NotFound() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-background px-6 text-center">
      <MapPinOff className="size-8 text-muted-foreground" aria-hidden="true" />
      <div className="space-y-1">
        <h1 className="text-lg font-semibold text-foreground">Página no encontrada</h1>
        <p className="text-sm text-muted-foreground">
          La dirección que buscas no existe o cambió de sitio.
        </p>
      </div>
      <Link
        href="/"
        className="inline-flex min-h-11 items-center rounded-lg border border-border bg-background px-4 text-sm font-medium text-foreground transition-colors hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
      >
        Volver al cotizador
      </Link>
    </main>
  );
}
