"use client";

import { useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState, type ReactNode, type Ref } from "react";
import { Check, ChevronDown, Loader2, Locate, LocateFixed, X } from "lucide-react";
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
import VehicleCatalogPicker from "@/components/VehicleCatalogPicker";
import { cn } from "@/lib/utils";
import {
  autocompleteAddress,
  dedupeByProximity,
  MAX_SUGGESTION_LIMIT,
  MIN_QUERY_LENGTH,
  GeocodeResult,
} from "@/lib/geocoding";
import { formatVehicleType, VEHICLE_LABELS, VEHICLE_TYPES } from "@/lib/pricing";
import { describeVehicle, getVehicleTypeFromSelection } from "@/lib/vehicleCatalog";
import { Coords, MapSelectionMode, PASSENGER_CAPACITY, QuoteCoords, QuoteRequest, VehicleSelection, VehicleType } from "@/types";
import type { Vehicle } from "@/types/vehicle";
import { useUserLocation, type UserLocation } from "@/hooks/useUserLocation";

/** Debounce de escritura antes de pedir sugerencias a Photon. */
const GEOCODE_DEBOUNCE_MS = 500;

/**
 * Tolerancia de movimiento del gesto sobre una sugerencia (Fase 8.1), en píxeles: por encima de esto el
 * gesto se interpreta como scroll de la lista y NO como un tap. Un tap real en táctil arrastra unos
 * pocos píxeles, así que 10 px distingue "quiero seleccionar" de "estoy desplazando la lista".
 */
const TAP_MOVE_TOLERANCE_PX = 10;

/**
 * Ventana para descartar el evento REPETIDO del mismo gesto (Fase 8.1), en ms: un tap en móvil entrega
 * `pointerup` y después `click`, y solo el primero debe seleccionar.
 */
const SELECT_DEDUPE_MS = 600;

/** Solo dígitos (o vacío, mientras el usuario borra para reescribir el campo "Pasajeros"). */
const PASSENGERS_ALLOWED_PATTERN = /^\d*$/;

/**
 * Cómo se nombra el vehículo dentro de una frase ("Máximo 1 pasajero para moto"). Es texto de UI
 * (concordancia de número y de género) y por eso NO vive en lib/pricing.ts; la capacidad —que es un
 * número de negocio— se lee de `PASSENGER_CAPACITY` (types/index.ts).
 */
const VEHICLE_SENTENCE_NAMES: Record<VehicleType, string> = {
  moto: "moto",
  sedan: "sedán",
  suv: "SUV",
  van: "van",
};

/**
 * Texto del límite de pasajeros, con el prefijo que lo introduce. El singular importa: "1 pasajeros"
 * es el tipo de detalle que hace dudar del resto de los números de la app.
 */
function formatCapacityText(
  prefix: string,
  vehicleType: VehicleType,
  maxPassengers: number
): string {
  return `${prefix} ${maxPassengers} ${maxPassengers === 1 ? "pasajero" : "pasajeros"} para ${
    VEHICLE_SENTENCE_NAMES[vehicleType]
  }`;
}

/**
 * Aviso del ajuste del campo "Pasajeros" (Fase 5.3): "Máximo 1 pasajero para moto" · "Máximo 5
 * pasajeros para sedán". Habla de un HECHO —"lo que pediste no cabe"—, así que solo aparece tras un
 * recorte.
 */
function formatCapacityNotice(vehicleType: VehicleType, maxPassengers: number): string {
  return formatCapacityText("Máximo", vehicleType, maxPassengers);
}

/**
 * Helper permanente del campo "Pasajeros" (Fase 8.1): "Máx. 5 pasajeros para sedán". Está siempre
 * visible para que el techo del campo no haya que adivinarlo; cuando hay recorte lo sustituye el aviso
 * (mismo dato, otro motivo).
 */
