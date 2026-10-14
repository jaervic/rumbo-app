import type { MetadataRoute } from "next";
import { createPublicClient } from "@/lib/supabase/public";
import { isSupabaseConfigured } from "@/lib/supabase/config";

/**
 * Sitemap (D5): rutas públicas + un perfil por conductor VISIBLE (bueno para SEO de los perfiles).
 *
 * Se genera sin cookies (cliente público). Si Supabase no está configurado o la consulta falla, se
 * devuelven solo las rutas estáticas: el sitemap nunca debe romper el build.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/$/, "");
  const now = new Date();

  const staticRoutes: MetadataRoute.Sitemap = [
    { url: `${base}/`, lastModified: now, changeFrequency: "weekly", priority: 1 },
    { url: `${base}/conductores`, lastModified: now, changeFrequency: "daily", priority: 0.8 },
    { url: `${base}/login`, lastModified: now, changeFrequency: "yearly", priority: 0.3 },
  ];

  if (!isSupabaseConfigured) return staticRoutes;

  try {
    const supabase = createPublicClient();
    const { data } = await supabase
      .from("drivers")
      .select("id, updated_at")
      .eq("is_visible", true)
      .eq("is_active", true)
      .limit(1000);

    const driverRoutes: MetadataRoute.Sitemap = (data ?? []).map((driver) => ({
      url: `${base}/conductores/${driver.id}`,
      lastModified: driver.updated_at !== null ? new Date(driver.updated_at) : now,
      changeFrequency: "weekly",
      priority: 0.6,
    }));

    return [...staticRoutes, ...driverRoutes];
  } catch {
    return staticRoutes;
  }
}
