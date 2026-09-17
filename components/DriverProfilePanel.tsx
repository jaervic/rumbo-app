"use client";

/**
 * Panel del conductor (Fase 6.2): nombre, vehículo y tarifas propias, dentro de un panel tipo sheet.
 *
 * ¿Por qué Dialog de Base UI y no la `Sheet` de shadcn? Porque shadcn/ui aquí está montado sobre Base
 * UI (no Radix) y `Sheet` no existe. El `Dialog` de Base UI ya trae lo que hace falta (portal,
 * backdrop, foco atrapado, cierre con Escape y bloqueo del scroll) y se estiliza como sheet: **desde
 * abajo en móvil** y **panel lateral derecho desde `sm`**. TODO (Fase 6.3): valorar el `Drawer` de
 * Base UI para tener swipe-to-dismiss en móvil (hoy no se usa: su API de gestos y snap points no está
 * verificada contra la versión instalada y un gesto mal calibrado arruina el scroll interno).
 *
 * El FORMULARIO se monta con una `key` que cambia al abrir: así cada apertura empieza con los datos
 * del perfil guardado y se descarta lo que se hubiera escrito y no se guardó (evita cualquier
 * sincronización con efectos, que es lo que este repo no permite).
 *
 * Mobile-first: los campos miden min-h-11, el contenido hace scroll interno y el pie con los botones
 * queda fijo, para que "Guardar" siempre esté al alcance del pulgar.
 */

import { useState } from "react";
import { Dialog } from "@base-ui/react/dialog";
import { Check, Trash2, X } from "lucide-react";
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
import TariffEditor from "@/components/TariffEditor";
import VehicleSelector from "@/components/VehicleSelector";
import { useDriverProfile } from "@/hooks/useDriverProfile";
import {
  DEFAULT_TARIFF,
  isValidName,
  validateTariff,
  type DriverProfile,
  type DriverTariffConfig,
} from "@/lib/driverProfile";
import { VEHICLE_LABELS, VEHICLE_TYPES } from "@/lib/pricing";
import { cn } from "@/lib/utils";
import { PASSENGER_CAPACITY, type VehicleType } from "@/types";
import type { Vehicle } from "@/types/vehicle";

export interface DriverProfilePanelProps {
  /** El panel está abierto (lo controla el botón, que es quien lo abre). */
  open: boolean;
  /** Avisa de que se quiere abrir o cerrar (backdrop, Escape y botón "Cerrar"). */
  onOpenChange: (open: boolean) => void;
  /** Se guardó el perfil: el botón lo usa para mostrar el mensaje de éxito. */
  onSaved: () => void;
}

/**
 * Contenido del panel. Se monta al abrir (ver la `key` del wrapper) y sale de aquí con los datos del
 * perfil guardado o con los valores por defecto si todavía no hay perfil.
 */
