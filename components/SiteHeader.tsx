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
import ThemeToggle from "@/components/ThemeToggle";

export default function SiteHeader() {
  const pathname = usePathname();

  if (pathname.startsWith("/login")) return null;

  return (
    <header className="sticky top-0 z-[1130] border-b border-border bg-background/85 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-2 px-4 sm:px-6 lg:px-8">
        <Link
          href="/"
          className="flex items-center gap-2 rounded-md font-heading text-lg font-bold tracking-tight text-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          {/* Marca provisional (D4 hará el logo definitivo): inicial de Rumbo en el color de marca. */}
          <span
            className="grid size-7 place-items-center rounded-lg bg-brand text-sm font-bold text-brand-foreground"
            aria-hidden="true"
          >
            R
          </span>
          Rumbo
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
