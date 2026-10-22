import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderConApp } from '@/test/render';
import { TarjetasKpi } from './TarjetasKpi';

const tarjeta = (titulo: string) => {
  const h = screen.getByRole('heading', { name: titulo });
  const article = h.closest('article');
  if (!article) throw new Error('sin tarjeta');
  return article;
};

describe('TarjetasKpi', () => {
  it('títulos del mes en curso: patrimonio a hoy, ingresos y gastos netos de 1 a hoy', () => {
    renderConApp(
      <TarjetasKpi
        hoy="2026-10-19"
        patrimonioHoy="2458.32"
        patrimonioAnterior="1975.00"
        resumenActual={{ ingresos: '3420.00', gastos_netos: '961.68', balance: '2458.32' }}
        resumenAnterior={{ ingresos: '3042.70', gastos_netos: '1037.40', balance: '2005.30' }}
      />,
    );
    const patrimonio = tarjeta('Patrimonio a 19/10/2026');
    expect(within(patrimonio).getByText(/2\.458,32/)).toBeInTheDocument();
    expect(within(patrimonio).getByText('+24,5 %')).toBeInTheDocument();
    expect(within(patrimonio).getByText('vs 19/09/2026')).toBeInTheDocument();

    const ingresos = tarjeta('Ingresos · 1–19 oct');
    expect(within(ingresos).getByText('vs 1–19 sept')).toBeInTheDocument();
    expect(tarjeta('Gastos netos · 1–19 oct')).toBeInTheDocument();
  });

  it('si el mes anterior tuvo 0 € de ingresos dice «Sin datos del mes anterior» (sección 11)', () => {
    renderConApp(
      <TarjetasKpi
        hoy="2026-10-19"
        patrimonioHoy="2458.32"
        patrimonioAnterior="1975.00"
        resumenActual={{ ingresos: '3420.00', gastos_netos: '961.68', balance: '2458.32' }}
        resumenAnterior={{ ingresos: '0.00', gastos_netos: '900.00', balance: '-900.00' }}
      />,
    );
    const ingresos = tarjeta('Ingresos · 1–19 oct');
    expect(within(ingresos).getByText('Sin datos del mes anterior')).toBeInTheDocument();
    expect(within(ingresos).queryByText(/%/)).not.toBeInTheDocument();
  });

  it('color por significado: que suban los gastos es rojo y que suban los ingresos es verde', () => {
    renderConApp(
      <TarjetasKpi
        hoy="2026-10-19"
        patrimonioHoy="1000.00"
        patrimonioAnterior="1200.00"
        resumenActual={{ ingresos: '1100.00', gastos_netos: '961.68', balance: '138.32' }}
        resumenAnterior={{ ingresos: '1000.00', gastos_netos: '900.00', balance: '100.00' }}
      />,
    );
    // Gastos: +6,9 % → rojo.
    const gastos = within(tarjeta('Gastos netos · 1–19 oct')).getByText('+6,9 %');
    expect(gastos.parentElement).toHaveClass('text-negativo');
    // Ingresos: +10,0 % → verde.
    const ingresos = within(tarjeta('Ingresos · 1–19 oct')).getByText('+10,0 %');
    expect(ingresos.parentElement).toHaveClass('text-positivo');
    // Patrimonio baja: −16,7 % → rojo.
    const patrimonio = within(tarjeta('Patrimonio a 19/10/2026')).getByText('-16,7 %');
    expect(patrimonio.parentElement).toHaveClass('text-negativo');
  });

  it('que bajen los gastos es verde', () => {
    renderConApp(
      <TarjetasKpi
        hoy="2026-10-19"
        patrimonioHoy="1000.00"
        patrimonioAnterior="1000.00"
        resumenActual={{ ingresos: '1000.00', gastos_netos: '800.00', balance: '200.00' }}
        resumenAnterior={{ ingresos: '1000.00', gastos_netos: '1000.00', balance: '0.00' }}
      />,
    );
    const gastos = within(tarjeta('Gastos netos · 1–19 oct')).getByText('-20,0 %');
    expect(gastos.parentElement).toHaveClass('text-positivo');
  });

  it('sin patrimonio del día equivalente: «Sin datos del mes anterior»', () => {
    renderConApp(
      <TarjetasKpi
        hoy="2026-10-19"
        patrimonioHoy="1000.00"
        patrimonioAnterior={null}
        resumenActual={{ ingresos: '0.00', gastos_netos: '0.00', balance: '0.00' }}
        resumenAnterior={null}
      />,
    );
    expect(within(tarjeta('Patrimonio a 19/10/2026')).getByText('Sin datos del mes anterior')).toBeInTheDocument();
  });
});
