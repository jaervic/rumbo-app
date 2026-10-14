import { NextResponse } from "next/server";

/**
 * Tasas de cambio a bolívares (P9), servidas en el SERVIDOR (sin CORS ni claves en el cliente).
 *
 * - **BCV (oficial)**: `ve.dolarapi.com/v1/dolares/oficial`.
 * - **Binance P2P (referencia de mercado)**: `criptoya.com/api/binancep2p/USDT/VES/1`.
 *
 * Seguridad: la respuesta externa es dato NO confiable; se valida que sea un número finito y dentro de
 * un rango razonable antes de usarla. Caché de 5 min (`revalidate`), así que no se golpea a los
 * servicios públicos en cada visita. Si una fuente falla, se devuelve la otra con `null` en la caída.
 */

const BCV_URL = "https://ve.dolarapi.com/v1/dolares/oficial";
const BINANCE_URL = "https://criptoya.com/api/binancep2p/USDT/VES/1";
const REVALIDATE_SECONDS = 300;
const MIN_RATE = 1;
const MAX_RATE = 1_000_000;

function toValidRate(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= MIN_RATE && value <= MAX_RATE
    ? value
    : null;
}

async function fetchBcv(): Promise<number | null> {
  try {
    const response = await fetch(BCV_URL, {
      headers: { Accept: "application/json" },
      next: { revalidate: REVALIDATE_SECONDS },
    });
    if (!response.ok) return null;

    const data: unknown = await response.json();
    if (typeof data !== "object" || data === null) return null;

    return toValidRate((data as Record<string, unknown>).promedio);
  } catch {
    return null;
  }
}

async function fetchBinance(): Promise<number | null> {
  try {
    const response = await fetch(BINANCE_URL, {
      headers: { Accept: "application/json" },
      next: { revalidate: REVALIDATE_SECONDS },
    });
    if (!response.ok) return null;

    const data: unknown = await response.json();
    if (typeof data !== "object" || data === null) return null;

    const record = data as Record<string, unknown>;
    const ask = toValidRate(record.totalAsk);
    const bid = toValidRate(record.totalBid);

    if (ask !== null && bid !== null) return (ask + bid) / 2;
    return ask ?? bid;
  } catch {
    return null;
  }
}

export async function GET() {
  const [bcv, binance] = await Promise.all([fetchBcv(), fetchBinance()]);

  return NextResponse.json(
    { bcv, binance, updatedAt: new Date().toISOString() },
    { headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600" } }
  );
}
