import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Users } from "lucide-react";
import DriverCard from "@/components/DriverCard";
import { listVisibleDrivers } from "@/lib/drivers";
import { isSupabaseConfigured } from "@/lib/supabase/config";

export const metadata: Metadata = {
  title: "Conductores · Cotizador de Transporte",
  description: "Conoce a los conductores disponibles, su vehículo y sus valoraciones.",
};

/**
 * Listado público de conductores (Fase 2). Página dinámica (lee la base con la sesión/cookies), con
 * el cotizador intacto: aquí solo se consulta.
 */
export default async function DriversPage() {
  const drivers = isSupabaseConfigured ? await listVisibleDrivers() : [];

  return (
    <main className="min-h-dvh bg-background px-4 py-8 sm:px-6 lg:px-8">
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

        {!isSupabaseConfigured ? (
          <p className="rounded-lg border border-border bg-muted/40 px-4 py-6 text-center text-sm text-muted-foreground">
            El listado estará disponible cuando se configure Supabase.
          </p>
        ) : drivers.length === 0 ? (
          <p className="rounded-lg border border-border bg-muted/40 px-4 py-6 text-center text-sm text-muted-foreground">
            Todavía no hay conductores publicados.
          </p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {drivers.map((driver) => (
              <DriverCard key={driver.id} driver={driver} />
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
