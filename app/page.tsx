"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import DriverProfileButton from "@/components/DriverProfileButton";
import QuoteForm, { type QuoteFormHandle } from "@/components/QuoteForm";
import MapModeToggle from "@/components/MapModeToggle";
import MapPickerWrapper from "@/components/MapPickerWrapper";
import PriceCard from "@/components/PriceCard";
import { useDriverProfile } from "@/hooks/useDriverProfile";
import { useRoute } from "@/hooks/useRoute";
import { buildFallbackLocation, reverseGeocode } from "@/lib/geocoding";
import type { GeoPoint } from "@/lib/distance";
import { estimatePrice } from "@/lib/pricing";
import { MapSelectionMode, QuoteCoords, QuoteRequest } from "@/types";

const INITIAL_COORDS: QuoteCoords = { origin: null, destination: null };

/**
 * Cotización inicial (Fase 6). QuoteForm avisa de cada cambio con `onRequestChange` y aquí se guarda
 * el último estado recibido: es lo que alimenta al motor de precios.
 */
const INITIAL_REQUEST: QuoteRequest = {
  origin: "",
  destination: "",
  passengers: 1,
  vehicleType: "sedan",
  // Fase 6.1: vehículo del catálogo (marca/modelo/año) que envía QuoteForm; null = no elegido.
  vehicle: null,
};

export default function Home() {
  // Fase 6.2: perfil del conductor (localStorage). `profileLoading` es true hasta saber si hay perfil:
  // con eso no se pinta el botón antes de tiempo (el HTML del servidor no puede leer localStorage).
  const { profile, loading: profileLoading } = useDriverProfile();

  const [coords, setCoords] = useState<QuoteCoords>(INITIAL_COORDS);
  // Fase 6: última cotización emitida por QuoteForm (vehículo y pasajeros son los datos tarifables).
  const [request, setRequest] = useState<QuoteRequest>(INITIAL_REQUEST);

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

  // Igual que las coordenadas: identidad estable para no re-disparar el efecto de QuoteForm.
  const handleRequestChange = useCallback((next: QuoteRequest) => {
    setRequest(next);
  }, []);

  // Fase 4: la ruta (distancia y duración por calles) llega desde OSRM. Solo se pide
  // cuando hay AMBAS coordenadas; en cuanto cambian, la petición anterior se cancela.
  const { route, loading } = useRoute(coords.origin, coords.destination);
  const hasCoords = coords.origin !== null && coords.destination !== null;

  /**
   * Precio en vivo (Fase 6): sin red, porque `estimatePrice` es puro y trabaja sobre la ruta que ya
   * resolvió `useRoute`. `null` significa una de tres cosas, y PriceCard decide cuál explicar: falta
   * alguna coordenada, la ruta no llegó, o la combinación vehículo/pasajeros no es posible.
   *
   * TODO (Fase 7+): el factor de tráfico se fija con la hora del cálculo. Si el usuario deja la
   * página abierta y cruza una franja horaria (p. ej. las 22:00), el precio se actualiza al siguiente
   * cambio de ruta, vehículo o pasajeros; para que se refresque solo haría falta un reloj.
   */
  const price = useMemo(
    () =>
      route === null
        ? null
        : estimatePrice({
            distanceKm: route.distanceKm,
            durationIdealMin: route.durationMin,
            vehicleType: request.vehicleType,
            passengers: request.passengers,
            // Fase 6.2: tarifas propias del conductor, si tiene perfil configurado (si no, el motor
            // usa las de la tabla por vehículo, como hasta ahora).
            tariffOverride: profile?.tariff,
          }),
    [route, request.vehicleType, request.passengers, profile?.tariff]
  );

  // Tarjeta del precio: el botón del formulario la enfoca y desplaza hasta ella.
  const priceCardRef = useRef<HTMLElement>(null);

  /**
   * Acción del botón principal del formulario. En móvil la tarjeta del precio queda DEBAJO del mapa,
   * así que el botón sirve como "ver mi precio" sin obligar a desplazarse a mano. Se enfoca la
   * tarjeta (`tabIndex={-1}` en PriceCard) para que el lector de pantalla anuncie el resultado, con
   * preventScroll para no deshacer el desplazamiento suave que se acaba de lanzar.
   */
  const handleViewPrice = useCallback(() => {
    const card = priceCardRef.current;
    if (card === null) return;

    // Quien pidió menos movimiento en su sistema no ve un desplazamiento animado.
    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    card.scrollIntoView({ behavior: prefersReducedMotion ? "auto" : "smooth", block: "center" });
    card.focus({ preventScroll: true });
  }, []);

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
    <main className="flex-1 bg-background px-4 pt-6 pb-24 sm:px-6 sm:pt-8 md:pb-8 lg:px-8">
      <div className="mx-auto max-w-6xl space-y-6 sm:space-y-8">
        {/* Tipografía escalonada: en móvil 320px un h1 de 3xl parte el título en 3 líneas. */}
        {/* Barra superior: el perfil del conductor va arriba a la derecha (Fase 6.2). No se renderiza
            hasta saber si hay perfil (`profileLoading`), y el botón se trunca si el nombre es largo. */}
        {/* La navegación (Cotizador/Conductores/Panel/Cuenta) vive en la barra inferior; aquí solo
            queda el perfil de cotización del conductor, que es específico de esta pantalla. */}
        <div className="flex justify-end">
          {!profileLoading && <DriverProfileButton />}
        </div>

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
              // Fase 6: el precio se calcula en vivo con lo que el formulario informe (ver `price`).
              onRequestChange={handleRequestChange}
              // El botón del formulario ya no calcula: lleva a la tarjeta del precio.
              onViewPrice={handleViewPrice}
              // Fase 6.2: el tipo del vehículo del perfil se pre-selecciona mientras el usuario no lo
              // cambie a mano en este formulario (ver `defaultVehicleType` en QuoteForm).
              defaultVehicleType={profile?.vehicle.vehicleType}
              // Fase 8.1: el vehículo guardado en el perfil se muestra en el formulario como chip
              // informativo ("Vehículo: Toyota Corolla 2015"), sin obligar a abrir el catálogo.
              profileVehicle={profile?.vehicle ?? null}
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
            <PriceCard
              ref={priceCardRef}
              price={price}
              route={route}
              request={request}
              loading={loading}
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

