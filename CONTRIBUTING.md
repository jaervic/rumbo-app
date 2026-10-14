# Contribuir a Rumbo

¡Gracias por querer aportar! Rumbo es un proyecto **open source (MIT)** de un cotizador y mercado
ligero de transporte para Venezuela. Antes de abrir un PR, lee esto.

## Requisitos

- Node.js 20.9 o superior (recomendado 22) y npm.
- Opcional: un proyecto de [Supabase](https://supabase.com/) propio si vas a trabajar en auth, base
  de datos o perfiles públicos.

## Puesta en marcha

```bash
npm install
npm run dev        # http://localhost:3000
```

Sin `.env.local` la app funciona igual (el cotizador es 100 % cliente); las funciones de Supabase se
desactivan solas. Para activarlas, copia `.env.local.example` a `.env.local` y rellena las variables.

## Antes de abrir un PR

El pipeline de CI corre estos comandos; córrelos en local:

```bash
npm run typecheck   # next typegen && tsc --noEmit
npm run lint
npm run test
npm run build
```

## Convenciones del proyecto

- **TypeScript estricto; `any` prohibido.** Los datos externos se validan con type guards o Zod.
- **Mobile-first.** Los estilos base son para móvil; lo de escritorio se añade con breakpoints.
- **Sin dependencias nuevas sin justificar** en la descripción del PR.
- **No reescribir archivos enteros** si el cambio es puntual; diffs pequeños y revisables.
- **Comentarios de por qué, no de qué.** El código explica el "qué"; los comentarios, las decisiones.
- **Accesibilidad y seguridad primero**: nada de exponer datos personales ni coordenadas exactas.
- **Un commit por fase/cambio funcional**, con mensaje claro.

## Base de datos

Las migraciones viven en `supabase/migrations/`. Para aplicarlas a tu proyecto:

```bash
npx supabase link --project-ref <tu-ref>
npm run db:push
npm run db:types     # regenera types/database.ts
```

No edites `types/database.ts` a mano: regéneralo tras cada migración.

## Reportar problemas

- **Errores y sugerencias**: abre un *issue* con pasos para reproducir.
- **Vulnerabilidades de seguridad**: NO abras un issue público; sigue `SECURITY.md`.
