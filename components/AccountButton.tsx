"use client";

/**
 * Botón de cuenta (Fase 1): arriba a la derecha, junto al perfil del conductor.
 *
 * Estado:
 * - Sin Supabase configurado → no se pinta nada (la app sigue igual que antes).
 * - Cargando la sesión → no se pinta nada (evita el salto de "Entrar" a "tu correo").
 * - Sin sesión → enlace a `/login`.
 * - Con sesión → el correo y "Salir".
 *
 * Los `setState` ocurren SOLO en callbacks asíncronos (`getUser().then`, `onAuthStateChange`), nunca
 * en el cuerpo del efecto, que es lo que prohíbe el linter del compilador de React de este repo.
 */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { LogIn, LogOut, UserRound } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/config";

type Status = "loading" | "ready";

export default function AccountButton() {
  const router = useRouter();
  const [status, setStatus] = useState<Status>("loading");
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    if (!isSupabaseConfigured) return;

    const supabase = createClient();
    let active = true;

    void supabase.auth.getUser().then(({ data }) => {
      if (!active) return;
      setEmail(data.user?.email ?? null);
      setStatus("ready");
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setEmail(session?.user?.email ?? null);
      setStatus("ready");
    });

    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  const handleSignOut = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    setEmail(null);
    // El middleware limpia las cookies en la próxima petición; refresca para re-renderizar server.
    router.refresh();
  };

  // Sin backend o mientras se resuelve la sesión, no ocupa sitio ni muestra un estado falso.
  if (!isSupabaseConfigured || status === "loading") return null;

  if (email === null) {
    return (
      <Link
        href="/login"
        className={cn(buttonVariants({ variant: "outline" }), "min-h-10 gap-1.5")}
      >
        <LogIn className="size-4 shrink-0" aria-hidden="true" />
        Entrar
      </Link>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <span className="hidden max-w-[12rem] items-center gap-1.5 truncate text-xs text-muted-foreground sm:flex">
        <UserRound className="size-3.5 shrink-0" aria-hidden="true" />
        {email}
      </span>
      <Button
        type="button"
        variant="ghost"
        onClick={handleSignOut}
        className="min-h-10 gap-1.5"
        aria-label="Cerrar sesión"
      >
        <LogOut className="size-4 shrink-0" aria-hidden="true" />
        Salir
      </Button>
    </div>
  );
}
