"use client";

import { useCallback, useRef, useState } from "react";
import QuoteForm, { type QuoteFormHandle } from "@/components/QuoteForm";
import MapModeToggle from "@/components/MapModeToggle";
import MapPickerWrapper from "@/components/MapPickerWrapper";
import RouteInfoCard from "@/components/RouteInfoCard";
import { useRoute } from "@/hooks/useRoute";
import { buildFallbackLocation, reverseGeocode } from "@/lib/geocoding";
import type { GeoPoint } from "@/lib/distance";
import { MapSelectionMode, QuoteCoords } from "@/types";

const INITIAL_COORDS: QuoteCoords = { origin: null, destination: null };

export default function Home() {
  const [coords, setCoords] = useState<QuoteCoords>(INITIAL_COORDS);

  // Fase 3.5h: campo que se fija con el siguiente toque en el mapa (null = toques ignorados).
  const [activeMapMode, setActiveMapMode] = useState<MapSelectionMode | null>(null);
  const [isResolvingMapAddress, setIsResolvingMapAddress] = useState(false);
  // API imperativa del formulario: el clic llega del mapa, que es hermano del formulario.
  const quoteFormRef = useRef<QuoteFormHandle>(null);

  // Ubicación GPS del usuario (Fase 3.7): QuoteForm la comparte por callback y aquí se usa para
  // el marcador azul pulsante del mapa.
  const [userLocation, setUserLocation] = useState<GeoPoint | null>(null);

  const handleUserLocationChange = useCallback((location: GeoPoint | null) => {
    setUserLocation(location);
  }, []);

  // useCallback mantiene la identidad estable: evita re-disparar el efecto del formulario.
  const handleCoordsChange = useCallback((next: QuoteCoords) => {
    setCoords(next);
  }, []);

  // Fase 4: la ruta (distancia y duración por calles) llega desde OSRM. Solo se pide
  // cuando hay AMBAS coordenadas; en cuanto cambian, la petición anterior se cancela.
  const { route, loading, error } = useRoute(coords.origin, coords.destination);
  const hasCoords = coords.origin !== null && coords.destination !== null;

  /**
   * Toque en el mapa: resuelve la dirección del punto y la fija en el campo activo.
   *
   * TODO: cuando llegue Supabase, guardar aquí analytics de "taps en el mapa" (coordenadas
   * tocadas, campo fijado y si la dirección vino de Photon o del fallback) para saber qué
   * zonas se usan más y dónde faltan direcciones en OSM.
   */
  const handleMapClick = useCallback(
    async (lat: number, lng: number) => {
      const mode = activeMapMode;
      // Sin modo activo los toques del mapa no hacen nada (regla del flujo).
      if (mode === null) return;

      setIsResolvingMapAddress(true);
      const resolved = await reverseGeocode(lat, lng);
      setIsResolvingMapAddress(false);

      // Si reverse falla (el /reverse público de Photon devuelve 503 con frecuencia) se usa la
      // etiqueta de respaldo con las coordenadas: el input nunca se queda vacío.
      const location = resolved ?? buildFallbackLocation(lat, lng);

      quoteFormRef.current?.setLocationFromMap(mode, location.displayName, [lat, lng]);

      // Flujo pedido: tras fijar el origen el toggle pasa solo a destino; tras el destino se apaga.
      setActiveMapMode(mode === "origin" ? "destination" : null);
    },
    [activeMapMode]
  );

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
            <QuoteForm
              ref={quoteFormRef}
              onCoordsChange={handleCoordsChange}
              onUserLocationChange={handleUserLocationChange}
              // El campo que se está resolviendo es el del modo activo (no cambia hasta terminar).
              resolvingField={isResolvingMapAddress ? activeMapMode : null}
              // TODO (Fase 5): lo activará la petición de precios; hoy refleja el único cálculo
              // real que existe (la ruta de OSRM).
              isSubmitting={loading && hasCoords}
            />
          </aside>

          <section className="flex min-w-0 flex-col gap-3 md:col-span-7 lg:col-span-8">
            <div className="order-1">
              {/* El toggle vive aquí, entre el formulario y el mapa: son hermanos, y el formulario
                  no necesita saber nada del modo (recibe el resultado ya resuelto por `ref`). */}
              <MapModeToggle mode={activeMapMode} onModeChange={setActiveMapMode} />

              {/* Guía del modo activo. `min-h-5` reserva el alto para que el texto aparezca sin
                  empujar el mapa, y `animate-in fade-in` (tw-animate-css) lo funde al entrar. El
                  estado del reverse geocoding se muestra junto al campo afectado, en el formulario. */}
              <p
                className="mt-2 flex min-h-5 items-center gap-1.5 text-xs text-muted-foreground"
                aria-live="polite"
              >
                {activeMapMode !== null && (
                  <span className="animate-in fade-in duration-200">
                    Toca el mapa para fijar el{" "}
                    <strong className="font-semibold text-foreground">
                      {activeMapMode === "origin" ? "Origen" : "Destino"}
                    </strong>
                  </span>
                )}
              </p>
            </div>

            {/* Un solo componente con dos órdenes: en móvil el resultado va debajo del mapa (la
                fuente de datos primero) y desde md queda arriba, más cerca de la vista. */}
            <RouteInfoCard
              route={route}
              loading={loading}
              error={error}
              hasCoords={hasCoords}
              className="order-3 md:order-2"
            />

            <div className="order-2 md:order-3">
              <MapPickerWrapper
                origin={coords.origin ?? undefined}
                destination={coords.destination ?? undefined}
                routeGeometry={route?.geometry}
                onMapClick={handleMapClick}
                isPickingMode={activeMapMode !== null}
                userLocation={userLocation ? [userLocation.lat, userLocation.lng] : undefined}
                isRouteLoading={loading}
              />
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}

