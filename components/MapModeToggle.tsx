"use client";

import { Flag, MapPin, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { MapSelectionMode } from "@/types";

export interface MapModeToggleProps {
  /** Modo activo (null = el mapa no fija ningún campo). */
  mode: MapSelectionMode | null;
  onModeChange: (mode: MapSelectionMode | null) => void;
}

const OPTIONS: { mode: MapSelectionMode; label: string; Icon: LucideIcon }[] = [
  { mode: "origin", label: "Origen", Icon: MapPin },
  { mode: "destination", label: "Destino", Icon: Flag },
];

/**
 * Toggle para elegir qué campo del viaje se fija con el siguiente toque en el mapa.
 *
 * - Volver a pulsar el botón activo lo APAGA: así se puede cancelar sin tocar el mapa.
 * - `aria-pressed` comunica el estado a los lectores de pantalla (un grupo de dos botones
 *   alternables, no un tablist: no hay paneles que mostrar/ocultar).
 * - El botón activo usa `variant="default"` (primary: casi negro en tema claro, claro en tema
 *   oscuro) y el inactivo `outline` (fondo blanco + borde gris): el contraste lo da el propio
 *   tema, sin colores sueltos.
 * - El activo se agranda un 2 % (`scale-[1.02]`, Fase 3.7): confirma de un vistazo, sin depender
 *   solo del color, qué campo se va a fijar con el siguiente toque.
 * - 44 px de alto en móvil (mínimo táctil) y compacto desde `md`, como el resto del formulario.
 */
export default function MapModeToggle({ mode, onModeChange }: MapModeToggleProps) {
  return (
    <div
      role="group"
      aria-label="Fijar origen o destino tocando el mapa"
      className="flex gap-2"
    >
      {OPTIONS.map(({ mode: optionMode, label, Icon }) => {
        const isActive = mode === optionMode;

        return (
          <Button
            key={optionMode}
            type="button"
            variant={isActive ? "default" : "outline"}
            aria-pressed={isActive}
            aria-label={`Fijar ${label.toLowerCase()} tocando el mapa`}
            onClick={() => onModeChange(isActive ? null : optionMode)}
            className={cn(
              "min-h-11 flex-1 gap-1.5 transition-all duration-150 ease-out md:min-h-9",
              isActive && "scale-[1.02] shadow-sm"
            )}
          >
            <Icon aria-hidden="true" />
            {label}
          </Button>
        );
      })}
    </div>
  );
}
