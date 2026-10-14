import type { MetadataRoute } from "next";

/**
 * robots.txt (D5). Se permite indexar la parte pública (cotizador, listado y perfiles) y se excluyen
 * las zonas con sesión o de acceso, que no aportan a los buscadores y no deben aparecer en resultados.
 */
export default function robots(): MetadataRoute.Robots {
  const base = (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/$/, "");

  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/panel", "/cuenta", "/login", "/auth/", "/api/"],
      },
    ],
    sitemap: `${base}/sitemap.xml`,
    host: base,
  };
}
