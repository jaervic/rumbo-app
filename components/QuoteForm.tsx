"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { geocodeAddress, MIN_QUERY_LENGTH } from "@/lib/geocoding";
import { Coords, QuoteCoords, QuoteRequest } from "@/types";

/** Debounce de escritura antes de consultar Nominatim. */
const GEOCODE_DEBOUNCE_MS = 500;

type GeocodeStatus = "idle" | "loading" | "found" | "not-found";

interface GeocodedField {
  status: GeocodeStatus;
  coords: Coords | null;
}

export interface QuoteFormProps {
  /** Notifica al padre las coordenadas resueltas para pintar los marcadores. */
  onCoordsChange?: (coords: QuoteCoords) => void;
}

/** Estados constantes (identidad estable -> no re-disparan efectos del padre). */
const IDLE_FIELD: GeocodedField = { status: "idle", coords: null };
const LOADING_FIELD: GeocodedField = { status: "loading", coords: null };

/**
 * Debounce (500ms) + geocoding del valor de un campo de dirección.
 * El estado de carga se DERIVA durante el render (no con setState dentro del
 * efecto), y el resultado se asocia a la consulta que lo produjo para descartar
 * respuestas obsoletas. Cancela el timer al desmontar o al cambiar el texto.
 */
function useGeocodedAddress(query: string): GeocodedField {
  const trimmed = query.trim();
  const isQueryValid = trimmed.length >= MIN_QUERY_LENGTH;

  const [resolved, setResolved] = useState<{ query: string; field: GeocodedField } | null>(
    null
  );

  useEffect(() => {
    if (!isQueryValid) return;

    let cancelled = false;

    const timer = setTimeout(() => {
      void geocodeAddress(trimmed).then((result) => {
        if (cancelled) return;

        const coords: Coords | null = result ? [result.lat, result.lng] : null;
        setResolved({
          query: trimmed,
          field: { status: result ? "found" : "not-found", coords },
        });
      });
    }, GEOCODE_DEBOUNCE_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [isQueryValid, trimmed]);

  if (!isQueryValid) return IDLE_FIELD;
  if (resolved === null || resolved.query !== trimmed) return LOADING_FIELD;

  return resolved.field;
}

/** Mensaje discreto bajo el input cuando la dirección no se pudo geocodificar. */
function GeocodeFeedback({ status }: { status: GeocodeStatus }) {
  if (status !== "not-found") return null;

  return (
    <p className="text-xs text-destructive" aria-live="polite">
      Dirección no encontrada
    </p>
  );
}

export default function QuoteForm({ onCoordsChange }: QuoteFormProps) {
  const [formData, setFormData] = useState<QuoteRequest>({
    origin: "",
    destination: "",
    passengers: 1,
    vehicleType: "sedan",
  });

  const origin = useGeocodedAddress(formData.origin);
  const destination = useGeocodedAddress(formData.destination);

  const originCoords = origin.coords;
  const destinationCoords = destination.coords;

  // Sincroniza las coordenadas geocodificadas con el padre (mapa).
  useEffect(() => {
    onCoordsChange?.({ origin: originCoords, destination: destinationCoords });
  }, [onCoordsChange, originCoords, destinationCoords]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    console.log("Datos del formulario:", formData);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6 rounded-xl border border-border p-6 shadow-sm bg-card">
      <div className="space-y-4">
        <div className="grid gap-2">
          <Label htmlFor="origin">Origen</Label>
          <div className="relative">
            <Input
              id="origin"
              placeholder="Ej: Altamira, Caracas"
              value={formData.origin}
              onChange={(e) => setFormData({ ...formData, origin: e.target.value })}
              className="pr-9"
              aria-invalid={origin.status === "not-found"}
              required
            />
            {origin.status === "loading" && (
              <Loader2 className="absolute top-1/2 right-3 size-4 -translate-y-1/2 animate-spin text-muted-foreground" />
            )}
          </div>
          <GeocodeFeedback status={origin.status} />
        </div>

        <div className="grid gap-2">
          <Label htmlFor="destination">Destino</Label>
          <div className="relative">
            <Input
              id="destination"
              placeholder="Ej: El Hatillo, Caracas"
              value={formData.destination}
              onChange={(e) => setFormData({ ...formData, destination: e.target.value })}
              className="pr-9"
              aria-invalid={destination.status === "not-found"}
              required
            />
            {destination.status === "loading" && (
              <Loader2 className="absolute top-1/2 right-3 size-4 -translate-y-1/2 animate-spin text-muted-foreground" />
            )}
          </div>
          <GeocodeFeedback status={destination.status} />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="grid gap-2">
            <Label htmlFor="passengers">Pasajeros</Label>
            <Input
              id="passengers"
              type="number"
              min={1}
              max={6}
              value={formData.passengers}
              onChange={(e) => setFormData({ ...formData, passengers: parseInt(e.target.value) || 1 })}
              required
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="vehicle">Vehículo</Label>
            <Select
              value={formData.vehicleType}
              onValueChange={(value) => {
                // El Select puede emitir null (ej: al limpiarse), solo actualizamos con un valor válido
                if (value) {
                  setFormData({ ...formData, vehicleType: value });
                }
              }}
            >
              <SelectTrigger id="vehicle">
                <SelectValue placeholder="Tipo de vehículo" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="moto">Moto</SelectItem>
                <SelectItem value="sedan">Sedán</SelectItem>
                <SelectItem value="suv">SUV</SelectItem>
                <SelectItem value="van">Van</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      <Button type="submit" className="w-full">
        Calcular precio
      </Button>
    </form>
  );
}
