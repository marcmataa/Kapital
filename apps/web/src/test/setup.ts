import '@testing-library/jest-dom/vitest';
import { cleanup, configure } from '@testing-library/react';
import { afterEach } from 'vitest';

// Las rutas son lazy y la suite corre en paralelo: con la máquina cargada, el primer import de
// una página puede tardar más que el 1 s por defecto de findBy*/waitFor. 5 s evita falsos rojos.
configure({ asyncUtilTimeout: 5_000 });

afterEach(() => {
  cleanup();
  try {
    window.localStorage.clear();
  } catch {
    // sin almacenamiento: nada que limpiar
  }
});
