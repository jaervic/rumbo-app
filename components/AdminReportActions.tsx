"use client";

/**
 * Acciones de moderación sobre un reporte (T): resolver/descartar y, si es de un conductor,
 * suspenderlo. Son Server Actions con comprobación de admin en el servidor.
 */

import { useTransition } from "react";
import { Ban, Check, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { resolveReport, setDriverBan } from "@/lib/actions/admin";

export interface AdminReportActionsProps {
  reportId: string;
  /** Si el reporte es de un conductor, permite suspenderlo; si no, no se muestra. */
  driverId: string | null;
}

export default function AdminReportActions({ reportId, driverId }: AdminReportActionsProps) {
  const [pending, startTransition] = useTransition();

  const resolve = (status: "resolved" | "dismissed") => {
    startTransition(async () => {
      await resolveReport({ reportId, status });
    });
  };

  const ban = () => {
    if (driverId === null) return;
    startTransition(async () => {
      await setDriverBan({ driverId, banned: true });
    });
  };

  return (
    <div className="flex flex-wrap gap-2">
      <Button type="button" size="sm" disabled={pending} onClick={() => resolve("resolved")}>
        {pending ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
        Resolver
      </Button>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        disabled={pending}
        onClick={() => resolve("dismissed")}
      >
        <X className="size-4" />
        Descartar
      </Button>
      {driverId !== null && (
        <Button type="button" size="sm" variant="destructive" disabled={pending} onClick={ban}>
          <Ban className="size-4" />
          Suspender conductor
        </Button>
      )}
    </div>
  );
}
