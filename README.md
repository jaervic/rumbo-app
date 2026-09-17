# App de Transporte - Estimador de Precios

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
- **Base de Datos:** [Supabase](https://supabase.com/) (Próximamente)
- **Deploy:** [Vercel](https://vercel.com/) (sitio estático, sin backend ni funciones serverless)

## Estructura de Carpetas

```text
app/            # Rutas y componentes de página (Next.js App Router)
components/     # Componentes reutilizables
  ui/           # Componentes de base (shadcn/ui sobre Base UI)
hooks/          # Hooks de cliente (useRoute, useDriverProfile, useUserLocation)
lib/            # Utilidades y lógica de negocio (pricing, geocoding, routing...)
types/          # Definiciones de tipos TypeScript
public/         # Assets estáticos
```

En la raíz: `package.json` (scripts), `.env.local.example` (plantilla de variables),
`next.config.ts`, `eslint.config.mjs`, `tsconfig.json`.

## Motor de precios (Fase 5)

Todo el cálculo vive en `lib/pricing.ts` y tiene dos capas:

- **`estimatePrice(input)`** — cálculo puro y sin red: recibe distancia (km), duración ideal (min),
  vehículo y pasajeros, y devuelve un `PriceEstimate` con el desglose completo, o `null` si la
  combinación no permite un precio honesto (p. ej. 2 pasajeros en una moto).
- **`calculatePrice(request, options)`** — capa orquestada: usa la ruta ya calculada (la de
  `useRoute`) o la pide a OSRM con las coordenadas, y luego aplica `estimatePrice`.

### Fórmula

```text
minAjustados = duraciónIdealOSRM × factorTráfico(hora de Venezuela)   (mínimo 1 min)
bruto        = bandera + (km × tarifaKm) + (minAjustados × tarifaMin) + recargoPasajeros
bruto       *= recargoNocturno × factorClima
medio        = max(bruto, viajeMínimo del vehículo)
rango        = medio × (1 ± 12 %)        priceMin nunca baja del viaje mínimo
```

Y desde la Fase 6.2, si el conductor tiene perfil con tarifas propias (`PricingInput.tariffOverride`),
esos cuatro importes (bandera, km, minuto y mínimo) SUSTITUYEN a los de la tabla del vehículo. Lo demás
—recargo por pasajero, capacidad y factores de tráfico, nocturno, clima y ±12 %— no cambia.

### Factores y constantes

| Constante | Valor | Por qué |
| --- | --- | --- |
| `VEHICLE_TARIFFS` | bandera + tarifa/km + tarifa/min + recargo por pasajero + viaje mínimo + capacidad (leída de `PASSENGER_CAPACITY`), **por tipo de vehículo** | Cada vehículo tiene su estructura de coste; una tabla se ajusta sin tocar la fórmula |
| `TRAFFIC_BANDS` (vía `getTrafficFactor`) | pico AM/PM 1,35 · mediodía 1,20 · madrugada 0,85 | OSRM da la duración *ideal* (sin tráfico); esta heurística la corrige por franja horaria |
| `NIGHT_SURCHARGE_FACTOR` | 1,15 (22:00–06:00) | Menos oferta y más riesgo de noche; cambia el PRECIO, no los minutos |
| `WEATHER_FACTOR` | 1 | Sin API de clima todavía; el gancho queda explícito |
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

### Catálogo de vehículos (Fase 6.1)

`lib/vehicleCatalog.ts` es la tabla local de marca + modelo + año (sin red y sin API key), siguiendo
el patrón de `lib/popularPlaces.ts`: semilla compacta, ids estables (`toyota-corolla`) y funciones
puras. El selector es `components/VehicleCatalogPicker.tsx` (cascada marca → modelo → año).

```text
QuoteForm (VehicleCatalogPicker)
        |
        | getVehicleTypeFromSelection(selección)   <- el TIPO se deduce del modelo
        v
QuoteRequest { ..., vehicleType, vehicle: { brandId, modelId, year } | null }
```

- **El tipo de vehículo se deduce del modelo**: la ficha del vehículo y lo que tarifa el precio no
  pueden contradecirse. Elegir un modelo fija el año más nuevo disponible (dos toques bastan).
- **"Otra marca / no está en la lista"** sale del catálogo y devuelve el control al select manual de
  tipo. Mientras haya un vehículo del catálogo elegido, ese select se **deshabilita** (el tipo es un
  dato derivado del modelo) y el aviso que va justo debajo explica la salida: así el vehículo que se
  describe y el que se tarifa no pueden contradecirse.
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
- `components/VehicleSelector.tsx` (Fase 6.1a) es el selector con filtro marca → modelo → año. El
  borrador se guarda con el tipo con el que se creó, así que **cambiar de sedán a moto resetea marca y
  modelo sin `useEffect`** (reset derivado en el render) y con "Otro" aparece un campo de texto libre.
- Catálogo ampliado con el parque antiguo (80/90/2000): Starlet, Tercel, Chevette, Caprice, Corsa,
  Escort, Galant, Sunny, Almera, Clio, 323… y camionetas como Blazer, Bronco, F-100, Patrol, Nativa,
  Samurai, más las series FJ del Land Cruiser y el **Autana** (el 4Runner venezolano). Marcas que se
  suman: **Peugeot, Daewoo, Dodge** (autos) y **Voge, Vento** (motos, todavía sin modelos cargados).
  De la Fase 6.1: Keeway, Skygo, AKT, motos extra y autos extra; **"Haojue" → "MD"**, y `getYears()`
  arranca en **1980** porque en Venezuela se cotizan carros de esa época.
- `VehicleSelector` se monta en el **panel del conductor** (Fase 6.2), filtrando marcas por el tipo
  elegido. El QuoteForm sigue con `VehicleCatalogPicker` (Fase 6.1), que no filtra por tipo.
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

### Pendiente

- Convertir el precio a bolívares con la tasa BCV del día (Fase 7).
- Fase 7: sincronizar el `DriverProfile` con Supabase cuando haya login, permitir varios vehículos por
  conductor y mandar las marcas/modelos personalizados con `is_custom_brand` / `is_custom_model`.
  Fase 8: comparar la tarifa del conductor con el promedio de la app. Nivel 2: factores avanzados.
- Factor por antigüedad del vehículo (Fase 6.2) y revisión del catálogo: años por generación y las
  marcas de moto que faltan (Vento, Ryan, Motomel...).
- Calibrar `VEHICLE_TARIFFS` y `TRAFFIC_BANDS` con viajes reales cuando exista Supabase.
- Tráfico en vivo (TomTom/HERE) y clima (Open-Meteo) en lugar de las heurísticas estáticas.
- Si el usuario deja la página abierta y cruza una franja horaria (p. ej. las 22:00), el precio se
  actualiza al siguiente cambio de ruta/vehículo/pasajeros: falta un reloj que lo refresque solo.
- Instalar Vitest y convertir en suite permanente las comprobaciones del motor (Fase 9).

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

> En Next.js 16 `next build` **ya no ejecuta ESLint**: los avisos del linter solo se ven con
> `npm run lint`, y el build de Vercel tampoco los mira. Si quieres que sean bloqueantes, cambia el
> *Build Command* de Vercel a `npm run lint && npm run build`.

## Build y start en producción

```bash
npm run build
npm run start     # sirve la build en http://localhost:3000
```

La ruta `/` se prerenderiza como estática: no hay rutas de API ni funciones serverless.

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

Hoy **ninguna es obligatoria**: Photon (`https://photon.komoot.io`) y OSRM
(`https://router.project-osrm.org`) son APIs públicas y no piden clave. En el ejemplo solo están
comentadas las de Supabase, que se activarán con el login. En Vercel los valores se cargan en
*Settings → Environment Variables* y solo las `NEXT_PUBLIC_*` llegan al navegador.

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

