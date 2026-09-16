"use client";

import { useCallback, useState } from "react";
import QuoteForm from "@/components/QuoteForm";
import MapPickerWrapper from "@/components/MapPickerWrapper";
import RouteSummary from "@/components/RouteSummary";
import { useRoute } from "@/hooks/useRoute";
import { QuoteCoords } from "@/types";

const INITIAL_COORDS: QuoteCoords = { origin: null, destination: null };

export default function Home() {
  const [coords, setCoords] = useState<QuoteCoords>(INITIAL_COORDS);

  // useCallback mantiene la identidad estable: evita re-disparar el efecto del formulario.
  const handleCoordsChange = useCallback((next: QuoteCoords) => {
    setCoords(next);
  }, []);

  // Fase 4: la ruta (distancia y duración por calles) llega desde OSRM. Solo se pide
  // cuando hay AMBAS coordenadas; en cuanto cambian, la petición anterior se cancela.
  const { route, loading, error } = useRoute(coords.origin, coords.destination);
  const hasCoords = coords.origin !== null && coords.destination !== null;

  return (
    <main className="min-h-dvh bg-background px-4 pt-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] sm:px-6 sm:pt-8 lg:px-8">
      <div className="mx-auto max-w-6xl space-y-6 sm:space-y-8">
        {/* Tipografía escalonada: en móvil 320px un h1 de 3xl parte el título en 3 líneas. */}
        <header className="space-y-1.5 text-center sm:space-y-2">
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl lg:text-4xl">
            Cotizador de Transporte
          </h1>
          <p className="mx-auto max-w-xl text-sm text-muted-foreground sm:text-base">
            Ingresa los detalles de tu viaje para obtener una estimación al instante.
          </p>
        </header>

        {/* Mobile-first: una sola columna (formulario primero, mapa después); el
            layout de dos columnas arranca en md. min-w-0 evita que contenidos
            largos (direcciones, dropdown) desborden la celda del grid. */}
        <div className="grid items-start gap-6 md:grid-cols-12 md:gap-8">
          {/* z-index propio para que el dropdown de sugerencias quede por encima
              de los panes de Leaflet (que usan z-index de hasta ~800). */}
          <aside className="relative z-[900] min-w-0 md:col-span-5 lg:col-span-4">
            <QuoteForm onCoordsChange={handleCoordsChange} />
          </aside>

          <section className="min-w-0 md:col-span-7 lg:col-span-8">
            <MapPickerWrapper
              origin={coords.origin ?? undefined}
              destination={coords.destination ?? undefined}
              routeGeometry={route?.geometry}
            />
            {/* El resumen va debajo del mapa, en su misma columna: en móvil aparece
                justo tras el mapa y en desktop cierra la columna derecha. */}
            <RouteSummary
              route={route}
              loading={loading}
              error={error}
              hasCoords={hasCoords}
            />
          </section>
        </div>
      </div>
    </main>
  );
}

