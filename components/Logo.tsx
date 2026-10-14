import { cn } from "@/lib/utils";

/**
 * Marca de Rumbo (D4): un pin de mapa —el mismo símbolo que usa el destino en el mapa del cotizador—
 * sobre un cuadrado redondeado del color de marca.
 *
 * El SVG usa los TOKENS (`var(--brand)` / `var(--brand-foreground)`), así que se adapta solo al modo
 * claro/oscuro sin duplicar el logo. El mismo símbolo es el favicon (`app/icon.svg`) y los iconos de
 * app (`public/icon-*.png`, `app/apple-icon.png`).
 */
export interface LogoProps {
  className?: string;
  /** Oculta el texto "Rumbo" y deja solo la insignia (para espacios estrechos). */
  showWordmark?: boolean;
}

export default function Logo({ className, showWordmark = true }: LogoProps) {
  return (
    <span
      className={cn(
        "flex items-center gap-2 font-heading font-bold tracking-tight text-foreground",
        className
      )}
    >
      <svg viewBox="0 0 32 32" className="size-7 shrink-0" role="img" aria-label="Rumbo">
        <rect width="32" height="32" rx="7" fill="var(--brand)" />
        <path
          d="M16 6.5c-3.7 0-6.7 3-6.7 6.7 0 4.7 6.7 12.3 6.7 12.3s6.7-7.6 6.7-12.3c0-3.7-3-6.7-6.7-6.7z"
          fill="var(--brand-foreground)"
        />
        <circle cx="16" cy="13.2" r="2.5" fill="var(--brand)" />
      </svg>
      {showWordmark && <span>Rumbo</span>}
    </span>
  );
}
