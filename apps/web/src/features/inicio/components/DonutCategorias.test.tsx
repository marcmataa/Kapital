import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderConApp } from '@/test/render';
import { DonutCategorias, type CategoriaDonut } from './DonutCategorias';

const fila = (nombre: string) => {
  const li = within(screen.getByRole('list', { name: 'Gasto neto por categoría' })).getByText(nombre).closest('li');
  if (!li) throw new Error('sin fila');
  return li;
};

describe('DonutCategorias', () => {
  it('una categoría en negativo se muestra en rojo con −30,00 € y no entra en el donut (sección 11)', () => {
    // Otros gastos: 20 € de gasto y 50 € de devoluciones → −30,00 €.
    const categorias: CategoriaDonut[] = [
      { id: 'ocio', nombre: 'Ocio', color: '#9b6bff', gasto: '40.00' },
      { id: 'restaurantes', nombre: 'Restaurantes', color: '#ff8a3d', gasto: '60.00' },
      { id: 'otros', nombre: 'Otros gastos', color: '#8f9bbd', gasto: '-30.00' },
    ];
    renderConApp(<DonutCategorias categorias={categorias} totalGastoNeto="70.00" />);

    const otros = fila('Otros gastos');
    const importe = within(otros).getByText(/30,00/);
    expect(importe).toHaveTextContent('-30,00 €');
    expect(importe).toHaveClass('text-negativo');

    const arcos = screen.getAllByTestId('arco-donut');
    expect(arcos).toHaveLength(2);
    expect(arcos.map((a) => a.getAttribute('stroke'))).not.toContain('#8f9bbd');
  });

  it('el % de cada categoría es sobre los gastos netos y el total va en el centro', () => {
    const categorias: CategoriaDonut[] = [
      { id: 'a', nombre: 'Restaurantes', color: '#ff8a3d', gasto: '279.85' },
      { id: 'b', nombre: 'Ocio', color: '#9b6bff', gasto: '681.83' },
    ];
    renderConApp(<DonutCategorias categorias={categorias} totalGastoNeto="961.68" />);
    expect(within(fila('Restaurantes')).getByText('29,1 %')).toBeInTheDocument();
    expect(within(fila('Ocio')).getByText('70,9 %')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /961,68/ })).toBeInTheDocument();
    expect(screen.getByText('gasto neto')).toBeInTheDocument();
  });

  it('acepta una etiqueta propia para el total y omite categorías a 0 €', () => {
    renderConApp(
      <DonutCategorias
        categorias={[
          { id: 'a', nombre: 'Ocio', color: '#9b6bff', gasto: '10.00' },
          { id: 'b', nombre: 'Viajes', color: '#3b82ff', gasto: '0.00' },
        ]}
        totalGastoNeto="10.00"
        etiquetaTotal="septiembre"
      />,
    );
    expect(screen.getByText('septiembre')).toBeInTheDocument();
    expect(screen.queryByText('Viajes')).not.toBeInTheDocument();
    expect(within(fila('Ocio')).getByText('100,0 %')).toBeInTheDocument();
  });
});
