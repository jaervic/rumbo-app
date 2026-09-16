"use client";

import { useEffect } from "react";
import { MapContainer, TileLayer, Marker, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

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
}

/**
 * Ajusta la vista del mapa según las coordenadas disponibles:
 * - Origen + destino -> fitBounds para encuadrar ambos puntos.
 * - Solo uno -> centra en ese punto con zoom 14.
 */
function MapViewController({ origin, destination }: MapPickerProps) {
  const map = useMap();

  useEffect(() => {
    if (origin && destination) {
      map.fitBounds(L.latLngBounds([origin, destination]), {
        padding: [40, 40],
        maxZoom: 15,
      });
      return;
    }

    const single = origin ?? destination;
    if (single) {
      map.setView(single, 14);
    }
  }, [map, origin, destination]);

  return null;
}

export default function MapPicker({ origin, destination }: MapPickerProps) {
  const defaultCenter: [number, number] = [10.48, -66.90]; // Caracas, Venezuela

  return (
    <div className="h-[400px] w-full overflow-hidden rounded-xl border border-border shadow-sm">
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
        {origin && <Marker position={origin} icon={originIcon} />}
        {destination && (
          <Marker position={destination} icon={destinationIcon} />
        )}
        <MapViewController origin={origin} destination={destination} />
      </MapContainer>
    </div>
  );
}
