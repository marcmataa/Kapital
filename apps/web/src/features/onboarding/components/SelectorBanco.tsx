import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { Check, Plus } from 'lucide-react';
import { useT } from '@/shared/i18n';
import { ENTIDADES, NOMBRE_ENTIDAD, type Entidad } from '@/shared/lib/bancos';
import { cx } from '@/shared/lib/cx';
import { BankLogo, Input } from '@/shared/ui';

/** Banco elegido: del catálogo (sin color propio) o «Otro» (nombre y color propios). */
export type BancoElegido =
  { entidad: Entidad; nombre: string; color: null } | { entidad: null; nombre: string; color: string };

export interface PropsSelectorBanco {
  /** Entidades que no se ofrecen (p. ej. las ya elegidas). */
  excluir?: readonly Entidad[];
  /** Nombres de cuentas que ya existen: un banco «Otro» no puede repetirlos (sin distinguir mayúsculas). */
  nombresOcupados?: readonly string[];
  valor: BancoElegido | null;
  /** null = nada elegido o banco «Otro» con datos no válidos todavía. */
  onCambio: (b: BancoElegido | null) => void;
}

/** Paleta de colores para bancos «Otro». Todos dan contraste ≥ 4,5:1 con las iniciales en blanco. */
export const COLORES_BANCO = [
  { id: 'verde', valor: '#15803d' },
  { id: 'azul', valor: '#2563eb' },
  { id: 'marino', valor: '#1e3a8a' },
  { id: 'rojo', valor: '#dc2626' },
  { id: 'naranja', valor: '#c2410c' },
  { id: 'morado', valor: '#7c3aed' },
  { id: 'rosa', valor: '#be185d' },
  { id: 'gris', valor: '#475569' },
] as const;

const COLOR_POR_DEFECTO = COLORES_BANCO[0].valor;

export type ErrorNombreBanco = 'vacio' | 'ocupado';

/** Nombre de un banco «Otro»: no vacío y distinto (sin mayúsculas) de las cuentas que ya hay. */
export function validarNombreBanco(nombre: string, ocupados: readonly string[] = []): ErrorNombreBanco | null {
  const limpio = nombre.trim();
  if (limpio === '') return 'vacio';
  const clave = limpio.toLocaleLowerCase();
  return ocupados.some((o) => o.trim().toLocaleLowerCase() === clave) ? 'ocupado' : null;
}

const clasesTarjeta = (activa: boolean) =>
  cx(
    'flex min-h-23 flex-col items-center justify-center gap-2 rounded-2xl border-2 px-1.5 py-2.5 text-center text-xs leading-tight text-texto transition-colors',
    'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-acento',
    activa ? 'border-acento bg-acento-suave font-semibold' : 'border-borde bg-superficie hover:border-borde-fuerte',
  );

/**
 * Rejilla de bancos del catálogo con logo + «Otro banco» (formulario en línea: nombre y color).
 * La usan el onboarding y Configuración.
 */
