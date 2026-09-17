"use client";

/**
 * Selector de vehículo (Fase 6.1a): marca → modelo → año, FILTRADO por el tipo de vehículo activo.
 *
 * ¿Qué lo diferencia de `components/VehicleCatalogPicker.tsx` (Fase 6.1)? El picker muestra el catálogo
 * completo y DEDUCE el tipo del modelo elegido; este selector parte del tipo activo y filtra: con
 * "moto" solo aparecen marcas de moto (`getBrandsByVehicleType`). Este es el selector del PERFIL DEL
 * CONDUCTOR (Fase 6.2): en el QuoteForm sigue el picker, que no necesita filtrar por tipo.
 *
 * El BORRADOR (marca → modelo → año) es de este componente y el padre solo recibe vehículos COMPLETOS
 * (`null` mientras falte algo). El borrador se guarda con el tipo con el que se creó, así que al
 * cambiar de tipo (sedán → moto) se descarta EN EL RENDER: sin `useEffect` + `setState` (que el linter
 * del compilador de React prohíbe) y sin estado duplicado que pueda quedar desincronizado.
 *
 * Mobile-first: una columna en el móvil y dos desde `sm`, con la marca en la fila completa. Triggers e
 * inputs con min-h-11 y text-base, igual que el resto del formulario (dedo y sin zoom en iOS).
 *
 * TODO (Fase 6.2): usar VehicleSelector en el perfil del conductor.
 * TODO (Fase 6.2): persistir Vehicle en localStorage.
 * TODO (Fase 7): enviar brands/models personalizados a Supabase con flags.
 * TODO (Fase 6.2+): factor de precio por antigüedad o gama, con datos reales. Mirar la gama del
 * modelo (económico / estándar / premium) contra los viajes reales.
 */

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  getBrandsByVehicleType,
  getModelsByBrand,
  getYears,
  isBrandAvailableForType,
  isKnownBrand,
  isKnownModel,
  OTHER_OPTION,
} from "@/lib/vehicleCatalog";
import type { VehicleType } from "@/types";
import type { Vehicle } from "@/types/vehicle";

export interface VehicleSelectorProps {
  /** Vehículo elegido (nulo mientras el borrador esté incompleto o venga de otro tipo). */
  value: Vehicle | null;
  /** Avisa de cada cambio: `Vehicle` completo, o `null` si todavía falta algún campo. */
  onChange: (vehicle: Vehicle | null) => void;
  /** Tipo de vehículo activo: filtra las marcas y decide cuándo se descarta el borrador. */
  vehicleType: VehicleType;
  /** Clases de la rejilla de tres campos. */
  className?: string;
}

/**
 * Borrador del selector. Guarda el `vehicleType` con el que se creó: si el tipo activo deja de ser ese
 * (o la marca ya no aplica al nuevo tipo), el borrador se descarta al pintarlo.
 */
interface VehicleDraft {
  readonly vehicleType: VehicleType;
  /** Opción del select de marca: un nombre del catálogo, `OTHER_OPTION` o "" (sin elegir). */
  readonly brandOption: string;
  /** Texto libre de marca (solo tiene valor cuando `brandOption` es `OTHER_OPTION`). */
  readonly customBrand: string;
  /** Opción del select de modelo, `OTHER_OPTION` o "" (sin elegir). */
  readonly modelOption: string;
  /** Texto libre de modelo (marca personalizada o modelo "Otro"). */
  readonly customModel: string;
}

/** Borrador vacío para un tipo de vehículo: lo que se ve al abrir y tras cada reset. */
function emptyDraft(vehicleType: VehicleType): VehicleDraft {
  return { vehicleType, brandOption: "", customBrand: "", modelOption: "", customModel: "" };
}

/**
 * Traduce el vehículo recibido al borrador inicial.
 *
 * Un vehículo que no valga para el tipo activo (o cuya marca no exista para ese tipo) se descarta: es
 * la misma regla del reset, aplicada por si el `value` llega de fuera (Fase 6.2: vehículo recuperado de
 * localStorage).
 */
