import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { renderConApp } from '@/test/render';
import type { PuntoPatrimonio } from '../api/inicioApi';
import { GraficoCapital } from './GraficoCapital';

/** Serie de un mes: patrimonio[i] es el del día i + 1. El último punto puede ser hoy (provisional). */
function serie(mes: string, valores: readonly string[], hoy?: string): PuntoPatrimonio[] {
  return valores.map((patrimonio, i) => {
    const fecha = `${mes}-${String(i + 1).padStart(2, '0')}`;
    return { fecha, patrimonio, provisional: fecha === hoy };
  });
}

// Septiembre completo (30 días) y octubre hasta el 19 (hoy).
const SEPT = Array.from({ length: 30 }, (_, i) => (i === 14 ? '1950.00' : `${1800 + i * 10}.00`));
const OCT = Array.from({ length: 19 }, (_, i) => (i === 14 ? '2310.00' : i === 18 ? '2458.32' : `${2075 + i * 10}.00`));

const lectura = () => screen.getByTestId('lectura-grafico');
const normal = (s: string | null) => (s ?? '').replace(/\s+/g, ' ').trim();

function pintar(hoy: string, actual: PuntoPatrimonio[], anterior: PuntoPatrimonio[]) {
  return renderConApp(<GraficoCapital hoy={hoy} actual={actual} anterior={anterior} />);
}

