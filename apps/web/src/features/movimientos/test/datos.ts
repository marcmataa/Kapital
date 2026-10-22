import type { Categoria, Cuenta } from '@/shared/api/catalogos';
import type { Movimiento } from '../lib/tipos';

/** Datos inventados para los tests (sin datos personales). */
export const ID = {
  caixa: '11111111-1111-4111-8111-111111111111',
  ing: '22222222-2222-4222-8222-222222222222',
  efectivo: '33333333-3333-4333-8333-333333333333',
  cerrada: '44444444-4444-4444-8444-444444444444',
  ocio: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  restaurantes: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  nomina: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  mov1: 'dddddddd-0000-4000-8000-000000000001',
  mov2: 'dddddddd-0000-4000-8000-000000000002',
  mov3: 'dddddddd-0000-4000-8000-000000000003',
  mov4: 'dddddddd-0000-4000-8000-000000000004',
  mov5: 'dddddddd-0000-4000-8000-000000000005',
} as const;

function cuenta(c: Partial<Cuenta> & Pick<Cuenta, 'id' | 'nombre'>): Cuenta {
  return {
    tipo: 'banco',
    entidad: null,
    color: null,
    emoji: null,
    es_principal: false,
    orden: 0,
    fecha_inicial: '2026-01-01',
    fecha_cierre: null,
    saldo_inicial: '0.00',
    valor: '0.00',
    ...c,
  };
}

export const CUENTAS: Cuenta[] = [
  cuenta({ id: ID.caixa, nombre: 'Banco Uno', entidad: 'caixabank', es_principal: true, orden: 1 }),
  cuenta({ id: ID.ing, nombre: 'Banco Dos', entidad: 'ing', orden: 2, fecha_inicial: '2026-10-05' }),
  cuenta({ id: ID.efectivo, nombre: 'Efectivo', tipo: 'efectivo', orden: 3 }),
  cuenta({ id: ID.cerrada, nombre: 'Banco Viejo', orden: 4, fecha_cierre: '2026-06-30', valor: null }),
];

function categoria(c: Pick<Categoria, 'id' | 'nombre' | 'tipo'> & Partial<Categoria>): Categoria {
  return {
    user_id: 'u',
    color: '#9b6bff',
    icono: null,
    orden: 0,
    archivada: false,
    created_at: '2026-01-01T00:00:00Z',
    ...c,
  };
}

export const CATEGORIAS: Categoria[] = [
  categoria({ id: ID.ocio, nombre: 'Ocio', tipo: 'gasto', icono: '🎉' }),
  categoria({ id: ID.restaurantes, nombre: 'Restaurantes', tipo: 'gasto', color: '#ff8a3d' }),
  categoria({ id: ID.nomina, nombre: 'Nómina', tipo: 'ingreso', color: '#5fd3a0' }),
];

export function movimiento(m: Partial<Movimiento> & Pick<Movimiento, 'id'>): Movimiento {
  return {
    fecha: '2026-10-14',
    hora: null,
    concepto: 'Concepto',
    comercio: null,
    tipo: 'gasto',
    importe: '10.00',
    sentido: null,
    categoria_id: ID.ocio,
    metodo: 'tarjeta',
    cuenta_id: ID.caixa,
    cuenta_destino_id: null,
    devolucion_de: null,
    notas: null,
    origen: 'app',
    created_at: '2026-10-14T18:00:00.000000+00:00',
    ...m,
  };
}
