/**
 * Esqueleto del listado de conductores (D3). Se muestra mientras la lista se resuelve en el servidor
 * (boundary de Suspense de `/conductores`), con el mismo grid que el contenido real para no saltar.
 *
 * `aria-hidden`: es decorativo; el lector de pantalla no debe leer cajas vacías (el `Suspense` no
 * anuncia nada especial, pero al menos esto no añade ruido).
 */
export default function DriverGridSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2" aria-hidden="true">
      {Array.from({ length: count }).map((_, index) => (
        <div key={index} className="animate-pulse rounded-xl border border-border bg-card p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <div className="size-10 shrink-0 rounded-full bg-muted" />
              <div className="space-y-2">
                <div className="h-4 w-28 rounded bg-muted" />
                <div className="h-3 w-36 rounded bg-muted" />
              </div>
            </div>
            <div className="h-4 w-14 shrink-0 rounded bg-muted" />
          </div>
          <div className="mt-4 h-3 w-full rounded bg-muted" />
          <div className="mt-2 h-3 w-2/3 rounded bg-muted" />
        </div>
      ))}
    </div>
  );
}
