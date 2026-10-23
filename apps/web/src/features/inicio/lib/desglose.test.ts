import { describe, expect, it } from 'vitest';
import { cuentasDelDesglose, type CuentaDesglose } from './desglose';

const cuenta = (c: Partial<CuentaDesglose> & Pick<CuentaDesglose, 'id'>): CuentaDesglose => ({
  nombre: c.id,
  tipo: 'banco',
  entidad: null,
  color: null,
  emoji: null,
  es_principal: false,
  orden: 0,
  fecha_inicial: '2026-01-01',
  fecha_cierre: null,
  valor: '100.00',
  ...c,
});

const ids = (cs: readonly CuentaDesglose[]) => cs.map((c) => c.id);

describe('cuentasDelDesglose', () => {
  it('ordena con la principal primero y luego por `orden`, sin mutar la entrada', () => {
    const cuentas = [
      cuenta({ id: 'efectivo', tipo: 'efectivo', orden: 2 }),
      cuenta({ id: 'broker', tipo: 'inversion', orden: 1 }),
      cuenta({ id: 'principal', es_principal: true, orden: 5 }),
      cuenta({ id: 'otro', orden: 0 }),
    ];
    expect(ids(cuentasDelDesglose(cuentas, '2026-10-19'))).toEqual(['principal', 'otro', 'broker', 'efectivo']);
    expect(ids(cuentas)).toEqual(['efectivo', 'broker', 'principal', 'otro']);
  });

  it('fuera la cuenta que aún no existía en la fecha (valor NULL o fecha_inicial posterior)', () => {
    const cuentas = [
      cuenta({ id: 'vieja' }),
      cuenta({ id: 'nueva', fecha_inicial: '2026-10-05', valor: null }),
      cuenta({ id: 'mismo-dia', fecha_inicial: '2026-09-30' }),
    ];
    expect(ids(cuentasDelDesglose(cuentas, '2026-09-30'))).toEqual(['vieja', 'mismo-dia']);
  });

  it('cierre del 30/09: una cuenta cerrada después sí sale; la cerrada antes o ese mismo día, no', () => {
    const cuentas = [
      cuenta({ id: 'cerrada-oct', fecha_cierre: '2026-10-10', orden: 1 }),
      cuenta({ id: 'cerrada-ago', fecha_cierre: '2026-08-31', valor: '0.00', orden: 2 }),
      cuenta({ id: 'cerrada-ese-dia', fecha_cierre: '2026-09-30', valor: '0.00', orden: 3 }),
    ];
    expect(ids(cuentasDelDesglose(cuentas, '2026-09-30'))).toEqual(['cerrada-oct']);
  });

  it('conserva los valores negativos tal cual (texto de SQL)', () => {
    const [pasivo] = cuentasDelDesglose([cuenta({ id: 'tarjeta', tipo: 'pasivo', valor: '-250.40' })], '2026-10-19');
    expect(pasivo?.valor).toBe('-250.40');
  });
});
