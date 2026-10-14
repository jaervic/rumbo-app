import Link from "next/link";
import { Car, MapPin } from "lucide-react";
import DriverRating from "@/components/DriverRating";
import { formatVehicleType } from "@/lib/pricing";
import type { PublicDriverSummary } from "@/lib/drivers";

/**
 * Tarjeta del listado público de conductores (Fase 2). Enlaza al perfil completo.
 * Presentacional: toda la información viene ya resuelta desde el servidor.
 */
export default function DriverCard({ driver }: { driver: PublicDriverSummary }) {
  const vehicleLabel = `${driver.vehicleBrand} ${driver.vehicleModel}${
    driver.vehicleYear !== null ? ` ${driver.vehicleYear}` : ""
  }`;

  return (
    <Link
      href={`/conductores/${driver.id}`}
      className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 shadow-sm transition-colors hover:border-ring/60 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-semibold text-foreground">{driver.name}</p>
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Car className="size-3.5 shrink-0" aria-hidden="true" />
            <span className="truncate">
              {vehicleLabel} · {formatVehicleType(driver.vehicleType)}
            </span>
          </p>
        </div>
        <DriverRating value={driver.ratingAvg} count={driver.ratingCount} className="shrink-0" />
      </div>

      {driver.bio.length > 0 && (
        <p className="line-clamp-2 text-sm text-muted-foreground">{driver.bio}</p>
      )}

      {driver.city !== null && driver.city.length > 0 && (
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <MapPin className="size-3.5 shrink-0" aria-hidden="true" />
          {driver.city}
        </p>
      )}
    </Link>
  );
}
