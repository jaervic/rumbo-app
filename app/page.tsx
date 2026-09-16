"use client";

import { useCallback, useState } from "react";
import QuoteForm from "@/components/QuoteForm";
import MapPickerWrapper from "@/components/MapPickerWrapper";
import { QuoteCoords } from "@/types";

const INITIAL_COORDS: QuoteCoords = { origin: null, destination: null };

export default function Home() {
  const [coords, setCoords] = useState<QuoteCoords>(INITIAL_COORDS);

  // useCallback mantiene la identidad estable: evita re-disparar el efecto del formulario.
  const handleCoordsChange = useCallback((next: QuoteCoords) => {
    setCoords(next);
  }, []);
  return (
    <main className="min-h-screen bg-background p-4 md:p-8">
      <div className="mx-auto max-w-6xl space-y-8">
        <header className="text-center space-y-2">
          <h1 className="text-3xl font-bold tracking-tight md:text-4xl">
            Cotizador de Transporte
          </h1>
          <p className="text-muted-foreground">
            Ingresa los detalles de tu viaje para obtener una estimación al instante.
          </p>
        </header>

        <div className="grid gap-8 md:grid-cols-12 items-start">
          <aside className="md:col-span-5 lg:col-span-4">
            <QuoteForm onCoordsChange={handleCoordsChange} />
          </aside>

          <section className="md:col-span-7 lg:col-span-8">
            <MapPickerWrapper
              origin={coords.origin ?? undefined}
              destination={coords.destination ?? undefined}
            />
          </section>
        </div>
      </div>
    </main>
  );
}

