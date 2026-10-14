# Política de seguridad

## Versiones soportadas

Se da soporte de seguridad solo a la rama `main` (el proyecto se despliega desde ahí).

## Cómo reportar una vulnerabilidad

**No abras un issue público para vulnerabilidades.** Envía un correo privado a la persona que
mantiene el proyecto (el correo está en el perfil de GitHub del repositorio). Incluye:

- Descripción del problema y su impacto.
- Pasos para reproducirlo (o una prueba de concepto).
- Versión/commit afectado y, si procede, una propuesta de solución.

Acusaremos recibo lo antes posible e intentaremos publicar una corrección. Te daremos crédito si lo
deseas.

## Superficie de seguridad (qué miramos con lupa)

- **RLS de Supabase**: cada tabla tiene políticas; la `anon key` es pública por diseño, así que la
  seguridad de los datos recae en RLS. La ubicación exacta del conductor está revocada a nivel de
  columna (`0003_location_privacy.sql`).
- **Server Actions**: toda entrada pasa por Zod antes de tocar la base; la sesión se resuelve en el
  servidor.
- **Secretos**: nunca se comitean. `.env*` está ignorado; usa `.env.local`.
- **Cabeceras**: CSP y demás cabeceras en `next.config.ts`.

## Fuera de alcance

- Datos que el propio usuario hace públicos a propósito (p. ej. su teléfono de contacto en su ficha).
- Ataques de denegación de servicio contra las APIs públicas de terceros (Photon, OSRM, OSM).
