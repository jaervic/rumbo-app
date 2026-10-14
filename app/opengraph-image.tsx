import { ImageResponse } from "next/og";

/**
 * Imagen de Open Graph (D4): la que se ve al compartir el enlace en WhatsApp/redes. Se genera en el
 * servidor con `ImageResponse` (sin depender de un PNG estático con texto y sin fuentes personalizadas
 * que cargar), manteniendo la marca: insignia + "Rumbo" + reclamo.
 */
export const alt = "Rumbo · Cotizador de transporte";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          gap: 44,
          backgroundColor: "#f8f9fb",
          padding: "96px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 32 }}>
          <div
            style={{
              width: 112,
              height: 112,
              borderRadius: 28,
              backgroundColor: "#386695",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#ffffff",
              fontSize: 72,
              fontWeight: 700,
            }}
          >
            R
          </div>
          <div style={{ fontSize: 96, fontWeight: 700, color: "#1c1f26" }}>Rumbo</div>
        </div>
        <div style={{ fontSize: 40, color: "#4a5160" }}>
          Cotiza tu viaje. Encuentra conductores cerca.
        </div>
      </div>
    ),
    size
  );
}
