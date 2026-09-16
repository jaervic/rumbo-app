"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { MapContainer, TileLayer, Marker, Polyline, useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";
import type { LeafletMouseEvent } from "leaflet";
import { Loader2 } from "lucide-react";
import "leaflet/dist/leaflet.css";
import { MAP_HEIGHT_CLASS } from "@/lib/mapConfig";
import { cn } from "@/lib/utils";

// Fix para los iconos de Leaflet en Next.js
const iconRetinaUrl = "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png";
const iconUrl = "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png";
const shadowUrl = "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png";

const DefaultIcon = L.icon({
  iconRetinaUrl,
  iconUrl,
  shadowUrl,
  iconSize: [25, 41],
  iconAnchor: [12, 41],
});

L.Marker.prototype.options.icon = DefaultIcon;

/**
 * Marcadores propios con DivIcon (HTML/SVG inline: sin assets externos ni peticiones extra):
 * - Origen: círculo verde con "A" blanca (se distingue del destino de un vistazo).
 * - Destino: pin rojo clásico en forma de gota, con punto blanco interior.
 * - Ubicación del usuario: punto azul con anillo pulsante (clase `.map-user-pulse`).
 */
const originIcon = L.divIcon({
  className: "border-0 bg-transparent",
  html: '<span style="display:flex;width:22px;height:22px;align-items:center;justify-content:center;border-radius:9999px;border:2px solid #ffffff;background:#16a34a;box-shadow:0 1px 4px rgba(0,0,0,.4);color:#ffffff;font:600 11px/1 ui-sans-serif,system-ui,sans-serif">A</span>',
  iconSize: [22, 22],
  iconAnchor: [11, 11],
});

const destinationIcon = L.divIcon({
  className: "border-0 bg-transparent",
  // La punta del SVG (13, 33) es el ancla: así el pin señala el punto exacto del mapa.
  html: '<svg width="26" height="33" viewBox="0 0 26 33" aria-hidden="true" style="filter:drop-shadow(0 1px 2px rgba(0,0,0,.35))"><path d="M13 1C6.4 1 1 6.4 1 13c0 8.4 12 19 12 19s12-10.6 12-19C25 6.4 19.6 1 13 1z" fill="#dc2626" stroke="#ffffff" stroke-width="2"/><circle cx="13" cy="13" r="4.5" fill="#ffffff"/></svg>',
  iconSize: [26, 33],
  iconAnchor: [13, 33],
});

/**
 * Ubicación actual del usuario: punto azul (#2563eb) con borde blanco, sombra suave y un anillo
 * que se expande y desvanece detrás (`.map-user-pulse`, definido en globals.css).
 */
const userLocationIcon = L.divIcon({
  className: "border-0 bg-transparent",
  html: '<span style="position:relative;display:block;width:18px;height:18px"><span class="map-user-pulse" style="position:absolute;inset:0;border-radius:9999px;background:#2563eb"></span><span style="position:absolute;inset:2px;border-radius:9999px;border:2px solid #ffffff;background:#2563eb;box-shadow:0 1px 4px rgba(0,0,0,.4)"></span></span>',
  iconSize: [18, 18],
  iconAnchor: [9, 9],
});

export interface MapPickerProps {
  origin?: [number, number];
  destination?: [number, number];
  /** Trazo de la ruta devuelto por OSRM (GeoJSON). Si falta, no se dibuja ninguna línea. */
  routeGeometry?: GeoJSON.LineString;
  /**
   * Toque/clic en el mapa (Fase 3.5h). La página decide qué hacer con el punto: si no hay
   * ningún modo activo, ignora el aviso.
   */
  onMapClick?: (lat: number, lng: number) => void;
  /** Hay un modo "fijar origen/destino" activo: cambia el cursor y la capa táctil. */
  isPickingMode?: boolean;
  /** Ubicación actual del usuario ([lat, lng]): punto azul pulsante, no interactivo. */
  userLocation?: [number, number];
  /** OSRM está calculando la ruta: overlay informativo sobre el mapa. */
  isRouteLoading?: boolean;
}

/**
 * Escucha los clics/toques en el mapa con `useMapEvents` de react-leaflet.
 *
 * Registra el handler en el propio evento `click` de Leaflet (no en el DOM) para que reciba
 * las coordenadas del punto tocado ya convertidas a lat/lng y para que respete los gestos:
 * un arrastre o un pellizco no disparan `click`.
 */
