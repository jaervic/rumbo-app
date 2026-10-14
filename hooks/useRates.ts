"use client";

/**
 * Tasas de cambio para el precio en bolívares (P9). Carga `/api/rates` una sola vez (caché de módulo
 * + dedupe de peticiones en vuelo) y la comparte entre componentes.
 *
 * Es un hook de CLIENTE: el precio base es en USD y la conversión se muestra solo cuando llegan las
 * tasas. Al no renderizarse en el primer pintado, no hay riesgo de desajuste de hidratación.
 */

import { useEffect, useState } from "react";

export interface Rates {
  /** Tasa oficial del BCV (Bs/USD) o `null` si no está disponible. */
  bcv: number | null;
  /** Referencia de mercado (Binance P2P, Bs/USD) o `null`. */
  binance: number | null;
}

let cached: Rates | null = null;
let inflight: Promise<Rates> | null = null;

async function loadRates(): Promise<Rates> {
  if (cached !== null) return cached;

  if (inflight === null) {
    inflight = fetch("/api/rates")
      .then((response) => (response.ok ? response.json() : null))
      .then((data: unknown): Rates => {
        const record = (data ?? {}) as Record<string, unknown>;
        const rates: Rates = {
          bcv: typeof record.bcv === "number" ? record.bcv : null,
          binance: typeof record.binance === "number" ? record.binance : null,
        };
        cached = rates;
        return rates;
      })
      .catch((): Rates => ({ bcv: null, binance: null }))
      .finally(() => {
        inflight = null;
      });
  }

  return inflight;
}

export function useRates(): Rates | null {
  const [rates, setRates] = useState<Rates | null>(cached);

  useEffect(() => {
    if (cached !== null) return;

    let active = true;
    void loadRates().then((result) => {
      if (active) setRates(result);
    });

    return () => {
      active = false;
    };
  }, []);

  return rates;
}
