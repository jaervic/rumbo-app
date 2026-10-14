import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { ArrowLeft, UserPlus, Users } from "lucide-react";
import DriverCard from "@/components/DriverCard";
import DriverGridSkeleton from "@/components/DriverGridSkeleton";
import EmptyState from "@/components/EmptyState";
import { listVisibleDrivers } from "@/lib/drivers";
import { isSupabaseConfigured } from "@/lib/supabase/config";

export const metadata: Metadata = {
  title: "Conductores · Rumbo",
  description: "Conoce a los conductores disponibles, su vehículo y sus valoraciones.",
};

/**
 * Listado público de conductores (Fase 2). La cabecera se pinta al instante y la lista se resuelve
 * dentro de un `Suspense` con esqueleto (D3): navegar a esta pantalla se siente inmediato.
 *
 * No se usa `loading.tsx`: un boundary a nivel de directorio envolvería también a `/conductores/[id]`
 * y convertiría su 404 en un 200 por streaming. El `Suspense` va SOLO alrededor de la lista, donde el
 * 200 es correcto.
 */
export default function DriversPage() {
  return (
    <main className="flex-1 bg-background px-4 pt-8 pb-24 sm:px-6 md:pb-8 lg:px-8">
      <div className="mx-auto max-w-4xl space-y-6">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          Volver al cotizador
        </Link>

        <header className="space-y-1.5">
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight text-foreground">
            <Users className="size-6 text-muted-foreground" aria-hidden="true" />
            Conductores
          </h1>
          <p className="text-sm text-muted-foreground">
            Fichas de conductores con su vehículo y valoraciones de otros clientes.
          </p>
        </header>

        {isSupabaseConfigured ? (
          <Suspense fallback={<DriverGridSkeleton />}>
            <DriverList />
          </Suspense>
        ) : (
          <EmptyState
            icon={Users}
            title="El listado estará disponible pronto"
            description="Cuando la base de datos esté configurada aquí verás los conductores publicados."
          />
        )}
      </div>
    </main>
  );
}

/** Lista real (asíncrona): se resuelve en el servidor dentro del boundary de Suspense. */
async function DriverList() {
  const drivers = await listVisibleDrivers();

  if (drivers.length === 0) {
    return (
      <EmptyState
        icon={UserPlus}
        title="Todavía no hay conductores publicados"
        description="Sé el primero: publica tu ficha y aparecerás aquí para que los clientes te encuentren."
        action={
          <Link
            href="/panel"
            className="inline-flex min-h-11 items-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
          >
            Publicar mi perfil
          </Link>
        }
      />
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {drivers.map((driver) => (
        <DriverCard key={driver.id} driver={driver} />
      ))}
    </div>
  );
}