function MapClickHandler({
  onMapClick,
}: {
  onMapClick?: (lat: number, lng: number) => void;
}) {
  useMapEvents({
    click: (event: LeafletMouseEvent) => {
      onMapClick?.(event.latlng.lat, event.latlng.lng);
    },
  });

  return null;
}

/** Coordenadas GeoJSON ([lng, lat]) -> LatLng de Leaflet ([lat, lng]). */
function toLatLngs(geometry: GeoJSON.LineString): [number, number][] {
  return geometry.coordinates.map(([lng, lat]) => [lat, lng]);
}

/**
 * Ajusta la vista del mapa según las coordenadas disponibles:
 * - Origen + destino -> fitBounds para encuadrar ambos puntos y la ruta completa.
 * - Solo uno -> centra en ese punto con zoom 14.
 */
function MapViewController({ origin, destination, routeGeometry }: MapPickerProps) {
  const map = useMap();

  // Recalcula el tamaño interno de Leaflet cuando cambia el tamaño del contenedor.
  // En móvil el alto del mapa depende del viewport: al mostrar/ocultar la barra de
  // direcciones de iOS Safari (o al rotar el dispositivo) el contenedor cambia de
  // alto y, sin esto, Leaflet conserva las medidas iniciales y deja zonas grises.
  useEffect(() => {
    const observer = new ResizeObserver(() => map.invalidateSize());
    observer.observe(map.getContainer());

    return () => observer.disconnect();
  }, [map]);

  useEffect(() => {
    // La ruta completa entra en el encuadre: limitarse a los extremos deja fuera de la
    // vista los tramos que se desvían del camino recto entre origen y destino.
    const routePoints = routeGeometry ? toLatLngs(routeGeometry) : [];

    if (origin && destination) {
      // Padding proporcional al contenedor: 40px fijos son correctos en desktop,
      // pero en un mapa móvil de ~240px de alto dejarían muy poco espacio para
      // encuadrar los dos puntos.
      const size = map.getSize();
      const padding = Math.round(Math.min(40, size.y * 0.15));

      map.fitBounds(L.latLngBounds([origin, destination, ...routePoints]), {
        padding: [padding, padding],
        maxZoom: 15,
      });
      return;
    }

    const single = origin ?? destination;
    if (single) {
      map.setView(single, 14);
    }
  }, [map, origin, destination, routeGeometry]);

  return null;
}

/** Consulta de medios que identifica un puntero grueso (dedo). */
const COARSE_POINTER_QUERY = "(pointer: coarse)";

/**
 * Detección de puntero grueso con useSyncExternalStore en lugar de useState +
 * useEffect: la regla react-hooks/set-state-in-effect prohíbe hacer setState en el
 * cuerpo de un efecto, y suscribirse a matchMedia es exactamente el caso de uso de
 * esta API. Es SSR-safe: en servidor devuelve false (sin capa táctil).
 */
function subscribeToCoarsePointer(onStoreChange: () => void): () => void {
  const mediaQuery = window.matchMedia(COARSE_POINTER_QUERY);
  mediaQuery.addEventListener("change", onStoreChange);

  return () => mediaQuery.removeEventListener("change", onStoreChange);
}

function getCoarsePointerSnapshot(): boolean {
  return window.matchMedia(COARSE_POINTER_QUERY).matches;
}

function getCoarsePointerServerSnapshot(): boolean {
  return false;
}

/**
 * Capa que cubre el mapa en pantallas táctiles hasta que el usuario lo activa.
 *
 * Por qué existe: Leaflet captura los gestos de un dedo sobre su contenedor, así que
 * en móvil el usuario no puede desplazar la página si el dedo cae dentro del mapa (y
 * el pellizco hace zoom del mapa, no de la página). Con esta capa el primer toque
 * solo habilita el mapa; mientras está visible, el scroll de la página funciona con
 * normalidad. Solo se muestra con puntero grueso: en desktop nunca aparece.
 */
function MapTouchOverlay({ onActivate }: { onActivate: () => void }) {
  return (
    <button
      type="button"
      onClick={onActivate}
      aria-label="Activar interacción con el mapa"
      className="absolute inset-0 z-[1000] flex items-center justify-center bg-background/20 p-4 backdrop-blur-[1px]"
    >
      <span className="pointer-events-none rounded-full border border-border bg-secondary px-4 py-2 text-sm font-medium text-secondary-foreground shadow-sm">
        Toca para mover el mapa
      </span>
    </button>
  );
}