export function SelectorBanco({ excluir = [], nombresOcupados = [], valor, onCambio }: PropsSelectorBanco) {
  const t = useT('onboarding');
  const idColor = useId();
  const [otroAbierto, setOtroAbierto] = useState(valor !== null && valor.entidad === null);
  const [nombre, setNombre] = useState(valor !== null && valor.entidad === null ? valor.nombre : '');
  const [color, setColor] = useState<string>(
    valor !== null && valor.entidad === null ? valor.color : COLOR_POR_DEFECTO,
  );
  const [tocado, setTocado] = useState(false);
  const refNombre = useRef<HTMLInputElement>(null);
  const enfocarNombre = useRef(false);
  const refColores = useRef<(HTMLButtonElement | null)[]>([]);

  useEffect(() => {
    if (otroAbierto && enfocarNombre.current) {
      enfocarNombre.current = false;
      refNombre.current?.focus();
    }
  }, [otroAbierto]);

  const disponibles = ENTIDADES.filter((e) => !excluir.includes(e));
  const errorNombre = validarNombreBanco(nombre, nombresOcupados);

  const emitirOtro = (n: string, c: string) => {
    onCambio(validarNombreBanco(n, nombresOcupados) === null ? { entidad: null, nombre: n.trim(), color: c } : null);
  };

  const elegirEntidad = (entidad: Entidad) => {
    setOtroAbierto(false);
    if (valor?.entidad === entidad) {
      onCambio(null);
      return;
    }
    onCambio({ entidad, nombre: NOMBRE_ENTIDAD[entidad], color: null });
  };

  const abrirOtro = () => {
    if (otroAbierto) return;
    enfocarNombre.current = true;
    setOtroAbierto(true);
    emitirOtro(nombre, color);
  };

  const cambiarNombre = (n: string) => {
    setNombre(n);
    emitirOtro(n, color);
  };

  const cambiarColor = (c: string) => {
    setColor(c);
    emitirOtro(nombre, c);
  };

  const moverColor = (e: KeyboardEvent<HTMLButtonElement>, indice: number) => {
    const delta =
      e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
    if (delta === 0) return;
    e.preventDefault();
    const siguiente = (indice + delta + COLORES_BANCO.length) % COLORES_BANCO.length;
    const opcion = COLORES_BANCO[siguiente];
    if (!opcion) return;
    cambiarColor(opcion.valor);
    refColores.current[siguiente]?.focus();
  };

  const mensajeNombre =
    tocado || nombre !== ''
      ? errorNombre === 'vacio'
        ? t('selector.nombreVacio')
        : errorNombre === 'ocupado'
          ? t('selector.nombreOcupado')
          : undefined
      : undefined;

  return (
    <div className="flex flex-col gap-4">
      <div role="group" aria-label={t('selector.etiqueta')} className="grid grid-cols-3 gap-2.5 sm:grid-cols-4">
        {disponibles.map((entidad) => {
          const activa = !otroAbierto && valor?.entidad === entidad;
          return (
            <button
              key={entidad}
              type="button"
              aria-pressed={activa}
              aria-label={NOMBRE_ENTIDAD[entidad]}
              onClick={() => elegirEntidad(entidad)}
              className={clasesTarjeta(activa)}
            >
              <BankLogo entidad={entidad} nombre={NOMBRE_ENTIDAD[entidad]} className="pointer-events-none" />
              <span>{NOMBRE_ENTIDAD[entidad]}</span>
            </button>
          );
        })}
        <button type="button" aria-pressed={otroAbierto} onClick={abrirOtro} className={clasesTarjeta(otroAbierto)}>
          <span
            aria-hidden="true"
            className="inline-flex size-10 items-center justify-center rounded-xl bg-superficie-3 text-texto"
          >
            <Plus className="size-5" />
          </span>
          <span>{t('selector.otro')}</span>
        </button>
      </div>

      {otroAbierto && (
        <fieldset className="flex flex-col gap-4 rounded-2xl border border-borde bg-superficie p-4">
          <legend className="sr-only">{t('selector.otroTitulo')}</legend>
          <div className="flex items-end gap-3">
            <BankLogo entidad={null} nombre={nombre.trim() === '' ? '?' : nombre} color={color} className="mb-0.5" />
            <Input
              ref={refNombre}
              className="flex-1"
              label={t('selector.nombre')}
              value={nombre}
              maxLength={60}
              autoComplete="off"
              onChange={(e) => cambiarNombre(e.target.value)}
              onBlur={() => setTocado(true)}
              error={mensajeNombre}
            />
          </div>
          <div className="flex flex-col gap-2">
            <span id={idColor} className="text-sm font-medium text-texto">
              {t('selector.color')}
            </span>
            <div role="radiogroup" aria-labelledby={idColor} className="flex flex-wrap gap-2">
              {COLORES_BANCO.map((opcion, i) => {
                const activo = opcion.valor === color;
                return (
                  <button
                    key={opcion.id}
                    ref={(el) => {
                      refColores.current[i] = el;
                    }}
                    type="button"
                    role="radio"
                    aria-checked={activo}
                    aria-label={t(`color.${opcion.id}`)}
                    tabIndex={activo ? 0 : -1}
                    onClick={() => cambiarColor(opcion.valor)}
                    onKeyDown={(e) => moverColor(e, i)}
                    className={cx(
                      'inline-flex size-9 items-center justify-center rounded-full border-2 text-white transition-transform',
                      'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-acento',
                      activo ? 'scale-110 border-texto' : 'border-transparent',
                    )}
                    style={{ backgroundColor: opcion.valor }}
                  >
                    {activo && <Check aria-hidden="true" className="size-4" />}
                  </button>
                );
              })}
            </div>
          </div>
        </fieldset>
      )}
    </div>
  );
}
