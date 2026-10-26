import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { traducir, type FuncionT, type Idioma } from '@/shared/i18n';
import { Proveedores } from '@/test/render';
import { estado, reiniciar } from '@/test/supabaseFalso';
import { CLAVES_CATEGORIA, nombreCategoria } from './categorias';

vi.mock('@/shared/lib/supabase', async () => (await import('@/test/supabaseFalso')).moduloFalso);

const { useNombreCategoriaCatalogo } = await import('@/shared/hooks/useNombreCategoria');

const tDe =
  (idioma: Idioma): FuncionT<'common'> =>
  (clave, variables) =>
    traducir(idioma, 'common', clave, variables);

describe('nombreCategoria', () => {
  it('traduce las categorías por defecto según el idioma', () => {
    const ocio = { nombre: 'Ocio', clave: 'ocio' };
    expect(nombreCategoria(ocio, tDe('es'))).toBe('Ocio');
    expect(nombreCategoria(ocio, tDe('en'))).toBe('Leisure');
    expect(nombreCategoria(ocio, tDe('ca'))).toBe('Oci');
    expect(nombreCategoria({ nombre: 'Otros ingresos', clave: 'otros_ingresos' }, tDe('ca'))).toBe('Altres ingressos');
  });

  it('las categorías por defecto nuevas (20261024000000) también se traducen', () => {
    const nuevas = [
      ['supermercado', 'Groceries', 'Supermercat'],
      ['hogar', 'Home', 'Llar'],
      ['salud', 'Health', 'Salut'],
      ['deporte', 'Sport', 'Esport'],
      ['cuidado_personal', 'Personal care', 'Cura personal'],
      ['ropa', 'Clothing', 'Roba'],
      ['regalos', 'Gifts', 'Regals'],
    ] as const;
    for (const [clave, en, ca] of nuevas) {
      expect(nombreCategoria({ nombre: 'x', clave }, tDe('en'))).toBe(en);
      expect(nombreCategoria({ nombre: 'x', clave }, tDe('ca'))).toBe(ca);
    }
  });

  it('una categoría propia o renombrada (sin clave) se ve tal cual en cualquier idioma', () => {
    for (const idioma of ['es', 'en', 'ca'] as const) {
      expect(nombreCategoria({ nombre: 'Mascotas', clave: null }, tDe(idioma))).toBe('Mascotas');
      expect(nombreCategoria({ nombre: 'Fiesta' }, tDe(idioma))).toBe('Fiesta');
    }
  });

  it('una clave desconocida no rompe nada: se muestra el nombre', () => {
    expect(nombreCategoria({ nombre: 'Rara', clave: 'inventada' }, tDe('en'))).toBe('Rara');
  });

  it('cada clave tiene texto en es / en / ca, y en español coincide con el nombre de la base', () => {
    const nombresBase = [
      'Restaurantes', 'Ocio', 'Transporte', 'Suscripciones', 'Otros gastos', 'Nómina', 'Otros ingresos', 'Rendimientos',
      'Supermercado', 'Hogar', 'Salud', 'Deporte', 'Cuidado personal', 'Ropa', 'Regalos',
    ];
    expect(CLAVES_CATEGORIA).toHaveLength(nombresBase.length);
    CLAVES_CATEGORIA.forEach((clave, i) => {
      expect(nombreCategoria({ nombre: 'x', clave }, tDe('es'))).toBe(nombresBase[i]);
      for (const idioma of ['en', 'ca'] as const) expect(nombreCategoria({ nombre: 'x', clave }, tDe(idioma))).not.toBe('x');
    });
  });
});

/* Datos sin clave (gasto_por_categoria, snapshot del análisis): la clave sale del catálogo. */
function Nombres({ filas }: { filas: { id?: string; nombre: string }[] }) {
  const nombreDe = useNombreCategoriaCatalogo();
  return (
    <ul>
      {filas.map((f) => (
        <li key={f.nombre}>{nombreDe(f)}</li>
      ))}
    </ul>
  );
}

describe('useNombreCategoriaCatalogo', () => {
  beforeEach(() => {
    reiniciar();
    estado.responder = (ll) =>
      ll.nombre === 'categorias'
        ? {
            data: [
              { id: 'c-ocio', nombre: 'Ocio', clave: 'ocio', tipo: 'gasto' },
              { id: 'c-nomina', nombre: 'Nómina', clave: 'nomina', tipo: 'ingreso' },
              { id: 'c-fiesta', nombre: 'Fiesta', clave: null, tipo: 'gasto' },
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

  it('traduce por id y, si no hay id, por nombre', async () => {
    pintar('en', [{ id: 'c-ocio', nombre: 'Ocio' }, { nombre: 'Nómina' }, { id: 'c-fiesta', nombre: 'Fiesta' }]);
    expect(await screen.findByText('Leisure')).toBeInTheDocument();
    expect(screen.getByText('Salary')).toBeInTheDocument();
    expect(screen.getByText('Fiesta')).toBeInTheDocument();
  });

  it('en catalán', async () => {
    pintar('ca', [{ id: 'c-ocio', nombre: 'Ocio' }, { nombre: 'Viajes' }]);
    expect(await screen.findByText('Oci')).toBeInTheDocument();
    // No está en el catálogo: tal cual.
    expect(screen.getByText('Viajes')).toBeInTheDocument();
  });

  it('un nombre antiguo que ya no coincide con el del catálogo no se traduce', async () => {
    // Snapshot con «Ocio» de una categoría que hoy se llama «Fiesta» (renombrada).
    pintar('en', [{ id: 'c-fiesta', nombre: 'Ocio' }, { id: 'c-nomina', nombre: 'Nómina' }]);
    expect(await screen.findByText('Salary')).toBeInTheDocument();
    expect(screen.getAllByRole('listitem').map((li) => li.textContent)).toEqual(['Ocio', 'Salary']);
  });
});
