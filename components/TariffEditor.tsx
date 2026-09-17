"use client";

/**
 * Editor de tarifas propias (Fase 6.2, Nivel 1): bandera de bajada, costo por km, costo por minuto y
 * tarifa mínima, con validación en vivo y un ejemplo de precio.
 *
 * El ejemplo se calcula con `estimatePrice` sobre una ruta FICTICIA (5 km, 15 min, 1 pasajero): el
 * motor es puro, así que no hay ninguna llamada a OSRM ni a Photon desde aquí. Con 1 pasajero no hay
 * recargo por pasajero, así que el número depende solo de las tarifas que se están editando.
 *
 * El editor guarda NÚMEROS en el padre (los que consume el motor) pero conserva un borrador de texto
 * por campo: un input numérico controlado con números no deja escribir "0." ni vaciar el campo. Un
 * valor imposible llega al padre como `NaN` y `validateTariff` lo marca en rojo: nunca se guarda.
 *
 * TODO (Nivel 2): exponer factores avanzados (pasajeros, nocturno, rango).
 */

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import {
  DEFAULT_TARIFF,
  TARIFF_FIELDS,
  TARIFF_KEYS,
  validateTariff,
  type DriverTariffConfig,
} from "@/lib/driverProfile";
import { estimatePrice } from "@/lib/pricing";

/** Ruta ficticia del ejemplo (Fase 6.2): kilómetros y minutos fijos, sin red. */
const PREVIEW_KM = 5;
const PREVIEW_MIN = 15;

/** Dólares con 2 decimales y coma decimal: "$6,33" (a mano, sin `Intl`: hidratación). */
function formatUsd(value: number): string {
  return `$${value.toFixed(2).replace(".", ",")}`;
}

/** Rango del campo tal y como lo lee el conductor: "$0,50 – $10,00". */
function formatRange(min: number, max: number): string {
  return `${formatUsd(min)} – ${formatUsd(max)}`;
}

/**
 * Texto → número del borrador. Acepta coma decimal ("0,55") porque es como se escribe en Venezuela.
 * Un campo vacío o con basura da `NaN`, que la validación marca como error.
 */
function toNumber(text: string): number {
  return Number.parseFloat(text.replace(",", "."));
}

/** Borradores de texto de los cuatro campos, a partir de una tarifa. */
function toDrafts(tariff: DriverTariffConfig): Record<keyof DriverTariffConfig, string> {
  return {
    baseFare: String(tariff.baseFare),
    costPerKm: String(tariff.costPerKm),
    costPerMin: String(tariff.costPerMin),
    minFare: String(tariff.minFare),
  };
}

export interface TariffEditorProps {
  /** Tarifa actual (la del perfil mientras se edita). */
  value: DriverTariffConfig;
  /** Avisa de cada cambio, ya con números (un campo inválido llega como `NaN`). */
  onChange: (tariff: DriverTariffConfig) => void;
  /** Clases del bloque completo. */
  className?: string;
}

export default function TariffEditor({ value, onChange, className }: TariffEditorProps) {
  const [drafts, setDrafts] = useState<Record<keyof DriverTariffConfig, string>>(() =>
    toDrafts(value)
  );

  const validation = validateTariff(value);

  const preview = useMemo(
    () =>
      validation.valid
        ? estimatePrice({
            distanceKm: PREVIEW_KM,
            durationIdealMin: PREVIEW_MIN,
            vehicleType: "sedan",
            passengers: 1,
            tariffOverride: value,
          })
        : null,
    [validation.valid, value]
  );

  const handleFieldChange = (key: keyof DriverTariffConfig, text: string) => {
    setDrafts((current) => ({ ...current, [key]: text }));
    onChange({ ...value, [key]: toNumber(text) });
  };

  const handleRestore = () => {
    setDrafts(toDrafts(DEFAULT_TARIFF));
    onChange(DEFAULT_TARIFF);
  };

  return (
    <div className={cn("space-y-3", className)}>
      {TARIFF_KEYS.map((key) => {
        const field = TARIFF_FIELDS[key];
        const error = validation.errors[key];
        const inputId = `tariff-${key}`;

        return (
          <div key={key} className="grid gap-1.5">
            <Label htmlFor={inputId}>
              {field.label}
              <span className="ml-auto text-xs font-normal text-muted-foreground">USD</span>
            </Label>

            <div className="relative">
              {/* Símbolo de moneda fijo a la izquierda; el input lleva padding para no pisarlo. */}
              <span
                aria-hidden="true"
                className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-sm text-muted-foreground"
              >
                $
              </span>
              <Input
                id={inputId}
                type="number"
                inputMode="decimal"
                step={field.step}
                min={field.min}
                max={field.max}
                value={drafts[key]}
                onChange={(event) => handleFieldChange(key, event.target.value)}
                // `aria-invalid` pinta el borde rojo (las clases ya están en el Input de shadcn) y lo
                // anuncia el lector de pantalla; el mensaje va en el párrafo de abajo.
                aria-invalid={error !== undefined}
                aria-describedby={`${inputId}-help`}
                className="min-h-11 pl-7 text-base md:min-h-0 md:text-sm"
              />
            </div>

            {/* Ayuda y error comparten sitio: el rango siempre visible (para no adivinarlo) y el
                mensaje en rojo cuando el valor se sale. */}
            <p
              id={`${inputId}-help`}
              role={error === undefined ? undefined : "alert"}
              className={cn(
                "text-xs",
                error === undefined ? "text-muted-foreground" : "text-destructive"
              )}
            >
              {error ?? `Entre ${formatRange(field.min, field.max)}`}
            </p>
          </div>
        );
      })}

      {/* Ejemplo en vivo: se recalcula a cada tecla con el motor real, sin red (ruta ficticia). */}
      <div className="rounded-lg border border-border bg-muted/40 px-3 py-2">
        <p className="text-xs font-medium text-foreground">
          Ejemplo: {PREVIEW_KM} km, {PREVIEW_MIN} min, 1 pasajero →{" "}
          <span className="tabular-nums">
            {preview === null ? "—" : formatUsd(preview.priceAvg)}
          </span>
        </p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {preview === null
            ? "Revisa los valores marcados para ver el ejemplo."
            : "Con el tráfico de esta hora; el rango de negociación (±12 %) no se incluye."}
        </p>
      </div>

      <Button
        type="button"
        variant="outline"
        onClick={handleRestore}
        className="min-h-11 w-full md:min-h-0"
      >
        Restaurar valores por defecto
      </Button>
    </div>
  );
}