function DriverProfileForm({
  onSaved,
  onClose,
}: {
  onSaved: () => void;
  onClose: () => void;
}) {
  const { profile, saveProfile, clearProfile } = useDriverProfile();

  const [name, setName] = useState(() => profile?.name ?? "");
  /**
   * Tipo de vehículo del perfil. NO estaba en el guion de la fase y es imprescindible: el catálogo se
   * filtra por tipo (`getBrandsByVehicleType`), así que sin este select un conductor de moto no
   * podría elegir su marca. Es el mismo select del QuoteForm, aquí manda el perfil.
   */
  const [vehicleType, setVehicleType] = useState<VehicleType>(
    () => profile?.vehicle.vehicleType ?? "sedan"
  );
  const [vehicle, setVehicle] = useState<Vehicle | null>(() => profile?.vehicle ?? null);
  const [tariff, setTariff] = useState<DriverTariffConfig>(() => profile?.tariff ?? DEFAULT_TARIFF);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const nameError = isValidName(name) ? null : "Escribe al menos 2 caracteres";
  const tariffValidation = validateTariff(tariff);
  const canSave = nameError === null && vehicle !== null && tariffValidation.valid;

  /** Cambiar de tipo invalida el vehículo elegido: las marcas de un tipo no sirven para otro. */
  const handleVehicleTypeChange = (next: VehicleType) => {
    setVehicleType(next);
    setVehicle(null);
  };

  const handleSave = () => {
    if (!canSave || vehicle === null) return;

    const next: DriverProfile = {
      name: name.trim(),
      vehicle,
      tariff,
      updatedAt: new Date().toISOString(),
    };

    saveProfile(next);
    onSaved();
    onClose();
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Cabecera: título, subtítulo y el aspa de cerrar (Dialog.Close = "cerrar sin guardar"). */}
      <header className="flex items-start justify-between gap-3 border-b border-border px-4 py-3 sm:px-5">
        <div className="min-w-0">
          <Dialog.Title className="text-base font-semibold text-foreground">
            Mi perfil de conductor
          </Dialog.Title>
          <Dialog.Description className="mt-0.5 text-xs text-muted-foreground">
            Tus datos y tus tarifas se guardan en este dispositivo.
          </Dialog.Description>
        </div>
        <Dialog.Close
          render={
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="Cerrar sin guardar"
              className="shrink-0"
            />
          }
        >
          <X className="size-4" aria-hidden="true" />
        </Dialog.Close>
      </header>

      {/* Cuerpo con scroll interno: el pie con los botones queda fijo y siempre al alcance del pulgar. */}
      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 py-4 sm:px-5">
        <div className="grid gap-2">
          <Label htmlFor="driver-name">Nombre</Label>
          <Input
            id="driver-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Cómo quieres que te llamemos"
            autoComplete="name"
            aria-invalid={nameError !== null}
            aria-describedby="driver-name-help"
            className="min-h-11 text-base md:min-h-0 md:text-sm"
          />
          <p
            id="driver-name-help"
            className={cn(
              "text-xs",
              nameError === null ? "text-muted-foreground" : "text-destructive"
            )}
          >
            {nameError ?? "Es el nombre con el que cotizas"}
          </p>
        </div>

        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-foreground">Tu vehículo</h3>

          <div className="grid gap-2">
            <Label htmlFor="driver-vehicle-type">Tipo de vehículo</Label>
            <Select
              value={vehicleType}
              onValueChange={(value) => {
                if (value) handleVehicleTypeChange(value);
              }}
            >
              <SelectTrigger
                id="driver-vehicle-type"
                className="w-full min-h-11 text-base md:min-h-0 md:text-sm"
              >
                <SelectValue placeholder="Tipo de vehículo" />
              </SelectTrigger>
              <SelectContent side="bottom" sideOffset={4}>
                {VEHICLE_TYPES.map((type) => (
                  <SelectItem key={type} value={type}>
                    {VEHICLE_LABELS[type]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {/* La capacidad se muestra porque es lo que después limita los pasajeros al cotizar
                (PASSENGER_CAPACITY, la misma tabla que usa el formulario). */}
            <p className="text-xs text-muted-foreground">
              Capacidad: {PASSENGER_CAPACITY[vehicleType]}{" "}
              {PASSENGER_CAPACITY[vehicleType] === 1 ? "pasajero" : "pasajeros"}
            </p>
          </div>

          <VehicleSelector value={vehicle} onChange={setVehicle} vehicleType={vehicleType} />
        </div>
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-foreground">Tus tarifas</h3>
          <TariffEditor value={tariff} onChange={setTariff} />
        </div>

        {/* Borrar perfil con confirmación en el sitio (nada de un diálogo dentro de otro) y solo si hay
            algo que borrar. */}
        {profile !== null && (
          <div className="rounded-lg border border-border p-3">
            {confirmingDelete ? (
              <div className="space-y-2">
                <p className="text-xs text-foreground">¿Seguro que quieres borrar tu perfil?</p>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="destructive"
                    className="min-h-10"
                    onClick={() => {
                      clearProfile();
                      setConfirmingDelete(false);
                    }}
                  >
                    Sí, borrar
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    className="min-h-10"
                    onClick={() => setConfirmingDelete(false)}
                  >
                    Cancelar
                  </Button>
                </div>
              </div>
            ) : (
              <Button
                type="button"
                variant="ghost"
                className="min-h-10 text-destructive hover:bg-destructive/10"
                onClick={() => setConfirmingDelete(true)}
              >
                <Trash2 className="size-4" aria-hidden="true" />
                Borrar perfil
              </Button>
            )}
          </div>
        )}
      </div>

      {/* Pie fijo: "Guardar" siempre visible y deshabilitado mientras haya algo que corregir. */}
      <footer className="space-y-2 border-t border-border px-4 py-3 sm:px-5">
        <Button
          type="button"
          onClick={handleSave}
          disabled={!canSave}
          className="min-h-12 w-full text-base font-semibold md:min-h-0 md:text-sm"
        >
          <Check className="size-4" aria-hidden="true" />
          Guardar
        </Button>
        {!canSave && (
          <p className="text-xs text-muted-foreground" role="status">
            {nameError ??
              (vehicle === null
                ? "Elige marca, modelo y año de tu vehículo."
                : "Revisa las tarifas marcadas.")}
          </p>
        )}
        <Dialog.Close
          render={<Button type="button" variant="ghost" className="min-h-11 w-full md:min-h-0" />}
        >
          Cerrar sin guardar
        </Dialog.Close>
      </footer>
    </div>
  );
}

/**
 * Panel del conductor: el Dialog de Base UI estilizado como sheet (abajo en móvil, lateral derecho
 * desde `sm`).
 *
 * Z-index: backdrop 1150 y popup 1160 van por ENCIMA de Leaflet (hasta 1100) y por DEBAJO de los
 * popups de los Select (1200, ver components/ui/select.tsx). Importa: dentro del panel hay tres
 * selects y sus listas deben poder salir por encima del sheet.
 */
export default function DriverProfilePanel({
  open,
  onOpenChange,
  onSaved,
}: DriverProfilePanelProps) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-[1150] bg-black/40 data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0" />
        <Dialog.Popup
          className={cn(
            "fixed z-[1160] flex max-h-[92dvh] w-full flex-col overflow-hidden border border-border bg-card text-sm shadow-lg outline-none",
            // Móvil: sheet desde abajo, ancho completo y esquinas superiores redondeadas.
            "inset-x-0 bottom-0 rounded-t-2xl",
            // Desde `sm`: panel lateral derecho a pantalla completa (y sin esquinas arriba).
            "sm:inset-y-0 sm:right-0 sm:left-auto sm:h-full sm:max-h-none sm:w-[26rem] sm:rounded-none sm:rounded-l-2xl",
            "data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0"
          )}
        >
          <DriverProfileForm
            // Se monta de nuevo al abrir: cada apertura parte del perfil guardado y descarta lo que se
            // hubiera escrito sin guardar. Evita cualquier sincronización con efectos.
            key={open ? "abierto" : "cerrado"}
            onSaved={onSaved}
            onClose={() => onOpenChange(false)}
          />
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
