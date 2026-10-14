# Rumbo — Cotizador y mercado de transporte

Web-app para estimar precios de transporte (moto, sedán, SUV y van) para conductores independientes en
Venezuela: se elige origen y destino en el mapa (o se escribe la dirección), el vehículo y los
pasajeros, y la app calcula un rango de precio **en vivo** a partir de la distancia y el tiempo de ruta
de OSRM. Sin backend: todo se calcula en el navegador y el perfil del conductor se guarda en
`localStorage`.

## Stack Tecnológico

- **Framework:** [Next.js 16](https://nextjs.org/) (App Router)
- **Lenguaje:** [TypeScript](https://www.typescriptlang.org/) (Estricto)
- **Estilos:** [Tailwind CSS v4](https://tailwindcss.com/)
- **Componentes:** [shadcn/ui](https://ui.shadcn.com/) sobre [Base UI](https://base-ui.com/)
- **Mapas:** [Leaflet](https://leafletjs.com/) + [OpenStreetMap](https://www.openstreetmap.org/)
- **Rutas y distancia:** [OSRM](http://project-osrm.org/) (servidor público, sin API key)
- **Autocompletado de direcciones:** [Photon](https://photon.komoot.io/) (OpenStreetMap, gratis)
- **Base de Datos y Auth:** [Supabase](https://supabase.com/) (Fase 1: auth por enlace mágico + esquema con RLS)
- **Deploy:** [Vercel](https://vercel.com/) (el cotizador es estático; la Fase 1 añade un Route Handler de auth y un proxy de sesión)

## Estructura de Carpetas

```text
app/            # Rutas (App Router): /, /login, /auth/callback, /conductores, /conductores/[id], /panel, /cuenta
components/     # Reutilizables (SiteHeader, BottomNav, DriverCard, ReviewForm, DriverProfileForm...)
  ui/           # Componentes de base (shadcn/ui sobre Base UI)
hooks/          # Hooks de cliente (useRoute, useDriverProfile, useUserLocation)
lib/            # Utilidades y lógica de negocio (pricing, geocoding, routing...)
  actions/      # Server Actions (drivers: publicar perfil, reseñar)
  supabase/     # Clientes de Supabase (browser/server/session) y config
types/          # Tipos (index, vehicle, database de Supabase)
supabase/       # Migraciones SQL (esquema + RLS) para Supabase
public/         # Assets estáticos
proxy.ts        # Refresco de sesión de Supabase (convención `proxy` de Next 16)
```

En la raíz: `package.json` (scripts), `.env.local.example` (plantilla de variables),
`next.config.ts`, `eslint.config.mjs`, `tsconfig.json`.

## Motor de precios (Fase 5)

Todo el cálculo vive en `lib/pricing.ts`, en una única función pura:

- **`estimatePrice(input)`** — cálculo puro y sin red: recibe distancia (km), duración ideal (min),
  vehículo y pasajeros, y devuelve un `PriceEstimate` con el desglose completo, o `null` si la
  combinación no permite un precio honesto (p. ej. 2 pasajeros en una moto). La ruta la resuelve
  `useRoute` (OSRM) en la UI y se le pasa ya calculada.

### Fórmula

```text
minAjustados = duraciónIdealOSRM × factorTráfico(hora de Venezuela)   (mínimo 1 min)
bruto        = bandera + (km × tarifaKm) + (minAjustados × tarifaMin) + recargoPasajeros
bruto       *= recargoNocturno
medio        = max(bruto, viajeMínimo del vehículo)
rango        = medio × (1 ± 12 %)        priceMin nunca baja del viaje mínimo
```

Y desde la Fase 6.2, si el conductor tiene perfil con tarifas propias (`PricingInput.tariffOverride`),
esos cuatro importes (bandera, km, minuto y mínimo) SUSTITUYEN a los de la tabla del vehículo. Lo demás
—recargo por pasajero, capacidad y factores de tráfico, nocturno y ±12 %— no cambia.

### Factores y constantes

| Constante | Valor | Por qué |
| --- | --- | --- |
| `VEHICLE_TARIFFS` | bandera + tarifa/km + tarifa/min + recargo por pasajero + viaje mínimo + capacidad (leída de `PASSENGER_CAPACITY`), **por tipo de vehículo** | Cada vehículo tiene su estructura de coste; una tabla se ajusta sin tocar la fórmula |
| `TRAFFIC_BANDS` (vía `getTrafficFactor`) | pico AM/PM 1,35 · mediodía 1,20 · madrugada 0,85 | OSRM da la duración *ideal* (sin tráfico); esta heurística la corrige por franja horaria |
| `NIGHT_SURCHARGE_FACTOR` | 1,15 (22:00–06:00) | Menos oferta y más riesgo de noche; cambia el PRECIO, no los minutos |
| `PRICE_SPREAD` | ±12 % | Rango para negociar en lugar de un "precio exacto" que se lee como contrato |

La hora se resuelve con `Intl.DateTimeFormat` en `America/Caracas` (`getVenezuelaHour`), no con la
hora del dispositivo, para que la franja horaria no dependa de cómo esté configurado el equipo.

### Moneda

Los importes van en **USD ("divisa")**, la unidad en la que hoy cotizan los conductores
independientes en Venezuela. Pendiente (Fase 7+): conversión a bolívares con la tasa BCV del día.

### Capacidades y validación

| Vehículo | Pasajeros máx. | Viaje mínimo |
| --- | --- | --- |
| Moto | 1 | $1,50 |
| Sedán | 5 | $2,50 |
| SUV | 6 | $3,50 |
| Van | 6 | $4,50 |

La capacidad se declara en `PASSENGER_CAPACITY` (`types/index.ts`) y `VEHICLE_TARIFFS` lee de ahí su
campo `maxPassengers`, así que el límite del campo "Pasajeros" y el que valida el motor son el mismo
número. El campo no deja pasar de la capacidad del vehículo: con 6 pasajeros en una van, cambiar a moto
deja 1 y un aviso discreto lo explica ("Máximo 1 pasajero para moto"). `estimatePrice` sigue devolviendo
`null` para una combinación imposible (la tarjeta dice "Esta combinación no es posible"), porque el motor
también se llama fuera de la UI (Fase 7: cotización guardada).

### Precio en vivo (Fase 6)

No hay que pulsar nada para cotizar:

```text
QuoteForm --onRequestChange(QuoteRequest)--> app/page.tsx
                                              |
              useRoute (OSRM) --> route ------+--> useMemo(estimatePrice) --> PriceCard
```

- `estimatePrice` es puro: cambiar de vehículo o de pasajeros recalcula el precio al instante y sin
  red (la ruta ya está calculada por `useRoute`).
- `components/PriceCard.tsx` (sustituye a `RouteInfoCard`) muestra el rango, el contexto del viaje
  (km, minutos, vehículo, pasajeros) y un desglose colapsable (`<details>` nativo: sin dependencias,
  accesible y con filas que suman exactamente el precio recomendado).
- Estados de la tarjeta: calculando · precio · "Completa origen y destino para ver el precio." ·
  "No se pudo calcular la ruta" · "Esta combinación no es posible. Revisa el vehículo y el número de
  pasajeros."
- El botón "Ver precio estimado" no calcula: desplaza la vista y el foco a la tarjeta (en móvil queda
  debajo del mapa). Antes de la Fase 6 el formulario solo escribía el envío en la consola.

### Catálogo de vehículos (consolidado en P1)

`lib/vehicleCatalog.ts` es la tabla local de marca + modelo + año (sin red y sin API key), siguiendo
el patrón de `lib/popularPlaces.ts`: semilla compacta, ids estables (`toyota-corolla`) y funciones
puras. Hay **un solo selector**, `components/VehicleSelector.tsx` (cascada marca → modelo → año),
usado tanto en el cotizador como en el perfil del conductor.

```text
QuoteForm / DriverProfile* (VehicleSelector)
        |
        | marca → modelo → año, filtrado por el vehicleType activo
        v
QuoteRequest { ..., vehicleType, vehicle: { brand, model, year, vehicleType } | null }
```

- **El tipo de vehículo lo fija `vehicleType`** (el selector filtra el catálogo por él), así que la
  ficha del vehículo y lo que tarifa el precio no pueden contradecirse. Elegir un modelo fija el año
  más nuevo disponible (dos toques bastan). Marca y modelo son **texto** y admiten "Otro" (texto libre).
- **Cambiar el tipo** reinicia la selección de vehículo (sus marcas/modelos son de otro tipo): el reset
  es derivado en el render, sin `useEffect`.
- **El año no cambia el precio todavía** (`estimatePrice` sigue tarifando por tipo y pasajeros). El
  factor por antigüedad queda apuntado en el `TODO (Fase 6.2)` de `lib/pricing.ts`: el dato ya viaja
  en `QuoteRequest.vehicle`, así que no hará falta tocar el formulario.
- `PriceCard` muestra el vehículo real: "Toyota Corolla 2015 (Sedán) · 3 pasajeros (2 adicionales)".
- Marcas y modelos van en orden de prevalencia en el parque venezolano (carros primero, motos al
  final) y los años son el rango en el que el modelo se vendió: `yearTo === null` = sigue a la venta.
- La lista de años se corta en `MAX_VEHICLE_YEAR`, una constante escrita a mano (no la fecha del
  sistema) para que el HTML del servidor y el del cliente coincidan: la hidratación manda.

### Catálogo unificado y selector filtrado (Fase 6.1a)

Un solo catálogo (`lib/vehicleCatalog.ts`): cada marca declara `vehicleTypes`, **deducidos de sus
modelos** (`[...new Set(models.map(m => m.type))]`), así que "Toyota" no aparece en la lista de motos
porque no tiene motos, no porque alguien la apuntara en dos sitios. El comodín `Otro` (`OTHER_OPTION`)
declara los cuatro tipos, no tiene modelos y va al final de la tabla (última opción de todas las listas).

```text
getBrandsByVehicleType("moto")  -> Honda · Suzuki · Yamaha · Bera · Empire · Bajaj · MD · UM ·
                                   Keeway · Skygo · AKT · Otro
getModelsByBrand("toyota")      -> Corolla, Camry, Yaris, RAV4, Fortuner, 4Runner,
                                   Land Cruiser Prado, Land Cruiser, Hilux, Hiace
getYears()                      -> 2027, 2026, ..., 1980      (CURRENT_YEAR + 1 → 1980)
isKnownBrand · isKnownModel · isBrandAvailableForType
```

- `types/vehicle.ts` define `Vehicle { brand, model, year, vehicleType }`: marca y modelo son TEXTO
  (admiten "Otro") y el tipo viaja dentro del vehículo para no depender del formulario.
- `components/VehicleSelector.tsx` es el **único** selector (marca → modelo → año), con filtro por
  tipo. El borrador se guarda con el tipo con el que se creó, así que **cambiar de sedán a moto
  resetea marca y modelo sin `useEffect`** (reset derivado en el render) y con "Otro" aparece un campo
  de texto libre.
- Catálogo ampliado con el parque antiguo (80/90/2000): Starlet, Tercel, Chevette, Caprice, Corsa,
  Escort, Galant, Sunny, Almera, Clio, 323… y camionetas como Blazer, Bronco, F-100, Patrol, Nativa,
  Samurai, más las series FJ del Land Cruiser y el **Autana** (el 4Runner venezolano). Marcas que se
  suman: **Peugeot, Daewoo, Dodge** (autos) y **Voge, Vento** (motos, todavía sin modelos cargados).
  De la Fase 6.1: Keeway, Skygo, AKT, motos extra y autos extra; **"Haojue" → "MD"**, y `getYears()`
  arranca en **1980** porque en Venezuela se cotizan carros de esa época.
- `VehicleSelector` se monta en el cotizador y en el **panel del conductor** (Fase 6.2), filtrando
  marcas por el tipo elegido. (Antes había dos selectores; P1 los consolidó en uno.)
- ⚠️ `CURRENT_YEAR = new Date().getFullYear()` se evalúa al importar el módulo y la página se
  prerenderiza: la lista de años queda congelada en la fecha del build (solo puede dar aviso de
  hidratación en el salto de año).

### Perfil del conductor (Fase 6.2)

`lib/driverProfile.ts` guarda en **localStorage** (`cotizador.driverProfile.v1`) el nombre, el vehículo
y las **tarifas propias** (Nivel 1) del conductor. La UI es `DriverProfileButton` +
`DriverProfilePanel` (Dialog de Base UI como sheet: **abajo en móvil**, lateral derecho desde `sm`) +
`TariffEditor` (4 campos con su rango, validación en vivo y un ejemplo de 5 km / 15 min calculado con
`estimatePrice`, sin OSRM).

```text
DriverProfileButton ──▶ DriverProfilePanel ──▶ VehicleSelector + TariffEditor
        │                                             │
        └── useDriverProfile (useSyncExternalStore) ──┴──▶ localStorage (v1)
                                  │
                   app/page.tsx ──┴──▶ estimatePrice({ ..., tariffOverride: profile?.tariff })
```

- **Sin perfil** no cambia nada: el motor usa `VEHICLE_TARIFFS` y el formulario arranca igual.
- **Con perfil**: el precio se calcula con las tarifas del conductor, el botón resume "Juan · Corolla
  2015" y el QuoteForm **pre-selecciona** el tipo del perfil mientras el usuario no lo cambie a mano
  (dato derivado, no copiado: sin `useEffect` y sin remontar el formulario).
- Los rangos viven en `TARIFF_FIELDS` (una sola tabla: la usan la validación y el editor); el motor
  solo descarta valores imposibles (≤ 0 o `NaN`) y cae a la tabla del vehículo.
- `useDriverProfile` usa `useSyncExternalStore`: el HTML del servidor no puede leer localStorage, así
  que el primer render dice "aún no lo sé" (`loading`) y React re-renderiza al hidratar **sin
  desajuste** y sin el `setState` dentro de un `useEffect` que el linter del repo prohíbe. El perfil se
  sincroniza entre pestañas (evento `storage`).
- El panel monta el formulario con una `key` que cambia al abrir: cada apertura parte del perfil
  guardado y descarta lo escrito sin guardar.

### Correcciones móviles y UX (Fase 8.1)

Detectado al probar la URL de producción en un celular real:

1. **Campo "Pasajeros"** (bug de "salta de 1 a 5 o 6"): con `type="number"` el teclado móvil entregaba
   `""` al borrar, el recorte inmediato a 1 devolvía "1" al campo y escribir "3" producía "13", que se
   clavaba al máximo del vehículo. Ahora el campo es `type="text"` + `inputMode="numeric"` +
   `pattern="[0-9]*"`, guarda un BORRADOR de texto (`passengerInput`), solo acepta dígitos, se puede
   borrar entero, mantiene al motor con un valor válido (nunca < 1 ni > capacidad) y clava el valor
   visible al rango [1, capacidad] **al salir del campo** (`onBlur`), no en cada tecla. Debajo hay una
   línea informativa que muestra "Máx. 5 pasajeros para sedán" y, si hubo recorte, el aviso que lo
   explica (mismo dato, otro motivo: el aviso habla del hecho).
2. **Sugerencias del autocompletado en móvil**: al tocar una sugerencia, el navegador cerraba antes el
   teclado virtual y ese primer tap se consumía en el reflujo, así que el `click` no llegaba y la
   coordenada no se guardaba (origen y destino quedaban como texto y el viaje no se podía cotizar). La
   selección se resuelve ahora en `pointerup` —unifica táctil y ratón en un solo camino y se dispara
   antes del cierre del teclado— con `click` como respaldo y ventana de deduplicación de 600 ms; un
   desplazamiento mayor a 10 px se interpreta como scroll de la lista y no selecciona.
3. **Catálogo de vehículos colapsable**: marca, modelo y año viven en un `<details>` nativo (no hay
   Collapsible instalado en `components/ui` y la fase prohíbe añadir paquetes) con el título
   "Especificar modelo del vehículo (opcional)", **cerrado por defecto**. Si el perfil del conductor ya
   tiene vehículo, aparece un chip "Vehículo: Toyota Corolla 2015 · del perfil" con un botón "Cambiar"
   que lo despliega. Colapsado no cambia nada del cálculo: el precio sigue saliendo del `vehicleType`
   del select de arriba.
4. **Etiquetas del tipo de vehículo**: `formatVehicleType(type)` (`lib/pricing.ts`) centraliza
   "sedan" → "Sedán" y se usa en el select del formulario, en el panel del conductor y en PriceCard. El
   valor interno sigue siendo `"sedan"` (minúsculas, sin tilde).
   ⚠️ **Trampa de Base UI**: `Select.Value` pinta la ETIQUETA del item seleccionado solo si el
   `Select.Root` recibe la prop `items` (mapa valor → etiqueta); sin ella renderiza el **valor crudo**, y
   los triggers mostraban "sedan" y, en el catálogo, "toyota" / "toyota-corolla".

### Pendiente

- Convertir el precio a bolívares con la tasa BCV **y** la de Binance (P9 del plan).
- Sincronizar el `DriverProfile` con Supabase, permitir varios vehículos por conductor y mandar las
  marcas/modelos personalizados con `is_custom_brand` / `is_custom_model`. Nivel 2: factores avanzados.
- Factor por antigüedad del vehículo (Fase 6.2) y revisión del catálogo: años por generación y las
  marcas de moto que faltan (Vento, Ryan, Motomel...).
- Calibrar `VEHICLE_TARIFFS` y `TRAFFIC_BANDS` con viajes reales cuando exista Supabase.
- Tráfico en vivo (TomTom/HERE) y clima (Open-Meteo) en lugar de las heurísticas estáticas.
- Si el usuario deja la página abierta y cruza una franja horaria (p. ej. las 22:00), el precio se
  actualiza al siguiente cambio de ruta/vehículo/pasajeros: falta un reloj que lo refresque solo.
- ~~Instalar Vitest~~ **Hecho en la Fase 0**: la suite del motor vive en `lib/pricing.test.ts`. Falta
  ampliarla (rutas, geocoding, perfil del conductor) y añadir CI que la corra en cada push.

## Diseño y tema (D1)

La marca es **Rumbo**. El sistema visual vive en `app/globals.css`:

- **Base “taxi blanco”**: fondo *off-white* con un leve sesgo frío (blanco texturizado, no plano) y
  superficies/tarjetas un punto más claras para elevarse solas. Jerarquía por elevación sutil, no por
  bordes duros.
- **Acento azul pizarra suave** (`--brand`) para acciones, enlaces y foco. **Tokens semánticos**
  (`--success`, `--warning`, `--info`, `--destructive`) sustituyen a los colores sueltos: los
  componentes usan `bg-brand`, `text-success`, `fill-warning`… nunca `blue-600`/`amber-400`.
- **Modo oscuro real**: paleta de grises cálidos, detección de la preferencia del sistema y toggle
  manual (`components/ThemeToggle.tsx`). Un script inline en `app/layout.tsx` aplica el tema antes del
  primer pintado para evitar el destello. `theme-color` cambia con el esquema.
- **Tipografía**: se corrigió el token de fuente (ahora Geist Sans se aplica de verdad).

### Shell móvil (D2)

- **`SiteHeader`** (`components/SiteHeader.tsx`): cabecera pegada arriba (`sticky`) con la marca
  **Rumbo**, el botón de tema y la cuenta (en escritorio). Oculta en `/login`.
- **`BottomNav`** (`components/BottomNav.tsx`): barra inferior en móvil con 4 pestañas —Cotizador,
  Conductores, Mi panel y Cuenta— al alcance del pulgar, con `safe-area-inset-bottom`, resalte de la
  pestaña activa y `backdrop-blur`. Oculta en `/login` y en escritorio.
- **`/cuenta`**: destino de la pestaña Cuenta; muestra la sesión, el perfil de cotización
  (`DriverProfileButton`), el acceso al panel público y el cierre de sesión.
- Cada página reserva `pb-24` en móvil (`md:pb-8`) para que la barra no tape el contenido; así el
  login (sin shell) queda centrado.

### Pulido de componentes y estados (D3)

- **Esqueleto** del listado (`DriverGridSkeleton`) dentro de un `Suspense` en `/conductores`: la
  cabecera se pinta al instante y la lista se rellena. El boundary va SOLO alrededor de la lista (no
  un `loading.tsx` de directorio) para no romper el 404 de `/conductores/[id]`.
- **Estados vacíos** reutilizables (`EmptyState`) con icono, explicación y CTA (p. ej. "Publicar mi
  perfil" cuando no hay conductores).
- **Feedback unificado** (`InlineMessage`): éxito/error/info con la misma caja y color de token en
  todos los formularios.
- `DriverCard` con avatar de iniciales y jerarquía mejorada; páginas sin doble scroll (se sustituyó
  `min-h-dvh` por `flex-1` bajo el header).

### Marca y app móvil (D4)

- **Logo** (`components/Logo.tsx`): un pin de mapa —el mismo símbolo del destino en el cotizador—
  sobre insignia del color de marca, usando tokens (se adapta a claro/oscuro). Es el mismo símbolo del
  favicon y los iconos.
- **Iconos**: `app/icon.svg` (favicon), `app/apple-icon.png` y PNGs en `public/` (192, 512 y
  *maskable*) generados con `sharp` desde la marca.
- **Manifest PWA** (`app/manifest.ts`): permite "Añadir a inicio", `display: standalone` y
  `theme_color`.
- **Open Graph** (`app/opengraph-image.tsx`, con `ImageResponse`): imagen de 1200×630 para compartir
  enlaces. `metadataBase` se toma de `NEXT_PUBLIC_SITE_URL`.

### Rendimiento, SEO y accesibilidad (D5)

- **`app/robots.ts`** y **`app/sitemap.ts`**: se indexa la parte pública (incluidos los perfiles de
  conductores visibles, leídos con un cliente sin cookies) y se excluyen las zonas con sesión.
- **`lib/supabase/public.ts`**: cliente anónimo (`persistSession: false`) para contextos sin petición
  (sitemap), respetando RLS.
- **Accesibilidad**: enlace "Saltar al contenido" (`#contenido`), orígenes `preconnect`
  (Photon/OSRM/tiles) para acelerar la primera carga, y **reducción global de movimiento** con
  `prefers-reduced-motion`.
- Contraste pensado para **WCAG AA** en claro y oscuro; foco visible en todos los controles.

## Cómo correr en local

Requisitos: **Node.js 20.9 o superior** y npm.

```bash
npm install     # instala las dependencias
npm run dev     # servidor de desarrollo en http://localhost:3000
```

No hace falta configurar nada más para desarrollar: el autocompletado (Photon) y las rutas (OSRM) usan
APIs públicas sin clave, así que la app arranca sin `.env.local`.

## Scripts

| Script | Qué hace |
| --- | --- |
| `npm run dev` | Servidor de desarrollo (Turbopack) en `http://localhost:3000` |
| `npm run build` | Build de producción en `.next/`, con chequeo de tipos de TypeScript |
| `npm run start` | Sirve la build de producción (requiere `npm run build` antes) |
| `npm run lint` | ESLint 9 (flat config de `eslint-config-next`) |
| `npm run typecheck` | `next typegen && tsc --noEmit` (genera los tipos de rutas de Next antes de comprobar) |
| `npm run test` | Vitest en modo `run` (una pasada) sobre la suite del motor de precios |
| `npm run test:watch` | Vitest en modo vigilancia durante el desarrollo |
| `npm run db:push` | Aplica las migraciones al proyecto de Supabase enlazado (Supabase CLI) |
| `npm run db:types` | Regenera `types/database.ts` desde el esquema (`supabase gen types`) |

> En Next.js 16 `next build` **ya no ejecuta ESLint**: los avisos del linter solo se ven con
> `npm run lint`, y el build de Vercel tampoco los mira. Si quieres que sean bloqueantes, cambia el
> *Build Command* de Vercel a `npm run lint && npm run build`.

## Seguridad y pruebas (Fase 0)

**Cabeceras de seguridad** (`next.config.ts`, aplicadas a todas las rutas): `Content-Security-Policy`
(orígenes permitidos: los propios, los tiles de OpenStreetMap, Photon y OSRM), `X-Content-Type-Options:
nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy` (solo geolocalización para
el propio sitio) y `Strict-Transport-Security` + `upgrade-insecure-requests` en producción. Además
`poweredByHeader: false`. La CSP usa `'unsafe-inline'` para los scripts de hidratación de Next; migrar
a nonces queda pendiente de cuando haya servidor dinámico (Supabase, Fase 1).

**Dependencias**: el proyecto fija **Next.js 16.4** (el 16.3.5 tenía una vulnerabilidad crítica). Los
iconos del mapa ya no se cargan desde `unpkg.com` (todos los marcadores usan `divIcon` inline). Queda
una vulnerabilidad alta en `braces`, dependencia de desarrollo del CLI de `shadcn` que **no entra en el
bundle de runtime** y aún no tiene versión corregida.

**Datos que llegan de fuera**: los perfiles de `localStorage` se validan con `isVehicleType`
(`types/index.ts`) antes de usarse, así que un `vehicleType` corrupto no puede tumbar el motor.

**Pruebas**: `lib/pricing.test.ts` cubre el motor de precios (duración ajustada, viaje mínimo, recargo
nocturno, rango ±12 %, desglose que suma exacto, tarifas propias, casos `null` y el guard de tipos).
Se ejecutan con `npm run test` (Vitest, entorno `node`).

## CI y Supabase CLI (P2)

**Integración continua**: `.github/workflows/ci.yml` corre en cada push a `main` y cada Pull Request
`npm ci → typecheck → lint → test → build`. No necesita secretos: sin variables de Supabase la app
degrada sola (build y sitemap están protegidos con `isSupabaseConfigured`), así que funciona también
en un fork.

**Migraciones versionadas**: el esquema vive en `supabase/migrations/` y se aplica con el CLI:
`npx supabase link --project-ref <ref>` (una vez) y luego `npm run db:push`. `supabase/config.toml`
está versionado; `supabase/.temp/` (que contiene el ref enlazado) queda ignorado.

**Tipos generados**: `npm run db:types` regenera `types/database.ts` desde el esquema real. Úsalo
después de cada migración en vez de editar el archivo a mano.

## Build y start en producción

```bash
npm run build
npm run start     # sirve la build en http://localhost:3000
```

La ruta `/` y `/login` se prerenderizan como estáticas. `/auth/callback` es una ruta dinámica
(Route Handler) y el proxy de sesión (`proxy.ts`) corre en el borde; ambos son no-op sin las
variables de Supabase, así que el cotizador sigue siendo estático y funcional.

## Datos del conductor (localStorage)

**Hoy no hay backend.** El perfil del conductor (nombre, vehículo y tarifas propias) se guarda en el
`localStorage` del navegador con la clave `cotizador.driverProfile.v1` (ver `lib/driverProfile.ts`):

- Los datos viven solo en ese navegador y ese dispositivo: no se sincronizan ni se comparten.
- Se pierden si el usuario borra los datos del sitio o navega en modo incógnito.
- No viajan al servidor: el deploy no necesita base de datos ni variables de entorno.
- La migración a Supabase (con login) y la sincronización del perfil quedan para una fase posterior.

## Variables de entorno

1. Copia `.env.local.example` a `.env.local`.
2. Completa las variables de entorno necesarias.

Hoy **ninguna es obligatoria para el cotizador**: Photon (`https://photon.komoot.io`) y OSRM
(`https://router.project-osrm.org`) son APIs públicas y no piden clave. Para el **login** (Fase 1)
hacen falta `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_ANON_KEY` (la `anon key` es pública
por diseño; RLS protege los datos — **nunca** la `service_role` aquí). Si faltan, la app funciona
igual: el proxy de sesión y los componentes de cuenta se desactivan solos.

En Vercel los valores se cargan en *Settings → Environment Variables* y solo las `NEXT_PUBLIC_*`
llegan al navegador.

## Autenticación y base de datos (Fase 1)

Auth por **enlace mágico** (sin contraseñas): `/login` pide el correo, Supabase envía un enlace y
`/auth/callback` lo canjea por una sesión (con protección contra *open redirect* en el parámetro
`next`). El proxy `proxy.ts` refresca la sesión en cada navegación.

El esquema vive en `supabase/migrations/` (`0001_init.sql` y siguientes) y se aplica con el **CLI de
Supabase** (`supabase db push`) o en el **SQL Editor**. Crea `profiles`, `drivers`, `driver_tariffs` y
`reviews` con **RLS activada en todas** (deny by default): cada usuario escribe lo suyo y solo se lee
públicamente lo que un conductor marca como visible. La ubicación exacta del conductor **no se puede
leer por REST**: `0003_location_privacy.sql` revoca el SELECT de la columna `location` a `anon`/
`authenticated` y expone una vista `public_drivers` sin ella; la cercanía (Fase 3) leerá una
coordenada aproximada vía RPC. Un trigger crea el `profile` al registrarse y otro recalcula
`rating_avg`/`rating_count` tras cada reseña. El modelo de suscripción (`plans`/
`subscriptions`) se retiró en `0002_drop_subscriptions.sql`: el proyecto es open source con donaciones.

El perfil del conductor **sigue en `localStorage`** por ahora; la migración a la nube llega en una
fase posterior.

## Perfiles públicos y reseñas (Fase 2)

Un conductor con sesión puede **publicar su ficha** en `/panel` (nombre visible, ciudad, bio,
vehículo y tarifas, con un interruptor de visibilidad). Los clientes ven el **listado** en
`/conductores` y el **perfil** en `/conductores/[id]` con su valoración media.

- **Datos**: `lib/drivers.ts` (lecturas, solo servidor) combina consultas planas y las une en memoria
  para evitar la frágil inferencia de tipos de los *joins* de PostgREST.
- **Escritura**: Server Actions en `lib/actions/drivers.ts`. Toda entrada pasa por **Zod**
  (`lib/validation.ts`) antes de tocar la base; la sesión se resuelve en el servidor y la RLS es la
  última barrera.
- **Reseñas**: 1–5 estrellas + comentario; una por cliente y conductor (restricción en la base). No se
  puede reseñar a un conductor inactivo ni a uno mismo. Al publicar, un trigger recalcula
  `rating_avg`/`rating_count`.
- `/conductores` y `/conductores/[id]` devuelven **códigos HTTP correctos** (200/404/307); por eso no
  hay `loading.tsx` global (un límite de streaming convertiría los 404 en 200).
- La página pública se renderiza en el servidor (dinámica, lee la base): mejor SEO y sin exponer la
  ubicación exacta del conductor.

## Deploy en Vercel

Pasos manuales (una sola vez):

1. **Cuenta**: entra en [vercel.com](https://vercel.com) → *Sign Up* → **Continue with GitHub**.
2. **Importar**: *Add New… → Project* → **Import Git Repository** → elige `app-transporte` (si no
   aparece, pulsa *Adjust GitHub App Permissions* y da acceso al repositorio).
3. **Deploy**: Vercel detecta Next.js solo (*Framework Preset: Next.js*, *Build Command*:
   `npm run build`, *Install Command*: `npm install`, *Output Directory*: `.next`). No hay variables
   de entorno que cargar. Pulsa **Deploy**.
4. **URL pública**: al terminar (~1 min) Vercel asigna algo como
   `https://app-transporte-<hash>.vercel.app`; cópiala del panel del proyecto o de *Settings → Domains*.

A partir de ahí el **deploy es automático**:

- Cada `git push` a `main` publica una nueva versión de producción.
- Cada Pull Request genera una *Preview URL* propia.
- La carpeta `.vercel/` (del CLI local) está en `.gitignore`: no se versiona.

### Advertencias para el deploy

- `CURRENT_YEAR = new Date().getFullYear()` (`lib/vehicleCatalog.ts`) se evalúa al construir: la lista
  de años queda congelada en la fecha del build y solo cambia con un nuevo deploy.
- El mapa es Leaflet cargado en el cliente con `next/dynamic` (`ssr: false`), así que no se renderiza en
  el servidor: no hay riesgo de avisos de hidratación por el mapa.
- El linter no bloquea el build (Next 16 no lo ejecuta): córrelo a mano antes del push.
- Las tarifas de `VEHICLE_TARIFFS` y las franjas de `TRAFFIC_BANDS` siguen siendo heurísticas sin datos
  reales de viajes; publicar en Vercel no las valida.

## Licencia y proyecto open source

Rumbo es **open source bajo licencia MIT** (ver `LICENSE`): puedes usarlo, modificarlo y desplegarlo
libremente. El proyecto **no cobra suscripciones**; se sostiene con **donaciones voluntarias**. Se
agradecen los aportes de código y de ideas (ver `CONTRIBUTING.md`).

## Donaciones

Rumbo es gratuito y no tiene planes de pago. Si quieres apoyarlo:

| Vía | Enlace |
| --- | --- |
| GitHub Sponsors | _pendiente de configurar_ (`FUNDING.yml`) |
| Open Collective | _pendiente de configurar_ |
| Ko-fi | _pendiente de configurar_ |
| Cripto (USDT TRC20) | _pendiente de configurar_ |

> **Privacidad**: por seguridad, **no se publican números de teléfono ni datos personales**. Si
> quieres donar por **Zelle** o **Pago Móvil** (Venezuela), escríbenos a un correo del proyecto y te
> damos los datos **a solicitud**.

## Self-hosting

Cualquiera puede desplegar su propia instancia:

1. Crea un proyecto en [Supabase](https://supabase.com/) y anota `URL` y `anon key`.
2. Clona el repo e instala: `npm install`.
3. Copia `.env.local.example` a `.env.local` y rellena `NEXT_PUBLIC_SUPABASE_URL`,
   `NEXT_PUBLIC_SUPABASE_ANON_KEY` y (opcional) `NEXT_PUBLIC_SITE_URL`.
4. Aplica el esquema: `npx supabase link --project-ref <ref>` y `npm run db:push`.
5. En Supabase → *Authentication → URL Configuration*, añade tu dominio y `/auth/callback` a las
   *Redirect URLs*.
6. `npm run dev` (local) o despliega en Vercel (ver *Deploy en Vercel*).

Sin Supabase, el cotizador funciona igual: solo se desactivan auth, perfiles y reseñas.

