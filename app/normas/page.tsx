import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, ShieldCheck } from "lucide-react";

export const metadata: Metadata = {
  title: "Normas y privacidad · Rumbo",
  description:
    "Normas de convivencia de Rumbo y cómo tratamos tus datos: sin documentos de identidad y con la ubicación protegida.",
};

/**
 * Normas de la comunidad y resumen de privacidad (T5). Es la página que se acepta al publicar la
 * ficha. Texto claro, sin jerga legal, coherente con un proyecto sin empresa ni KYC.
 */
export default function NormasPage() {
  return (
    <main className="flex-1 bg-background px-4 pt-8 pb-24 sm:px-6 md:pb-8 lg:px-8">
      <div className="mx-auto max-w-2xl space-y-6">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          Volver al cotizador
        </Link>

        <header className="space-y-1.5">
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Normas y privacidad</h1>
          <p className="text-sm text-muted-foreground">
            Rumbo conecta conductores y clientes en Venezuela. Estas normas buscan un uso serio y
            respetuoso.
          </p>
        </header>

        <section className="space-y-2 rounded-xl border border-border bg-card p-4 shadow-sm">
          <h2 className="text-sm font-semibold text-foreground">Normas de la comunidad</h2>
          <ul className="list-disc space-y-1.5 pl-5 text-sm text-muted-foreground">
            <li>Da información veraz: tu nombre, tu vehículo y tus tarifas.</li>
            <li>Trata con respeto. No se toleran amenazas, discriminación ni acoso.</li>
            <li>No uses Rumbo para actividades ilegales ni para engañar a otros usuarios.</li>
            <li>Las reseñas deben reflejar experiencias reales.</li>
            <li>Puedes reportar conductas inapropiadas; las revisamos y podemos suspender cuentas.</li>
          </ul>
        </section>

        <section className="space-y-2 rounded-xl border border-border bg-card p-4 shadow-sm">
          <h2 className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
            <ShieldCheck className="size-4 text-success" aria-hidden="true" />
            Cómo tratamos tus datos
          </h2>
          <ul className="list-disc space-y-1.5 pl-5 text-sm text-muted-foreground">
            <li>
              <strong className="text-foreground">No pedimos documentos de identidad.</strong> La
              confianza se basa en la reputación (reseñas), la moderación y el email de tu cuenta.
            </li>
            <li>
              Tu <strong className="text-foreground">ubicación exacta no se publica</strong>; en la
              búsqueda de cercanía se usa una referencia aproximada.
            </li>
            <li>
              Compartes tu <strong className="text-foreground">teléfono de contacto</strong> solo si
              tú lo decides, y se muestra a los clientes con sesión iniciada.
            </li>
            <li>
              Puedes pedir el borrado de tu perfil; al hacerlo se eliminan tus datos asociados.
            </li>
          </ul>
        </section>

        <p className="text-xs text-muted-foreground">
          Rumbo es un proyecto open source. La app sugiere; cada usuario decide. No sustituye un
          acuerdo entre las partes.
        </p>
      </div>
    </main>
  );
}
