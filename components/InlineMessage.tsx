import { CircleAlert, CircleCheck, Info, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Mensaje en línea unificado (D3): éxito, error o información, con icono y color de token.
 *
 * Centraliza el feedback para que un mismo estado se vea igual en toda la app (antes cada formulario
 * inventaba su caja de color). `role="alert"` en los errores para que el lector de pantalla los
 * anuncie; `status` para el resto.
 */

type Variant = "success" | "error" | "info";

const STYLES: Record<Variant, { className: string; Icon: LucideIcon }> = {
  success: { className: "border-success/30 bg-success/10 text-success", Icon: CircleCheck },
  error: {
    className: "border-destructive/30 bg-destructive/10 text-destructive",
    Icon: CircleAlert,
  },
  info: { className: "border-border bg-muted/40 text-muted-foreground", Icon: Info },
};

export interface InlineMessageProps {
  variant?: Variant;
  children: React.ReactNode;
  className?: string;
}

export default function InlineMessage({ variant = "info", children, className }: InlineMessageProps) {
  const { className: variantClass, Icon } = STYLES[variant];

  return (
    <p
      role={variant === "error" ? "alert" : "status"}
      className={cn(
        "flex items-start gap-2 rounded-lg border px-3 py-2.5 text-sm",
        variantClass,
        className
      )}
    >
      <Icon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <span className="min-w-0">{children}</span>
    </p>
  );
}
