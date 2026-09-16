"use client";

import { useCallback, useEffect, useImperativeHandle, useRef, useState, type ReactNode, type Ref } from "react";
import { Check, Loader2, Locate, LocateFixed, X } from "lucide-react";
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
  dedupeByProximity,
  MAX_SUGGESTION_LIMIT,
  MIN_QUERY_LENGTH,
  GeocodeResult,
} from "@/lib/geocoding";
import { Coords, MapSelectionMode, QuoteCoords, QuoteRequest } from "@/types";
import { useUserLocation, type UserLocation } from "@/hooks/useUserLocation";

/** Debounce de escritura antes de pedir sugerencias a Photon. */
const GEOCODE_DEBOUNCE_MS = 500;

/**
 * API imperativa del formulario.
 *
 * El estado de los campos (texto + coordenadas) vive dentro de QuoteForm, pero el gesto que
 * los fija ocurre en el mapa, que es un componente hermano en app/page.tsx. Exponer un método
 * por `ref` evita subir todo el estado del formulario a la página.
 */
export interface QuoteFormHandle {
  /**
   * Fija un campo con una dirección ya resuelta (toque en el mapa): escribe el texto, fija las
   * coordenadas y marca el campo como "fijado" para que el autocompletado no lo pise.
   */
  setLocationFromMap: (field: MapSelectionMode, address: string, coords: Coords) => void;
}

export interface QuoteFormProps {
  /** Notifica al padre las coordenadas elegidas en el autocompletado. */
  onCoordsChange?: (coords: QuoteCoords) => void;
  /** Ref con la API imperativa (Fase 3.5h: fijar origen/destino tocando el mapa). */
  ref?: Ref<QuoteFormHandle>;
  /**
   * Notifica la ubicación GPS del usuario (Fase 3.7): la página la usa para el marcador azul
   * del mapa. El estado sigue viviendo aquí, igual que las coordenadas con `onCoordsChange`.
   */
  onUserLocationChange?: (location: UserLocation) => void;
  /** Campo cuya dirección se está resolviendo (reverse geocoding): muestra el spinner. */
  resolvingField?: MapSelectionMode | null;
  /**
   * Se está calculando: el botón de envío muestra spinner y "Calculando...".
   * TODO (Fase 5): lo activará el motor de precios; hoy lo activa la página mientras OSRM
   * calcula la ruta, que es el único cálculo real que existe.
   */
  isSubmitting?: boolean;
}

interface AddressAutocompleteProps {
  id: string;
  label: string;
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
  onSelect: (coords: Coords) => void;
  /** Ubicación del usuario (GPS) para sesgar la búsqueda. null = sesgo por defecto (Caracas). */
  userLocation: UserLocation;
  /** Control opcional al lado del input (el botón "Usar mi ubicación actual" del origen). */
  action?: ReactNode;
  /** Mensaje de estado bajo el input (p. ej. "Buscando dirección..." mientras hay reverse). */
  hint?: ReactNode;
  /**
   * Dirección fijada desde el mapa (Fase 3.5h): deja el campo "fijado" igual que una sugerencia
   * elegida, para que el autocompletado no reabra la lista sobre un punto ya elegido. Se compara
   * con el texto actual, así que editar el input lo libera automáticamente.
   */
  pinnedAddress?: string | null;
}

