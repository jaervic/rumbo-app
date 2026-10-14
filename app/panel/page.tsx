import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, ExternalLink } from "lucide-react";
import DriverProfileForm from "@/components/DriverProfileForm";
import { getMyDriver } from "@/lib/drivers";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";

export const metadata: Metadata = {
  title: "Mi panel · Cotizador de Transporte",
  description: "Publica tu ficha de conductor y gestiona tus tarifas.",
};

/**
 * Panel del conductor (Fase 2). Es una página dinámica: depende de la sesión, así que se renderiza
 * por petición. Sin sesión redirige al login; sin Supabase configurado muestra un aviso.
 */
export default async function PanelPage() {
  if (!isSupabaseConfigured) {
    return (
      <Shell>
        <p className="text-sm text-muted-foreground">
          Supabase no está configurado. Añade las variables en <code>.env.local</code> para publicar tu
          perfil.
        </p>
      </Shell>
    );
  }

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();

  if (auth.user === null) {
    redirect("/login");
  }

  const driver = await getMyDriver(auth.user.id);

  return (
    <Shell>
      <div className="space-y-5 rounded-xl border border-border bg-card p-4 shadow-sm sm:p-6">
        <div className="space-y-1">
          <h1 className="text-xl font-semibold tracking-tight text-foreground">Mi ficha pública</h1>
          <p className="text-sm text-muted-foreground">
            Publica tu perfil para que los clientes te encuentren y valoraciones.
          </p>
        </div>

        {driver !== null && driver.isVisible && (
          <Link
            href={`/conductores/${driver.id}`}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-foreground underline underline-offset-4"
          >
            Ver mi perfil público
            <ExternalLink className="size-3.5" aria-hidden="true" />
          </Link>
        )}

        <DriverProfileForm initial={driver} />
      </div>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-dvh bg-background px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-2xl space-y-5">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          Volver al cotizador
        </Link>
        {children}
      </div>
    </main>
  );
}
