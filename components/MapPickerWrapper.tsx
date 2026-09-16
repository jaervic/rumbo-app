"use client";

import dynamic from "next/dynamic";
import type { MapPickerProps } from "@/components/MapPicker";
import { MAP_HEIGHT_CLASS } from "@/lib/mapConfig";
import { cn } from "@/lib/utils";

// El import dinámico con ssr: false debe vivir dentro de un Client Component.
// Este wrapper se encarga de eso para que los Server Components (ej: app/page.tsx)
// puedan renderizar el mapa de forma segura.
const MapPicker = dynamic(() => import("@/components/MapPicker"), {
  ssr: false,
  // El skeleton reutiliza MAP_HEIGHT_CLASS para tener exactamente el mismo alto que
  // el mapa y evitar el salto de layout (CLS) al terminar la carga.
  loading: () => (
    <div
      className={cn(
        MAP_HEIGHT_CLASS,
        "flex w-full animate-pulse items-center justify-center rounded-xl border bg-muted"
      )}
    >
      <span className="text-sm text-muted-foreground">Cargando mapa...</span>
    </div>
  ),
});

export default function MapPickerWrapper(props: MapPickerProps) {
  return <MapPicker {...props} />;
}