function toDraft(value: Vehicle | null, vehicleType: VehicleType): VehicleDraft {
  if (value === null) return emptyDraft(vehicleType);
  if (value.vehicleType !== vehicleType || !isBrandAvailableForType(value.brand, vehicleType)) {
    return emptyDraft(vehicleType);
  }

  // Marca o modelo fuera de la tabla ⇒ se representan como "Otro" más texto libre.
  const brandIsKnown = isKnownBrand(value.brand);
  const modelIsKnown = isKnownModel(value.brand, value.model);

  return {
    vehicleType,
    brandOption: brandIsKnown ? value.brand : OTHER_OPTION,
    customBrand: brandIsKnown ? "" : value.brand,
    modelOption: modelIsKnown ? value.model : OTHER_OPTION,
    customModel: modelIsKnown ? "" : value.model,
  };
}

/**
 * Vehículo a partir del borrador y el año, o `null` mientras falte algo.
 *
 * Es la única salida del componente: así el padre nunca recibe un vehículo a medias ("Toyota" sin
 * modelo ni año) y no hay que validarlo fuera.
 */
function toVehicle(draft: VehicleDraft, year: number): Vehicle | null {
  const brand = (draft.brandOption === OTHER_OPTION ? draft.customBrand : draft.brandOption).trim();
  const model = (draft.modelOption === OTHER_OPTION ? draft.customModel : draft.modelOption).trim();
  if (brand === "" || model === "" || !Number.isInteger(year)) return null;

  return { brand, model, year, vehicleType: draft.vehicleType };
}

