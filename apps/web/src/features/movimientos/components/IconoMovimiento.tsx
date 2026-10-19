import { ArrowLeftRight, Receipt, Scale, Undo2, Wallet } from 'lucide-react';
import type { Categoria } from '@/shared/api/catalogos';
import { cx } from '@/shared/lib/cx';
import type { TipoMovimiento } from '../lib/tipos';

interface Props {
  tipo: TipoMovimiento;
  categoria: Categoria | undefined;
  className?: string;
}

const COLOR_HEX = /^#[0-9a-f]{6}$/i;

/**
 * Icono de la fila: traspaso, ajuste y devolución tienen icono propio (no son gasto normal);
 * gasto e ingreso usan el emoji y el color de su categoría. Es decorativo (aria-hidden):
 * el tipo ya se lee en el texto de la fila.
 */
export function IconoMovimiento({ tipo, categoria, className }: Props) {
  const base = cx('flex size-10 shrink-0 items-center justify-center rounded-xl', className);

  if (tipo === 'traspaso') {
    return (
      <span aria-hidden="true" className={cx(base, 'bg-superficie-3 text-apagado')}>
        <ArrowLeftRight className="size-[18px]" />
      </span>
    );
  }
  if (tipo === 'ajuste') {
    return (
      <span aria-hidden="true" className={cx(base, 'bg-aviso-suave text-aviso')}>
        <Scale className="size-[18px]" />
      </span>
    );
  }
  if (tipo === 'devolucion') {
    return (
      <span aria-hidden="true" className={cx(base, 'bg-morado-suave text-morado')}>
        <Undo2 className="size-[18px]" />
      </span>
    );
  }

  const color = categoria && COLOR_HEX.test(categoria.color) ? categoria.color : null;
  const estilo = color ? { backgroundColor: `${color}2e`, color } : undefined;
  const Respaldo = tipo === 'ingreso' ? Wallet : Receipt;
  return (
    <span aria-hidden="true" className={cx(base, !color && 'bg-superficie-3 text-apagado')} style={estilo}>
      {categoria?.icono ? <span className="text-lg leading-none">{categoria.icono}</span> : <Respaldo className="size-[18px]" />}
    </span>
  );
}
