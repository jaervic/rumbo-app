"use client";

/**
 * Selector del catálogo de vehículos (Fase 6.1): marca → modelo → año, en cascada.
 *
 * Es un componente aparte del select de "Tipo de vehículo" de QuoteForm por dos razones:
 * 1. La cascada tiene estado propio (qué marca está elegida) que no le sirve a nadie más, así que
 *    QuoteForm no se llena de estado de UI.
 * 2. El catálogo es DATOS (lib/vehicleCatalog.ts): si mañana sale de Supabase en lugar de la tabla
 *    local, este componente es el único de la UI que cambia.
 *
 * Aquí NO se elige el tipo de vehículo: se DEDUCE del modelo (QuoteForm llama a
 * `getVehicleTypeFromSelection`), para que la ficha del vehículo y lo que tarifa el precio no puedan
 * contradecirse. La línea de resumen del final muestra esa deducción.
 *
 * Todo es opcional por diseño: "Otra marca / no está en la lista" devuelve el control al select
 * manual de tipo. Un conductor cuyo carro no esté en el catálogo no puede quedarse sin cotizar.
 *
 * Mobile-first: una columna en el móvil (marca, modelo y año apilados, con sitio para escribir
 * "Land Cruiser Prado") y dos desde `sm`, con la marca ocupando la fila completa. Los triggers
 * llevan min-h-11 y text-base por el mismo motivo que los demás campos: dedo y sin zoom en iOS.
 */

import { useState } from "react";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatVehicleType } from "@/lib/pricing";
import { cn } from "@/lib/utils";
import {
  describeVehicle,
  getVehicleModelYears,
  getVehicleModelsByBrand,
  getVehicleTypeFromSelection,
  VEHICLE_BRANDS,
} from "@/lib/vehicleCatalog";
import type { VehicleSelection } from "@/types";

/**
 * Valor centinela de la opción "Otra marca".
 *
 * El Select de Base UI trabaja con valores string y `null` ya significa "sin elegir", así que salir
 * del catálogo necesita un valor propio que no pueda colisionar con un id (los ids son slugs).
 */
const OTHER_BRAND_VALUE = "__other__";

/**
 * `items` del Select de marca (Fase 8.1): Base UI solo pinta la ETIQUETA del item seleccionado si el
 * Root recibe el mapa valor → etiqueta; sin él, el trigger renderiza el valor CRUDO y el campo mostraba
 * el id del catálogo ("toyota"). Se construye una sola vez, a nivel de módulo, para que la identidad no
 * cambie en cada render.
 */
const BRAND_ITEMS: Record<string, string> = {
  ...Object.fromEntries(VEHICLE_BRANDS.map((brand) => [brand.id, brand.name])),
  [OTHER_BRAND_VALUE]: "Otra marca / no está en la lista",
};

export interface VehicleCatalogPickerProps {
  /** Selección completa actual (null = sin elegir, o el vehículo no está en el catálogo). */
  value: VehicleSelection | null;
  /** Avisa de cada selección COMPLETA y de cada limpieza (null). */
  onChange: (selection: VehicleSelection | null) => void;
  /** Clases de la rejilla de tres campos. */
  className?: string;
}

