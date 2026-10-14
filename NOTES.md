# NOTES.md — Documentación viva del proyecto

> Este archivo es la **fuente de verdad** del proyecto. Si abres un nuevo chat 
> en Cline o DeepSeek, pega este archivo como contexto inicial. Actualízalo 
> cuando cambies algo estructural, no en cada micro-cambio.

**Última actualización:** P5 (contacto por WhatsApp)

---

## 1. Qué es este proyecto

Web-app para **cotizar el precio de un servicio de transporte en Venezuela**. 
Dirigida a **conductores independientes** (no a pasajeros). El conductor 
configura sus propias tarifas, ingresa origen y destino, y obtiene un precio 
estimado con desglose.

**Propósito real:**
- Resolver la fricción operativa diaria del cálculo de tarifas.
- Ajustar precios a la realidad económica venezolana (inflación, gasolina, 
  tasa de cambio).
- Dar **velocidad**: el conductor debe cotizar en segundos, no minutos.
- Dar **transparencia**: mostrar desglose para negociar con el cliente.

**Diferenciador frente a Ridery/Yummy:**
- Ridery/Yummy fijan precios. Esta app deja al conductor fijar sus tarifas.
- Es un cotizador, no una plataforma de viajes. No conecta pasajeros con 
  conductores, solo calcula precios.

**Aspecto ético (del documento de ideas):**
- Promueve comercio justo.
- Protege al conductor de pérdidas por inflación o subestimación.
- Protege al usuario de tarifas arbitrarias.
- La app sugiere, el conductor decide. Debe quedar claro en la UI.

**URL de producción:** https://proyectotransporte.vercel.app/
**Repositorio:** https://github.com/jaervic/proyectotransporte

---

## 2. Estado actual (fase 8.2)

La app **funciona end-to-end y está deployada**.

**Lo que hace hoy:**
- Autocompletado de direcciones con Photon + lista local de POIs venezolanos.
- Mapa Leaflet interactivo con marcadores de origen/destino/ubicación actual.
- Cálculo de ruta con OSRM (distancia y duración).
- Motor de precios con tarifas por vehículo, factores de tráfico y pasajeros.
- Precio en vivo con rango min/max y desglose colapsable.
- Perfil del conductor (nombre + vehículo + tarifas propias) en localStorage.
- Catálogo de vehículos con marcas/modelos venezolanos (incluye antiguos).
- Responsive mobile-first.
- Deploy en Vercel con HTTPS y redeploy automático por cada push a main.

**Lo que NO hace todavía:**
- Hay **login** (enlace mágico), **perfiles públicos y reseñas** (Fase 2) y esquema en Supabase. El
  perfil del conductor para COTIZAR sigue en `localStorage` (la migración a la nube se pospone).
- No hay búsqueda por cercanía (Fase 3) ni fotos de perfil. Proyecto open source con donaciones (sin
  suscripción).
- No hay conversión a bolívares (solo USD).
- No hay historial de carreras.
- No hay rutas guardadas.
- No hay múltiples paradas.
- No hay monetización.
- No hay analytics.

---

## 3. Stack técnico