export default function VehicleSelector({
  value,
  onChange,
  vehicleType,
  className,
}: VehicleSelectorProps) {
  // Borrador y año. La lista de años se calcula una vez por montaje (no cambia mientras la app vive).
  const [draft, setDraft] = useState<VehicleDraft>(() => toDraft(value, vehicleType));
  const [years] = useState<number[]>(getYears);
  // Año por defecto: el más nuevo disponible (el caso normal es un vehículo en circulación), para que
  // no haya que elegirlo si no importa.
  const [year, setYear] = useState<number>(() => getYears()[0]);

  // Reset derivado (sin efectos): el borrador solo vale para el tipo con el que se creó.
  const activeDraft = draft.vehicleType === vehicleType ? draft : emptyDraft(vehicleType);

  // Opciones de la cascada. Las marcas ya traen el comodín "Otro" como última opción (está en el
  // catálogo con los cuatro tipos: ver `getBrandsByVehicleType`), así que NO se añade aquí.
  const brands = getBrandsByVehicleType(vehicleType);
  const isCustomBrand = activeDraft.brandOption === OTHER_OPTION;
  const models =
    activeDraft.brandOption === "" || isCustomBrand
      ? []
      : getModelsByBrand(activeDraft.brandOption);
  const isCustomModel = isCustomBrand || activeDraft.modelOption === OTHER_OPTION;

  const vehicle = toVehicle(activeDraft, year);

  /** Único punto de escritura: actualiza el borrador (y el año, si cambió) y avisa al padre. */
  const apply = (nextDraft: VehicleDraft, nextYear: number = year) => {
    setDraft(nextDraft);
    if (nextYear !== year) setYear(nextYear);
    onChange(toVehicle(nextDraft, nextYear));
  };

  const handleBrandChange = (next: string | null) => {
    // Base UI emite null al limpiar el select: sin marca no hay nada que hacer.
    if (next === null) return;
    // Cambiar de marca descarta el modelo: los modelos de una marca no valen para otra (y si la marca
    // es "Otro", el modelo pasa a texto libre).
    apply({ ...activeDraft, brandOption: next, customBrand: "", modelOption: "", customModel: "" });
  };

  const handleCustomBrandChange = (text: string) => {
    apply({ ...activeDraft, customBrand: text, modelOption: "", customModel: "" });
  };

  const handleModelChange = (next: string | null) => {
    if (next === null) return;
    apply({ ...activeDraft, modelOption: next, customModel: "" });
  };

  const handleCustomModelChange = (text: string) => {
    apply({ ...activeDraft, customModel: text });
  };

  const handleYearChange = (next: string | null) => {
    if (next === null) return;
    const parsedYear = Number.parseInt(next, 10);
    if (!Number.isInteger(parsedYear)) return;
    apply(activeDraft, parsedYear);
  };

  return (
    <div className={cn("grid gap-3 sm:grid-cols-2", className)}>
      {/* MARCA — fila completa: es el primer paso de la cascada y filtra el resto. Las opciones salen
          de `getBrandsByVehicleType`, así que con "moto" no aparece ninguna marca de auto. */}
      <div className="grid min-w-0 gap-2 sm:col-span-2">
        <Label htmlFor="vehicle-selector-brand">Marca</Label>
        <Select
          value={activeDraft.brandOption === "" ? null : activeDraft.brandOption}
          onValueChange={handleBrandChange}
        >
          <SelectTrigger
            id="vehicle-selector-brand"
            className="w-full min-h-11 text-base md:min-h-0 md:text-sm"
          >
            <SelectValue placeholder="Elige la marca" />
          </SelectTrigger>
          <SelectContent side="bottom" sideOffset={4}>
            {brands.map((brand) => (
              <SelectItem key={brand} value={brand}>
                {brand}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Marca personalizada ("Otro" en el catálogo): el select se queda visible con "Otro" marcado
            para poder volver a la lista sin recargar nada. */}
        {isCustomBrand && (
          <Input
            id="vehicle-selector-brand-custom"
            aria-label="Escribe la marca"
            placeholder="Escribe la marca (ej. Jetour)"
            value={activeDraft.customBrand}
            onChange={(e) => handleCustomBrandChange(e.target.value)}
            autoComplete="off"
            className="min-h-11 text-base md:min-h-0 md:text-sm"
          />
        )}
      </div>

      {/* MODELO — deshabilitado hasta que haya marca. Con marca personalizada no hay lista que mostrar,
          así que va directo al texto libre. */}
      <div className="grid min-w-0 gap-2">
        <Label htmlFor={isCustomBrand ? "vehicle-selector-model-custom" : "vehicle-selector-model"}>
          Modelo
        </Label>

        {!isCustomBrand && (
          <Select
            value={activeDraft.modelOption === "" ? null : activeDraft.modelOption}
            onValueChange={handleModelChange}
            disabled={activeDraft.brandOption === ""}
          >
            <SelectTrigger
              id="vehicle-selector-model"
              className="w-full min-h-11 text-base md:min-h-0 md:text-sm"
            >
              <SelectValue
                placeholder={activeDraft.brandOption === "" ? "Primero la marca" : "Elige el modelo"}
              />
            </SelectTrigger>
            <SelectContent side="bottom" sideOffset={4}>
              {models.map((model) => (
                <SelectItem key={model} value={model}>
                  {model}
                </SelectItem>
              ))}
              {/* "Otro" también en el modelo: el catálogo es corto y un modelo que falte no puede
                  dejar al conductor sin registrar su vehículo. */}
              <SelectItem value={OTHER_OPTION}>{OTHER_OPTION}</SelectItem>
            </SelectContent>
          </Select>
        )}

        {isCustomModel && (
          <Input
            id="vehicle-selector-model-custom"
            aria-label="Escribe el modelo"
            placeholder="Escribe el modelo"
            value={activeDraft.customModel}
            onChange={(e) => handleCustomModelChange(e.target.value)}
            autoComplete="off"
            className="min-h-11 text-base md:min-h-0 md:text-sm"
          />
        )}
      </div>

      {/* AÑO — siempre habilitado: no depende de la marca ni del modelo (`getYears`). */}
      <div className="grid min-w-0 gap-2">
        <Label htmlFor="vehicle-selector-year">Año</Label>
        <Select value={String(year)} onValueChange={handleYearChange}>
          <SelectTrigger
            id="vehicle-selector-year"
            className="w-full min-h-11 text-base md:min-h-0 md:text-sm"
          >
            <SelectValue placeholder="Elige el año" />
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

      {/* Confirmación: el vehículo completo que se comunica al padre, o lo que falta. min-h-4 reserva
          el alto para no empujar el resto del formulario al aparecer. */}
      <p className="min-h-4 text-xs text-muted-foreground sm:col-span-2" aria-live="polite">
        {vehicle === null
          ? "Elige marca, modelo y año para registrar tu vehículo."
          : `${vehicle.brand} ${vehicle.model} ${vehicle.year}`}
      </p>
    </div>
  );
}
