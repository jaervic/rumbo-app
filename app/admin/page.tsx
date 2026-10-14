import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, ShieldAlert } from "lucide-react";
import AdminReportActions from "@/components/AdminReportActions";
import EmptyState from "@/components/EmptyState";
import { getCurrentProfile, listOpenReports } from "@/lib/drivers";
import { isSupabaseConfigured } from "@/lib/supabase/config";

export const metadata: Metadata = {
  title: "Moderación · Rumbo",
  // Zona privada: fuera de los buscadores.
  robots: { index: false, follow: false },
};

/**
 * Panel de moderación (T). Solo para admins (`profiles.is_admin`). Sin sesión redirige al login; con
 * sesión pero sin rol de admin devuelve 404 (no se revela que existe).
 */
export default async function AdminPage() {
  if (!isSupabaseConfigured) {
    return (
      <main className="flex-1 bg-background px-4 py-8 sm:px-6 lg:px-8">
        <p className="mx-auto max-w-2xl text-sm text-muted-foreground">
          Supabase no está configurado.
        </p>
      </main>
    );
  }

  const profile = await getCurrentProfile();
  if (profile === null) redirect("/login");
  if (!profile.isAdmin) notFound();

  const reports = await listOpenReports();

  return (
    <main className="flex-1 bg-background px-4 pt-8 pb-24 sm:px-6 md:pb-8 lg:px-8">
      <div className="mx-auto max-w-2xl space-y-6">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          Volver al cotizador
        </Link>

        <header className="space-y-1.5">
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight text-foreground">
            <ShieldAlert className="size-6 text-muted-foreground" aria-hidden="true" />
            Moderación
          </h1>
          <p className="text-sm text-muted-foreground">
            Reportes abiertos. Resuélvelos o suspende la cuenta si procede.
          </p>
        </header>

        {reports.length === 0 ? (
          <EmptyState
            icon={ShieldAlert}
            title="Sin reportes abiertos"
            description="Cuando alguien reporte un perfil o una reseña, aparecerá aquí."
          />
        ) : (
          <ul className="space-y-3">
            {reports.map((report) => (
              <li
                key={report.id}
                className="space-y-3 rounded-xl border border-border bg-card p-4 shadow-sm"
              >
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-medium text-foreground">{report.reason}</p>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {report.targetType === "driver" ? "Conductor" : "Reseña"}
                  </span>
                </div>

                {report.details.length > 0 && (
                  <p className="text-sm text-muted-foreground">{report.details}</p>
                )}

                <p className="text-xs text-muted-foreground">
                  Reportado por {report.reporterName} ·{" "}
                  {report.targetType === "driver" ? (
                    <Link
                      href={`/conductores/${report.targetId}`}
                      className="underline underline-offset-4 hover:text-foreground"
                    >
                      ver ficha
                    </Link>
                  ) : (
                    <span>id {report.targetId.slice(0, 8)}…</span>
                  )}
                </p>

                <AdminReportActions
                  reportId={report.id}
                  driverId={report.targetType === "driver" ? report.targetId : null}
                />
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
