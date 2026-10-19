import { useEffect, useState } from 'react';

export const INTERVALO_SONDEO_MS = 5_000;
export const MAXIMO_SONDEO_MS = 120_000;

/**
 * Mientras `activo` (análisis pendiente o generando), devuelve el intervalo de sondeo (5 s).
 * A los ~2 minutos deja de sondear (`agotado`) y llama a `alAgotar` (un último refresco).
 * `reiniciar` vuelve a empezar la cuenta (botón «Comprobar de nuevo»).
 */
export function useSondeoAnalisis(activo: boolean, alAgotar: () => void) {
  const [agotado, setAgotado] = useState(false);
  const [ronda, setRonda] = useState(0);
  const [activoAntes, setActivoAntes] = useState(activo);
  if (activo !== activoAntes) {
    // Al terminar (o volver a empezar) la generación, la cuenta empieza de cero.
    setActivoAntes(activo);
    setAgotado(false);
  }

  useEffect(() => {
    if (!activo) return;
    const temporizador = setTimeout(() => {
      setAgotado(true);
      alAgotar();
    }, MAXIMO_SONDEO_MS);
    return () => clearTimeout(temporizador);
    // alAgotar se lee al vencer; no reinicia el temporizador.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activo, ronda]);

  return {
    intervalo: activo && !agotado ? INTERVALO_SONDEO_MS : 0,
    agotado: activo && agotado,
    reiniciar: () => {
      setAgotado(false);
      setRonda((r) => r + 1);
    },
  };
}
