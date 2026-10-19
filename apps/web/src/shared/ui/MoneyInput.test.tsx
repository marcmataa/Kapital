import { useState } from 'react';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { Idioma } from '@/shared/i18n';
import { importePositivo } from '@/shared/lib/dinero';
import { renderConApp } from '@/test/render';
import { MoneyInput, importeParaEditar } from './MoneyInput';

function Controlado({ inicial = '', onCambio }: { inicial?: string; onCambio?: (v: string) => void }) {
  const [valor, setValor] = useState(inicial);
  return (
    <MoneyInput
      label="Importe"
      value={valor}
      onChange={(v) => {
        setValor(v);
        onCambio?.(v);
      }}
    />
  );
}

const montar = (idioma: Idioma = 'es', inicial = '') => renderConApp(<Controlado inicial={inicial} />, { idioma });

describe('MoneyInput', () => {
  it('usa teclado decimal y está etiquetado', () => {
    montar();
    const input = screen.getByLabelText('Importe');
    expect(input).toHaveAttribute('inputmode', 'decimal');
    expect(input).toHaveAttribute('type', 'text');
  });

  it('normaliza al salir: "1.258,5" → "1258,50" (es) y vuelve a leerse igual', async () => {
    montar('es');
    const input = screen.getByLabelText('Importe');
    await userEvent.type(input, '1.258,5');
    await userEvent.tab();
    expect(input).toHaveValue('1258,50');
    expect(importePositivo('1258,50')).toBe('1258.50');
  });

  it('en inglés usa punto decimal', async () => {
    montar('en');
    const input = screen.getByLabelText('Importe');
    await userEvent.type(input, '38.5');
    await userEvent.tab();
    expect(input).toHaveValue('38.50');
  });

  it('el signo negativo se ignora como en leer_importe: "-24" → "24,00"', async () => {
    montar('es');
    const input = screen.getByLabelText('Importe');
    await userEvent.type(input, '-24');
    await userEvent.tab();
    expect(input).toHaveValue('24,00');
  });

  it('con un lector estricto (saldos), "-24" no se convierte en 24: se deja para que la validación lo rechace', async () => {
    function Saldo() {
      const [valor, setValor] = useState('');
      const estricto = (texto: string) => (texto.includes('-') ? null : importePositivo(texto));
      return <MoneyInput label="Saldo" value={valor} onChange={setValor} normalizar={estricto} />;
    }
    renderConApp(<Saldo />);
    const input = screen.getByLabelText('Saldo');
    await userEvent.type(input, '-24');
    await userEvent.tab();
    expect(input).toHaveValue('-24');
  });

  it('no toca un texto inválido (lo marca la validación)', async () => {
    const onCambio = vi.fn();
    renderConApp(<Controlado onCambio={onCambio} />);
    const input = screen.getByLabelText('Importe');
    await userEvent.type(input, 'abc');
    onCambio.mockClear();
    await userEvent.tab();
    expect(input).toHaveValue('abc');
    expect(onCambio).not.toHaveBeenCalled();
  });

  it('muestra el error accesible', () => {
    renderConApp(<MoneyInput label="Importe" value="" onChange={() => undefined} error="Introduce un importe" />);
    const input = screen.getByLabelText('Importe');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAccessibleDescription('Introduce un importe');
  });

  it('importeParaEditar', () => {
    expect(importeParaEditar('1508.00', 'es-ES')).toBe('1508,00');
    expect(importeParaEditar('1508.00', 'en-GB')).toBe('1508.00');
  });
});
