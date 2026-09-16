"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { MapContainer, TileLayer, Marker, Polyline, useMap } from "react-leaflet";
import L from "leaflet";
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
 * Marcadores diferenciados por color (divIcon = HTML propio, sin assets externos):
 * - Azul: origen
 * - Rojo: destino
 */
const originIcon = L.divIcon({
  className: "border-0 bg-transparent",
  html: '<span style="display:block;width:16px;height:16px;border-radius:9999px;border:2px solid #ffffff;background:#2563eb;box-shadow:0 1px 4px rgba(0,0,0,0.4)"></span>',
  iconSize: [16, 16],
  iconAnchor: [8, 8],
});

const destinationIcon = L.divIcon({
  className: "border-0 bg-transparent",
  html: '<span style="display:block;width:16px;height:16px;border-radius:9999px;border:2px solid #ffffff;background:#dc2626;box-shadow:0 1px 4px rgba(0,0,0,0.4)"></span>',
  iconSize: [16, 16],
  iconAnchor: [8, 8],
});

export interface MapPickerProps {
  origin?: [number, number];
  destination?: [number, number];
  /** Trazo de la ruta devuelto por OSRM (GeoJSON). Si falta, no se dibuja ninguna línea. */
  routeGeometry?: GeoJSON.LineString;
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

export default function MapPicker({ origin, destination, routeGeometry }: MapPickerProps) {
  const defaultCenter: [number, number] = [10.48, -66.90]; // Caracas, Venezuela

  const isCoarsePointer = useSyncExternalStore(
    subscribeToCoarsePointer,
    getCoarsePointerSnapshot,
    getCoarsePointerServerSnapshot
  );
  // En táctil el mapa arranca bloqueado y el primer toque lo habilita (ver overlay).
  const [isInteractive, setIsInteractive] = useState(false);
  const isOverlayVisible = isCoarsePointer && !isInteractive;

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

        {origin && <Marker position={origin} icon={originIcon} />}
        {destination && (
          <Marker position={destination} icon={destinationIcon} />
        )}
        <MapViewController
          origin={origin}
          destination={destination}
          routeGeometry={routeGeometry}
        />
      </MapContainer>

      {isOverlayVisible && (
        <MapTouchOverlay onActivate={() => setIsInteractive(true)} />
      )}
    </div>
  );
}
