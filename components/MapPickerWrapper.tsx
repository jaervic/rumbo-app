"use client";

import dynamic from "next/dynamic";
import type { MapPickerProps } from "@/components/MapPicker";

// El import dinámico con ssr: false debe vivir dentro de un Client Component.
// Este wrapper se encarga de eso para que los Server Components (ej: app/page.tsx)
// puedan renderizar el mapa de forma segura.
const MapPicker = dynamic(() => import("@/components/MapPicker"), {
  ssr: false,
  loading: () => (
    <div className="h-[400px] w-full animate-pulse rounded-xl bg-muted flex items-center justify-center border">
      <span className="text-muted-foreground">Cargando mapa...</span>
    </div>
  ),
});

export default function MapPickerWrapper(props: MapPickerProps) {
  return <MapPicker {...props} />;
}
