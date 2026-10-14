import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import LoginForm from "@/components/LoginForm";

export const metadata: Metadata = {
  title: "Entrar · Cotizador de Transporte",
  description: "Accede con tu correo mediante un enlace de un solo uso.",
};

export default function LoginPage() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-6 bg-background px-4 py-10">
      <div className="w-full max-w-sm space-y-6 rounded-xl border border-border bg-card p-5 shadow-sm sm:p-6">
        <div className="space-y-1.5 text-center">
          <h1 className="text-xl font-semibold tracking-tight text-foreground">Entrar</h1>
          <p className="text-sm text-muted-foreground">
            Accede a tu cuenta de conductor para publicar tu perfil.
          </p>
        </div>

        <LoginForm />
      </div>

      <Link
        href="/"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        Volver al cotizador
      </Link>
    </main>
  );
}
