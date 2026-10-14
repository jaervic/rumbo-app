"use client";

/**
 * Búsqueda de conductores cercanos (P6). Pide la ubicación al usuario y consulta la Server Action
 * `findNearbyDrivers` (que llama a la RPC PostGIS). Muestra los resultados por cercanía.
 *
 * La geolocalización se pide SOLO al pulsar (nunca al montar), como en el resto de la app.
 */

import { useEffect, useState, useTransition } from "react";
import { Loader2, LocateFixed, Navigation } from "lucide-react";
import { Button } from "@/components/ui/button";
import DriverCard from "@/components/DriverCard";
import InlineMessage from "@/components/InlineMessage";
import { useUserLocation } from "@/hooks/useUserLocation";
import { findNearbyDrivers } from "@/lib/actions/drivers";
import type { NearbyDriver } from "@/lib/drivers";

export default function NearbyDrivers() {
  const { location, requestLocation, loading: locating, error: locationError } = useUserLocation();
  const [started, setStarted] = useState(false);
  const [drivers, setDrivers] = useState<NearbyDriver[] | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // Cuando ya se pidió la ubicación y llega, se lanza la búsqueda. El setState va en el callback
  // asíncrono, no en el cuerpo del efecto (regla react-hooks/set-state-in-effect).
  useEffect(() => {
    if (!started || location === null) return;

    let active = true;
    startTransition(async () => {
      const result = await findNearbyDrivers({ lat: location.lat, lng: location.lng, radiusKm: 10 });
      if (!active) return;

      if (result.ok) {
        setDrivers(result.drivers);
        setMessage(null);
      } else {
        setMessage(result.error);
      }
    });

    return () => {
      active = false;
    };
  }, [started, location]);

  const handleStart = () => {
    setMessage(null);
    setStarted(true);
    if (location === null) requestLocation();
  };

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
          <Navigation className="size-4 text-muted-foreground" aria-hidden="true" />
          Conductores cerca de ti
        </h2>
        <Button type="button" variant="outline" size="sm" onClick={handleStart} disabled={pending || locating}>
          {pending || locating ? (
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          ) : (
            <LocateFixed className="size-4" aria-hidden="true" />
          )}
          {locating ? "Ubicando…" : drivers === null ? "Buscar cerca de mí" : "Actualizar"}
        </Button>
      </div>

      {locating && <p className="text-xs text-muted-foreground">Obteniendo tu ubicación…</p>}

      {!locating && started && locationError !== null && (
        <InlineMessage variant="error">
          No pudimos obtener tu ubicación. Revisa los permisos del navegador.
        </InlineMessage>
      )}

      {message !== null && <InlineMessage variant="error">{message}</InlineMessage>}

      {drivers !== null &&
        (drivers.length === 0 ? (
          <InlineMessage variant="info">
            No hay conductores publicados en tu zona por ahora.
          </InlineMessage>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {drivers.map((driver) => (
              <DriverCard key={driver.id} driver={driver} distanceKm={driver.distanceKm} />
            ))}
          </div>
        ))}
    </section>
  );
}
