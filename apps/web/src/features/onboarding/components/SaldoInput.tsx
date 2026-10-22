import { useIdioma } from '@/shared/i18n';
import { parsearImporteLocal } from '@/shared/lib/dinero';
import { MoneyInput, importeParaEditar, type MoneyInputProps } from '@/shared/ui';
import { leerSaldo } from '../schemas/saldo';

/**
 * MoneyInput para saldos. Al salir del campo, MoneyInput normaliza con `parsearImporteLocal`
 * (como `leer_importe`, que quita signos y letras: «-24» → «24,00»). Un saldo se lee con
 * `leer_saldo`, que los rechaza, así que aquí se ignora esa normalización cuando el texto
 * no es un saldo válido: el usuario ve su texto y el error, en vez de un importe cambiado.
 */
export function SaldoInput({ value, onChange, ...resto }: MoneyInputProps) {
  const { locale } = useIdioma();

  const cambiar = (texto: string) => {
    if (!leerSaldo(value, locale).ok) {
      const normalizado = parsearImporteLocal(value, locale);
      if (normalizado !== null && texto === importeParaEditar(normalizado, locale)) return;
    }
    onChange(texto);
  };

  return <MoneyInput {...resto} value={value} onChange={cambiar} />;
}
