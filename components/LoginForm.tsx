"use client";

/**
 * Formulario de acceso por ENLACE MÁGICO (Fase 1).
 *
 * Se escribe el correo y Supabase envía un enlace de un solo uso; no hay contraseñas que guardar, lo
 * que reduce la superficie de seguridad. El `emailRedirectTo` apunta a `/auth/callback`, que es quien
 * canjea el código por una sesión.
 *
 * Sin Supabase configurado el formulario lo dice y no intenta nada: la app no debe romperse por no
 * tener `.env.local`.
 */

import { useState } from "react";
import { Loader2, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/config";

/** Validación local mínima; el servidor valida de nuevo. Evita peticiones con basura. */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type Status = "idle" | "sending" | "sent" | "error";

export default function LoginForm() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [message, setMessage] = useState("");

  const configured = isSupabaseConfigured;

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    const trimmed = email.trim();

    if (!EMAIL_PATTERN.test(trimmed)) {
      setStatus("error");
      setMessage("Escribe un correo válido.");
      return;
    }

    if (!configured) {
      setStatus("error");
      setMessage("Falta configurar Supabase. Añade las variables en .env.local.");
      return;
    }

    setStatus("sending");
    setMessage("");

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email: trimmed,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });

    if (error) {
      setStatus("error");
      setMessage("No se pudo enviar el enlace. Inténtalo de nuevo en un momento.");
      return;
    }

    setStatus("sent");
  };

  if (status === "sent") {
    return (
      <div className="space-y-4 text-center" role="status">
        <Mail className="mx-auto size-8 text-primary" aria-hidden="true" />
        <div className="space-y-1">
          <p className="font-medium text-foreground">Revisa tu correo</p>
          <p className="text-sm text-muted-foreground">
            Enviamos un enlace de acceso a <strong className="font-medium">{email.trim()}</strong>. Ábrelo
            en este mismo dispositivo.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          className="min-h-11 w-full"
          onClick={() => {
            setStatus("idle");
            setMessage("");
          }}
        >
          Usar otro correo
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-4">
      <div className="grid gap-2">
        <Label htmlFor="login-email">Correo electrónico</Label>
        <Input
          id="login-email"
          type="email"
          inputMode="email"
          autoComplete="email"
          placeholder="tucorreo@ejemplo.com"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          aria-invalid={status === "error"}
          aria-describedby="login-help"
          className="min-h-11 text-base md:min-h-0 md:text-sm"
        />
        <p
          id="login-help"
          role={status === "error" ? "alert" : undefined}
          className={
            status === "error" ? "text-xs text-destructive" : "text-xs text-muted-foreground"
          }
        >
          {status === "error" ? message : "Te enviaremos un enlace para entrar, sin contraseña."}
        </p>
      </div>

      <Button type="submit" className="min-h-11 w-full font-semibold" disabled={status === "sending"}>
        {status === "sending" ? (
          <>
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            Enviando…
          </>
        ) : (
          "Enviar enlace de acceso"
        )}
      </Button>
    </form>
  );
}
