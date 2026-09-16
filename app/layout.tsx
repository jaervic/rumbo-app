import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Cotizador de Transporte",
  description:
    "Calcula el precio estimado de un viaje en Venezuela según origen, destino, pasajeros y tipo de vehículo.",
};

/**
 * Mobile-first: el viewport explícito habilita `viewport-fit=cover`, requisito para
 * que `env(safe-area-inset-*)` funcione en iOS (notch y barra inferior del gesto
 * home). No se fija `maximumScale` ni `userScalable`: bloquear el zoom rompe la
 * accesibilidad y el zoom de página en táctil.
 */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0a0a" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="es"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