interface SuggestionState {
  query: string;
  /**
   * Sesgo con el que se resolvieron los resultados ("" = sin GPS). Si el usuario comparte su
   * ubicación DESPUÉS de buscar, la lista guardada deja de corresponder a esta consulta y hay
   * que volver a pedirla: por eso forma parte de la identidad de la búsqueda.
   */
  biasKey: string;
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
  userLocation,
  action,
  pinnedAddress,
  hint,
}: AddressAutocompleteProps) {
  const [search, setSearch] = useState<SuggestionState | null>(null);
  const [selectedValue, setSelectedValue] = useState<string | null>(null);
  const [isDismissed, setIsDismissed] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);

  const trimmed = value.trim();
  const isQueryValid = trimmed.length >= MIN_QUERY_LENGTH;
  // Texto fijado por una sugerencia del dropdown o por un toque en el mapa: no se vuelve a
  // buscar y no se reabre la lista. En ambos casos se compara con el texto actual, así que
  // editar el input libera el campo.
  const isPinned =
    (selectedValue !== null && selectedValue === trimmed) || pinnedAddress === trimmed;
  // Clave del sesgo actual ("" = sin GPS): forma parte de la identidad de la búsqueda, así
  // que al compartir la ubicación los resultados guardados se consideran caducados.
  const userLocationKey =
    userLocation === null ? "" : `${userLocation.lat.toFixed(3)},${userLocation.lng.toFixed(3)}`;
  const isSettled =
    search !== null && search.query === trimmed && search.biasKey === userLocationKey;
  const settledResults: GeocodeResult[] =
    search !== null && search.query === trimmed && search.biasKey === userLocationKey
      ? search.results
      : [];

  const isLoading = isQueryValid && !isPinned && !isSettled;
  const results: GeocodeResult[] = isPinned ? [] : settledResults;
  // Segunda barrera de deduplicación (la primera está en lib/geocoding.ts: mismo nombre a
  // menos de 50 m). Es idempotente y garantiza que la UI nunca pinte dos filas idénticas
  // aunque cambie la fuente de datos.
  const visibleResults = dedupeByProximity(results);
  const hasNoResults =
    isQueryValid &&
    !isPinned &&
    isSettled &&
    visibleResults.length === 0 &&
    trimmed.length > MIN_QUERY_LENGTH;
  const isDropdownVisible = !isDismissed && (visibleResults.length > 0 || hasNoResults);

  const activeIndex =
    highlightedIndex >= 0 && highlightedIndex < visibleResults.length ? highlightedIndex : -1;
  const listboxId = `${id}-listbox`;

  // Búsqueda con debounce: el setState ocurre dentro del callback del timer
  // (asíncrono), nunca en el cuerpo del efecto.
  useEffect(() => {
    if (!isQueryValid || isPinned) return;

    let cancelled = false;

    const timer = setTimeout(() => {
      void autocompleteAddress(trimmed, {
        limit: MAX_SUGGESTION_LIMIT,
        // Fase 3.5g: con ubicación compartida, Photon se sesga a la posición real y el
        // orden por cercanía entra en juego; sin ella, sesgo por defecto (Caracas).
        userLocation: userLocation ?? undefined,
      }).then((list) => {
        if (cancelled) return;

        setSearch({ query: trimmed, biasKey: userLocationKey, results: list });
        setHighlightedIndex(-1);
      });
    }, GEOCODE_DEBOUNCE_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [isQueryValid, isPinned, trimmed, userLocation, userLocationKey]);

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

    if (!isDropdownVisible || visibleResults.length === 0) return;

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setHighlightedIndex((current) => (current + 1) % visibleResults.length);
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      setHighlightedIndex((current) => (current <= 0 ? visibleResults.length - 1 : current - 1));
      return;
    }

    if (event.key === "Enter" && activeIndex >= 0) {
      event.preventDefault();
      selectSuggestion(visibleResults[activeIndex]);
    }
  };

  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>{label}</Label>

      {/* El campo ocupa el ancho disponible y el control opcional (botón de GPS) queda al
          lado: en un móvil de 320px el input conserva espacio útil. `min-w-0` evita que el
          input imponga su ancho mínimo al flex (min-width:auto por defecto). */}
      <div className="flex items-center gap-2">
        <div className="relative min-w-0 flex-1" ref={containerRef}>
          <Input
            id={id}
            role="combobox"
            aria-expanded={isDropdownVisible}
            aria-controls={visibleResults.length > 0 ? listboxId : undefined}
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

          {isDropdownVisible && visibleResults.length > 0 && (
            <ul
              id={listboxId}
              role="listbox"
              aria-label={`Sugerencias para ${label}`}
              className="absolute top-full left-0 right-0 z-50 mt-1 max-h-[min(50dvh,17.5rem)] overflow-y-auto overscroll-contain rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-lg"
            >
              {visibleResults.map((suggestion, index) => (
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
                  <span className="block truncate text-sm font-semibold">
                    {suggestion.shortName}
                  </span>
                  {/* Segunda línea: displayName completo ("Farmatodo — Avenida José María
                      Vargas, Santa Fe, Caracas"). Es lo que distingue una sede de otra
                      dentro de la misma cadena; el title cubre el texto truncado. */}
                  <span className="block truncate text-xs text-muted-foreground">
                    {suggestion.displayName}
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

        {action}
      </div>

      {hint}

      {hasNoResults && (
        <p className="text-xs text-destructive" aria-live="polite">
          Dirección no encontrada
        </p>
      )}
    </div>
  );
}

export default function QuoteForm({
  onCoordsChange,
  ref,
  onUserLocationChange,
  resolvingField = null,
  isSubmitting = false,
}: QuoteFormProps) {
  const [formData, setFormData] = useState<QuoteRequest>({
    origin: "",
    destination: "",
    passengers: 1,
    vehicleType: "sedan",
  });

  // Fase 3.5g: ubicación del usuario. El hook NO la pide al montar (ver useUserLocation);
  // solo se pide al pulsar el botón del campo Origen. Si no hay, `location` es null y todo
  // sigue sesgado a Caracas como antes.
  const {
    location,
    requestLocation,
    clearLocation,
    loading: isLocating,
    error: locationError,
  } = useUserLocation();

  const hasLocation = location !== null;

  // Coordenadas fijadas al elegir una sugerencia del autocompletado (Photon) o al tocar el mapa.
  const [pickedOrigin, setPickedOrigin] = useState<Coords | null>(null);
  const [pickedDestination, setPickedDestination] = useState<Coords | null>(null);

  // Dirección fijada desde el mapa (Fase 3.5h): marca el campo como "fijado" para que el
  // autocompletado no reabra la lista sobre un punto que el usuario ya eligió.
  const [mapPinned, setMapPinned] = useState<{ origin: string | null; destination: string | null }>({
    origin: null,
    destination: null,
  });

  const originCoords = pickedOrigin;
  const destinationCoords = pickedDestination;

  const handleOriginChange = (value: string) => {
    setPickedOrigin(null); // editar el texto invalida la coordenada fijada
    setMapPinned((current) => ({ ...current, origin: null }));
    setFormData((current) => ({ ...current, origin: value }));
  };

  const handleOriginSelect = (coords: Coords) => {
    setPickedOrigin(coords);
  };

  const handleDestinationChange = (value: string) => {
    setPickedDestination(null);
    setMapPinned((current) => ({ ...current, destination: null }));
    setFormData((current) => ({ ...current, destination: value }));
  };

  const handleDestinationSelect = (coords: Coords) => {
    setPickedDestination(coords);
  };

  /**
   * API imperativa expuesta por `ref`: la usa app/page.tsx cuando el usuario fija un punto
   * tocando el mapa. Escribe la dirección y las coordenadas en el mismo lote de render, así que
   * el efecto de `onCoordsChange` avisa al padre una sola vez con ambos datos.
   */
  const setLocationFromMap = useCallback(
    (field: MapSelectionMode, address: string, coords: Coords) => {
      if (field === "origin") {
        setFormData((current) => ({ ...current, origin: address }));
        setPickedOrigin(coords);
        setMapPinned((current) => ({ ...current, origin: address }));
        return;
      }

      setFormData((current) => ({ ...current, destination: address }));
      setPickedDestination(coords);
      setMapPinned((current) => ({ ...current, destination: address }));
    },
    []
  );

  useImperativeHandle(ref, () => ({ setLocationFromMap }), [setLocationFromMap]);

  // Sincroniza las coordenadas geocodificadas con el padre (mapa).
  useEffect(() => {
    onCoordsChange?.({ origin: originCoords, destination: destinationCoords });
  }, [onCoordsChange, originCoords, destinationCoords]);

  // Sincroniza la ubicación GPS con el padre (Fase 3.7: marcador azul del mapa).
  useEffect(() => {
    onUserLocationChange?.(location);
  }, [onUserLocationChange, location]);

  // El botón de envío solo se habilita con origen y destino escritos.
  const canSubmit =
    formData.origin.trim().length > 0 && formData.destination.trim().length > 0;

  /**
   * "Buscando dirección..." del campo cuya dirección se está resolviendo: el spinner va junto al
   * input, en el mismo campo, para que se vea dónde va a caer el resultado del toque en el mapa.
   */
  const resolvingHint = (field: MapSelectionMode): ReactNode =>
    resolvingField === field ? (
      <span className="flex items-center gap-1.5 text-xs text-muted-foreground" aria-live="polite">
        <Loader2 className="size-3 shrink-0 animate-spin" aria-hidden="true" />
        Buscando dirección...
      </span>
    ) : undefined;

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
          userLocation={location}
          pinnedAddress={mapPinned.origin}
          hint={resolvingHint("origin")}
          action={
            <span className="group relative shrink-0">
              <Button
                type="button"
                variant="outline"
                size="icon"
                aria-label="Usar mi ubicación actual"
                aria-describedby="origin-location-tooltip"
                onClick={requestLocation}
                disabled={isLocating}
                // 44px en móvil (mínimo táctil); compacto desde md, como el resto del form.
                className={cn(
                  "size-11 md:size-9",
                  // Estado activo: azul claro, para que se vea que YA hay ubicación sin leer nada.
                  hasLocation &&
                    "border-blue-300 bg-blue-50 text-blue-700 hover:bg-blue-100 hover:text-blue-800 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-300 dark:hover:bg-blue-950/70"
                )}
              >
                {isLocating ? (
                  <Loader2 className="animate-spin" />
                ) : hasLocation ? (
                  <LocateFixed />
                ) : (
                  // Sin ubicación todavía: icono gris neutro dentro del botón outline.
                  <Locate className="text-muted-foreground" />
                )}
              </Button>

              {/* Check pequeño: refuerza que la ubicación está activa. */}
              {hasLocation && !isLocating && (
                <span
                  className="pointer-events-none absolute -top-1 -right-1 flex size-4 items-center justify-center rounded-full bg-blue-600 text-white shadow-sm"
                  aria-hidden="true"
                >
                  <Check className="size-2.5" />
                </span>
              )}

              {/* Tooltip en hover/focus. Se resuelve con CSS (group) en vez de añadir el primitivo
                  de tooltip de base-ui: la fase solo pide hover/focus y así no entra un componente
                  nuevo al proyecto. `pointer-coarse:hidden` lo oculta en táctil, donde enfocar el
                  botón al tocarlo dejaría un cartel pegado encima del campo siguiente. */}
              <span
                id="origin-location-tooltip"
                role="tooltip"
                className="pointer-coarse:hidden pointer-events-none invisible absolute top-full right-0 z-50 mt-2 w-max max-w-[12rem] rounded-md bg-foreground px-2 py-1 text-xs font-medium text-background opacity-0 shadow-md transition-opacity duration-150 group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100"
              >
                Usar mi ubicación actual
              </span>
            </span>
          }
        />

        {/* Estado de la geolocalización: aparece solo tras pulsar el botón. aria-live para
            que el lector de pantalla anuncie el resultado. El fallo es silencioso: la app
            sigue funcionando con el sesgo por defecto (Caracas). */}
        {isLocating && (
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground" aria-live="polite">
            <Loader2 className="size-3.5 shrink-0 animate-spin" aria-hidden="true" />
            Obteniendo tu ubicación...
          </p>
        )}

        {/* Chip de ubicación activa (Fase 3.7): discreto pero claro, y pulsarlo deja de usar la
            ubicación. Al pasar el ratón o enfocar con el teclado el texto se convierte en la
            acción ("Dejar de usar mi ubicación"), así el gesto se entiende sin abrir un menú. */}
        {!isLocating && hasLocation && (
          <button
            type="button"
            onClick={clearLocation}
            aria-label="Dejar de usar mi ubicación"
            title="Dejar de usar mi ubicación"
            className="group flex w-fit items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-800 transition-colors outline-none hover:bg-emerald-100 focus-visible:ring-2 focus-visible:ring-ring/50 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300 dark:hover:bg-emerald-950/70"
          >
            <span className="size-1.5 shrink-0 rounded-full bg-blue-600" aria-hidden="true" />
            <span className="group-hover:hidden group-focus-visible:hidden">Ubicación activa</span>
            <span className="hidden group-hover:inline group-focus-visible:inline">
              Dejar de usar mi ubicación
            </span>
            <X className="size-3 shrink-0 opacity-60" aria-hidden="true" />
          </button>
        )}

        {!isLocating && location === null && locationError !== null && (
          <p className="text-xs text-destructive" aria-live="polite" title={locationError}>
            No se pudo obtener tu ubicación, usando Caracas.
          </p>
        )}

        <AddressAutocomplete
          id="destination"
          label="Destino"
          placeholder="Ej: El Hatillo, Caracas"
          value={formData.destination}
          onChange={handleDestinationChange}
          onSelect={handleDestinationSelect}
          userLocation={location}
          pinnedAddress={mapPinned.destination}
          hint={resolvingHint("destination")}
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

      <Button
        type="submit"
        size="lg"
        disabled={!canSubmit || isSubmitting}
        className="min-h-12 w-full text-base font-semibold md:min-h-0 md:text-sm"
      >
        {isSubmitting ? (
          <>
            <Loader2 className="animate-spin" aria-hidden="true" />
            Calculando...
          </>
        ) : (
          "Calcular precio"
        )}
      </Button>
    </form>
  );
}
