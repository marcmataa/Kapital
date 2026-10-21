import { useEffect, useState } from 'react';

/** Instante actual (ms) que se refresca cada `intervaloMs` (por defecto, 30 s). */
export function useAhora(intervaloMs = 30_000): number {
  const [ahora, setAhora] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setAhora(Date.now()), intervaloMs);
    return () => clearInterval(id);
  }, [intervaloMs]);
  return ahora;
}
