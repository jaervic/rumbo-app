/**
 * Tarjeta del precio estimado (Fase 6): rango recomendado, contexto del viaje y desglose.
 *
 * Sustituye a RouteInfoCard: con el precio en vivo, distancia y duración ya no son un resultado en
 * sí mismo sino el CONTEXTO del precio, y mostrarlos en dos tarjetas separadas duplicaría datos y
 * ocuparía el doble de alto en un móvil.
 *
 * El desglose usa `<details>` nativo en lugar de un componente de acordeón: no depende de ningún
 * paquete, funciona sin JavaScript y es accesible de fábrica (el navegador ya expone el estado
 * expandido/colapsado). En un móvil el resumen colapsado mide min-h-11 (44px) para acertar con el
 * dedo, y las filas del desglose envuelven el texto en vez de truncarlo.
 *
 * Estados, en orden de prioridad:
 * 1. Calculando ruta (con coordenadas ya elegidas).
 * 2. Precio disponible.
 * 3. Sin coordenadas → "Completa origen y destino".
 * 4. Con coordenadas pero sin ruta (OSRM falló) → "No se pudo calcular la ruta".
 * 5. Con ruta pero sin precio (más pasajeros que la capacidad del vehículo, o datos inválidos) →
 *    "Esta combinación no es posible".
 *
 * No recibe `error` de useRoute a propósito: "falló la petición" y "no hay ruta" se explican con el
 * mismo texto, así que `route === null` ya distingue el caso y la prop sobraba.
 */

import type { Ref } from "react";
import { ChevronDown, Clock, Loader2, Ruler, TriangleAlert, Users, Wallet } from "lucide-react";
import { VEHICLE_LABELS, type PriceEstimate } from "@/lib/pricing";
import type { RouteResult } from "@/lib/routing";
import { cn } from "@/lib/utils";
import type { QuoteRequest } from "@/types";

export interface PriceCardProps {
  /** Cotización calculada (null = falta ruta, faltan coordenadas o combinación imposible). */
  price: PriceEstimate | null;
  /** Ruta que alimentó el precio. Necesaria para el contexto (km) y para distinguir los estados. */
  route: RouteResult | null;
  /** Lo que el usuario pidió: se usa el vehículo y el número de pasajeros para el contexto. */
  request: QuoteRequest;
  /** OSRM está calculando la ruta de las coordenadas actuales. */
  loading: boolean;
  /** true solo con origen Y destino elegidos: distingue "aún no hay datos" de "falló". */
  hasCoords: boolean;
  /** Clases de posición/orden (la página la pone debajo del mapa en móvil y arriba en desktop). */
  className?: string;
  /** Ref al contenedor: app/page.tsx la enfoca al pulsar el botón del formulario. */
  ref?: Ref<HTMLElement>;
}

/**
 * Dólares con 2 decimales: "$6.33".
 *
 * Se formatea a mano (igual que formatDistance) y NO con Intl/toLocaleString: el HTML del servidor
 * y el del cliente deben coincidir carácter a carácter o React reporta un error de hidratación.
 */
function formatUsd(value: number): string {
  return `$${value.toFixed(2)}`;
}

/** Kilómetros con 2 decimales y coma decimal (es-VE). */
function formatDistance(distanceKm: number): string {
  return distanceKm.toFixed(2).replace(".", ",");
}

/** Multiplicador de tarifa: 1.05 → "×1,05". */
function formatMultiplier(factor: number): string {
  return `×${factor.toFixed(2).replace(".", ",")}`;
}

/** Recargo expresado en porcentaje: 1.15 → "+15 %". */
function formatFactor(factor: number): string {
  return `+${Math.round((factor - 1) * 100)} %`;
}

/** Redondeo a céntimos para las diferencias que se muestran (evita 0,21999999999999997). */
function roundCents(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Fila del desglose: etiqueta a la izquierda (puede envolver) e importe a la derecha. */
function BreakdownRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="min-w-0 text-muted-foreground">{label}</dt>
      <dd className="shrink-0 font-medium tabular-nums text-foreground">{value}</dd>
    </div>
  );
}

interface PriceContentProps {
  price: PriceEstimate;
  route: RouteResult;
  passengers: number;
  vehicleLabel: string;
}

