"use client";

/**
 * Cabecera global (D2): marca "Rumbo" a la izquierda y controles a la derecha, pegada arriba al
 * hacer scroll (`sticky`) con fondo translúcido.
 *
 * - Se oculta en `/login` (página de acceso sin shell).
 * - En móvil solo lleva la marca y el botón de tema: la cuenta vive en la pestaña "Cuenta" de la
 *   barra inferior, para no saturar una pantalla pequeña. En escritorio sí aparece `AccountButton`.
 *
 * z-index `1130`: por debajo de la barra inferior (1140) y de los popups de Select (1200).
 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import AccountButton from "@/components/AccountButton";
import Logo from "@/components/Logo";
import ThemeToggle from "@/components/ThemeToggle";

export default function SiteHeader() {
  const pathname = usePathname();

  if (pathname.startsWith("/login")) return null;

  return (
    <header className="sticky top-0 z-[1130] border-b border-border bg-background/85 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-2 px-4 sm:px-6 lg:px-8">
        <Link
          href="/"
          aria-label="Rumbo, ir al inicio"
          className="flex items-center rounded-md outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <Logo className="text-lg" />
        </Link>

        <div className="flex items-center gap-1">
          <ThemeToggle />
          <div className="hidden md:block">
            <AccountButton />
          </div>
        </div>
      </div>
    </header>
  );
}
