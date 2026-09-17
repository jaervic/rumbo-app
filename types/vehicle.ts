/**
 * Vehículo concreto del catálogo (Fase 6.1a): marca + modelo + año, más el tipo con el que se cotiza.
 *
 * ¿Por qué `brand` y `model` son TEXTO y no ids? Porque el catálogo (`lib/vehicleCatalog.ts`) se
 * filtra por tipo y admite marca y modelo libres ("Otro"): el selector trabaja con lo que el usuario
 * ve y escribe. Los ids estables (`toyota-corolla`) son cosa de los modelos ricos del catálogo y se
 * usarán cuando haya que GUARDAR (Fase 7: Supabase, con los flags `is_custom_brand` /
 * `is_custom_model` para las marcas y modelos personalizados).
 *
 * `vehicleType` viaja DENTRO del vehículo a propósito: el tipo activo del formulario puede cambiar
 * después de elegir el vehículo, así que este dato no debe depender de lo que esté seleccionado en
 * ese momento (es lo que el selector usa para saber si su borrador sigue siendo válido).
 *
 * TODO (Fase 6.2): usar este vehículo en el perfil del conductor y persistirlo en localStorage, para
 * que no haya que elegirlo otra vez al abrir la app.
 * TODO (Fase 6.2+): factor de precio por antigüedad (`year`) o por gama del modelo.
 */

import type { VehicleType } from "@/types";

export interface Vehicle {
  /** Nombre de marca tal cual lo ve el usuario ("Toyota"), o texto libre si eligió "Otro". */
  brand: string;
  /** Nombre del modelo ("Corolla"), o texto libre si eligió "Otro". */
  model: string;
  /** Año del modelo, dentro del rango que ofrece `getYears()`. */
  year: number;
  /** Tipo de vehículo para el que se eligió (el tipo activo del formulario). */
  vehicleType: VehicleType;
}
