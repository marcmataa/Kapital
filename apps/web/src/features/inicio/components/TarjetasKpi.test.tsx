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
        resumenActual={{ ingresos: '3420.00', gastos_netos: '961.68', balance: '2458.32', ahorro_pct: null }}
        resumenAnterior={{ ingresos: '3042.70', gastos_netos: '1037.40', balance: '2005.30', ahorro_pct: null }}
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
        resumenActual={{ ingresos: '3420.00', gastos_netos: '961.68', balance: '2458.32', ahorro_pct: null }}
        resumenAnterior={{ ingresos: '0.00', gastos_netos: '900.00', balance: '-900.00', ahorro_pct: null }}
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
        resumenActual={{ ingresos: '1100.00', gastos_netos: '961.68', balance: '138.32', ahorro_pct: null }}
        resumenAnterior={{ ingresos: '1000.00', gastos_netos: '900.00', balance: '100.00', ahorro_pct: null }}
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
        resumenActual={{ ingresos: '1000.00', gastos_netos: '800.00', balance: '200.00', ahorro_pct: null }}
        resumenAnterior={{ ingresos: '1000.00', gastos_netos: '1000.00', balance: '0.00', ahorro_pct: null }}
      />,
    );
    const gastos = within(tarjeta('Gastos netos · 1–19 oct')).getByText('-20,0 %');
    expect(gastos.parentElement).toHaveClass('text-positivo');
  });

  it('mes cerrado: patrimonio al último día vs d′ y mes completo vs mes anterior completo', () => {
    renderConApp(
      <TarjetasKpi
        hoy="2026-10-19"
        mes="2026-09-01"
        patrimonioHoy="2327.44"
        patrimonioAnterior="2000.00"
        resumenActual={{ ingresos: '1508.00', gastos_netos: '1168.28', balance: '339.72', ahorro_pct: null }}
        resumenAnterior={{ ingresos: '1400.00', gastos_netos: '1000.00', balance: '400.00', ahorro_pct: null }}
      />,
    );
    const patrimonio = tarjeta('Patrimonio a 30/09/2026');
    expect(within(patrimonio).getByText('vs 30/08/2026')).toBeInTheDocument();
    expect(within(patrimonio).getByText('+16,4 %')).toBeInTheDocument();
    expect(within(tarjeta('Ingresos · 1–30 sept')).getByText('vs 1–31 ago')).toBeInTheDocument();
    expect(within(tarjeta('Gastos netos · 1–30 sept')).getByText('+16,8 %')).toBeInTheDocument();
  });

  it('mes cerrado de 31 días: d′ es el último día del mes anterior (sección 11)', () => {
    renderConApp(
      <TarjetasKpi
        hoy="2026-11-05"
        mes="2026-10-01"
        patrimonioHoy="1000.00"
        patrimonioAnterior="1000.00"
        resumenActual={{ ingresos: '0.00', gastos_netos: '0.00', balance: '0.00', ahorro_pct: null }}
        resumenAnterior={null}
      />,
    );
    expect(within(tarjeta('Patrimonio a 31/10/2026')).getByText('vs 30/09/2026')).toBeInTheDocument();
    expect(within(tarjeta('Ingresos · 1–31 oct')).getByText('Sin datos del mes anterior')).toBeInTheDocument();
  });

  it('sin patrimonio del día equivalente: «Sin datos del mes anterior»', () => {
    renderConApp(
      <TarjetasKpi
        hoy="2026-10-19"
        patrimonioHoy="1000.00"
        patrimonioAnterior={null}
        resumenActual={{ ingresos: '0.00', gastos_netos: '0.00', balance: '0.00', ahorro_pct: null }}
        resumenAnterior={null}
      />,
    );
    expect(within(tarjeta('Patrimonio a 19/10/2026')).getByText('Sin datos del mes anterior')).toBeInTheDocument();
  });
});

