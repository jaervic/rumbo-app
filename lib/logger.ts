/**
 * Log estructurado mínimo (P8). Sin dependencias externas: emite una línea JSON por evento, lista
 * para que la plataforma de despliegue (Vercel) las capture y se puedan filtrar por `level`/`event`.
 *
 * Es deliberadamente pequeño: aquí no se registran datos personales ni secretos.
 */

type LogLevel = "info" | "warn" | "error";

interface LogFields {
  [key: string]: unknown;
}

function emit(level: LogLevel, message: string, fields: LogFields): void {
  const line = JSON.stringify({ level, message, time: new Date().toISOString(), ...fields });

  if (level === "error") {
    console.error(line);
  } else if (level === "warn") {
    console.warn(line);
  } else {
    console.log(line);
  }
}

export const logger = {
  info: (message: string, fields: LogFields = {}) => emit("info", message, fields),
  warn: (message: string, fields: LogFields = {}) => emit("warn", message, fields),
  error: (message: string, fields: LogFields = {}) => emit("error", message, fields),
};
