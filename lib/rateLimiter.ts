/**
 * Limitador de tasa compartido por los clientes de APIs públicas.
 *
 * ¿Por qué existe? Los servidores públicos que usa la app (Photon para direcciones y
 * OSRM para rutas) piden como máximo 1 petición por segundo y no admiten ráfagas. La
 * cola es la misma para todos, así que se implementa una vez aquí y cada cliente crea
 * SU PROPIA instancia (cada servicio tiene su propio cupo y no deben bloquearse entre sí).
 */

/**
 * Crea un limitador de tasa: serializa las tareas y garantiza un intervalo mínimo
 * entre peticiones reales (así se respeta el 1 req/seg de cada servicio).
 */
export function createRateLimiter(minIntervalMs: number) {
  let chain: Promise<void> = Promise.resolve();
  let lastRunAt = 0;

  return async function schedule<T>(task: () => Promise<T>): Promise<T> {
    const run = chain.then(async () => {
      const waitFor = minIntervalMs - (Date.now() - lastRunAt);
      if (waitFor > 0) await wait(waitFor);

      lastRunAt = Date.now();
      return task();
    });

    // La cola no debe romperse si una tarea falla.
    chain = run.then(
      () => undefined,
      () => undefined
    );

    return run;
  };
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
