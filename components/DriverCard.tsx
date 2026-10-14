import Link from "next/link";
import { Car, MapPin } from "lucide-react";
import DriverRating from "@/components/DriverRating";
import { formatVehicleType } from "@/lib/pricing";
import type { PublicDriverSummary } from "@/lib/drivers";

/** Iniciales para el avatar provisional ("Juan Pérez" -> "JP"); "?" si no hay nombre usable. */
function initials(name: string): string {
  const parts = name.trim().split(/\s+/).slice(0, 2);
  const letters = parts.map((part) => part.charAt(0).toUpperCase()).join("");
  return letters.length > 0 ? letters : "?";
}

/**
 * Tarjeta del listado público de conductores (Fase 2 / pulido D3). Enlaza al perfil.
 *
 * Jerarquía: avatar + nombre arriba (lo primero que se reconoce), vehículo debajo, valoración a la
 * derecha como referencia rápida, y bio/ciudad como contexto. `active:scale` da respuesta táctil.
 */
export default function DriverCard({ driver }: { driver: PublicDriverSummary }) {
  const vehicleLabel = `${driver.vehicleBrand} ${driver.vehicleModel}${
    driver.vehicleYear !== null ? ` ${driver.vehicleYear}` : ""
  }`;

  return (
    <Link
      href={`/conductores/${driver.id}`}
      className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 shadow-sm transition-all hover:border-ring/50 hover:shadow-md focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none active:scale-[0.99]"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span
            className="grid size-10 shrink-0 place-items-center rounded-full bg-accent text-sm font-semibold text-accent-foreground"
            aria-hidden="true"
          >
            {initials(driver.name)}
          </span>
          <div className="min-w-0">
            <p className="truncate font-semibold text-foreground">{driver.name}</p>
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Car className="size-3.5 shrink-0" aria-hidden="true" />
              <span className="truncate">
                {vehicleLabel} · {formatVehicleType(driver.vehicleType)}
              </span>
            </p>
          </div>
        </div>
        <DriverRating value={driver.ratingAvg} count={driver.ratingCount} className="shrink-0" />
      </div>

      {driver.bio.length > 0 && (
        <p className="line-clamp-2 text-sm text-muted-foreground">{driver.bio}</p>
      )}

      {driver.city !== null && driver.city.length > 0 && (
        <p className="mt-auto flex items-center gap-1.5 text-xs text-muted-foreground">
          <MapPin className="size-3.5 shrink-0" aria-hidden="true" />
          {driver.city}
        </p>
      )}
    </Link>
  );
}
