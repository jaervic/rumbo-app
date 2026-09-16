"use client";

import { useEffect, useRef, useState } from "react";
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
import { cn } from "@/lib/utils";
import {
  autocompleteAddress,
  MAX_SUGGESTION_LIMIT,
  MIN_QUERY_LENGTH,
  GeocodeResult,
} from "@/lib/geocoding";
import { Coords, QuoteCoords, QuoteRequest } from "@/types";

/** Debounce de escritura antes de pedir sugerencias a Photon. */
const GEOCODE_DEBOUNCE_MS = 500;

export interface QuoteFormProps {
  /** Notifica al padre las coordenadas elegidas en el autocompletado. */
  onCoordsChange?: (coords: QuoteCoords) => void;
}

interface AddressAutocompleteProps {
  id: string;
  label: string;
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
  onSelect: (coords: Coords) => void;
}

interface SuggestionState {
  query: string;
  results: GeocodeResult[];
}

/**
 * Input de dirección con autocompletado sobre Photon (hasta 5 sugerencias).
 * Sigue el patrón WAI-ARIA combobox: el foco permanece en el input y el
 * highlight se comunica con aria-activedescendant (↑/↓ mueven, Enter selecciona,
 * Escape cierra). El dropdown se cierra al hacer clic fuera del contenedor.
 */
function AddressAutocomplete({
  id,
  label,
  placeholder,
  value,
  onChange,
  onSelect,
}: AddressAutocompleteProps) {
  const [search, setSearch] = useState<SuggestionState | null>(null);
  const [selectedValue, setSelectedValue] = useState<string | null>(null);
  const [isDismissed, setIsDismissed] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);

  const trimmed = value.trim();
  const isQueryValid = trimmed.length >= MIN_QUERY_LENGTH;
  // Texto fijado por una selección: no se vuelve a buscar ni se reabre la lista.
  const isPinned = selectedValue !== null && selectedValue === trimmed;
  const isSettled = search !== null && search.query === trimmed;
  const settledResults: GeocodeResult[] =
    search !== null && search.query === trimmed ? search.results : [];

  const isLoading = isQueryValid && !isPinned && !isSettled;
  const results: GeocodeResult[] = isPinned ? [] : settledResults;
  const hasNoResults =
    isQueryValid &&
    !isPinned &&
    isSettled &&
    results.length === 0 &&
    trimmed.length > MIN_QUERY_LENGTH;
  const isDropdownVisible = !isDismissed && (results.length > 0 || hasNoResults);

  const activeIndex =
    highlightedIndex >= 0 && highlightedIndex < results.length ? highlightedIndex : -1;
  const listboxId = `${id}-listbox`;

  // Búsqueda con debounce: el setState ocurre dentro del callback del timer
  // (asíncrono), nunca en el cuerpo del efecto.
  useEffect(() => {
    if (!isQueryValid || isPinned) return;

    let cancelled = false;

    const timer = setTimeout(() => {
      void autocompleteAddress(trimmed, MAX_SUGGESTION_LIMIT).then((list) => {
        if (cancelled) return;

        setSearch({ query: trimmed, results: list });
        setHighlightedIndex(-1);
      });
    }, GEOCODE_DEBOUNCE_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [isQueryValid, isPinned, trimmed]);

  // Cierra el dropdown al hacer clic fuera (suscripción a un sistema externo).
  useEffect(() => {
    if (!isDropdownVisible) return;

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (containerRef.current?.contains(target)) return;

      setIsDismissed(true);
      setHighlightedIndex(-1);
    };

    document.addEventListener("pointerdown", handlePointerDown);

    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [isDropdownVisible]);

  const selectSuggestion = (suggestion: GeocodeResult) => {
    // El input se rellena con el nombre corto ("Sambil Chacao") para que siga legible.
    onChange(suggestion.shortName);
    onSelect([suggestion.lat, suggestion.lng]);
    setSelectedValue(suggestion.shortName);
    setIsDismissed(false);
    setHighlightedIndex(-1);
  };

  const handleInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setSelectedValue(null); // cualquier edición invalida la selección anterior
    setIsDismissed(false);
    setHighlightedIndex(-1);
    onChange(event.target.value);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Escape") {
      setIsDismissed(true);
      setHighlightedIndex(-1);
      return;
    }

    if (!isDropdownVisible || results.length === 0) return;

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setHighlightedIndex((current) => (current + 1) % results.length);
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      setHighlightedIndex((current) => (current <= 0 ? results.length - 1 : current - 1));
      return;
    }

    if (event.key === "Enter" && activeIndex >= 0) {
      event.preventDefault();
      selectSuggestion(results[activeIndex]);
    }
  };

  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>{label}</Label>

      <div className="relative" ref={containerRef}>
        <Input
          id={id}
          role="combobox"
          aria-expanded={isDropdownVisible}
          aria-controls={results.length > 0 ? listboxId : undefined}
          aria-autocomplete="list"
          aria-activedescendant={activeIndex >= 0 ? `${id}-option-${activeIndex}` : undefined}
          aria-invalid={hasNoResults}
          autoComplete="off"
          placeholder={placeholder}
          value={value}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          className="min-h-11 pr-9 md:min-h-0"
          required
        />

        {isLoading && (
          <Loader2 className="absolute top-1/2 right-3 size-4 -translate-y-1/2 animate-spin text-muted-foreground" />
        )}

        {isDropdownVisible && results.length > 0 && (
          <ul
            id={listboxId}
            role="listbox"
            aria-label={`Sugerencias para ${label}`}
            className="absolute top-full left-0 right-0 z-50 mt-1 max-h-[min(50dvh,17.5rem)] overflow-y-auto overscroll-contain rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-lg"
          >
            {results.map((suggestion, index) => (
              <li
                key={`${id}-option-${suggestion.lat}-${suggestion.lng}-${index}`}
                id={`${id}-option-${index}`}
                role="option"
                aria-selected={index === activeIndex}
                title={suggestion.displayName}
                onClick={() => selectSuggestion(suggestion)}
                onMouseEnter={() => setHighlightedIndex(index)}
                className={cn(
                  // min-h-11 = 44px: alto mínimo recomendado para acertar con el dedo.
                  "min-h-11 cursor-pointer touch-manipulation rounded-md px-3 py-2.5",
                  index === activeIndex && "bg-accent text-accent-foreground"
                )}
              >
                <span className="block truncate text-sm font-medium">{suggestion.shortName}</span>
                <span className="block truncate text-xs text-muted-foreground">
                  {suggestion.secondaryText}
                </span>
              </li>
            ))}
          </ul>
        )}

        {isDropdownVisible && hasNoResults && (
          <div className="absolute top-full left-0 right-0 z-50 mt-1 rounded-lg border border-border bg-popover px-3 py-2 text-xs text-muted-foreground shadow-lg">
            Sin resultados
          </div>
        )}
      </div>

      {hasNoResults && (
        <p className="text-xs text-destructive" aria-live="polite">
          Dirección no encontrada
        </p>
      )}
    </div>
  );
}