describe('TarjetasKpi · desglose por cuenta', () => {
  const RESUMEN = { ingresos: '0.00', gastos_netos: '0.00', balance: '0.00', ahorro_pct: null };
  const base = {
    tipo: 'banco' as const,
    entidad: null,
    color: '#3366aa',
    emoji: null,
    es_principal: false,
    fecha_cierre: null,
    fecha_inicial: '2026-01-01',
  };

  it('mes cerrado: filtra a la fecha de cierre (30/09), no a hoy', () => {
    renderConApp(
      <TarjetasKpi
        hoy="2026-10-19"
        mes="2026-09-01"
        patrimonioHoy="1500.00"
        patrimonioAnterior={null}
        resumenActual={RESUMEN}
        resumenAnterior={null}
        cuentas={[
          { ...base, id: 'a', nombre: 'Banco Uno', orden: 0, valor: '1500.00' },
          // Abierta el 05/10: el 30/09 aún no existía.
          { ...base, id: 'b', nombre: 'Banco Octubre', orden: 1, fecha_inicial: '2026-10-05', valor: null },
          // Cerrada el 10/10: el 30/09 seguía abierta.
          { ...base, id: 'c', nombre: 'Banco Cerrado', orden: 2, fecha_cierre: '2026-10-10', valor: '0.00' },
        ]}
      />,
    );
    const lista = within(tarjeta('Patrimonio a 30/09/2026')).getByRole('list', { name: 'Patrimonio por cuenta' });
    const filas = within(lista).getAllByRole('listitem');
    expect(filas).toHaveLength(2);
    expect(filas[0]).toHaveTextContent('Banco Uno');
    expect(filas[1]).toHaveTextContent('Banco Cerrado');
    expect(within(lista).queryByText('Banco Octubre')).not.toBeInTheDocument();
  });

  it('negativos con signo y en rojo; emoji para las cuentas que no son banco', () => {
    renderConApp(
      <TarjetasKpi
        hoy="2026-10-19"
        patrimonioHoy="-205.40"
        patrimonioAnterior={null}
        resumenActual={RESUMEN}
        resumenAnterior={null}
        cuentas={[
          { ...base, id: 't', nombre: 'Tarjeta Prueba', tipo: 'pasivo', orden: 1, valor: '-250.40' },
          { ...base, id: 'e', nombre: 'Efectivo', tipo: 'efectivo', emoji: '💵', orden: 0, valor: '45.00' },
        ]}
      />,
    );
    const lista = screen.getByRole('list', { name: 'Patrimonio por cuenta' });
    const [efectivo, tarjetaCredito] = within(lista).getAllByRole('listitem');
    expect(efectivo).toHaveTextContent('💵');
    expect(within(efectivo as HTMLElement).getByText(/^45,00\s€$/)).toHaveClass('text-texto');
    expect(within(tarjetaCredito as HTMLElement).getByText(/^-250,40\s€$/)).toHaveClass('text-negativo');
  });

  it('sin cuentas (cargando o con error) no hay desglose ni aviso, ni en curso ni en un mes cerrado', () => {
    const props = { hoy: '2026-10-19', patrimonioHoy: '1.00', patrimonioAnterior: null, resumenActual: RESUMEN };
    const { unmount } = renderConApp(<TarjetasKpi {...props} mes="2026-09-01" resumenAnterior={null} />);
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
    expect(screen.queryByText(/desglose/)).not.toBeInTheDocument();
    unmount();
    renderConApp(<TarjetasKpi {...props} resumenAnterior={null} />);
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
  });
});

describe('TarjetasKpi · balance del mes (sección 3)', () => {
  it('mes sin ingresos (sección 11): balance negativo en rojo con signo y ahorro «—»', () => {
    renderConApp(
      <TarjetasKpi
        hoy="2026-10-19"
        patrimonioHoy="1000.00"
        patrimonioAnterior={null}
        resumenActual={{ ingresos: '0.00', gastos_netos: '900.00', balance: '-900.00', ahorro_pct: null }}
        resumenAnterior={null}
      />,
    );
    const balance = tarjeta('Balance · 1–19 oct');
    expect(within(balance).getByText(/^-900,00\s€$/)).toHaveClass('text-negativo');
    expect(within(balance).getByTestId('kpi-ahorro')).toHaveTextContent('Ahorro —');
    expect(within(balance).getByText('Sin datos del mes anterior')).toBeInTheDocument();
  });

  it('balance negativo: el ahorro también sale negativo (−15,0 %)', () => {
    renderConApp(
      <TarjetasKpi
        hoy="2026-10-19"
        patrimonioHoy="1000.00"
        patrimonioAnterior={null}
        resumenActual={{ ingresos: '1000.00', gastos_netos: '1150.00', balance: '-150.00', ahorro_pct: '-15.0000000000000000' }}
        resumenAnterior={{ ingresos: '1000.00', gastos_netos: '900.00', balance: '100.00', ahorro_pct: '10.0' }}
      />,
    );
    const balance = tarjeta('Balance · 1–19 oct');
    expect(within(balance).getByTestId('kpi-ahorro')).toHaveTextContent('Ahorro -15,0 %');
    // 100 → −150: −250,0 %, que baje el balance es rojo.
    expect(within(balance).getByText('-250,0 %').parentElement).toHaveClass('text-negativo');
  });

});
