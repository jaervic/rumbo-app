import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import BottomNav from "@/components/BottomNav";
import SiteHeader from "@/components/SiteHeader";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

/** Descripción reutilizada por metadata, Open Graph y Twitter. */
const DESCRIPTION =
  "Cotiza el precio de un viaje en Venezuela según origen, destino, pasajeros y vehículo. Encuentra conductores cerca y mira sus valoraciones.";

export const metadata: Metadata = {
  // `metadataBase` resuelve las URLs relativas de OG/Twitter (imagen, canonical). En Vercel se define
  // NEXT_PUBLIC_SITE_URL con el dominio final; en local cae a localhost.
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"),
  applicationName: "Rumbo",
  title: "Rumbo · Cotizador de transporte",
  description: DESCRIPTION,
  openGraph: {
    type: "website",
    siteName: "Rumbo",
    title: "Rumbo · Cotizador de transporte",
    description: DESCRIPTION,
    locale: "es_VE",
  },
  twitter: {
    card: "summary_large_image",
    title: "Rumbo · Cotizador de transporte",
    description: DESCRIPTION,
  },
};

/**
 * Mobile-first: el viewport explícito habilita `viewport-fit=cover`, requisito para
 * que `env(safe-area-inset-*)` funcione en iOS (notch y barra inferior del gesto
 * home). No se fija `maximumScale` ni `userScalable`: bloquear el zoom rompe la
 * accesibilidad y el zoom de página en táctil.
 *
 * `themeColor` pinta la barra del navegador en móvil; dos valores para claro y oscuro.
 */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f8f9fb" },
    { media: "(prefers-color-scheme: dark)", color: "#1b1d23" },
  ],
};

/**
 * Script anti-*flash* del tema (D1): se ejecuta ANTES del primer pintado y aplica la clase `dark`
 * según la preferencia guardada o la del sistema. Sin esto, el usuario vería un destello claro antes
 * de que React hidrate. Es intencionadamente un script inline (la CSP ya permite `'unsafe-inline'`
 * para los scripts de hidratación de Next).
 */
const THEME_INIT_SCRIPT = `(function(){try{var k="rumbo-theme";var s=localStorage.getItem(k);var d=s?s==="dark":window.matchMedia("(prefers-color-scheme: dark)").matches;document.documentElement.classList.toggle("dark",d);}catch(e){}})();`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // suppressHydrationWarning: el script añade `dark` al <html> antes de hidratar y React no debe
    // quejarse de esa diferencia esperada.
    <html
      lang="es"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
        {/* Shell global (D2): cabecera pegada arriba y barra inferior en móvil. El espacio para la
            barra inferior lo reserva cada página con `pb-24 md:pb-8`, para no descentrar las que no
            llevan shell (login). */}
        <SiteHeader />
        <div className="flex flex-1 flex-col">{children}</div>
        <BottomNav />
      </body>
    </html>
  );
}
