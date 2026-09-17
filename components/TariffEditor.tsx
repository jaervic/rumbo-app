"use client";

/**
 * Editor de tarifas propias (Fase 6.2, Nivel 1): bandera de bajada, costo por km, costo por minuto y
 * tarifa mínima, con validación en vivo y dos ejemplos de precio (viaje normal y viaje corto).
 *
 * Fase 6.2.2 — "bandera" vs "tarifa mínima": son cosas distintas y se confunden. La bandera es un
 * cargo FIJO que se suma SIEMPRE (aunque el viaje sea de 100 metros); la mínima es un PISO: si el
 * cálculo total no llega, se cobra el piso. Por eso cada campo lleva su explicación debajo del label y
 * el segundo ejemplo enseña el caso corto, que es donde el piso puede entrar en juego.
 *
 * Los ejemplos se calculan con la fórmula DESNUDA (bandera + km + minutos, redondeando por concepto
 * como el motor) y NO con `estimatePrice`: así el conductor puede comprobarlos de cabeza. El precio
 * real de la app añade factores (tráfico, nocturno) y el rango de negociación ±12 %, y el pie de los
 * ejemplos lo dice. Nada de esto llama a OSRM ni a Photon.
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

/** Un viaje de ejemplo: cómo se lee, cuánto dura y si además hay que explicar el piso. */
interface SampleTrip {
  /** Cómo se lee en la lista: "Viaje de 5 km, 15 min". */
  readonly label: string;
  readonly km: number;
  readonly minutes: number;
  /** `true` en el viaje corto: además del número se dice si toca la tarifa mínima (Fase 6.2.2). */
  readonly checksFloor: boolean;
}

/**
 * Viajes de ejemplo (Fase 6.2.2), fijos y sin red: uno normal y otro MUY corto, que es donde se ve si
 * el cálculo toca la tarifa mínima.
 */
const SAMPLE_TRIPS: readonly SampleTrip[] = [
  { label: "Viaje de 5 km, 15 min", km: 5, minutes: 15, checksFloor: false },
  { label: "Viaje de 1 km, 3 min", km: 1, minutes: 3, checksFloor: true },
];

/** Dólares con 2 decimales y coma decimal: "$6,33" (a mano, sin `Intl`: hidratación). */
function formatUsd(value: number): string {
  return `$${value.toFixed(2).replace(".", ",")}`;
}

/** Redondeo a céntimos por CONCEPTO, igual que el motor: así los ejemplos suman exacto. */
function roundCents(value: number): number {
  return Math.round(value * 100) / 100;
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

/**
 * Qué significa cada campo, en palabras del conductor (Fase 6.2.2).
 *
 * Es texto de UI y vive aquí, no en `TARIFF_FIELDS` (lib/driverProfile.ts): allí están los rangos y el
 * `step`, que son datos de validación. La confusión típica es bandera contra tarifa mínima: la bandera
 * se cobra SIEMPRE al iniciar el viaje; la mínima solo entra si el viaje sale más barato que ese piso.
 */
const FIELD_HELP: Record<keyof DriverTariffConfig, string> = {
  baseFare: "Monto fijo que se cobra por iniciar el viaje.",
  costPerKm: "Cuánto cobras por cada kilómetro recorrido.",
  costPerMin: "Cuánto cobras por cada minuto de viaje.",
  minFare: "Piso del precio. Nunca cobrarás menos que esto, aunque el viaje sea muy corto.",
};

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

  /**
   * Ejemplos en vivo (Fase 6.2.2): fórmula desnuda (bandera + km + minutos), redondeando por concepto
   * como el motor. `floorApplied` marca cuándo manda la tarifa mínima, que es justo lo que hay que ver
   * para entender la diferencia con la bandera.
   */
  const samples = useMemo(
    () =>
      validation.valid
        ? SAMPLE_TRIPS.map((trip) => {
            const concepts = roundCents(
              roundCents(value.baseFare) +
                roundCents(trip.km * value.costPerKm) +
                roundCents(trip.minutes * value.costPerMin)
            );
            const floorApplied = concepts < value.minFare;

            return {
              ...trip,
              concepts,
              floorApplied,
              total: floorApplied ? roundCents(value.minFare) : concepts,
            };
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

            {/* Fase 6.2.2: qué significa este campo, justo debajo del label. `text-xs` para que no
                rompa el layout en móvil (es el mismo tamaño que el rango y los errores). */}
            <p className="text-xs text-muted-foreground">{FIELD_HELP[key]}</p>

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

      {/* Ejemplos en vivo (Fase 6.2.2): la fórmula desnuda, para que el conductor la compruebe de
          cabeza. El segundo es corto a propósito: es donde se ve si entra la tarifa mínima. */}
      <div className="space-y-2 rounded-lg border border-border bg-muted/40 px-3 py-2.5">
        {samples === null ? (
          <p className="text-xs text-muted-foreground">
            Revisa los valores marcados para ver los ejemplos.
          </p>
        ) : (
          samples.map((sample) => (
            <div key={sample.label} className="space-y-0.5">
              <p className="text-xs font-medium text-foreground">
                {sample.label} →{" "}
                <span
                  className={cn(
                    "tabular-nums",
                    sample.floorApplied && "text-amber-600 dark:text-amber-400"
                  )}
                >
                  {formatUsd(sample.total)}
                </span>
              </p>

              {/* Piso aplicado (Fase 6.2.2): se dice y se pinta en ámbar para que se entienda que ese
                  importe es el suelo, no el cálculo. */}
              {sample.floorApplied && (
                <p className="text-xs font-medium text-amber-600 dark:text-amber-400">
                  Se aplica la tarifa mínima de {formatUsd(value.minFare)}.
                </p>
              )}

              {/* En el viaje corto se dice también cuándo NO entra el piso: saber que el cálculo lo
                  supera es exactamente lo que aclara la diferencia con la bandera. */}
              {sample.checksFloor && !sample.floorApplied && (
                <p className="text-xs text-muted-foreground">
                  El cálculo ({formatUsd(sample.concepts)}) supera la tarifa mínima.
                </p>
              )}
            </div>
          ))
        )}

        <p className="text-xs text-muted-foreground">
          Ejemplos sin factores de tráfico ni rango de negociación (±12 %).
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
