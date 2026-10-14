/**
 * Suite permanente del motor de precios (Fase 0). Convierte en comprobaciones automáticas lo que antes
 * se verificaba a mano: duración ajustada, viaje mínimo, recargo nocturno, rango ±12 %, desglose que
 * suma exacto y los casos que deben devolver `null`.
 *
 * Los momentos de salida se fijan con fechas UTC concretas y se confirma la hora de Venezuela con
 * `getVenezuelaHour`, para que el test no dependa de la zona horaria de la máquina que lo ejecuta
 * (Venezuela es UTC−4 fijo, sin horario de verano).
 */

import { describe, expect, it } from "vitest";
import {
  estimatePrice,
  getTrafficFactor,
  getVehicleCapacity,
  getVenezuelaHour,
  isVehicleSuitable,
  NIGHT_SURCHARGE_FACTOR,
  PRICE_SPREAD,
  VEHICLE_TARIFFS,
  type PricingInput,
} from "@/lib/pricing";
import { isVehicleType, PASSENGER_CAPACITY } from "@/types";

/** Redondeo a céntimos, igual que dentro del motor, para comparar sumas. */
function roundCents(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Hora valle (Caracas 15:00 = UTC 19:00): factor de tráfico 1,05. */
const VALLEY_DEPARTURE = new Date("2026-01-15T19:00:00.000Z");
/** Noche (Caracas 23:00 del 15-ene = UTC 03:00 del 16-ene): factor 0,9 + recargo nocturno. */
const NIGHT_DEPARTURE = new Date("2026-01-16T03:00:00.000Z");

function baseInput(overrides: Partial<PricingInput> = {}): PricingInput {
  return {
    distanceKm: 5,
    durationIdealMin: 25,
    vehicleType: "sedan",
    passengers: 1,
    departureAt: VALLEY_DEPARTURE,
    ...overrides,
  };
}

describe("getVenezuelaHour (base de tráfico y nocturno)", () => {
  it("resuelve la hora en America/Caracas, no la del dispositivo", () => {
    expect(getVenezuelaHour(VALLEY_DEPARTURE)).toBe(15);
    expect(getVenezuelaHour(NIGHT_DEPARTURE)).toBe(23);
  });
});

describe("getTrafficFactor", () => {
  it("cubre las 24 horas de forma continua", () => {
    for (let hour = 0; hour < 24; hour += 1) {
      expect(Number.isFinite(getTrafficFactor(hour))).toBe(true);
    }
  });

  it("da más tráfico en el pico AM que en la madrugada", () => {
    expect(getTrafficFactor(8)).toBeGreaterThan(getTrafficFactor(3));
  });
});

describe("getVehicleCapacity / isVehicleSuitable", () => {
  it("lee la capacidad de la misma tabla que el formulario", () => {
    expect(getVehicleCapacity("moto")).toBe(PASSENGER_CAPACITY.moto);
    expect(getVehicleCapacity("sedan")).toBe(PASSENGER_CAPACITY.sedan);
    expect(getVehicleCapacity("suv")).toBe(PASSENGER_CAPACITY.suv);
    expect(getVehicleCapacity("van")).toBe(PASSENGER_CAPACITY.van);
  });

  it("rechaza combinaciones imposibles", () => {
    expect(isVehicleSuitable("moto", 2)).toBe(false);
    expect(isVehicleSuitable("sedan", 6)).toBe(false);
    expect(isVehicleSuitable("sedan", 0)).toBe(false);
    expect(isVehicleSuitable("van", 3)).toBe(true);
  });
});

describe("isVehicleType (guardia de datos externos)", () => {
  it("acepta solo los tipos del dominio", () => {
    expect(isVehicleType("sedan")).toBe(true);
    expect(isVehicleType("moto")).toBe(true);
    expect(isVehicleType("bike")).toBe(false);
    expect(isVehicleType("toString")).toBe(false);
    expect(isVehicleType(undefined)).toBe(false);
  });
});

describe("estimatePrice · cotización normal", () => {
  it("calcula el sedán de 5 km / 25 min a las 15:00 con números verificables a mano", () => {
    const price = estimatePrice(baseInput());
    expect(price).not.toBeNull();
    if (price === null) return;

    expect(price.currency).toBe("USD");
    // 25 min ideales × 1,05 de tráfico = 26,25 → 26 min.
    expect(price.durationIdealMin).toBe(25);
    expect(price.durationAdjustedMin).toBe(26);
    expect(price.trafficFactor).toBe(1.05);

    expect(price.baseFare).toBe(1.5);
    expect(price.distanceFare).toBe(2.75); // 5 km × 0,55
    expect(price.timeFare).toBe(2.08); // 26 min × 0,08
    expect(price.passengerSurcharge).toBe(0);
    expect(price.nightSurcharge).toBe(0);
    expect(price.subtotal).toBe(6.33);

    expect(price.minimumFareApplied).toBe(false);
    expect(price.priceAvg).toBe(6.33);
    expect(price.priceMin).toBe(5.57); // 6,33 × 0,88 = 5,5704
    expect(price.priceMax).toBe(7.09); // 6,33 × 1,12 = 7,0896
    expect(price.priceSpread).toBe(PRICE_SPREAD);
  });

  it("cobra recargo por pasajeros adicionales (el primero no paga)", () => {
    const price = estimatePrice(baseInput({ passengers: 3 }));
    expect(price).not.toBeNull();
    if (price === null) return;

    // Sedán: 0,35 por cada pasajero adicional, con 3 pasajeros son 2.
    expect(price.passengerSurcharge).toBe(0.7);
  });
});

describe("estimatePrice · desglose y rango", () => {
  it("el desglose suma exactamente el subtotal", () => {
    const price = estimatePrice(baseInput({ passengers: 4 }));
    expect(price).not.toBeNull();
    if (price === null) return;

    const sum = roundCents(
      price.baseFare +
        price.distanceFare +
        price.timeFare +
        price.passengerSurcharge +
        price.nightSurcharge
    );
    expect(sum).toBe(price.subtotal);
  });

  it("el mínimo del rango nunca baja del viaje mínimo", () => {
    const price = estimatePrice(baseInput());
    expect(price).not.toBeNull();
    if (price === null) return;

    expect(price.priceMin).toBeGreaterThanOrEqual(price.minimumFare);
    expect(price.priceMax).toBe(roundCents(price.priceAvg * (1 + PRICE_SPREAD)));
  });
});

describe("estimatePrice · factores", () => {
  it("aplica el recargo nocturno a las 23:00 y lo refleja en el desglose", () => {
    const price = estimatePrice(baseInput({ departureAt: NIGHT_DEPARTURE }));
    expect(price).not.toBeNull();
    if (price === null) return;

    expect(price.nightSurchargeFactor).toBe(NIGHT_SURCHARGE_FACTOR);
    expect(price.nightSurcharge).toBeGreaterThan(0);
    // El recargo es la diferencia entre el subtotal (ya con factor) y los conceptos.
    const concepts = roundCents(
      price.baseFare + price.distanceFare + price.timeFare + price.passengerSurcharge
    );
    expect(roundCents(price.subtotal - concepts)).toBe(price.nightSurcharge);
  });

  it("aplica el viaje mínimo en un viaje muy corto", () => {
    const price = estimatePrice(
      baseInput({ distanceKm: 0.3, durationIdealMin: 2, departureAt: VALLEY_DEPARTURE })
    );
    expect(price).not.toBeNull();
    if (price === null) return;

    expect(price.minimumFareApplied).toBe(true);
    expect(price.priceAvg).toBe(price.minimumFare);
    expect(price.priceMin).toBe(price.minimumFare);
  });
});

describe("estimatePrice · tarifas propias del conductor", () => {
  it("sustituye bandera, km, minuto y mínimo, dejando el recargo por pasajero del vehículo", () => {
    const price = estimatePrice(
      baseInput({
        distanceKm: 10,
        passengers: 2,
        tariffOverride: { baseFare: 3, costPerKm: 1, costPerMin: 0.2, minFare: 5 },
      })
    );
    expect(price).not.toBeNull();
    if (price === null) return;

    expect(price.baseFare).toBe(3);
    expect(price.distanceFare).toBe(10); // 10 km × 1
    expect(price.minimumFare).toBe(5);
    // El recargo por pasajero sigue viniendo del vehículo (sedán: 0,35).
    expect(price.passengerSurcharge).toBe(VEHICLE_TARIFFS.sedan.perExtraPassenger);
  });

  it("ignora una tarifa propia imposible (NaN) y cae a la del vehículo", () => {
    const price = estimatePrice(
      baseInput({
        tariffOverride: { baseFare: Number.NaN, costPerKm: 1, costPerMin: 0.2, minFare: 5 },
      })
    );
    expect(price).not.toBeNull();
    if (price === null) return;

    expect(price.baseFare).toBe(VEHICLE_TARIFFS.sedan.baseFare);
  });
});

describe("estimatePrice · entradas imposibles devuelven null", () => {
  it("más pasajeros que la capacidad del vehículo", () => {
    expect(estimatePrice(baseInput({ vehicleType: "moto", passengers: 2 }))).toBeNull();
  });

  it("cero pasajeros", () => {
    expect(estimatePrice(baseInput({ passengers: 0 }))).toBeNull();
  });

  it("distancia o duración no finitas o negativas", () => {
    expect(estimatePrice(baseInput({ distanceKm: Number.NaN }))).toBeNull();
    expect(estimatePrice(baseInput({ distanceKm: -1 }))).toBeNull();
    expect(estimatePrice(baseInput({ durationIdealMin: Number.POSITIVE_INFINITY }))).toBeNull();
    expect(estimatePrice(baseInput({ durationIdealMin: -5 }))).toBeNull();
  });
});