export default function QuoteForm({ onCoordsChange }: QuoteFormProps) {
  const [formData, setFormData] = useState<QuoteRequest>({
    origin: "",
    destination: "",
    passengers: 1,
    vehicleType: "sedan",
  });

  // Coordenadas fijadas al elegir una sugerencia del autocompletado (Photon).
  const [pickedOrigin, setPickedOrigin] = useState<Coords | null>(null);
  const [pickedDestination, setPickedDestination] = useState<Coords | null>(null);

  const originCoords = pickedOrigin;
  const destinationCoords = pickedDestination;

  const handleOriginChange = (value: string) => {
    setPickedOrigin(null); // editar el texto invalida la coordenada fijada
    setFormData((current) => ({ ...current, origin: value }));
  };

  const handleOriginSelect = (coords: Coords) => {
    setPickedOrigin(coords);
  };

  const handleDestinationChange = (value: string) => {
    setPickedDestination(null);
    setFormData((current) => ({ ...current, destination: value }));
  };

  const handleDestinationSelect = (coords: Coords) => {
    setPickedDestination(coords);
  };

  // Sincroniza las coordenadas geocodificadas con el padre (mapa).
  useEffect(() => {
    onCoordsChange?.({ origin: originCoords, destination: destinationCoords });
  }, [onCoordsChange, originCoords, destinationCoords]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    console.log("Datos del formulario:", formData);
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-5 rounded-xl border border-border bg-card p-4 shadow-sm sm:space-y-6 sm:p-5 md:p-6"
    >
      <div className="space-y-4">
        <AddressAutocomplete
          id="origin"
          label="Origen"
          placeholder="Ej: Altamira, Caracas"
          value={formData.origin}
          onChange={handleOriginChange}
          onSelect={handleOriginSelect}
        />

        <AddressAutocomplete
          id="destination"
          label="Destino"
          placeholder="Ej: El Hatillo, Caracas"
          value={formData.destination}
          onChange={handleDestinationChange}
          onSelect={handleDestinationSelect}
        />

        <div className="grid grid-cols-2 gap-3 sm:gap-4">
          <div className="grid min-w-0 gap-2">
            <Label htmlFor="passengers">Pasajeros</Label>
            {/* inputMode numérico: en móvil abre el teclado de dígitos en vez del
                alfanumérico. min-h-11 = 44px táctil; en md vuelve al alto compacto. */}
            <Input
              id="passengers"
              type="number"
              inputMode="numeric"
              enterKeyHint="done"
              min={1}
              max={6}
              value={formData.passengers}
              onChange={(e) => setFormData({ ...formData, passengers: parseInt(e.target.value) || 1 })}
              className="min-h-11 md:min-h-0"
              required
            />
          </div>

          <div className="grid min-w-0 gap-2">
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
              {/* w-full + min-h-11: el trigger de shadcn es w-fit/h-8, demasiado
                  pequeño para tocar con el dedo. text-base evita el zoom automático
                  de iOS al enfocar (un control de <16px hace que Safari haga zoom). */}
              <SelectTrigger
                id="vehicle"
                className="w-full min-h-11 text-base md:min-h-0 md:text-sm"
              >
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

      <Button type="submit" size="lg" className="min-h-12 w-full text-base md:min-h-0 md:text-sm">
        Calcular precio
      </Button>
    </form>
  );
}