/** Contenido con precio: rango, contexto del viaje y desglose colapsable. */
function PriceContent({ price, route, passengers, vehicleLabel }: PriceContentProps) {
  // Diferencia que aporta el viaje mínimo para que las filas del desglose sumen el precio final.
  const minimumFareDelta = roundCents(price.priceAvg - price.subtotal);

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <p className="flex items-center gap-1.5 text-xs font-medium tracking-wide text-muted-foreground uppercase">
          <Wallet className="size-4 shrink-0" aria-hidden="true" />
          Precio estimado (USD)
        </p>
        {price.minimumFareApplied && (
          <p className="text-xs text-muted-foreground">viaje mínimo aplicado</p>
        )}
      </div>

      {/* El rango es el mensaje principal: es lo que el conductor cobra y puede negociar. */}
      <p className="text-2xl leading-tight font-semibold tabular-nums text-foreground">
        {formatUsd(price.priceMin)} – {formatUsd(price.priceMax)}
      </p>

      <p className="text-muted-foreground">
        Recomendado:{" "}
        <span className="text-base font-semibold tabular-nums text-foreground">
          {formatUsd(price.priceAvg)}
        </span>
      </p>

      <ul className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
        <li className="flex items-center gap-1.5" title="Distancia por carretera (OSRM).">
          <Ruler className="size-3.5 shrink-0" aria-hidden="true" />
          {formatDistance(route.distanceKm)} km
        </li>
        <li
          className="flex items-center gap-1.5"
          title="Duración con el tráfico previsto para la hora de salida."
        >
          <Clock className="size-3.5 shrink-0" aria-hidden="true" />
          {price.durationAdjustedMin} min
        </li>
        <li className="flex items-center gap-1.5">
          <Users className="size-3.5 shrink-0" aria-hidden="true" />
          {vehicleLabel} · {passengers} {passengers === 1 ? "pasajero" : "pasajeros"}
        </li>
      </ul>

      <details className="group rounded-md border border-border bg-muted/40">
        <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 px-3 py-2 font-medium select-none [&::-webkit-details-marker]:hidden">
          Ver desglose
          <ChevronDown
            className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180"
            aria-hidden="true"
          />
        </summary>

        <dl className="space-y-1.5 border-t border-border px-3 py-2.5 text-xs">
          <BreakdownRow label="Bandera de bajada" value={formatUsd(price.baseFare)} />
          <BreakdownRow
            label={`Distancia (${formatDistance(route.distanceKm)} km)`}
            value={formatUsd(price.distanceFare)}
          />
          <BreakdownRow
            label={`Tiempo (${price.durationAdjustedMin} min · tráfico ${formatMultiplier(price.trafficFactor)})`}
            value={formatUsd(price.timeFare)}
          />
          {price.passengerSurcharge > 0 && (
            <BreakdownRow
              label={`Pasajeros adicionales (${passengers - 1})`}
              value={formatUsd(price.passengerSurcharge)}
            />
          )}
          {price.nightSurcharge > 0 && (
            <BreakdownRow
              label={`Recargo nocturno (${formatFactor(price.nightSurchargeFactor)})`}
              value={formatUsd(price.nightSurcharge)}
            />
          )}
          {price.minimumFareApplied && (
            <BreakdownRow
              label={`Viaje mínimo (${formatUsd(price.minimumFare)})`}
              value={formatUsd(minimumFareDelta)}
            />
          )}

          {/* Cierre del desglose: la suma de las filas de arriba da exactamente este importe. */}
          <div className="flex items-baseline justify-between gap-3 border-t border-border pt-1.5 text-sm">
            <dt className="font-medium text-foreground">Precio estimado</dt>
            <dd className="font-semibold tabular-nums text-foreground">{formatUsd(price.priceAvg)}</dd>
          </div>
        </dl>

        <p className="border-t border-border px-3 py-2 text-xs text-muted-foreground">
          El rango (±{Math.round(price.priceSpread * 100)} %) deja margen para negociar según la
          demanda. Precio en dólares; la conversión a bolívares llegará en una próxima versión.
        </p>
      </details>
    </div>
  );
}
/**
 * Tarjeta del precio del viaje. Ver el estado que muestra en el comentario de cabecera.
 *
 * `tabIndex={-1}` la hace enfocable por script (el botón "Ver precio estimado" del formulario la
 * enfoca para que el lector de pantalla anuncie el resultado); no entra en el orden de tabulación.
 */
export default function PriceCard({
  price,
  route,
  request,
  loading,
  hasCoords,
  className,
  ref,
}: PriceCardProps) {
  return (
    <section
      ref={ref}
      tabIndex={-1}
      aria-label="Precio estimado del viaje"
      aria-live="polite"
      className={cn(
        "w-full rounded-lg border border-border bg-card p-3 text-sm shadow-sm focus-visible:outline-2 focus-visible:outline-offset-2 md:max-w-md",
        className
      )}
    >
      {loading && hasCoords ? (
        <p className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="size-4 shrink-0 animate-spin" aria-hidden="true" />
          Calculando ruta y precio...
        </p>
      ) : price !== null && route !== null ? (
        <PriceContent
          price={price}
          route={route}
          passengers={request.passengers}
          vehicleLabel={VEHICLE_LABELS[request.vehicleType]}
        />
      ) : !hasCoords ? (
        <p className="flex items-center gap-2 text-muted-foreground">
          <TriangleAlert className="size-4 shrink-0" aria-hidden="true" />
          Completa origen y destino para ver el precio.
        </p>
      ) : route === null ? (
        <p className="flex items-center gap-2 text-destructive">
          <TriangleAlert className="size-4 shrink-0" aria-hidden="true" />
          No se pudo calcular la ruta
        </p>
      ) : (
        <p className="flex items-center gap-2 text-muted-foreground">
          <TriangleAlert className="size-4 shrink-0" aria-hidden="true" />
          Esta combinación no es posible. Revisa el vehículo y el número de pasajeros.
        </p>
      )}
    </section>
  );
}


