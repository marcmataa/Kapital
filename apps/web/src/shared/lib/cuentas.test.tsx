import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { traducir, type FuncionT, type Idioma } from '@/shared/i18n';
import { Proveedores } from '@/test/render';
import { estado, reiniciar } from '@/test/supabaseFalso';
import { nombreCuenta } from './cuentas';

vi.mock('@/shared/lib/supabase', async () => (await import('@/test/supabaseFalso')).moduloFalso);

const { useNombreCuentaCatalogo } = await import('@/shared/hooks/useNombreCuenta');

const tDe =
  (idioma: Idioma): FuncionT<'common'> =>
  (clave, variables) =>
    traducir(idioma, 'common', clave, variables);

describe('nombreCuenta', () => {
  it('la cuenta de efectivo por defecto se traduce en todos los idiomas', () => {
    const efectivo = { nombre: 'Efectivo', clave: 'efectivo' };
    expect(nombreCuenta(efectivo, tDe('es'))).toBe('Efectivo');
    expect(nombreCuenta(efectivo, tDe('en'))).toBe('Cash');
    expect(nombreCuenta(efectivo, tDe('ca'))).toBe('Efectiu');
  });

  it('los bancos y las cuentas renombradas (sin clave) se ven tal cual', () => {
    for (const idioma of ['es', 'en', 'ca'] as const) {
      expect(nombreCuenta({ nombre: 'BBVA', clave: null }, tDe(idioma))).toBe('BBVA');
      expect(nombreCuenta({ nombre: 'Trade Republic' }, tDe(idioma))).toBe('Trade Republic');
      expect(nombreCuenta({ nombre: 'Cartera', clave: null }, tDe(idioma))).toBe('Cartera');
      // Una cuenta llamada «Efectivo» sin clave (renombrada a mano) no se traduce.
      expect(nombreCuenta({ nombre: 'Efectivo', clave: null }, tDe(idioma))).toBe('Efectivo');
    }
  });

  it('una clave desconocida no rompe nada: se muestra el nombre', () => {
    expect(nombreCuenta({ nombre: 'Rara', clave: 'inventada' }, tDe('en'))).toBe('Rara');
  });
});

/* Datos sin clave (v_fuera_balance: traspasos y ajustes de Estadísticas): la clave sale del catálogo. */
function Nombres({ filas }: { filas: { id?: string; nombre: string }[] }) {
  const nombreDe = useNombreCuentaCatalogo();
  return (
    <ul>
      {filas.map((f) => (
        <li key={f.nombre}>{nombreDe(f)}</li>
      ))}
    </ul>
  );
}

describe('useNombreCuentaCatalogo', () => {
  beforeEach(() => {
    reiniciar();
    estado.responder = (ll) =>
      ll.nombre === 'cuentas'
        ? {
            data: [
              { id: 'c-bbva', nombre: 'BBVA', clave: null, tipo: 'banco' },
              { id: 'c-efectivo', nombre: 'Efectivo', clave: 'efectivo', tipo: 'efectivo' },
            ],
            error: null,
          }
        : { data: [], error: null };
  });

  const pintar = (idioma: Idioma, filas: { id?: string; nombre: string }[]) =>
    render(
      <Proveedores idioma={idioma}>
        <Nombres filas={filas} />
      </Proveedores>,
    );

  it('traduce el efectivo por nombre y deja los bancos tal cual (en)', async () => {
    pintar('en', [{ nombre: 'Efectivo' }, { nombre: 'BBVA' }]);
    expect(await screen.findByText('Cash')).toBeInTheDocument();
    expect(screen.getByText('BBVA')).toBeInTheDocument();
  });

  it('en catalán, por id', async () => {
    pintar('ca', [{ id: 'c-efectivo', nombre: 'Efectivo' }, { nombre: 'Trade Republic' }]);
    expect(await screen.findByText('Efectiu')).toBeInTheDocument();
    expect(screen.getByText('Trade Republic')).toBeInTheDocument();
  });
});
