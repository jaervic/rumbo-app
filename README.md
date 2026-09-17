# App de Transporte - Estimador de Precios

Web-app para estimar precios de transporte para conductores independientes, permitiendo a los usuarios obtener cálculos rápidos basados en origen, destino y tipo de vehículo.

## Stack Tecnológico

- **Framework:** [Next.js 16](https://nextjs.org/) (App Router)
- **Lenguaje:** [TypeScript](https://www.typescriptlang.org/) (Estricto)
- **Estilos:** [Tailwind CSS v4](https://tailwindcss.com/)
- **Componentes:** [shadcn/ui](https://ui.shadcn.com/)
- **Mapas:** [Leaflet](https://leafletjs.com/) + [OpenStreetMap](https://www.openstreetmap.org/)
- **Rutas y distancia:** [OSRM](http://project-osrm.org/) (servidor público, sin API key)
- **Autocompletado de direcciones:** [Photon](https://photon.komoot.io/) (OpenStreetMap, gratis)
- **Base de Datos:** [Supabase](https://supabase.com/) (Próximamente)

## Estructura de Carpetas

```text
app/            # Rutas y componentes de página (Next.js App Router)
components/     # Componentes reutilizables
  ui/           # Componentes de base (shadcn/ui)
lib/            # Utilidades y lógica de negocio (pricing, fetching, etc.)
types/          # Definiciones de tipos TypeScript
public/         # Assets estáticos
```

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

### Pendiente

- Convertir el precio a bolívares con la tasa BCV del día (Fase 7).
- Factor por antigüedad del vehículo (Fase 6.2) y revisión del catálogo: años por generación y las
  marcas de moto que faltan (Vento, Ryan, Motomel...).
- Calibrar `VEHICLE_TARIFFS` y `TRAFFIC_BANDS` con viajes reales cuando exista Supabase.
- Tráfico en vivo (TomTom/HERE) y clima (Open-Meteo) en lugar de las heurísticas estáticas.
- Si el usuario deja la página abierta y cruza una franja horaria (p. ej. las 22:00), el precio se
  actualiza al siguiente cambio de ruta/vehículo/pasajeros: falta un reloj que lo refresque solo.
- Instalar Vitest y convertir en suite permanente las comprobaciones del motor (Fase 9).

## Comandos

### Instalación
```bash
npm install
```

### Desarrollo
```bash
npm run dev
```

### Producción
```bash
npm run build
npm run start
```

## Configuración

1. Copia `.env.local.example` a `.env.local`.
2. Completa las variables de entorno necesarias.

