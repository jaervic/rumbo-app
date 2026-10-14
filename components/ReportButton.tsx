"use client";

/**
 * Botón "Reportar" (T). Solo aparece con sesión iniciada. Abre un formulario mínimo (motivo +
 * detalle opcional) que envía la Server Action `submitReport`; el reporte lo revisa un admin.
 */

import { useState, useTransition } from "react";
import { Flag, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import InlineMessage from "@/components/InlineMessage";
import { submitReport } from "@/lib/actions/drivers";
import type { ReportTargetType } from "@/types/database";

const REASONS = [
  "Lenguaje ofensivo",
  "Datos falsos",
  "Spam o publicidad",
  "Conducta sospechosa",
  "Otro",
] as const;

export interface ReportButtonProps {
  targetType: ReportTargetType;
  targetId: string;
  isAuthenticated: boolean;
}

export default function ReportButton({ targetType, targetId, isAuthenticated }: ReportButtonProps) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<string>(REASONS[0]);
  const [details, setDetails] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [pending, startTransition] = useTransition();

  if (!isAuthenticated) return null;

  if (done) {
    return <InlineMessage variant="success">Gracias, revisaremos tu reporte.</InlineMessage>;
  }

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    setMessage(null);

    startTransition(async () => {
      const result = await submitReport({ targetType, targetId, reason, details });
      if (result.ok) {
        setDone(true);
        return;
      }
      setMessage(result.error ?? "No se pudo enviar el reporte.");
    });
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
      >
        <Flag className="size-3.5" aria-hidden="true" />
        Reportar
      </button>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-2 rounded-lg border border-border bg-muted/30 p-3"
    >
      <label htmlFor="report-reason" className="text-xs font-medium text-foreground">
        Motivo
      </label>
      <select
        id="report-reason"
        value={reason}
        onChange={(event) => setReason(event.target.value)}
        className="w-full rounded-lg border border-input bg-background px-2.5 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
      >
        {REASONS.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>

      <textarea
        value={details}
        onChange={(event) => setDetails(event.target.value)}
        maxLength={1000}
        rows={2}
        placeholder="Detalles (opcional)"
        className="w-full resize-y rounded-lg border border-input bg-transparent px-2.5 py-2 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
      />

      {message !== null && <InlineMessage variant="error">{message}</InlineMessage>}

      <div className="flex items-center gap-2">
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : "Enviar reporte"}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}