describe('GraficoCapital', () => {
  it('por defecto muestra hoy como provisional, con el punto hueco y la etiqueta «19 oct (hoy)»', () => {
    pintar('2026-10-19', serie('2026-10', OCT, '2026-10-19'), serie('2026-09', SEPT));
    expect(normal(lectura().textContent)).toContain('19 oct · hoy (provisional) · 2.458,32 €');
    expect(screen.getByTestId('punto-hoy')).toBeInTheDocument();
    expect(screen.getByText('19 oct (hoy)')).toBeInTheDocument();
    expect(screen.getByRole('slider', { name: 'Día del gráfico de capital' })).toHaveAttribute('aria-valuenow', '19');
  });

  it('la etiqueta «hoy» va encima del área de la línea y dentro del gráfico (sin solapes)', () => {
    // Último día del mes: el caso en que antes se salía o pisaba la línea.
    const oct = Array.from({ length: 31 }, (_, i) => `${2000 + i * 10}.00`);
    pintar('2026-10-31', serie('2026-10', oct, '2026-10-31'), serie('2026-09', SEPT));
    const etiqueta = screen.getByTestId('etiqueta-hoy');
    const punto = screen.getByTestId('punto-hoy');
    const y = Number(etiqueta.getAttribute('y'));
    expect(y).toBeLessThan(Number(punto.getAttribute('cy')) - 6);
    const svg = etiqueta.closest('svg');
    const ancho = Number(svg?.getAttribute('width'));
    const mitad = ((etiqueta.textContent ?? '').length * 7) / 2;
    expect(Number(etiqueta.getAttribute('x')) + mitad).toBeLessThanOrEqual(ancho);
    expect(etiqueta).toHaveAttribute('text-anchor', 'middle');
  });

  it('la ayuda de uso es un icono (i)', () => {
    pintar('2026-10-19', serie('2026-10', OCT, '2026-10-19'), serie('2026-09', SEPT));
    expect(screen.getByRole('button', { name: 'Cómo leer el gráfico' })).toBeInTheDocument();
    expect(screen.queryByText(/Pasa el ratón o el dedo/)).not.toBeInTheDocument();
  });

  it('el 15 oct se compara con el 15 sept: diferencia en euros y en % (sección 7)', async () => {
    pintar('2026-10-19', serie('2026-10', OCT, '2026-10-19'), serie('2026-09', SEPT));
    const control = screen.getByRole('slider');
    control.focus();
    await userEvent.keyboard('{ArrowLeft}{ArrowLeft}{ArrowLeft}{ArrowLeft}');
    expect(control).toHaveAttribute('aria-valuenow', '15');
    const texto = normal(lectura().textContent);
    expect(texto).toContain('15 oct · 2.310,00 €');
    expect(texto).toContain('vs 15 sept 1.950,00 € · +360,00 € (+18,5 %)');
    expect(normal(control.getAttribute('aria-valuetext'))).toContain('vs 15 sept 1.950,00 € · +360,00 € (+18,5 %)');
  });

  it('el 31 oct se compara con el 30 sept (sección 11, fin de mes)', () => {
    const oct31 = Array.from({ length: 31 }, (_, i) => (i === 30 ? '2100.00' : '2000.00'));
    pintar('2026-10-31', serie('2026-10', oct31, '2026-10-31'), serie('2026-09', SEPT));
    const texto = normal(lectura().textContent);
    expect(texto).toContain('31 oct · hoy (provisional) · 2.100,00 €');
    // 30 sept = 1800 + 29 × 10 = 2.090,00 €
    expect(texto).toContain('vs 30 sept 2.090,00 € · +10,00 € (+0,5 %)');
  });

  it('un día futuro dice «sin datos todavía» y no inventa valor', async () => {
    pintar('2026-10-19', serie('2026-10', OCT, '2026-10-19'), serie('2026-09', SEPT));
    const control = screen.getByRole('slider');
    control.focus();
    await userEvent.keyboard('{End}');
    expect(control).toHaveAttribute('aria-valuenow', '31');
    const texto = normal(lectura().textContent);
    expect(texto).toContain('31 oct · sin datos todavía');
    expect(texto).toContain('30 sept: 2.090,00 €');
  });

  it('no dibuja días futuros: la línea del mes actual termina hoy; la anterior ocupa sus propios días', () => {
    pintar('2026-10-19', serie('2026-10', OCT, '2026-10-19'), serie('2026-09', SEPT));
    const puntos = (id: string) => (screen.getByTestId(id).getAttribute('points') ?? '').trim().split(/\s+/);
    expect(puntos('linea-actual')).toHaveLength(19);
    expect(puntos('linea-anterior')).toHaveLength(30);
  });

  it('sin patrimonio positivo en d′ solo muestra la diferencia en euros', async () => {
    const anterior = serie('2026-09', Array.from({ length: 30 }, () => '0.00'));
    pintar('2026-10-19', serie('2026-10', OCT, '2026-10-19'), anterior);
    expect(normal(lectura().textContent)).toContain('vs 19 sept 0,00 € · +2.458,32 €');
    expect(normal(lectura().textContent)).not.toContain('%');
  });

  it('sin datos del mes anterior lo dice en vez de comparar', () => {
    pintar('2026-10-19', serie('2026-10', OCT, '2026-10-19'), []);
    expect(normal(lectura().textContent)).toContain('Sin datos del mes anterior');
  });

  it('antes del primer día con datos no hay valor', async () => {
    // La cuenta empieza el 10/10: los días 1–9 no existen para la app.
    const desde10 = serie('2026-10', OCT, '2026-10-19').slice(9);
    pintar('2026-10-19', desde10, []);
    const control = screen.getByRole('slider');
    control.focus();
    await userEvent.keyboard('{Home}');
    expect(normal(lectura().textContent)).toContain('1 oct · sin datos');
    expect((screen.getByTestId('linea-actual').getAttribute('points') ?? '').trim().split(/\s+/)).toHaveLength(10);
  });

  it('muestra las marcas del eje X cada 5 días, sin título del eje, y más marcas en el eje Y', () => {
    pintar('2026-10-19', serie('2026-10', OCT, '2026-10-19'), serie('2026-09', SEPT));
    for (const d of ['1', '5', '10', '15', '20', '25', '30']) expect(screen.getByText(d)).toBeInTheDocument();
    expect(screen.queryByText('Día del mes')).not.toBeInTheDocument();
    // Eje con números redondos y más líneas de referencia (hasta 6 marcas): 1.800 a 2.600 € de 200 en 200.
    for (const e of ['1.800 €', '2.000 €', '2.200 €', '2.400 €', '2.600 €']) expect(screen.getByText(e)).toBeInTheDocument();
  });

  it('mes cerrado: llega al último día, punto lleno de cierre y sin «hoy» ni «provisional»', () => {
    const AGO = Array.from({ length: 31 }, (_, i) => `${1700 + i * 5}.00`);
    renderConApp(
      <GraficoCapital hoy="2026-10-19" mes="2026-09-01" actual={serie('2026-09', SEPT)} anterior={serie('2026-08', AGO)} />,
    );
    // 30 sept (2.090,00 €) vs 30 ago (1.845,00 €), d′ de la sección 7.
    expect(normal(lectura().textContent)).toContain('30 sept · 2.090,00 €');
    expect(normal(lectura().textContent)).toContain('vs 30 ago 1.845,00 € · +245,00 € (+13,3 %)');
    expect(screen.getByTestId('punto-cierre')).toBeInTheDocument();
    expect(screen.queryByTestId('punto-hoy')).not.toBeInTheDocument();
    expect(screen.queryByText(/provisional|\(hoy\)/)).not.toBeInTheDocument();
    expect(screen.getByText(/El último punto es el cierre del mes/)).toBeInTheDocument();
    const control = screen.getByRole('slider');
    expect(control).toHaveAttribute('aria-valuenow', '30');
    expect(control).toHaveAttribute('aria-valuemax', '30');
    expect((screen.getByTestId('linea-actual').getAttribute('points') ?? '').trim().split(/\s+/)).toHaveLength(30);
  });

  it('mes cerrado sin datos: estado vacío propio', () => {
    renderConApp(<GraficoCapital hoy="2026-10-19" mes="2026-09-01" actual={[]} anterior={[]} />);
    expect(screen.getByText('No hay datos de patrimonio de ese mes.')).toBeInTheDocument();
  });

  it('sin datos muestra un estado vacío', () => {
    pintar('2026-10-19', [], []);
    expect(screen.getByText('Todavía no hay datos de patrimonio este mes.')).toBeInTheDocument();
  });
});
