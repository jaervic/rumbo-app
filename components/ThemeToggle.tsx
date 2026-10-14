"use client";

/**
 * Botón de tema claro/oscuro (D1).
 *
 * El icono se decide con CSS (`dark:hidden` / `hidden dark:block`), NO con estado de React: así el
 * botón correcto ya está pintado antes de hidratar —sin parpadeo ni desajuste— y sigue solo el
 * cambio de clase que hace el script anti-flash de `app/layout.tsx`.
 *
 * Al pulsar se guarda la preferencia en `localStorage` (clave `rumbo-theme`, la misma que lee el
 * script) y se conmuta la clase `dark` en <html>.
 */

import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const THEME_STORAGE_KEY = "rumbo-theme";

export default function ThemeToggle({ className }: { className?: string }) {
  const toggleTheme = () => {
    const root = document.documentElement;
    const next = !root.classList.contains("dark");
    root.classList.toggle("dark", next);

    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, next ? "dark" : "light");
    } catch {
      // Sin storage (modo privado) el tema vive solo en la clase actual: no es crítico.
    }
  };

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      onClick={toggleTheme}
      aria-label="Cambiar entre tema claro y oscuro"
      className={cn("min-h-10 min-w-10", className)}
    >
      <Sun className="size-4 dark:hidden" aria-hidden="true" />
      <Moon className="hidden size-4 dark:block" aria-hidden="true" />
    </Button>
  );
}
