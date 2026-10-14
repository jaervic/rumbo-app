import type { MetadataRoute } from "next";

/**
 * Manifest de la PWA (D4): permite "Añadir a inicio" en móvil y que la app se abra a pantalla
 * completa (`standalone`) con la barra del sistema en el color de marca.
 *
 * Los iconos son PNG estáticos de `public/` (generados desde la marca): el maskable lleva el pin
 * dentro de la zona segura para que no lo recorte el launcher de Android.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Rumbo · Cotizador de transporte",
    short_name: "Rumbo",
    description:
      "Cotiza el precio de un viaje en Venezuela y encuentra conductores cerca con sus valoraciones.",
    start_url: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#f8f9fb",
    theme_color: "#386695",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
