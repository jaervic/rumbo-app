"use client";

/**
 * Botón de cerrar sesión (D2), para la página `/cuenta`.
 *
 * Separado de `AccountButton` porque aquí la intención es explícita (no un menú de estado): cierra la
 * sesión, vuelve al inicio y refresca para que el servidor vuelva a renderizar sin usuario.
 */

import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";

export default function SignOutButton({ className }: { className?: string }) {
  const router = useRouter();

  const handleSignOut = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/");
    router.refresh();
  };

  return (
    <Button
      type="button"
      variant="outline"
      onClick={handleSignOut}
      className={className}
    >
      <LogOut className="size-4" aria-hidden="true" />
      Cerrar sesión
    </Button>
  );
}
