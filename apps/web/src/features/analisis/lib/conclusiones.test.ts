import { describe, expect, it } from 'vitest';
import { conclusionesMes } from './conclusiones';

const cat = (id: string, gasto: string) => ({ id, nombre: id, color: '#000000', gasto });

describe('conclusionesMes (reglas fijas, solo con datos del mes)', () => {
  it('sección 11 (septiembre): ahorro del 22,5 % y la categoría que más pesa con su % sobre lo gastado', () => {
    expect(
      conclusionesMes({
        ingresos: '1508.00',
        gastosNetos: '1168.28',
        balance: '339.72',
        ahorroPct: '22.5278514588859416',
        categorias: [cat('Ocio', '40.00'), cat('Restaurantes', '1158.28'), cat('Otros gastos', '-30.00')],
      }),
    ).toEqual([
      { tipo: 'ahorraste', porcentaje: '22.5278514588859416' },
      // 1.158,28 / (1.158,28 + 40,00) = 96,66 %: la categoría negativa no entra en la base.
      { tipo: 'mayorCategoria', nombre: 'Restaurantes', porcentaje: '96.6619' },
    ]);
  });

  it('gastaste más de lo que ingresaste: cuánto, en positivo', () => {
    const c = conclusionesMes({
      ingresos: '400.00',
      gastosNetos: '650.25',
      balance: '-250.25',
      ahorroPct: '-62.5625',
      categorias: [cat('Supermercado', '208.08'), cat('Hogar', '442.17')],
    });
    expect(c[0]).toEqual({ tipo: 'gastasteMas', importe: '250.25' });
    expect(c[1]).toEqual({ tipo: 'mayorCategoria', nombre: 'Hogar', porcentaje: '68.0000' });
  });

  it('sin ingresos: lo dice, nunca un ahorro', () => {
    const c = conclusionesMes({ ingresos: '0.00', gastosNetos: '80.00', balance: '-80.00', ahorroPct: null, categorias: [cat('Ocio', '80.00')] });
    expect(c.map((x) => x.tipo)).toEqual(['sinIngresos', 'mayorCategoria']);
  });

  it('justo a cero y sin gastos', () => {
    expect(conclusionesMes({ ingresos: '0.00', gastosNetos: '0.00', balance: '0.00', ahorroPct: null, categorias: [] })).toEqual([
      { tipo: 'sinIngresos' },
      { tipo: 'sinGastos' },
    ]);
    expect(
      conclusionesMes({ ingresos: '100.00', gastosNetos: '100.00', balance: '0.00', ahorroPct: '0', categorias: [cat('Ocio', '100.00')] })[0],
    ).toEqual({ tipo: 'aCero' });
  });

  it('solo devoluciones (todas las categorías en negativo): sin categoría destacada', () => {
    const c = conclusionesMes({ ingresos: '50.00', gastosNetos: '-20.00', balance: '70.00', ahorroPct: '140.0000', categorias: [cat('Ocio', '-20.00')] });
    // 140 % queda fuera de ±100 %: no se cita la tasa de ahorro.
    expect(c).toEqual([{ tipo: 'sinGastos' }]);
  });
});
