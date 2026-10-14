/**
 * Teléfono de contacto y enlaces de WhatsApp (P5).
 *
 * Se guarda en `profiles.phone` NORMALIZADO (solo dígitos, con el código de país 58 para Venezuela)
 * y **solo se muestra a usuarios con sesión** (privacidad): el HTML público no incluye el número.
 */

/**
 * Normaliza un teléfono venezolano a formato internacional sin `+` (lo que espera `wa.me`).
 * Acepta "0412-1234567", "+58 412 1234567", "4121234567", etc. Devuelve `null` si no es usable.
 */
export function normalizeVenezuelaPhone(input: string): string | null {
  const digits = input.replace(/\D/g, "");
  if (digits.length === 0) return null;

  let national = digits;
  if (national.startsWith("58")) national = national.slice(2);
  if (national.startsWith("0")) national = national.slice(1);

  // Venezuela: fijos 2XX XXXXXXX y móviles 4XX XXXXXXX → 10 dígitos tras quitar el 0 inicial.
  if (national.length < 10 || national.length > 11) return null;

  return `58${national}`;
}

/** Enlace de WhatsApp con mensaje predefinido. `phoneDigits` = salida de `normalizeVenezuelaPhone`. */
export function whatsappUrl(phoneDigits: string, text: string): string {
  return `https://wa.me/${phoneDigits}?text=${encodeURIComponent(text)}`;
}

/**
 * Formato para el input del panel: el teléfono se guarda normalizado ("58...") pero al conductor le
 * resulta más natural verlo como lo escribe ("0...").
 */
export function formatPhoneForInput(stored: string | null): string {
  if (stored === null || stored.length === 0) return "";
  if (stored.startsWith("58") && stored.length === 12) return `0${stored.slice(2)}`;
  return stored;
}
