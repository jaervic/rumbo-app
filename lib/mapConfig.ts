/**
 * Configuración compartida del contenedor del mapa (componentes y skeleton).
 *
 * La altura vive aquí y no dentro de MapPicker.tsx por dos motivos:
 * 1. MapPickerWrapper necesita el MISMO alto en su skeleton de carga; si la clase
 *    estuviera duplicada, cambiarla en un sitio y no en el otro produce layout
 *    shift (CLS) al terminar de cargar el mapa.
 * 2. MapPicker importa Leaflet (vía import dinámico con `ssr: false`). Importar una
 *    constante desde ese módulo arrastraría Leaflet al chunk inicial del wrapper.
 *
 * Mobile-first: en pantallas pequeñas el mapa ocupa una fracción del viewport con
 * `dvh` (que descuenta la barra de direcciones del navegador móvil) y un mínimo
 * usable; a partir de `sm`/`md`/`lg` crece para aprovechar el layout de columnas.
 *
 * `max-h-[70dvh]` cubre el caso de un móvil en horizontal: ahí el ancho supera el
 * breakpoint `sm` (640px) y sin el tope el mapa de 340px ocuparía ~90% de una
 * pantalla de ~375px de alto.
 */
export const MAP_HEIGHT_CLASS =
  "h-[45dvh] min-h-[240px] max-h-[70dvh] sm:h-[340px] md:h-[420px] lg:h-[520px]";
