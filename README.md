# App de Transporte - Estimador de Precios

Web-app para estimar precios de transporte para conductores independientes, permitiendo a los usuarios obtener cálculos rápidos basados en origen, destino y tipo de vehículo.

## Stack Tecnológico

- **Framework:** [Next.js 16](https://nextjs.org/) (App Router)
- **Lenguaje:** [TypeScript](https://www.typescriptlang.org/) (Estricto)
- **Estilos:** [Tailwind CSS v4](https://tailwindcss.com/)
- **Componentes:** [shadcn/ui](https://ui.shadcn.com/)
- **Mapas:** [Leaflet](https://leafletjs.com/) + [OpenStreetMap](https://www.openstreetmap.org/)
- **Rutas:** [OSRM](http://project-osrm.org/) (Público, próxima fase)
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