- **Next.js 16.4** con App Router
- **TypeScript estricto** (prohibido `any`)
- **Vitest** para pruebas del motor (suite en `lib/pricing.test.ts`)
- **Tailwind CSS v4**
- **shadcn/ui** (Base UI + preset Nova + Lucide + Geist)
- **Leaflet** + OpenStreetMap para el mapa
- **Photon** (https://photon.komoot.io) para autocompletado y reverse geocoding
- **OSRM público** (https://router.project-osrm.org) para rutas y distancias
- **localStorage** para el perfil del conductor (por ahora)
- **Vercel** para deploy
- **Supabase** (auth + Postgres + RLS) — Fase 1: enlace mágico y esquema en `supabase/migrations/`

**APIs externas (todas gratis, sin clave):**
- Photon: geocoding y reverse geocoding
- OSRM: rutas
- OpenStreetMap: tiles del mapa

**Futuro probable:**
- **Supabase Storage** (fotos de perfil de conductor) y sincronización del `DriverProfile` a la
  nube — pendiente (el auth y el esquema ya están en la Fase 1)
- **API del BCV** o `ve.dolarapi.com` para tasa de cambio — Fase 9.1
- **Open-Meteo** para clima (opcional, no implementado)

---

## 4. Arquitectura de archivos

```
app/
  layout.tsx              → layout raíz, metadata, viewport
  page.tsx                → página principal, integra todo
  error.tsx               → límite de error (Client Component, con reset)
  not-found.tsx           → 404
  login/page.tsx          → acceso por enlace mágico (Fase 1)
  auth/callback/route.ts  → canjea el código por sesión (Fase 1)
  conductores/page.tsx    → listado público de conductores (Fase 2)
  conductores/[id]/page.tsx → perfil público + reseñas (Fase 2)
  panel/page.tsx          → publicar/editar la ficha del conductor (Fase 2)
  cuenta/page.tsx         → cuenta: sesión, perfil de cotización y acceso al panel (D2)
  admin/page.tsx          → moderación, solo admin (T)
  normas/page.tsx         → normas de la comunidad y privacidad (T)
  globals.css             → estilos globales Tailwind
proxy.ts                  → refresco de sesión Supabase (convención proxy de Next 16)

components/
  QuoteForm.tsx           → formulario (origen, destino, pasajeros, vehículo)
  MapPicker.tsx           → mapa Leaflet con marcadores y polyline
  MapPickerWrapper.tsx    → wrapper con dynamic import ssr:false
  MapModeToggle.tsx       → toggle Origen/Destino para tocar el mapa
  PriceCard.tsx           → precio en vivo con desglose colapsable
  VehicleSelector.tsx     → selector marca/modelo/año filtrado por tipo
  TariffEditor.tsx        → editor de tarifas del conductor con preview
  DriverProfilePanel.tsx  → panel de perfil (sheet/dialog)
  DriverProfileButton.tsx → botón de perfil arriba de la página
  AccountButton.tsx       → sesión: Entrar / correo + Salir (Fase 1)
  LoginForm.tsx           → formulario de enlace mágico (Fase 1)
  DriverCard.tsx          → tarjeta del listado público (Fase 2)
  DriverRating.tsx        → valoración en estrellas (Fase 2)
  DriverProfileForm.tsx   → formulario de la ficha pública (Fase 2)
  ReviewList.tsx          → lista de reseñas (Fase 2)
  ReviewForm.tsx          → formulario de reseña (Fase 2)
  ThemeToggle.tsx         → botón claro/oscuro (D1)
  SiteHeader.tsx          → cabecera sticky con marca + cuenta (D2)
  BottomNav.tsx           → barra inferior móvil de 4 pestañas (D2)
  SignOutButton.tsx       → cerrar sesión, para /cuenta (D2)
  InlineMessage.tsx       → feedback unificado éxito/error/info (D3)
  EmptyState.tsx          → estado vacío con icono, texto y CTA (D3)
  DriverGridSkeleton.tsx  → esqueleto del listado de conductores (D3)
  Logo.tsx                → marca (pin + wordmark) con tokens (D4)
  ReportButton.tsx        → reportar un perfil (T)
  AdminReportActions.tsx  → resolver/descartar/banear en /admin (T)
  ui/                     → componentes de shadcn/ui

lib/
  geocoding.ts            → Photon + reverse + sesgo geográfico
  popularPlaces.ts        → lista curada de POIs venezolanos (~46 lugares)
  routing.ts              → OSRM + cache de rutas
  pricing.ts              → motor de precios (tarifas, factores, rango)
  pricing.test.ts         → suite Vitest del motor (Fase 0)
  vehicleCatalog.ts       → catálogo de marcas/modelos venezolanos
  driverProfile.ts        → gestión del perfil en localStorage
  mapConfig.ts            → constantes de altura del mapa
  utils.ts                → utilidades (cn de shadcn)
  validation.ts           → esquemas Zod (frontera de seguridad) (Fase 2)
  drivers.ts              → lecturas públicas de conductores/reseñas (Fase 2)
  actions/drivers.ts      → Server Actions: publicar ficha y reseñar (Fase 2)
  supabase/
    config.ts             → URL/anon key y bandera isSupabaseConfigured (Fase 1)
    client.ts             → cliente browser singleton (Fase 1)
    server.ts             → cliente server por petición, sobre cookies (Fase 1)
    session.ts            → updateSession: refresco de sesión del proxy (Fase 1)

hooks/
  useRoute.ts             → calcula ruta con OSRM, maneja loading/error
  useUserLocation.ts      → geolocalización del navegador
  useDriverProfile.ts     → carga/guarda/borra perfil de localStorage

types/
  index.ts                → tipos generales (QuoteRequest, QuoteResult, etc.)
  vehicle.ts              → tipo Vehicle
  database.ts             → tipos de las tablas de Supabase (Fase 1)

supabase/
  migrations/0001_init.sql → tablas + RLS + triggers (Fase 1)

public/                   → assets estáticos
```

**Archivos clave de configuración:**
- `.gitignore` — excluye node_modules, .next, .env*, *.log, .DS_Store, .vercel
- `.env.local.example` — variables de Supabase (Fase 1; opcionales: sin ellas el cotizador funciona)
- `next.config.ts` — cabeceras de seguridad (CSP, HSTS, Permissions-Policy...) y `poweredByHeader:false`
- `vitest.config.mts` — runner de pruebas (entorno node + alias `@`)
- `components.json` — configuración de shadcn/ui
- `tsconfig.json`, `eslint.config.mjs`, `postcss.config.mjs`

---

## 5. Historia de fases

### Fase 1 — Setup base ✅
- Next.js 16 + TypeScript + Tailwind v4 + shadcn/ui.
- Estructura de carpetas.
- Tipos base vacíos.
- Esqueleto de `lib/pricing.ts`.

### Fase 2 — Formulario + mapa Leaflet ✅
- Formulario con origen, destino, pasajeros, tipo de vehículo.
- Mapa Leaflet con Venezuela centrada.
- Fix de `ssr: false` con `MapPickerWrapper` (Client Component).

### Fase 3 — Geocoding con Photon ✅
- Autocompletado con Photon (mejor que Nominatim para prefix matching).
- Marcadores de origen y destino en el mapa.
- `fitBounds` para encuadrar ambos puntos.

### Fase 3.5 — Autocompletado avanzado ✅
- Lista de sugerencias con dropdown flotante.
- Sesgo geográfico a región central de Venezuela (Caracas por defecto).
- Lista local de POIs populares (`lib/popularPlaces.ts`) que se consulta 
  antes de Photon.
- Diferenciación de resultados (urbanización/avenida incluidos).
- Geolocalización del usuario para sesgar por cercanía.
- Fijar origen/destino tocando el mapa (toggle).

### Fase 3.6 — Responsive mobile-first ✅
- Layout en columna en móvil, dos columnas en desktop.
- Constante `MAP_HEIGHT_CLASS` centralizada.
- Inputs grandes (48px), text-base para evitar zoom en iOS.

### Fase 3.7 — UI/UX polish ✅
- Marcador azul pulsante de ubicación del usuario.
- Marcadores diferenciados (verde origen, rojo destino).
- Estados de carga ("Calculando ruta...", "Buscando dirección...").
- Botón GPS con estados.
- `RouteInfoCard` con distancia y duración.

### Fase 4 — OSRM ✅
- Cálculo de ruta, distancia y duración.
- Polyline azul en el mapa.
- Cache por par de coordenadas.

### Fase 5 — Motor de precios ✅
- Tabla de tarifas por vehículo (moto, sedan, suv, van).
- Factores: vehículo, pasajeros, tráfico, recargo nocturno.
- Rango ±12% con piso en tarifa mínima.
- Duración ajustada por franja horaria de Venezuela.
- Precio en vivo con desglose.

### Fase 5.1 — Claridad en desglose ✅
- "Sedán · 3 pasajeros (2 adicionales)".
- "Precio estimado para este viaje (USD)".

### Fase 5.2 — Fix dropdown z-index ✅
- El Select de vehículo ya no queda tapado por elementos inferiores.

### Fase 5.3 — Capacidad por vehículo ✅
- Moto: 1 pasajero, Sedán: 5, SUV: 6, Van: 6.
- Input de pasajeros ajusta automáticamente.

### Fase 6.1 — Catálogo de vehículos ✅
- Marcas y modelos venezolanos (incluye modelos antiguos 80s-2000s).
- `getBrandsByVehicleType()` para filtrar (moto solo muestra motos).
- `VehicleSelector` con cascada marca → modelo → año.
- No integrado todavía al QuoteForm (se usaría en el perfil).

### Fase 6.2 — Panel del conductor ✅
- Perfil con nombre + vehículo + tarifas propias (Nivel 1).
- Persistencia en localStorage (`cotizador.driverProfile.v1`).
- Preview de tarifas en vivo.
- El QuoteForm usa la config del conductor automáticamente.

### Fase 6.2.1 — Fix panel ✅
- El panel ya no se cierra al tocar inputs.
- Layout con ancho máximo (`max-w-lg`).

### Fase 6.2.2 — Claridad bandera vs mínima ✅
- Textos de ayuda en cada campo.
- Dos ejemplos en el preview (normal y corto).

### Fase 8 — Preparación para Vercel ✅
- `.gitignore` y `README.md` listos.
- Deploy exitoso en Vercel.

### Fase 8.1 — Fix bugs móviles ✅
- Input de pasajeros permite valores intermedios en móvil.
- Cotización funciona en móvil tras elegir ubicaciones.
- Vehículo opcional colapsable en QuoteForm.
- "sedan" → "Sedán" en la UI.

### Fase 8.2 — Refinamientos UX pre-validación ✅
- Eliminada duplicación de "Vehículo" (perfil manda si existe).
- Eliminada redundancia del precio recomendado.
- Toggle Origen/Destino movido arriba del mapa.
- Steppers (+/−) en input de pasajeros.

### Fase 0 — Saneamiento, seguridad y pruebas ✅
- Actualizado **Next.js 16.3.5 → 16.4.0** (el 16.3.5 tenía una vulnerabilidad crítica: RCE en
  `next/og`). `npm audit fix` aplicado; queda solo `braces` (dev, CLI de shadcn, fuera del bundle).
- **Guard `isVehicleType`** (`types/index.ts`) + `isDriverProfile` endurecido (`year` entero positivo,
  tipo válido): un perfil corrupto en localStorage ya no puede tumbar `estimatePrice`.
- **Páginas** `app/error.tsx`, `app/not-found.tsx` y `app/loading.tsx` (antes: pantalla en blanco).
- **Cabeceras de seguridad** en `next.config.ts` (CSP, HSTS, `nosniff`, `frame-ancestors`, Permissions
  -Policy, `poweredByHeader:false`). CSP con `'unsafe-inline'` (deuda: nonces en la Fase 1).
- **Eliminada** la carga de iconos desde `unpkg.com` en `MapPicker.tsx` (todos los marcadores usan
  `divIcon`): menos dependencia externa y CSP más simple.
- **Vitest** instalado y suite `lib/pricing.test.ts` (17 pruebas) del motor. Scripts `test`,
  `test:watch`, `typecheck`. `@types/node` alineado a `^22` (Node real).

### Fase 1 — Supabase + auth por enlace mágico ✅
- Paquetes: `@supabase/supabase-js`, `@supabase/ssr`, `zod` (para validación de Fase 2+).
- Clientes en `lib/supabase/`: `config.ts` (bandera `isSupabaseConfigured`), `client.ts` (browser,
  singleton), `server.ts` (por petición, sobre cookies) y `session.ts` (`updateSession`).
- `proxy.ts` (convención **proxy** de Next 16, antes `middleware`) refresca la sesión y **es no-op
  sin variables**: el cotizador sigue estático y funcional sin backend.
- UI: `/login` + `components/LoginForm.tsx` (enlace mágico, sin contraseñas) y
  `/auth/callback/route.ts` (canje del código con guard anti *open redirect*). `AccountButton` en la
  cabecera muestra Entrar / correo + Salir.
- Esquema `supabase/migrations/0001_init.sql`: `profiles`, `drivers`, `driver_tariffs` y `reviews`
  (`plans`/`subscriptions` se retiraron en P1); **RLS en todas**; triggers de `updated_at`, alta de
  `profile` y recálculo de `rating_avg`/`rating_count`. PostGIS (`location`) preparado para la Fase 3.
- Decisión: el `DriverProfile` **sigue en localStorage**; la migración a la nube se pospone.
- Pendiente de esta fase (deuda): CSP con nonces cuando haya más superficie dinámica.

### Fase 2 — Perfiles públicos y reseñas ✅
- Rutas: `/conductores` (listado), `/conductores/[id]` (perfil + reseñas) y `/panel` (publicar/editar
  la ficha del conductor). Todas dinámicas (leen la base con la sesión).
- Datos: `lib/drivers.ts` (lecturas) con consultas planas combinadas en memoria para no depender de
  la inferencia de *joins*. Escritura con **Server Actions** (`lib/actions/drivers.ts`).
- Seguridad: **Zod** (`lib/validation.ts`) valida todo input; la sesión se resuelve en el servidor;
  RLS como última barrera. Reseñas: 1 por cliente/conductor, sin autoevaluación, y un trigger
  recalcula `rating_avg`/`rating_count`.
- Se eliminó `app/loading.tsx`: el límite de streaming raíz convertía los 404/redirects en 200. Ahora
  `/conductores/[id]` inexistente devuelve **404** y `/panel` sin sesión **307 → /login**.
- Bug de configuración detectado y blindado: si `NEXT_PUBLIC_SUPABASE_URL` trae `/rest/v1/`, el SDK
  duplicaba la ruta; `lib/supabase/config.ts` la normaliza (y se corrigió el `.env.local`).
- Pendiente: subir foto de perfil (Storage), editar/borrar reseña desde la UI y geolocalización de
  cercanía (Fase 3).

### D1 — Sistema de diseño y tema "Rumbo" ✅
- Marca: **Rumbo**. Acento **azul pizarra suave**, base *off-white* grisácea (homenaje al taxi blanco
  venezolano). Decisión de producto: la identidad de color se apoya en los taxis blancos locales, no
  en el amarillo internacional.
- `app/globals.css`: paletas clara y oscura recalibradas, tokens semánticos (`brand`, `success`,
  `warning`, `info`, `destructive`), `color-scheme`, radios y `theme-color`. **Corregido** el token
  `--font-sans` (antes autorreferente: Geist Sans no se aplicaba).
- **Modo oscuro real**: script inline anti-*flash* en `app/layout.tsx` + `components/ThemeToggle.tsx`
  (el icono cambia con CSS `dark:`, sin estado ni parpadeo). Persiste en `localStorage` (`rumbo-theme`)
  y respeta `prefers-color-scheme`.
- Migrados a tokens los colores sueltos: `QuoteForm` (azul→brand), `ReviewForm`/`DriverProfileForm`
  (esmeralda→success), `DriverRating`/`ReviewList`/`TariffEditor` (ámbar→warning).
- Metadatos de la app renombrados a Rumbo. Pendiente de diseño: D2 (bottom nav, header/CTA sticky),
  D3 (pulido y estados), D4 (logo/iconos/manifest), D5 (rendimiento y a11y).

### D2 — Shell móvil ✅
- `components/SiteHeader.tsx`: cabecera sticky con marca Rumbo, tema y cuenta (cuenta solo en
  escritorio). Oculta en `/login`.
- `components/BottomNav.tsx`: barra inferior móvil con 4 pestañas (Cotizador · Conductores · Mi panel
  · Cuenta), `safe-area-inset-bottom`, activo por ruta y `backdrop-blur`. Oculta en `/login` y en `md+`.
- `app/cuenta/page.tsx` + `components/SignOutButton.tsx`: destino de la pestaña Cuenta (sesión, perfil
  de cotización, panel público y cerrar sesión). Sin sesión redirige a `/login` (307).
- `app/layout.tsx` monta el shell y reserva `pb-20` en móvil; la home se simplificó (la navegación
  vive en la barra inferior). Se eliminó el CTA sticky previsto: chocaría con la barra inferior; el
  botón "Ver precio estimado" del formulario sigue llevando a la tarjeta.
- z-index acordado: header 1130, barra inferior 1140, panel de perfil 1150/1160, popups de Select 1200.

### P5 — Contacto por WhatsApp ✅
- `lib/phone.ts`: normaliza teléfonos venezolanos a `58...` y arma enlaces `wa.me`.
- El conductor añade su WhatsApp en `/panel` (opcional; se guarda normalizado en `profiles.phone`).
- **Privacidad**: el número se muestra SOLO a clientes con sesión (`getPublicDriver(id, includeContact)`);
  para anónimos el número no llega a la página. Botón "Contactar por WhatsApp" con mensaje predefinido.

### P4 — Fotos de conductor ✅
- Migración `0005_storage.sql`: bucket público `driver-photos`; escritura solo del dueño (ruta = uid),
  lectura pública. `next.config.ts` añade el `remotePatterns` de Supabase Storage para `next/image`.
- `DriverProfileForm`: subida de foto (valida tipo/tamaño en cliente, sube al Storage y guarda la URL;
  `photoUrl` viaja en la Server Action). `DriverCard` y el perfil público muestran la foto (o iniciales).
- Pendiente operativo: aplicar la migración (`npm run db:push`) para que el bucket exista.

### T — Confianza y moderación (sin KYC) ✅
- Migración `0004_trust.sql`: `profiles` gana `terms_accepted_at`, `banned` e `is_admin`; tablas
  `reports` (reportes) y `audit_log` (auditoría). Funciones `is_admin()` y `can_participate()`
  (SECURITY DEFINER). RLS: reportes (autor o admin), auditoría (admin), y ban gating en drivers/reviews.
  Se decidió que la RLS exija solo "no baneado" (el control real); la aceptación de normas se registra.
- Server Actions: `lib/actions/admin.ts` (`resolveReport`, `setBan`, `setDriverBan`) con comprobación de
  admin; `submitReport` en `lib/actions/drivers.ts`; `saveDriverProfile` exige términos y bloquea si
  baneado.
- UI: `ReportButton` en el perfil del conductor; checkbox de normas en `DriverProfileForm`; panel
  `/admin` protegido por rol (404 si no es admin) con acciones de moderación; página pública `/normas`.
- Sin verificación de identidad (decisión de producto): la confianza es reputación + moderación.

### G1 — Base open source ✅
- `LICENSE` (**MIT**), `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md` (Contributor Covenant 2.1) y
  `SECURITY.md`.
- `.github/FUNDING.yml` con **placeholders comentados** (GitHub Sponsors, Open Collective, Ko-fi y
  cripto por `custom`). Sin datos personales: Zelle/Pago Móvil se comparten "a solicitud" por correo
  del proyecto.
- `README.md`: secciones de **Donaciones** y **Self-hosting** (Supabase propio + variables + migración).

### P3 — Privacidad de la ubicación ✅
- `supabase/migrations/0003_location_privacy.sql`: revoca `select (location)` a `anon`/`authenticated`
  (la RLS es por fila, no por columna; sin esto `select=location` exponía la coordenada exacta) y crea
  la vista `public_drivers` sin `location`. La cercanía (Fase 3) leerá una coordenada aproximada por RPC.
- El código de la app no cambia: `lib/drivers.ts` ya selecciona columnas explícitas sin `location`.

### P2 — CI y Supabase CLI ✅
- `.github/workflows/ci.yml`: en cada push a `main` y PR corre `npm ci → typecheck → lint → test →
  build`. Sin secretos (degrada sin Supabase).
- `package.json`: `typecheck` ahora hace `next typegen && tsc --noEmit` (los tipos de rutas los genera
  Next; sin ellos tsc falla en un clon limpio). Scripts `db:push` y `db:types` con `npx supabase`.
- `supabase/config.toml` versionado (generado con `supabase init`); `supabase/.temp/` ignorado.
  Flujo: `npx supabase link --project-ref <ref>` → `npm run db:push`; tipos con `npm run db:types`.

### P1 — Limpieza y deuda técnica ✅
- **Open source, sin suscripción**: se retira el modelo de suscripción con `0002_drop_subscriptions.sql`
  (drop de `plans`/`subscriptions` y del enum) y se limpian `types/database.ts` y la doc.
- `lib/pricing.ts`: **eliminado `calculatePrice`** (código muerto) y **`WEATHER_FACTOR` fuera de la
  fórmula** (el clima no está integrado; era un factor 1 que ensuciaba el desglose).
- **Un solo selector de vehículo**: se elimina `VehicleCatalogPicker` y el tipo `VehicleSelection`;
  `VehicleSelector` se usa en cotizador y perfil, y `QuoteRequest.vehicle` pasa a ser `Vehicle | null`.
- `components/ui/*` importan `cn` de `@/lib/utils` (antes del paquete `"cn"`); SVGs por defecto borrados.

### D5 — Rendimiento, SEO y accesibilidad ✅
- `app/robots.ts` y `app/sitemap.ts` (perfiles visibles vía `lib/supabase/public.ts`, cliente anónimo
  sin cookies; `try/catch` para no romper el build sin base). `NEXT_PUBLIC_SITE_URL` fija el dominio.
- Accesibilidad: enlace "Saltar al contenido" (`#contenido`), `preconnect` a Photon/OSRM/tiles y
  reducción global de `prefers-reduced-motion`. Contraste orientado a WCAG AA.
- Cierra el plan de diseño D1–D5.

### D4 — Marca y app móvil ✅
- `components/Logo.tsx`: marca Rumbo (pin sobre insignia) con tokens; usada en `SiteHeader`.
- Iconos: `app/icon.svg` (favicon), `app/apple-icon.png` y `public/icon-{192,512,maskable-512}.png`
  generados con `sharp` desde el SVG de la marca. Se eliminó el `favicon.ico` por defecto de Next.
- `app/manifest.ts` (PWA: standalone, theme_color, iconos) y `app/opengraph-image.tsx` (1200×630 con
  `ImageResponse`). `metadataBase` desde `NEXT_PUBLIC_SITE_URL`.

### D3 — Pulido de componentes y estados ✅
- `components/InlineMessage.tsx`: caja única de feedback (success/error/info) con tokens; adoptada en
  `ReviewForm` y `DriverProfileForm` (antes cada una tenía su color).
- `components/EmptyState.tsx` + `components/DriverGridSkeleton.tsx`: estados vacíos con CTA y esqueleto
  del listado. `/conductores` usa un `Suspense` SOLO alrededor de la lista (no `loading.tsx`, que
  habría envuelto también el detalle y roto su 404).
- `DriverCard` rediseñada: avatar de iniciales, jerarquía nombre→vehículo→valoración, `active:scale`.
- Corrección de layout: `min-h-dvh` → `flex-1` en todas las páginas para evitar el doble scroll bajo
  el header; el alto de la barra inferior se reserva con `pb-24 md:pb-8` por página.

---

## 6. Reglas y convenciones

### Código
- **TypeScript estricto, prohibido `any`.**
- **Componentes funcionales con hooks.** Nada de clases.
- **No reescribir archivos completos** si solo cambia una parte.
- **Explicar antes de codificar.** No lanzar código sin contexto.
- **No instalar paquetes sin avisar.** Justificar siempre.
- **Mobile-first siempre.** Los estilos base son para móvil.
- **localStorage solo en Client Components** (`"use client"`) y con 
  `useEffect` para evitar errores de hidratación.

### Flujo de trabajo
- **Una fase a la vez.** No mezclar.
- **Un commit por fase funcional.**
- **Start New Task en Cline al cambiar de fase grande** (ahorra tokens).
- **Verificar `npm run build`, `npx tsc --noEmit`, `npm run lint`** antes 
  de cada commit.
- **Probar en móvil (F12 → device toolbar → iPhone 12 Pro)** antes de 
  compartir cambios.

### Producto
- **La velocidad es el valor central.** El conductor cotiza en segundos.
- **La transparencia es obligatoria.** Siempre mostrar desglose.
- **La app sugiere, el conductor decide.** Debe quedar claro.
- **No cobrar hasta validar.** Sin monetización hasta tener 100 usuarios.

---

## 7. Decisiones de diseño y por qué

### Photon en vez de Nominatim
Nominatim no hace prefix matching. "chaca" no encuentra "Chacao". Photon sí. 
Además Photon busca POIs (Sambil, Farmatodo) mucho mejor.

### Lista local de POIs antes de Photon
Photon prioriza por nombre, no por popularidad. "el marq" no mostraba primero 
"CC El Marqués". La lista local resuelve eso y da control.

### Sesgo geográfico a región central
Por defecto se sesga a Caracas (10.48, -66.90). Los conductores venezolanos 
se concentran en la región central. Cuando el usuario da permiso de ubicación, 
se usa su GPS real.

### localStorage en vez de Supabase
Para MVP y validación. Migrar a Supabase en Fase 7 cuando haya usuarios reales.

### Perfil del conductor sin login
Se guarda en localStorage. Cero fricción. Migrar a auth cuando sea necesario.

### El catálogo de vehículos es informativo
Marca/modelo/año no afectan al precio **todavía**. Sirven para:
- Acumular datos para calibrar después.
- Profesionalismo visual.
- Features futuras (historial, filtros, comparativas).

### Tarifa mínima + bandera de bajada
- **Bandera:** monto fijo por iniciar el servicio.
- **Tarifa mínima:** piso del precio final.
- La fórmula: `precio = max(bandera + km*costo_km + min*costo_min, tarifa_mínima)`.
- Se aplican ambos porque reflejan la realidad del taxi venezolano.

### Duración ajustada por franja horaria
OSRM da duración ideal sin tráfico. Se multiplica por un factor según hora 
de Venezuela (America/Caracas, no la del dispositivo). Mañana pico ×1.35, 
tarde pico ×1.35, madrugada ×0.95.

### Rango ±12% con piso en tarifa mínima
Da margen de negociación sin bajar del mínimo. El precio mínimo del rango 
nunca está por debajo de la tarifa mínima.

### No integración de API de clima (todavía)
Open-Meteo es gratis, pero añade complejidad. Se implementará cuando haya 
usuarios reales y se justifique.

---

## 8. Roadmap: qué sigue y por qué

> **Decisión de producto (P1): open source con donaciones, SIN suscripción.**
> El proyecto pasa a ser **open source (licencia MIT)** sostenido por **donaciones voluntarias**
> (GitHub Sponsors, Open Collective, Ko-fi y cripto). Se **descarta el modelo de suscripción** (no hay
> empresa para operar pagos): se eliminan `plans`/`subscriptions` (`0002_drop_subscriptions.sql`).
> La confianza entre usuarios se apoya en **reputación y moderación**, **no** en KYC pesado (no se
> recogen documentos de identidad). El roadmap de features (perfiles públicos, cercanía, fotos) sigue
> vigente; lo que cambia es el modelo de ingresos.

### Prioridad ALTA (después de validar con conductores)

**8.3 — Validación con 5-10 conductores** ⚠️ PRÓXIMO PASO
- Mostrar la app a conductores reales.
- Observar sin interrumpir.
- Anotar bugs, confusiones, faltantes, comentarios de precio.
- NO cambiar nada durante la validación.

**9.1 — Conversión a bolívares (tasa BCV)**
- API gratuita: `ve.dolarapi.com/v1/dolares/oficial` o scraping del BCV.
- Mostrar precio en USD **y** Bs.
- Cache diario.
- Alta prioridad según validación: los conductores venezolanos piensan 
  en Bs, aunque guarden en USD.

**9.2 — Rutas frecuentes**
- Guardar pares origen-destino comunes.
- Acceso rápido a "casa → aeropuerto".
- Fácil de implementar, útil de verdad.

**9.3 — Historial de carreras**
- Guardar cada cotización.
- Base para estadísticas y reportes.
- localStorage primero, Supabase después.

### Prioridad MEDIA

**9.4 — Fase 7: Supabase + Auth**
- Login opcional.
- Sincronización de perfil entre dispositivos.
- Historial en la nube.
- Solo cuando la validación lo justifique.

**9.5 — Múltiples paradas (waypoints)**
- Origen + N paradas + destino.
- Máximo 3 paradas.
- OSRM soporta múltiples puntos.
- Solo si la validación lo pide.

**9.6 — Recargos por equipaje**
- Si 7 de 10 conductores lo piden.
- Factor adicional en pricing.

### Prioridad BAJA (a 6+ meses)

**10.1 — Modo avanzado (opcional)**
- Panel colapsado con gasolina, km/l, depreciación.
- Solo para conductores que quieran "modo ingeniero".
- Riesgo: abruma al usuario promedio. Debe estar oculto.

**10.2 — Reportes y recibos digitales**
- Generación de PDF.
- Compartir por WhatsApp.
- Plantillas personalizables.

**10.3 — Fase 9/10: Diseño final**
- Paleta de colores de marca.
- Logo.
- Tipografía definitiva.
- Modo oscuro (opcional).

**10.4 — Analytics con Supabase**
- Qué zonas se buscan más.
- Qué POIs faltan.
- Qué precios se cotizan más.
- Qué features se usan.

---

## 9. Análisis de ideas futuras

### Del documento "App de Cotización para Taxistas Independientes"

**✅ Buenas y alineadas con el proyecto:**
- **Enfoque en fricción operativa diaria.** Es el corazón del proyecto.
- **Velocidad de uso.** Crítico. Debe cotizar en segundos.
- **Aspectos éticos.** Transparencia, comercio justo, app sugiere y conductor 
  decide. Debe quedar claro en la UI.
- **Integrar servicio de mapas.** Ya hecho con Leaflet + Photon + OSRM.
- **Guardar rutas frecuentes.** Buena idea, fácil, útil. Fase 9.2.
- **Ajustar recargos por pasajeros.** Ya implementado.
- **Recargo por horario nocturno.** Ya implementado.
- **Tasa de cambio del día.** Fase 9.1, alta prioridad.

**⚠️ Buenas pero prematuras:**
- **Panel con costo del litro, rendimiento km/l, depreciación.** 
  Conceptualmente bueno, operativamente peligroso. Abruma al conductor 
  promedio. **Solo como modo avanzado colapsado, en Fase 10.1.** Además, 
  el precio de la gasolina en Venezuela cambia constantemente.
- **Recargo por equipaje.** Interesante, pero validar primero.
- **Recibos digitales para enviar a clientes.** Buena idea, pero es una 
  mini-app dentro de la app. Fase 10.2, no antes.
- **Registro de ingresos/gastos diarios.** Cambia el producto. Ya no es 
  un cotizador, es gestión financiera. Pivot a 1 año, no ahora.

**❌ No recomendado:**
- **Micro-suscripción SaaS con número limitado de cotizaciones gratuitas.**
  El conductor venezolano no paga suscripciones fácilmente. Además, limitar 
  cotizaciones mata la adopción. **No cobrar hasta tener 100 usuarios activos.**
  Cuando se cobre, probablemente sea por features avanzadas (reportes, 
  historial, recibos), no limitando lo básico.
- **Versión Premium con herramientas contables.** Pivot a otro producto. 
  Puede ser una línea de negocio futura, pero no del MVP.

### Lo que falta en el documento
- **Validación con conductores.** No menciona cómo saber si funciona.
- **Contexto regulatorio.** ¿Es legal una app que sugiere tarifas en Venezuela? 
  ¿Hay que registrar el servicio?
- **Tamaño de mercado.** ¿Cuántos conductores independientes hay? ¿Cuántos 
  con smartphone con datos? ¿Cuántos hacen suficientes carreras al día?
- **Definición de éxito.** ¿Qué métricas indican que el proyecto funciona?

---

## 10. Lo que NO funciona o es prematuro

- **Cobrar a los conductores ahora.** No hay masa crítica.
- **Panel avanzado (gasolina, km/l, depreciación).** Abruma, cambia pronto.
- **Registro de gastos.** Cambia el producto.
- **Recibos digitales.** Feature grande, no urgente.
- **APIs de tráfico real (TomTom, HERE, Google).** El factor heurístico 
  por hora es suficiente para MVP.
- **APIs de clima (Open-Meteo).** Bonito, pero añade dependencia externa.
  Esperar a tener usuarios.
- **Múltiples vehículos por conductor.** El 90% tiene uno solo.
- **Login obligatorio.** Fricción innecesaria en MVP.
- **Estilización final.** Debe venir al final, con todo funcional.

---

## 11. Lecciones aprendidas

1. **La validación con usuarios reales vale más que 10 features nuevas.** 
   Los bugs que aparecen en móvil real (como el input de pasajeros) no se 
   ven en DevTools.

2. **Menos contexto en Cline = menos costo y mejor calidad.** Start New Task 
   por fase. No arrastrar conversaciones de 500k tokens.

3. **Los warnings de build son señales.** `npm run build` + `npx tsc --noEmit` + 
   `npm run lint` antes de cada commit.

4. **El catálogo crece con datos, no con suposiciones.** La lista de POIs 
   y de modelos de vehículos se ampliará con el feedback real.

5. **Photon + OSRM son gratis y suficientes.** No pagar por Mapbox/Google 
   hasta que el volumen lo justifique.

6. **La velocidad es el diferenciador.** No agregar features que la reduzcan.

7. **Deploy temprano motiva.** Ver la app en producción cambia la perspectiva.

8. **Los bugs móviles aparecen tarde.** Probar en celular real antes de 
   validar con conductores.

9. **Un commit por fase.** Ayuda a revertir sin drama.

10. **El disclaimer importa.** "La app sugiere, tú decides" protege legal 
    y éticamente.

---

## 12. Cómo retomar el proyecto en un nuevo chat

**Paso 1:** Copia este archivo completo.

**Paso 2:** En un nuevo chat de Cline o DeepSeek, pega:

```
Voy a continuar un proyecto existente. Aquí está la documentación viva:

[pegar NOTES.md completo]

Estoy en la fase [X]. La tarea actual es [Y]. Reglas: TypeScript estricto, 
mobile-first, no instalar paquetes sin avisar, no reescribir archivos 
completos si solo cambias una parte.
```

**Paso 3:** Pega el prompt de la tarea específica.

**Paso 4:** Al terminar la fase, actualiza este NOTES.md con lo nuevo.

---

## 13. Contacto y mantenimiento

- **Creador:** Jaervic
- **Repositorio:** https://github.com/jaervic/proyectotransporte
- **Producción:** https://proyectotransporte.vercel.app/
- **Modelo IA principal:** DeepSeek V4 Flash (para desarrollo)
- **Modelo IA alternativo:** Gemini (gratis, para tareas simples)

Cuando hagas cambios estructurales (nueva fase, nueva dependencia, nuevo 
archivo importante), actualiza este NOTES.md en el mismo commit.

---

**Fin del documento.**