function formatCapacityHelper(vehicleType: VehicleType, maxPassengers: number): string {
  return formatCapacityText("Máx.", vehicleType, maxPassengers);
}

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
   * Notifica CADA cambio del formulario (Fase 6). Con el precio en vivo el formulario no "envía"
   * nada: informa del estado actual para que la página calcule el precio mientras el usuario
   * escribe y elige (vehículo y pasajeros son los datos que se tarifan).
   */
  onRequestChange?: (request: QuoteRequest) => void;
  /**
   * Acción del botón principal. Ya no calcula nada (el precio se calcula solo): lleva al usuario a
   * la tarjeta del precio, que en móvil queda debajo del mapa.
   */
  onViewPrice?: () => void;
  /**
   * Tipo de vehículo con el que ARRANCA el select (Fase 6.2: el del perfil del conductor). Es solo el
   * valor inicial: en cuanto el usuario cambia el tipo a mano —o elige un vehículo del catálogo, que lo
   * deduce— su elección manda y esta prop deja de aplicarse.
   */
  defaultVehicleType?: VehicleType;
  /**
   * Vehículo guardado en el perfil del conductor (Fase 8.1). ALIMENTA SOLO el chip informativo
   * ("Vehículo: Toyota Corolla 2015"): el precio no se lee de aquí — sigue saliendo de `vehicleType`
   * más las tarifas del perfil, que ya llegan por `defaultVehicleType` y desde app/page.tsx.
   */
  profileVehicle?: Vehicle | null;
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
  // Gesto en curso sobre la lista de sugerencias (Fase 8.1): punto donde empezó el toque/clic.
  const gestureStartRef = useRef<{ x: number; y: number } | null>(null);
  // Marca de tiempo de la última selección: descarta el evento repetido del mismo gesto.
  const lastSelectAtRef = useRef(0);

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

  /**
   * Selección de una sugerencia desde un GESTO (Fase 8.1).
   *
   * El bug móvil: al tocar la sugerencia, el navegador cerraba ANTES el teclado virtual (blur del
   * input) y ese primer tap se consumía en el reflow, así que el `click` no llegaba a dispararse y la
   * coordenada NO se guardaba — origen y destino quedaban como texto sin coordenadas y no se podía
   * cotizar. Ahora la selección se resuelve en `pointerup`, que se dispara antes de que el navegador
   * cierre el teclado y unifica táctil y ratón en un solo camino; el `click` queda como respaldo y la
   * ventana de deduplicación ignora el segundo evento del mismo gesto (no se selecciona dos veces).
   *
   * El sello de tiempo llega por parámetro desde el propio evento (`event.timeStamp`): así la función
   * sigue siendo pura —el linter del compilador de React prohíbe `Date.now()`— y se compara la hora del
   * `pointerup` con la del `click` que lo repite, que vienen del mismo reloj.
   */
  const activateSuggestion = (suggestion: GeocodeResult, eventTimestamp: number) => {
    // Un `timeStamp` no fiable (0) selecciona igual: mejor repetir la selección que dejar el campo sin
    // coordenadas y que el viaje no se pueda cotizar.
    if (eventTimestamp > 0 && eventTimestamp - lastSelectAtRef.current < SELECT_DEDUPE_MS) return;

    lastSelectAtRef.current = eventTimestamp;
    selectSuggestion(suggestion);
  };

  /** Punto de partida del gesto: distingue un tap de un arrastre para hacer scroll en la lista. */
  const handleSuggestionPointerDown = (event: React.PointerEvent<HTMLLIElement>) => {
    gestureStartRef.current = { x: event.clientX, y: event.clientY };
  };

  /**
   * Fin del gesto: solo selecciona si fue un TAP. Un desplazamiento mayor a `TAP_MOVE_TOLERANCE_PX` se
   * interpreta como scroll de la lista —el dedo puede soltarse encima de una fila distinta de la que
   * empezó a tocar— y no selecciona nada.
   */
  const handleSuggestionPointerUp = (
    suggestion: GeocodeResult,
    event: React.PointerEvent<HTMLLIElement>
  ) => {
    const start = gestureStartRef.current;
    gestureStartRef.current = null;

    if (start === null) return;
    if (Math.hypot(event.clientX - start.x, event.clientY - start.y) > TAP_MOVE_TOLERANCE_PX) {
      return;
    }

    activateSuggestion(suggestion, event.timeStamp);
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
                  // El tap se resuelve en pointerup (ver activateSuggestion): en móvil el `click`
                  // llegaba después de que el teclado virtual cerrara el dropdown y se perdía, así que
                  // la coordenada no se guardaba y no se podía cotizar.
                  onPointerDown={handleSuggestionPointerDown}
                  onPointerUp={(event) => handleSuggestionPointerUp(suggestion, event)}
                  onClick={(event) => activateSuggestion(suggestion, event.timeStamp)}
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
  onRequestChange,
  onViewPrice,
  defaultVehicleType,
  profileVehicle = null,
}: QuoteFormProps) {
  const [formData, setFormData] = useState<QuoteRequest>({
    origin: "",
    destination: "",
    passengers: 1,
    vehicleType: "sedan",
    // Fase 6.1: vehículo del catálogo (null = sin elegir, o "Otra marca"). Ver handleVehicleChange.
    vehicle: null,
  });

  // Fase 6.1: con un vehículo del catálogo elegido, el tipo viene del MODELO (dato derivado), así
  // que el select de tipo se deshabilita en lugar de dejar que lo contradiga. Ver el propio select.
  const hasCatalogVehicle = formData.vehicle !== null;

  /**
   * Bloque "Especificar modelo del vehículo" (Fase 8.1) desplegado. Arranca CERRADO: el formulario ya
   * cotiza con el `vehicleType` de arriba, así que marca/modelo/año son opcionales y no deben empujar
   * el botón principal fuera de la pantalla de un móvil. El chip del perfil puede abrirlo.
   */
  const [isVehicleDetailsOpen, setIsVehicleDetailsOpen] = useState(false);

  /**
   * Resumen del vehículo del catálogo para el título colapsado ("Toyota Corolla 2015"). Sale de
   * `describeVehicle` —la misma descripción que usa PriceCard—, así que no puede divergir de lo que se
   * tarifa. `null` = todavía no hay vehículo del catálogo elegido.
   */
  const catalogVehicleLabel =
    formData.vehicle === null ? null : describeVehicle(formData.vehicle);

  /**
   * Fase 6.2: el tipo de vehículo puede venir del perfil del conductor (`defaultVehicleType`) como
   * valor INICIAL. Se DERIVA en vez de copiarlo al estado por dos motivos:
   * 1. El perfil se lee de localStorage DESPUÉS de montar: copiarlo exigiría un `setState` dentro de un
   *    efecto, que el linter del compilador de React de este repo prohíbe.
   * 2. Así manda el usuario: en cuanto toca el select (o el catálogo), `manualVehicleType` se impone
   *    sobre el perfil sin perder nada de lo que ya haya escrito en el formulario.
   */
  const [manualVehicleType, setManualVehicleType] = useState<VehicleType | null>(null);
  const vehicleType = manualVehicleType ?? defaultVehicleType ?? formData.vehicleType;

  /**
   * Lo que se comunica al padre: `formData` con el tipo EFECTIVO. Memoizado para que el objeto no
   * cambie de identidad en cada render (eso dispararía el efecto de `onRequestChange` en bucle).
   */
  const effectiveRequest = useMemo(
    () => (formData.vehicleType === vehicleType ? formData : { ...formData, vehicleType }),
    [formData, vehicleType]
  );

  // Capacidad del vehículo elegido (Fase 5.3): es el `max` del campo "Pasajeros" y el MISMO número
  // que valida el motor, porque los dos leen `PASSENGER_CAPACITY` (types/index.ts).
  const maxPassengers = PASSENGER_CAPACITY[vehicleType];

  /**
   * Aviso del último ajuste del campo "Pasajeros". Es estado (y no un valor derivado) porque habla
   * de un HECHO —"se recortó"— y no del número actual: vive hasta que el usuario toca el campo.
   */
  const [capacityNotice, setCapacityNotice] = useState<string | null>(null);

  /**
   * Texto del campo "Pasajeros" (Fase 8.1). Es un BORRADOR DE TEXTO y no un número porque el usuario
   * tiene que poder DEJAR EL CAMPO VACÍO mientras reescribe: con `type="number"` el móvil entregaba ""
   * al borrar, el recorte inmediato a 1 devolvía "1" al campo y escribir "3" producía "13", que se
   * clavaba al máximo del vehículo. Ese era el bug de "salta de 1 a 5 o 6".
   *
   * Reglas: solo dígitos (regex), se puede borrar entero, el motor (`formData.passengers`) nunca baja
   * de 1 ni pasa de la capacidad, y el valor VISIBLE se clava al rango [1, capacidad] al salir del
   * campo (`onBlur`), no en cada tecla.
   */
  const [passengerInput, setPassengerInput] = useState<string>(() => String(formData.passengers));

  /**
   * Cambia el vehículo aplicando el límite de pasajeros (Fase 5.3).
   *
   * La capacidad es un límite DURO, no un aviso: con 6 pasajeros en una van, elegir una moto deja el
   * campo en 1 y lo explica. Así el formulario no puede quedar en un estado que el motor rechace
   * (`estimatePrice` devolvería `null` y la tarjeta diría "Esta combinación no es posible" sin decir
   * qué tocar).
   *
   * Lo usan los DOS caminos que cambian el vehículo —el select de tipo y el catálogo, que deduce el
   * tipo del modelo— para que el ajuste no se olvide en ninguno.
   */
  const applyVehicleType = (nextType: VehicleType) => {
    // El usuario eligió: su elección manda sobre el tipo que viniera del perfil (Fase 6.2).
    setManualVehicleType(nextType);
    const nextMax = PASSENGER_CAPACITY[nextType];
    // El recorte se decide con el valor actual del campo: dentro del updater de `setFormData` no se
    // puede avisar de nada sin volverlo impuro.
    const wasAdjusted = formData.passengers > nextMax;

    setFormData((current) => ({
      ...current,
      vehicleType: nextType,
      // Nunca por debajo de 1 (el mínimo del campo) ni por encima de la capacidad del vehículo.
      passengers: Math.min(Math.max(1, current.passengers), nextMax),
    }));

    // Fase 8.1: el texto del campo sigue al valor recortado. Si no se sincronizara, el campo mostraría
    // "9" mientras el motor cotiza 5 y el usuario no sabría qué se está cobrando.
    setPassengerInput(String(Math.min(Math.max(1, formData.passengers), nextMax)));

    // Cambiar de vehículo sin recorte borra el aviso: deja de describir nada.
    setCapacityNotice(wasAdjusted ? formatCapacityNotice(nextType, nextMax) : null);
  };

  /**
   * Escribe en el campo "Pasajeros" (Fase 8.1). Filtra a dígitos, permite vacío (para reescribir) y
   * deja al motor con un valor válido en todo momento: el precio se sigue calculando mientras se
   * escribe.
   */
  const handlePassengersChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const raw = event.target.value;

    // Escribir o pegar algo que no sean dígitos se ignora: el campo se queda como estaba.
    if (!PASSENGERS_ALLOWED_PATTERN.test(raw)) return;

    setPassengerInput(raw);

    // Vacío o "0": el campo queda libre para escribir, pero el motor conserva el último valor válido
    // (nunca cotiza con 0 pasajeros). El "1" visible llega al salir del campo (ver commitPassengers).
    if (raw === "" || raw === "0") return;

    const parsed = Number.parseInt(raw, 10);
    setFormData((current) => ({
      ...current,
      // El motor nunca recibe más de la capacidad: la capacidad es un límite DURO (Fase 5.3), así que
      // el precio no se rompe mientras el usuario escribe un número que no cabe.
      passengers: Math.min(parsed, maxPassengers),
    }));
    // El aviso describe el hecho de que lo pedido no cabe; el recorte VISIBLE llega al salir del campo.
    setCapacityNotice(
      parsed > maxPassengers ? formatCapacityNotice(vehicleType, maxPassengers) : null
    );
  };

  /**
   * Cierra el campo "Pasajeros" (Fase 8.1): aquí —y no en cada tecla— se clava el valor al rango
   * [1, capacidad del vehículo], que es lo que pide el guion de la fase. Un campo vacío (o "0") vale 1,
   * el mínimo cotizable.
   */
  const commitPassengers = () => {
    const parsed = Number.parseInt(passengerInput, 10);
    const requested = Number.isNaN(parsed) ? 1 : parsed;
    const clamped = Math.min(Math.max(1, requested), maxPassengers);

    setPassengerInput(String(clamped));
    setFormData((current) => ({ ...current, passengers: clamped }));
    setCapacityNotice(
      requested > maxPassengers ? formatCapacityNotice(vehicleType, maxPassengers) : null
    );
  };

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

  /**
   * Catálogo de vehículos (Fase 6.1): la marca, el modelo y el año se guardan en `formData.vehicle`
   * y el TIPO se deduce del modelo (una sola fuente de verdad: la tabla del catálogo). Así la ficha
   * del vehículo y lo que tarifa el precio no pueden contradecirse.
   *
   * `null` = "Otra marca / no está en la lista": se limpia la selección y el tipo se queda como
   * esté, porque entonces vuelve a mandar el select manual de vehículo.
   *
   * El TIPO lo deduce el modelo del catálogo; los pasajeros se ajustan con `applyVehicleType`, que es
   * el mismo camino que usa el select de tipo: la regla de capacidad vive en un solo sitio.
   */
  const handleVehicleChange = (selection: VehicleSelection | null) => {
    if (selection === null) {
      // "Otra marca / no está en la lista": el vehículo sale del catálogo y el tipo se queda como
      // está (vuelve a mandar el select manual). Los pasajeros no cambian.
      setFormData((current) => ({ ...current, vehicle: null }));
      return;
    }

    setFormData((current) => ({ ...current, vehicle: selection }));

    // El tipo lo define el modelo (dato derivado) y se aplica con `applyVehicleType` para que el
    // límite de pasajeros valga también por este camino. Si el modelo no estuviera en el catálogo (no
    // debería ocurrir) se conserva el tipo actual: el precio nunca se queda sin un `vehicleType`.
    applyVehicleType(getVehicleTypeFromSelection(selection) ?? vehicleType);
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

  // Fase 6: cada cambio del formulario se comunica a la página, que recalcula el precio en vivo con
  // `estimatePrice` (puro): no hay petición de red ni estado de carga que gestionar aquí.
  useEffect(() => {
    onRequestChange?.(effectiveRequest);
  }, [onRequestChange, effectiveRequest]);

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

  /**
   * El formulario ya no "envía" una cotización: el precio es en vivo. El submit solo lleva al
   * usuario a la tarjeta del precio, que explica lo que falte (coordenadas, ruta o combinación).
   */
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onViewPrice?.();
  };

  return (
    <form
      onSubmit={handleSubmit}
      // noValidate: con el precio en vivo, las burbujas nativas del navegador ("Please fill out this
      // field") competirían con los mensajes de la app, que son los que explican el estado real
      // (falta origen y destino, más pasajeros que la capacidad del vehículo...).
      noValidate
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
                  hasLocation && "border-brand/40 bg-brand/10 text-brand hover:bg-brand/15"
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
                  className="pointer-events-none absolute -top-1 -right-1 flex size-4 items-center justify-center rounded-full bg-brand text-brand-foreground shadow-sm"
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
            className="group flex w-fit items-center gap-1.5 rounded-full border border-success/30 bg-success/10 px-2.5 py-1 text-xs font-medium text-success transition-colors outline-none hover:bg-success/15 focus-visible:ring-2 focus-visible:ring-ring/50"
          >
            <span className="size-1.5 shrink-0 rounded-full bg-brand" aria-hidden="true" />
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
            {/* type="text" + inputMode/pattern (Fase 8.1): con `type="number"` el teclado móvil
                entregaba "" al borrar (el recorte inmediato devolvía "1") y escribir "3" producía "13",
                que se clavaba al máximo del vehículo. El teclado numérico se sigue abriendo por
                `inputMode="numeric"` (+ `pattern` para iOS); el filtro de dígitos y el rango se
                gestionan aquí, no en el navegador. min-h-11 = 44px táctil. */}
            <Input
              id="passengers"
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              enterKeyHint="done"
              autoComplete="off"
              value={passengerInput}
              onChange={handlePassengersChange}
              // El recorte al rango [1, capacidad] ocurre AL SALIR del campo, no en cada tecla.
              onBlur={commitPassengers}
              aria-describedby="passengers-info"
              className="min-h-11 md:min-h-0"
              required
            />

            {/* Línea informativa del campo (Fase 8.1). Un solo elemento con dos textos posibles: el
                helper permanente ("Máx. 5 pasajeros para sedán") y, cuando hubo recorte, el aviso que
                lo explica. Así el campo nunca salta de alto y `aria-describedby` apunta siempre a un id
                que existe. En gris de texto secundario y no en rojo: recortar es el comportamiento
                correcto del campo, no un error del usuario. */}
            <p id="passengers-info" className="text-xs text-muted-foreground" aria-live="polite">
              {capacityNotice ?? formatCapacityHelper(vehicleType, maxPassengers)}
            </p>
          </div>

          <div className="grid min-w-0 gap-2">
            <Label htmlFor="vehicle">Vehículo</Label>
            <Select
              value={vehicleType}
              // `items` (Fase 8.1): el `Select.Value` de Base UI solo pinta la ETIQUETA del item
              // seleccionado si el Root recibe el mapa valor → etiqueta. Sin esta prop renderiza el
              // valor CRUDO y el trigger mostraba "sedan" en minúsculas en lugar de "Sedán".
              items={VEHICLE_LABELS}
              disabled={hasCatalogVehicle}
              onValueChange={(value) => {
                // El Select puede emitir null (ej: al limpiarse), solo actualizamos con un valor válido
                if (value) {
                  // Cambiar el tipo pasa por `applyVehicleType`: no solo lo fija, también ajusta los
                  // pasajeros a la capacidad del nuevo vehículo (Fase 5.3).
                  applyVehicleType(value);
                }
              }}
            >
              {/* w-full + min-h-11: el trigger de shadcn es w-fit/h-8, demasiado
                  pequeño para tocar con el dedo. text-base evita el zoom automático
                  de iOS al enfocar (un control de <16px hace que Safari haga zoom). */}
              <SelectTrigger
                id="vehicle"
                className="w-full min-h-11 text-base md:min-h-0 md:text-sm"
                aria-describedby={hasCatalogVehicle ? "vehicle-catalog-hint" : undefined}
              >
                <SelectValue placeholder="Tipo de vehículo" />
              </SelectTrigger>
              <SelectContent
                // Explícitos aunque sean los valores por defecto de SelectContent: documentan en el
                // punto de uso por dónde debe salir el menú. `side="bottom"` lo abre hacia abajo y,
                // como Base UI lo alinea con el valor seleccionado, cabe entero en el viewport
                // móvil (medido en la Fase 5.2: 4 opciones, sin recorte).
                side="bottom"
                sideOffset={4}
              >
                {/* Nombres y orden salen de lib/pricing.ts: la etiqueta que el usuario ve y la
                    tarifa que se aplica no pueden desincronizarse. El VALOR del item sigue siendo el
                    tipo interno ("sedan"); `formatVehicleType` solo formatea lo que se muestra. */}
                {VEHICLE_TYPES.map((vehicle) => (
                  <SelectItem key={vehicle} value={vehicle}>
                    {formatVehicleType(vehicle)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* El tipo no se puede cambiar aquí mientras haya un vehículo del catálogo: no es un
                control roto, es información derivada del modelo. El aviso lo explica y da la salida
                (el aria-describedby del trigger apunta a este id). */}
            {hasCatalogVehicle && (
              <p id="vehicle-catalog-hint" className="text-xs text-muted-foreground">
                Lo define el modelo del catálogo. Para elegir otro tipo, usa &quot;Otra marca / no está
                en la lista&quot; en Marca.
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Chip del vehículo del perfil (Fase 8.1): si el conductor ya lo guardó, se muestra aquí el
          vehículo con el que cotiza sin obligarlo a abrir el catálogo. "Cambiar" despliega el bloque
          de abajo. Es SOLO informativo: el tipo ya llega por `defaultVehicleType` y las tarifas por el
          perfil, así que el precio no depende de este chip. */}
      {profileVehicle !== null && formData.vehicle === null && (
        <div className="flex items-center justify-between gap-2 rounded-lg border border-border bg-muted/30 py-1.5 pr-1.5 pl-3">
          <p className="min-w-0 truncate text-xs text-muted-foreground">
            Vehículo:{" "}
            <span className="font-medium text-foreground">
              {profileVehicle.brand} {profileVehicle.model} {profileVehicle.year}
            </span>{" "}
            · del perfil
          </p>

          <Button
            type="button"
            variant="ghost"
            size="sm"
            // 44px de alto (min-h-11) para el dedo, igual que el resto de controles del formulario.
            className="min-h-11 shrink-0"
            onClick={() => setIsVehicleDetailsOpen(true)}
          >
            Cambiar
          </Button>
        </div>
      )}

      {/* Catálogo de vehículos (Fase 6.1), ahora COLAPSABLE y opcional (Fase 8.1). Es el bloque menos
          usado del formulario —ajusta la ficha del vehículo, no el precio de hoy— y ocupaba tres
          selects antes del botón principal en un móvil. El tipo de vehículo de arriba ya permite
          cotizar; "Otra marca / no está en la lista" sigue devolviendo el control a ese select.

          ¿Por qué `<details>` nativo y no el Collapsible de Base UI? Porque este proyecto no tiene ese
          componente instalado en components/ui y la regla de la fase es no añadir paquetes: `<details>`
          ya trae el comportamiento (abierto/cerrado, teclado, lector de pantalla) sin JS ni
          dependencias, igual que el desglose de PriceCard. El estado `open` es controlado para que el
          chip "Cambiar" pueda desplegarlo. */}
      <details
        className="rounded-lg border border-border bg-muted/20 open:bg-muted/40"
        open={isVehicleDetailsOpen}
        // El toggle nativo se refleja en el estado: abrir con el dedo o con el teclado y abrir con el
        // chip acaban en el mismo sitio.
        onToggle={(event) => setIsVehicleDetailsOpen(event.currentTarget.open)}
      >
        <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 rounded-lg px-3 py-2.5 text-sm font-medium text-foreground outline-none select-none focus-visible:ring-2 focus-visible:ring-ring/50 [&::-webkit-details-marker]:hidden">
          <span className="min-w-0 truncate">
            {catalogVehicleLabel ?? "Especificar modelo del vehículo (opcional)"}
          </span>
          <ChevronDown
            className={cn(
              "size-4 shrink-0 text-muted-foreground transition-transform",
              isVehicleDetailsOpen && "rotate-180"
            )}
            aria-hidden="true"
          />
        </summary>

        <div className="border-t border-border p-3">
          <VehicleCatalogPicker value={formData.vehicle} onChange={handleVehicleChange} />
        </div>
      </details>

      {/* Siempre habilitado: no hay nada que "enviar" (el precio es en vivo) y el botón solo lleva a
          la tarjeta del precio, que explica lo que falte. Antes se deshabilitaba y el usuario se
          quedaba sin saber por qué. */}
      <Button
        type="submit"
        size="lg"
        className="min-h-12 w-full text-base font-semibold md:min-h-0 md:text-sm"
      >
        Ver precio estimado
      </Button>
    </form>
  );
}
