"use client";

/**
 * Botón de perfil del conductor (Fase 6.2): abre el panel y resume lo guardado ("Juan · Corolla
 * 2015" o "Configurar mi perfil").
 *
 * Mientras no se sabe si hay perfil NO se pinta nada: el HTML del servidor no puede leer localStorage
 * y un botón cuyo texto cambia al hidratar sería un desajuste (ese es el motivo de `loading` en el
 * hook). El hueco que deja es de una línea y evita el salto de texto.
 *
 * El mensaje "Perfil guardado" se muestra aquí, junto al botón, y no con un toast: no hay librería de
 * toasts instalada y un `role="status"` cumple la misma función sin dependencias.
 * TODO (Fase 6.3): valorar el Toast de Base UI (ya está en @base-ui/react) si el aviso necesita
 * apilarse con otros o desaparecer solo con animación.
 */

import { useRef, useState } from "react";
import { Check, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import DriverProfilePanel from "@/components/DriverProfilePanel";
import { useDriverProfile } from "@/hooks/useDriverProfile";
import { cn } from "@/lib/utils";

/** Cuánto tiempo se queda el aviso de éxito en pantalla (ms). */
const SAVED_MESSAGE_MS = 4000;

export interface DriverProfileButtonProps {
  /** Clases del contenedor (la página lo alinea a la derecha). */
  className?: string;
}

export default function DriverProfileButton({ className }: DriverProfileButtonProps) {
  const { profile, loading } = useDriverProfile();
  const [open, setOpen] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const timerRef = useRef<number | null>(null);

  const handleSaved = () => {
    setJustSaved(true);

    // Un solo temporizador vivo: guardar dos veces seguidas no acumula avisos.
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      setJustSaved(false);
    }, SAVED_MESSAGE_MS);
  };

  if (loading) return null;

  const label =
    profile === null
      ? "Configurar mi perfil"
      : `${profile.name} · ${profile.vehicle.model} ${profile.vehicle.year}`;

  return (
    <div className={cn("flex items-center justify-end gap-2", className)}>
      {justSaved && (
        <p role="status" className="text-xs text-muted-foreground">
          Perfil guardado
        </p>
      )}

      <Button
        type="button"
        variant="outline"
        onClick={() => setOpen(true)}
        className="min-h-10 max-w-[16rem] gap-1.5"
      >
        <User className="size-4 shrink-0" aria-hidden="true" />
        <span className="truncate">{label}</span>
        {profile !== null && (
          <Check className="size-4 shrink-0 text-primary" aria-hidden="true" />
        )}
      </Button>

      <DriverProfilePanel open={open} onOpenChange={setOpen} onSaved={handleSaved} />
    </div>
  );
}
