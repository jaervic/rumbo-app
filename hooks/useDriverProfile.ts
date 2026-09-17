"use client";

/**
 * Perfil del conductor (Fase 6.2) como estado de React.
 *
 * ¿Por qué `useSyncExternalStore` y no `useState` + `useEffect`? Dos motivos concretos de este
 * proyecto:
 * 1. HIDRATACIÓN: el HTML del servidor no puede leer localStorage. Con `useEffect` el primer render
 *    diría "no hay perfil" y el segundo "sí lo hay", que es justo el parpadeo que hay que evitar. Con
 *    `useSyncExternalStore`, el render de hidratación usa el snapshot del servidor
 *    (`undefined` = "aún no lo sé") y React re-renderiza con el valor real en cuanto hidrata.
 * 2. LINT: la regla del compilador de React activada en este repo (`react-hooks/set-state-in-effect`)
 *    prohíbe `setState` dentro de un `useEffect`, que es exactamente lo que haría falta para cargar
 *    el perfil al montar.
 *
 * El resultado para quien lo usa es el mismo estado de siempre: `loading` es `true` mientras no se
 * sabe si hay perfil (el botón no se pinta todavía, así que no hay saltos de layout visibles).
 */

import { useCallback, useSyncExternalStore } from "react";
import {
  clearProfile as clearStoredProfile,
  getProfileSnapshot,
  getServerProfileSnapshot,
  isValidName,
  saveProfile as saveStoredProfile,
  subscribeToProfile,
  validateTariff,
  type DriverProfile,
} from "@/lib/driverProfile";

export interface UseDriverProfileResult {
  /** Perfil guardado, o `null` si no hay (o si lo guardado no es válido). */
  profile: DriverProfile | null;
  /** `true` mientras no se sabe si hay perfil (servidor y primer render de hidratación). */
  loading: boolean;
  /** Hay perfil Y sus tarifas están dentro de rango: es lo que decide si el motor usa tarifas propias. */
  isConfigured: boolean;
  /** Guarda el perfil en localStorage y actualiza el estado (y a los demás consumidores del hook). */
  saveProfile: (profile: DriverProfile) => void;
  /** Borra el perfil guardado y actualiza el estado. */
  clearProfile: () => void;
}

export function useDriverProfile(): UseDriverProfileResult {
  // El tercer argumento es el snapshot del servidor: es lo que permite hidratar sin desajustes.
  const snapshot = useSyncExternalStore<DriverProfile | null | undefined>(
    subscribeToProfile,
    getProfileSnapshot,
    getServerProfileSnapshot
  );

  const loading = snapshot === undefined;
  const profile = snapshot ?? null;

  // Identidad estable: estos callbacks se pasan a componentes/handlers y no deben re-crearse.
  const saveProfile = useCallback((next: DriverProfile) => {
    saveStoredProfile(next);
  }, []);

  const clearProfile = useCallback(() => {
    clearStoredProfile();
  }, []);

  return {
    profile,
    loading,
    // Un perfil con nombre vacío o con tarifas fuera de rango se trata como "no configurado": el
    // motor vuelve a las tarifas sugeridas en lugar de cotizar con datos a medias.
    isConfigured: profile !== null && isValidName(profile.name) && validateTariff(profile.tariff).valid,
    saveProfile,
    clearProfile,
  };
}
