import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import { ArrowLeft, Car, MapPin, MessageCircle, Wallet } from "lucide-react";
import DriverRating from "@/components/DriverRating";
import InlineMessage from "@/components/InlineMessage";
import ReportButton from "@/components/ReportButton";
import { whatsappUrl } from "@/lib/phone";
import ReviewForm from "@/components/ReviewForm";
import ReviewList from "@/components/ReviewList";
import { getPublicDriver, listDriverReviews } from "@/lib/drivers";
import { formatVehicleType } from "@/lib/pricing";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";

export const metadata: Metadata = {
  title: "Perfil del conductor · Cotizador de Transporte",
  description: "Vehículo, tarifas y valoraciones de un conductor.",
};

/** Dólares con 2 decimales y coma decimal, a mano (hidratación coherente). */
function formatUsd(value: number): string {
  return `$${Number(value).toFixed(2).replace(".", ",")}`;
}

export default async function DriverDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  if (!isSupabaseConfigured) {
    return (
      <main className="flex-1 bg-background px-4 pt-8 pb-24 sm:px-6 md:pb-8 lg:px-8">
        <p className="mx-auto max-w-2xl text-sm text-muted-foreground">
          El perfil estará disponible cuando se configure Supabase.
        </p>
      </main>
    );
  }

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  const isAuthenticated = auth.user !== null;

  // El contacto (P5) solo se pide si hay sesión; para anónimos el número no llega ni a la página.
  const driver = await getPublicDriver(id, isAuthenticated);
  if (driver === null) notFound();

  const reviews = await listDriverReviews(id);

  const vehicleLabel = `${driver.vehicleBrand} ${driver.vehicleModel}${
    driver.vehicleYear !== null ? ` ${driver.vehicleYear}` : ""
  }`;

  return (
    <main className="flex-1 bg-background px-4 pt-8 pb-24 sm:px-6 md:pb-8 lg:px-8">
      <div className="mx-auto max-w-2xl space-y-6">
        <Link
          href="/conductores"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          Volver a conductores
        </Link>

        <section className="space-y-3 rounded-xl border border-border bg-card p-4 shadow-sm sm:p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 items-start gap-3">
              {driver.photoUrl !== null && (
                <Image
                  src={driver.photoUrl}
                  alt={`Foto de ${driver.name}`}
                  width={56}
                  height={56}
                  className="size-14 shrink-0 rounded-full object-cover"
                />
              )}
              <div className="min-w-0 space-y-1">
                <h1 className="truncate text-xl font-semibold tracking-tight text-foreground">
                  {driver.name}
                </h1>
                <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
                  <Car className="size-4 shrink-0" aria-hidden="true" />
                  <span className="truncate">
                    {vehicleLabel} · {formatVehicleType(driver.vehicleType)}
                  </span>
                </p>
                {driver.city !== null && driver.city.length > 0 && (
                  <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
                    <MapPin className="size-4 shrink-0" aria-hidden="true" />
                    {driver.city}
                  </p>
                )}
              </div>
            </div>
            <DriverRating
              value={driver.ratingAvg}
              count={driver.ratingCount}
              className="shrink-0 flex-col items-end"
            />
          </div>

          {driver.bio.length > 0 && (
            <p className="text-sm text-muted-foreground">{driver.bio}</p>
          )}
        </section>

        {driver.tariff !== null && (
          <section className="space-y-2 rounded-xl border border-border bg-card p-4 shadow-sm sm:p-5">
            <h2 className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
              <Wallet className="size-4 text-muted-foreground" aria-hidden="true" />
              Tarifas del conductor (USD)
            </h2>
            <dl className="grid grid-cols-2 gap-2 text-sm">
              <div className="flex items-baseline justify-between gap-2 rounded-lg bg-muted/40 px-3 py-2">
                <dt className="text-muted-foreground">Bandera</dt>
                <dd className="font-medium tabular-nums">{formatUsd(driver.tariff.base_fare)}</dd>
              </div>
              <div className="flex items-baseline justify-between gap-2 rounded-lg bg-muted/40 px-3 py-2">
                <dt className="text-muted-foreground">Por km</dt>
                <dd className="font-medium tabular-nums">{formatUsd(driver.tariff.cost_per_km)}</dd>
              </div>
              <div className="flex items-baseline justify-between gap-2 rounded-lg bg-muted/40 px-3 py-2">
                <dt className="text-muted-foreground">Por minuto</dt>
                <dd className="font-medium tabular-nums">{formatUsd(driver.tariff.cost_per_min)}</dd>
              </div>
              <div className="flex items-baseline justify-between gap-2 rounded-lg bg-muted/40 px-3 py-2">
                <dt className="text-muted-foreground">Mínima</dt>
                <dd className="font-medium tabular-nums">{formatUsd(driver.tariff.min_fare)}</dd>
              </div>
            </dl>
          </section>
        )}

        {/* Contacto (P5): el número solo aparece con sesión; sin sesión se invita a entrar. */}
        {driver.phone !== null ? (
          <a
            href={whatsappUrl(
              driver.phone,
              `Hola ${driver.name}, vi tu perfil en Rumbo y quiero cotizar un viaje.`
            )}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-success px-4 text-sm font-semibold text-success-foreground transition-colors hover:bg-success/90 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
          >
            <MessageCircle className="size-4" aria-hidden="true" />
            Contactar por WhatsApp
          </a>
        ) : driver.hasContact && !isAuthenticated ? (
          <InlineMessage variant="info">
            <Link href="/login" className="font-medium text-foreground underline underline-offset-4">
              Inicia sesión
            </Link>{" "}
            para ver el contacto de {driver.name}.
          </InlineMessage>
        ) : null}

        <section className="space-y-4">
          <h2 className="text-sm font-semibold text-foreground">
            Reseñas {driver.ratingCount > 0 ? `(${driver.ratingCount})` : ""}
          </h2>
          <ReviewList reviews={reviews} isAuthenticated={isAuthenticated} />
          <div className="rounded-xl border border-border bg-card p-3 shadow-sm sm:p-4">
            <ReviewForm driverId={driver.id} isAuthenticated={isAuthenticated} />
          </div>
        </section>

        {/* Reporte del perfil (T): solo con sesión. Lo revisa un admin. */}
        <div className="flex justify-center pt-2">
          <ReportButton targetType="driver" targetId={driver.id} isAuthenticated={isAuthenticated} />
        </div>
      </div>
    </main>
  );
}
