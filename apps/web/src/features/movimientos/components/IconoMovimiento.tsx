import { ArrowLeftRight, Scale, Undo2 } from 'lucide-react';
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
 * Icono de la fila. Gasto, ingreso y devolución usan el icono y el color de SU categoría (la
 * devolución, con una flecha de vuelta pequeña encima); si la categoría no tiene icono, su
 * inicial sobre su color. Traspaso y ajuste no tienen categoría: icono propio.
 * Es decorativo (aria-hidden): el tipo ya se lee en el texto de la fila.
 */
export function IconoMovimiento({ tipo, categoria, className }: Props) {
  const base = cx('relative flex size-10 shrink-0 items-center justify-center rounded-xl', className);

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

  const color = categoria && COLOR_HEX.test(categoria.color) ? categoria.color : null;
  const estilo = color ? { backgroundColor: `${color}2e`, color } : undefined;
  const inicial = Array.from(categoria?.nombre.trim() ?? '')[0]?.toLocaleUpperCase() ?? '·';
  return (
    <span
      aria-hidden="true"
      data-icono={categoria?.icono ? 'categoria' : 'inicial'}
      className={cx(base, !color && 'bg-superficie-3 text-apagado')}
      style={estilo}
    >
      {categoria?.icono ? (
        <span className="text-lg leading-none">{categoria.icono}</span>
      ) : (
        <span className="text-sm font-semibold">{inicial}</span>
      )}
      {tipo === 'devolucion' && (
        <span className="absolute -right-1 -bottom-1 flex size-[18px] items-center justify-center rounded-full border-2 border-superficie bg-positivo text-superficie">
          <Undo2 className="size-2.5" strokeWidth={3} />
        </span>
      )}
    </span>
  );
}
