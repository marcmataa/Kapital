import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderConApp } from '@/test/render';
import { RepartoCategorias, type CategoriaReparto } from './RepartoCategorias';

const fila = (nombre: string) => {
  const li = within(screen.getByRole('list', { name: 'Gasto neto por categoría' })).getByText(nombre).closest('li');
  if (!li) throw new Error('sin fila');
  return li;
};

describe('RepartoCategorias', () => {
  it('una categoría en negativo se muestra en rojo con −30,00 € y no entra en la barra (sección 11)', () => {
    // Otros gastos: 20 € de gasto y 50 € de devoluciones → −30,00 €.
    const categorias: CategoriaReparto[] = [
      { id: 'ocio', nombre: 'Ocio', color: '#9b6bff', gasto: '40.00' },
      { id: 'restaurantes', nombre: 'Restaurantes', color: '#ff8a3d', gasto: '60.00' },
      { id: 'otros', nombre: 'Otros gastos', color: '#8f9bbd', gasto: '-30.00' },
    ];
    renderConApp(<RepartoCategorias categorias={categorias} totalGastoNeto="70.00" />);

    const otros = fila('Otros gastos');
    const importe = within(otros).getByText(/30,00/);
    expect(importe).toHaveTextContent('-30,00 €');
    expect(importe).toHaveClass('text-negativo');

    // El % es sobre la suma de las positivas (100 €), no sobre los gastos netos (70 €).
    expect(within(fila('Restaurantes')).getByText('60,0 %')).toBeInTheDocument();
    expect(within(fila('Ocio')).getByText('40,0 %')).toBeInTheDocument();
    expect(within(otros).queryByText(/%/)).not.toBeInTheDocument();

    const tramos = screen.getAllByTestId('tramo-categoria');
    expect(tramos).toHaveLength(2);
    expect(tramos.map((a) => a.style.backgroundColor)).not.toContain('rgb(143, 155, 189)');
  });

  it('sin negativas, el % coincide con el de los gastos netos y el total va en la cabecera', () => {
    const categorias: CategoriaReparto[] = [
      { id: 'a', nombre: 'Restaurantes', color: '#ff8a3d', gasto: '279.85' },
      { id: 'b', nombre: 'Ocio', color: '#9b6bff', gasto: '681.83' },
    ];
    renderConApp(<RepartoCategorias categorias={categorias} totalGastoNeto="961.68" />);
    expect(within(fila('Restaurantes')).getByText('29,1 %')).toBeInTheDocument();
    expect(within(fila('Ocio')).getByText('70,9 %')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /961,68/ })).toBeInTheDocument();
    expect(screen.getByText('gasto neto')).toBeInTheDocument();
  });

  it('acepta una etiqueta propia para el total y omite categorías a 0 €', () => {
    renderConApp(
      <RepartoCategorias
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

  it('a partir de la 7.ª categoría, el resto se suma en «Otras (n)» (sin enlace) y la tarjeta no crece', () => {
    const importes = ['90.00', '80.00', '70.00', '60.00', '50.00', '40.00', '30.00', '20.00', '10.00'];
    const categorias: CategoriaReparto[] = importes.map((gasto, i) => ({ id: `c${i}`, nombre: `Cat ${i}`, color: '#123456', gasto }));
    renderConApp(
      <RepartoCategorias categorias={categorias} totalGastoNeto="450.00" enlace={(id) => `/movimientos?categoria=${id}`} />,
    );

    const lista = screen.getByRole('list', { name: 'Gasto neto por categoría' });
    expect(within(lista).getAllByRole('listitem')).toHaveLength(7);
    expect(within(lista).queryByText('Cat 6')).not.toBeInTheDocument();
    // 30 + 20 + 10 = 60 € sobre 450 €: 13,3 %.
    const otras = fila('Otras (3)');
    expect(otras).toHaveTextContent(/60,00\s€/);
    expect(otras).toHaveTextContent('13,3 %');
    expect(within(otras).queryByRole('link')).not.toBeInTheDocument();
    expect(within(fila('Cat 0')).getByRole('link')).toHaveAttribute('href', '/movimientos?categoria=c0');
    expect(screen.getAllByTestId('tramo-categoria')).toHaveLength(7);
  });
});
