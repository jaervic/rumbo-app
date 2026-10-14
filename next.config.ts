import type { NextConfig } from "next";

/**
 * Configuración de Next.js con una base de seguridad (Fase 0).
 *
 * ¿Por qué cabeceras? La app es hoy estática y solo-cliente, así que la superficie de ataque está en
 * el navegador del usuario: XSS, clickjacking, sniffing de tipos y fuga de referer. La
 * Content-Security-Policy restringe de qué orígenes puede cargar/ejecutar la página; el resto de
 * cabeceras desactiva comportamientos peligrosos por defecto.
 *
 * Decisiones concretas:
 * - `script-src` incluye `'unsafe-inline'` porque Next inyecta scripts inline de hidratación y esta
 *   fase no monta middleware con nonces. Es una mejora real (bloquea orígenes externos) con una
 *   deuda anotada: migrar a nonces cuando haya servidor dinámico (Fase 1).
 * - `'unsafe-eval'` y `ws:` SOLO en desarrollo (Turbopack/HMR los necesitan). En producción se omiten.
 * - HSTS y `upgrade-insecure-requests` SOLO en producción: en localhost forzarían HTTPS y ensucian el
 *   navegador del desarrollador.
 * - Los orígenes externos permitidos son los tres servicios públicos que ya usa la app, sin claves.
 */

const isProduction = process.env.NODE_ENV === "production";

const OSM_TILES = "https://*.tile.openstreetmap.org";
const PHOTON = "https://photon.komoot.io";
const OSRM = "https://router.project-osrm.org";

const contentSecurityPolicy = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  "font-src 'self' data:",
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' data: blob: ${OSM_TILES}`,
  `script-src 'self' 'unsafe-inline'${isProduction ? "" : " 'unsafe-eval'"}`,
  `connect-src 'self' ${PHOTON} ${OSRM}${isProduction ? "" : " ws:"}`,
  "worker-src 'self' blob:",
  "manifest-src 'self'",
  ...(isProduction ? ["upgrade-insecure-requests"] : []),
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: contentSecurityPolicy },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value:
      "camera=(), microphone=(), geolocation=(self), payment=(), usb=(), magnetometer=(), gyroscope=()",
  },
  // HSTS solo en producción: cachear HTTPS para localhost es un dolor innecesario.
  ...(isProduction
    ? [
        {
          key: "Strict-Transport-Security",
          value: "max-age=63072000; includeSubDomains; preload",
        },
      ]
    : []),
];

const nextConfig: NextConfig = {
  // No anunciar el framework en una cabecera que ayuda a fingerprinting.
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