export default function VehicleCatalogPicker({
  value,
  onChange,
  className,
}: VehicleCatalogPickerProps) {
  // El borrador (marca → modelo → año) es de ESTE componente: el padre solo recibe selecciones
  // completas. Por eso no hay que sincronizar nada hacia dentro (ni `useEffect` + setState ni el
  // patrón de resetear estado en render): la única forma de vaciar la selección es "Otra marca", que
  // ya vacía el borrador aquí. Se inicializa desde `value` para que un vehículo ya elegido (Fase 7:
  // cotización guardada) se vea tal cual al montar.
  const [brandId, setBrandId] = useState<string | null>(value?.brandId ?? null);
  const [modelId, setModelId] = useState<string | null>(value?.modelId ?? null);
  const [year, setYear] = useState<number | null>(value?.year ?? null);

  // Fuentes de cada paso de la cascada: sin marca no hay modelos, sin modelo no hay años.
  const models = brandId === null ? [] : getVehicleModelsByBrand(brandId);
  const years = modelId === null ? [] : getVehicleModelYears(modelId);
  // Etiquetas del Select de modelo (mismo motivo que BRAND_ITEMS): el trigger debe decir "Corolla",
  // no el id "toyota-corolla".
  const modelItems: Record<string, string> = Object.fromEntries(
    models.map((model) => [model.id, model.name])
  );
  // Solo se describe lo que el padre aceptó como selección completa (ver `onChange`).
  const description = value === null ? null : describeVehicle(value);
  const vehicleType = value === null ? null : getVehicleTypeFromSelection(value);

  const handleBrandChange = (next: string | null) => {
    // Base UI emite null al limpiar el select: sin marca no hay nada que hacer.
    if (next === null) return;

    if (next === OTHER_BRAND_VALUE) {
      setBrandId(null);
      setModelId(null);
      setYear(null);
      // El tipo de vehículo vuelve a mandar: el usuario lo elige en su select, sin que esta cascada
      // se lo pise.
      onChange(null);
      return;
    }

    setBrandId(next);
    setModelId(null);
    setYear(null);
    // Selección incompleta: todavía no hay vehículo que anunciar ni tipo que deducir.
    onChange(null);
  };

  /**
   * Al elegir modelo se fija el año MÁS NUEVO disponible: el caso normal es un carro en circulación,
   * así que bastan dos toques (marca → modelo) para que el tipo quede deducido. Cambiar el año es un
   * toque más, nunca un requisito.
   */
  const handleModelChange = (next: string | null) => {
    if (next === null || brandId === null) return;

    const modelYears = getVehicleModelYears(next);
    if (modelYears.length === 0) return;

    const newestYear = modelYears[0];
    setModelId(next);
    setYear(newestYear);
    onChange({ brandId, modelId: next, year: newestYear });
  };

  const handleYearChange = (next: string | null) => {
    if (next === null || brandId === null || modelId === null) return;

    const parsedYear = Number.parseInt(next, 10);
    if (!Number.isInteger(parsedYear)) return;

    setYear(parsedYear);
    onChange({ brandId, modelId, year: parsedYear });
  };

  return (
    <div className={cn("grid gap-3 sm:grid-cols-2", className)}>
      {/* La marca ocupa la fila completa: es el primer paso de la cascada y desde ahí manda el resto. */}
      <div className="grid min-w-0 gap-2 sm:col-span-2">
        <Label htmlFor="vehicle-brand">Marca</Label>
        <Select value={brandId} items={BRAND_ITEMS} onValueChange={handleBrandChange}>
          <SelectTrigger
            id="vehicle-brand"
            className="w-full min-h-11 text-base md:min-h-0 md:text-sm"
          >
            <SelectValue placeholder="Elige la marca" />
          </SelectTrigger>
          <SelectContent side="bottom" sideOffset={4}>
            {VEHICLE_BRANDS.map((brand) => (
              <SelectItem key={brand.id} value={brand.id}>
                {brand.name}
              </SelectItem>
            ))}
            {/* Salida del catálogo: con la lista cerrada, un carro que no esté sería un callejón sin
                salida. Al elegirla vuelve a mandar el select manual de tipo de vehículo. */}
            <SelectItem value={OTHER_BRAND_VALUE}>Otra marca / no está en la lista</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="grid min-w-0 gap-2">
        <Label htmlFor="vehicle-model">Modelo</Label>
        <Select
          value={modelId}
          items={modelItems}
          onValueChange={handleModelChange}
          disabled={brandId === null}
        >
          <SelectTrigger
            id="vehicle-model"
            className="w-full min-h-11 text-base md:min-h-0 md:text-sm"
          >
            <SelectValue placeholder={brandId === null ? "Primero la marca" : "Elige el modelo"} />
          </SelectTrigger>
          <SelectContent side="bottom" sideOffset={4}>
            {models.map((model) => (
              <SelectItem key={model.id} value={model.id}>
                {model.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid min-w-0 gap-2">
        <Label htmlFor="vehicle-year">Año</Label>
        {/* El año se pasa como string porque el Select solo admite valores string; se convierte al
            soltar el valor (handleYearChange) para no guardar "2015" como texto en la selección. */}
        <Select
          value={year === null ? null : String(year)}
          onValueChange={handleYearChange}
          disabled={modelId === null}
        >
          <SelectTrigger
            id="vehicle-year"
            className="w-full min-h-11 text-base md:min-h-0 md:text-sm"
          >
            <SelectValue placeholder={modelId === null ? "Primero el modelo" : "Elige el año"} />
          </SelectTrigger>
          <SelectContent side="bottom" sideOffset={4}>
            {years.map((candidate) => (
              <SelectItem key={candidate} value={String(candidate)}>
                {candidate}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* La confirmación es la que explica que el catálogo mueve el precio: "Sedán" es lo que se
          tarifa. min-h-4 reserva el alto para que el resumen no empuje el resto del formulario al
          aparecer, y aria-live lo anuncia al cambiar. */}
      <p className="min-h-4 text-xs text-muted-foreground sm:col-span-2" aria-live="polite">
        {description !== null && vehicleType !== null
          ? `${description} · ${formatVehicleType(vehicleType)}`
          : "Opcional: con marca y modelo se ajusta solo el tipo de vehículo."}
      </p>
    </div>
  );
}
