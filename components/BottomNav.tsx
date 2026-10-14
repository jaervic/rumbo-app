"use client";

/**
 * Navegación inferior para MÓVIL (D2): cuatro pestañas al alcance del pulgar.
 *
 * - Solo se muestra en móvil (`md:hidden`); en escritorio la navegación va en `SiteHeader`.
 * - Se oculta en `/login` y `/auth/*` (páginas de acceso sin shell).
 * - Respeta el `safe-area-inset-bottom` de iOS (barra de gesto) con padding, y `backdrop-blur` para
 *   que se lea sobre el mapa al hacer scroll.
 *
 * z-index `1140`: por encima de los overlays de Leaflet (hasta 1100) y por debajo de los popups de
 * los Select (1200) y del panel de perfil (1150), de modo que un modal tape la barra, no al revés.
 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Calculator, LayoutDashboard, User, Users, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface Tab {
  href: string;
  label: string;
  icon: LucideIcon;
  /** `true` si la pestaña está activa con esta ruta. */
  isActive: (pathname: string) => boolean;
}

const TABS: Tab[] = [
  { href: "/", label: "Cotizador", icon: Calculator, isActive: (p) => p === "/" },
  { href: "/conductores", label: "Conductores", icon: Users, isActive: (p) => p.startsWith("/conductores") },
  { href: "/panel", label: "Mi panel", icon: LayoutDashboard, isActive: (p) => p.startsWith("/panel") },
  { href: "/cuenta", label: "Cuenta", icon: User, isActive: (p) => p.startsWith("/cuenta") },
];

export default function BottomNav() {
  const pathname = usePathname();

  if (pathname.startsWith("/login") || pathname.startsWith("/auth")) return null;

  return (
    <nav
      aria-label="Navegación principal"
      className="fixed inset-x-0 bottom-0 z-[1140] border-t border-border bg-card/95 backdrop-blur md:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <ul className="mx-auto flex max-w-lg items-stretch">
        {TABS.map(({ href, label, icon: Icon, isActive }) => {
          const active = isActive(pathname);

          return (
            <li key={href} className="flex-1">
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                // min-h-14 = 56px: cómodo para el dedo. El icono cambia de color y peso con el estado.
                className={cn(
                  "flex min-h-14 flex-col items-center justify-center gap-0.5 px-1 py-2 text-[11px] font-medium transition-colors",
                  active ? "text-brand" : "text-muted-foreground hover:text-foreground"
                )}
              >
                <Icon className="size-5" strokeWidth={active ? 2.4 : 2} aria-hidden="true" />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
