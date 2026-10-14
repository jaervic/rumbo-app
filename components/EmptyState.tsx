import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Estado vacío reutilizable (D3): icono en un círculo, título, descripción y una acción opcional.
 *
 * Un "no hay nada" sin explicación ni salida deja al usuario perdido; con icono y CTA se entiende qué
 * falta y qué hacer. Borde punteado para distinguirlo de una tarjeta con contenido.
 */
export interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}

export default function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center gap-4 rounded-xl border border-dashed border-border bg-card px-6 py-10 text-center",
        className
      )}
    >
      <span
        className="grid size-12 place-items-center rounded-full bg-muted text-muted-foreground"
        aria-hidden="true"
      >
        <Icon className="size-6" />
      </span>
      <div className="space-y-1">
        <p className="font-medium text-foreground">{title}</p>
        {description !== undefined && (
          <p className="mx-auto max-w-sm text-sm text-muted-foreground">{description}</p>
        )}
      </div>
      {action}
    </div>
  );
}
