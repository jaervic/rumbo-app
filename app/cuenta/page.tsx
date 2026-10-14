import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { LayoutDashboard, Mail, UserRound, Wallet } from "lucide-react";
import DriverProfileButton from "@/components/DriverProfileButton";
import SignOutButton from "@/components/SignOutButton";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";

export const metadata: Metadata = {
  title: "Cuenta · Rumbo",
  description: "Tu cuenta, tu perfil de cotización y el acceso a tu panel de conductor.",
};

/**
 * Página de cuenta (D2), destino de la pestaña "Cuenta" de la barra inferior. Página dinámica: si no
 * hay sesión, redirige al login.
 */
export default async function CuentaPage() {
  if (!isSupabaseConfigured) {
    return (
      <Shell>
        <p className="text-sm text-muted-foreground">
          Supabase no está configurado. Añade las variables en <code>.env.local</code> para usar tu
          cuenta.
        </p>
      </Shell>
    );
  }

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();

  if (auth.user === null) {
    redirect("/login");
  }

  const email = auth.user.email ?? "(sin correo)";

  return (
    <Shell>
      <h1 className="text-xl font-semibold tracking-tight text-foreground">Cuenta</h1>

      <section className="space-y-2 rounded-xl border border-border bg-card p-4 shadow-sm">
        <h2 className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
          <Mail className="size-4 text-muted-foreground" aria-hidden="true" />
          Sesión iniciada
        </h2>
        <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <UserRound className="size-4 shrink-0" aria-hidden="true" />
          <span className="truncate">{email}</span>
        </p>
      </section>

      <section className="space-y-3 rounded-xl border border-border bg-card p-4 shadow-sm">
        <h2 className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
          <Wallet className="size-4 text-muted-foreground" aria-hidden="true" />
          Perfil de cotización
        </h2>
        <p className="text-sm text-muted-foreground">
          Tu nombre, vehículo y tarifas para calcular precios. Se guardan en este dispositivo.
        </p>
        <div className="flex justify-start">
          <DriverProfileButton />
        </div>
      </section>

      <section className="space-y-3 rounded-xl border border-border bg-card p-4 shadow-sm">
        <h2 className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
          <LayoutDashboard className="size-4 text-muted-foreground" aria-hidden="true" />
          Perfil público
        </h2>
        <p className="text-sm text-muted-foreground">
          Publica tu ficha para que los clientes te encuentren y te valoren.
        </p>
        <Link
          href="/panel"
          className="inline-flex min-h-11 items-center rounded-lg border border-border bg-background px-4 text-sm font-medium text-foreground transition-colors hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
        >
          Ir a mi panel
        </Link>
      </section>

      <SignOutButton className="min-h-11 w-full" />
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-dvh bg-background px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-lg space-y-5">{children}</div>
    </main>
  );
}