/**
 * Overlay informativo mientras OSRM calcula la ruta.
 *
 * `pointer-events-none` a propósito: informa sin bloquear, así el usuario puede seguir moviendo
 * el mapa mientras llega la respuesta. `role="status"` + aria-live lo anuncian sin robar el foco.
 */
function RouteLoadingOverlay() {
  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none absolute inset-0 z-[1100] flex items-center justify-center bg-background/40 backdrop-blur-[1px]"
    >
      <span className="flex items-center gap-2 rounded-full border border-border bg-card/95 px-3 py-1.5 text-xs font-medium shadow-sm sm:text-sm">
        <Loader2 className="size-3.5 shrink-0 animate-spin" aria-hidden="true" />
        Calculando ruta...
      </span>
    </div>
  );
}

export default function MapPicker({
  origin,
  destination,
  routeGeometry,
  onMapClick,
  isPickingMode = false,
  userLocation,
  isRouteLoading = false,
}: MapPickerProps) {
  const defaultCenter: [number, number] = [10.48, -66.90]; // Caracas, Venezuela

  const isCoarsePointer = useSyncExternalStore(
    subscribeToCoarsePointer,
    getCoarsePointerSnapshot,
    getCoarsePointerServerSnapshot
  );
  // En táctil el mapa arranca bloqueado y el primer toque lo habilita (ver overlay).
  const [isInteractive, setIsInteractive] = useState(false);

  // Con un modo de fijado activo la capa táctil NO se interpone: el usuario ya pidió
  // interactuar con el mapa, así que su toque debe llegar directo al mapa (un solo toque,
  // no "primero activa y luego fija").
  const isOverlayVisible = isCoarsePointer && !isInteractive && !isPickingMode;

  // Un toque en modo fijar también marca el mapa como activo: al terminar de fijar el punto,
  // la capa "Toca para mover el mapa" no vuelve a aparecer sobre un mapa que ya se usó.
  const handleMapClick = useCallback(
    (lat: number, lng: number) => {
      setIsInteractive(true);
      onMapClick?.(lat, lng);
    },
    [onMapClick]
  );

  return (
    <div
      role="region"
      aria-label="Mapa con el origen y el destino del viaje"
      className={cn(
        MAP_HEIGHT_CLASS,
        "relative w-full overflow-hidden rounded-xl border border-border shadow-sm"
      )}
    >
      <MapContainer
        center={origin || defaultCenter}
        zoom={6}
        scrollWheelZoom={true}
        className="h-full w-full"
        // Cursor de cruz mientras hay un modo activo. Va en `style` (inline) y no como clase
        // de Tailwind a propósito: el `.leaflet-grab { cursor: grab }` de leaflet.css no vive
        // en ninguna @layer, así que ganaría en la cascada a las utilidades de Tailwind.
        style={isPickingMode ? { cursor: "crosshair" } : undefined}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {/* La polyline es declarativa: al cambiar `positions`, React reutiliza el mismo
            layer de Leaflet (setLatLngs) y al quedarse sin ruta el componente se
            desmonta y Leaflet elimina el trazo. Así nunca se acumulan líneas viejas. */}
        {routeGeometry && (
          <Polyline
            positions={toLatLngs(routeGeometry)}
            color="#2563eb"
            weight={5}
            opacity={0.7}
          />
        )}

        {/* Ubicación del usuario: es una referencia, no un destino, así que nunca es
            interactiva (sin popup ni clic). Se dibuja antes que origen y destino para que los
            marcadores del viaje queden por encima si se solapan. */}
        {userLocation && (
          <Marker
            position={userLocation}
            icon={userLocationIcon}
            interactive={false}
            keyboard={false}
            zIndexOffset={-250}
          />
        )}

        {origin && <Marker position={origin} icon={originIcon} />}
        {destination && (
          <Marker position={destination} icon={destinationIcon} />
        )}
        <MapViewController
          origin={origin}
          destination={destination}
          routeGeometry={routeGeometry}
        />
        <MapClickHandler onMapClick={handleMapClick} />
      </MapContainer>

      {isOverlayVisible && (
        <MapTouchOverlay onActivate={() => setIsInteractive(true)} />
      )}

      {isRouteLoading && <RouteLoadingOverlay />}
    </div>
  );
}
