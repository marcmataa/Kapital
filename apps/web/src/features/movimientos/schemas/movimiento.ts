import { z } from 'zod';
import type { Categoria, Cuenta } from '@/shared/api/catalogos';
import type { FuncionT } from '@/shared/i18n';
import { aCentimos, formatearEuros, importePositivo } from '@/shared/lib/dinero';
import { formatearFecha } from '@/shared/lib/fechas';
import {
  esFechaValida,
  type MetodoPago,
  type Movimiento,
  type SentidoAjuste,
  type TipoMovimiento,
} from '../lib/tipos';

/**
 * Formulario de movimiento. Replica en la UI las reglas que la base impone (la base sigue
 * mandando; esto solo evita enviar algo que va a rechazar):
 *
 * Tabla `movimientos` (esquema inicial):
 * - importe > 0 (numeric(12,2)); el texto se lee como `leer_importe`: «-24» → 24,00 (sección 11).
 * - categoria_segun_tipo: gasto/ingreso/devolución con categoría; traspaso/ajuste sin ella.
 * - traspaso_con_destino: solo el traspaso tiene destino y es distinto del origen.
 * - sentido_solo_en_ajuste, devolucion_de_solo_en_devolucion.
 * Trigger validar_movimiento:
 * 1. gasto/devolución → categoría de gasto; ingreso → categoría de ingreso.
 * 2. la fecha no puede ser anterior a la fecha de partida de las cuentas.
 * 3. una devolución vinculada apunta a un gasto y no supera lo que queda por devolver.
 * 4. un gasto con devoluciones no baja de lo devuelto ni cambia de tipo.
 * Trigger proteger_cuenta_cerrada: no se usan cuentas cerradas.
 *
 * Reglas propias de la UI (no las impone la base):
 * - La fecha es el día en que ocurrió: no puede ser futura (el atajo admite como mucho mañana).
 * - El gasto pide método de pago; en ingreso y devolución es opcional; traspaso y ajuste no tienen.
 * - El ajuste necesita una nota que explique el descuadre (sección 9: «Ajuste por la diferencia, con nota»).
 */

export const CONCEPTO_MAXIMO = 200;
export const NOTAS_MAXIMO = 1000;

export interface ValoresMovimiento {
  tipo: TipoMovimiento;
  /** Texto tal cual lo escribe el usuario ('38,5'). */
  importe: string;
  categoria_id: string;
  /** Sale de (gasto), entra en (ingreso, devolución), desde (traspaso) o cuenta corregida (ajuste). */
  cuenta_id: string;
  /** Hacia (solo traspaso). */
  cuenta_destino_id: string;
  metodo: MetodoPago | '';
  devolucion_de: string;
  sentido: SentidoAjuste;
  fecha: string;
  concepto: string;
  notas: string;
}

/** Fila lista para insert/update (importe normalizado 'dddd.dd', siempre positivo). */
export interface PayloadMovimiento {
  tipo: TipoMovimiento;
  importe: string;
  fecha: string;
  concepto: string;
  notas: string | null;
  categoria_id: string | null;
  metodo: MetodoPago | null;
  cuenta_id: string;
  cuenta_destino_id: string | null;
  devolucion_de: string | null;
  sentido: SentidoAjuste | null;
}

export interface ContextoEsquema {
  t: FuncionT<'movimientos'>;
  locale: string;
  /** Hoy en Madrid ('YYYY-MM-DD'). */
  hoy: string;
  cuentas: readonly Cuenta[];
  categorias: readonly Categoria[];
  /** Al editar un gasto: lo ya devuelto ('0.00' si nada). Regla 4 del trigger. */
  devueltoOriginal?: string | null;
  /** Al editar: tipo que tenía el movimiento. */
  tipoOriginal?: TipoMovimiento | null;
  /** Devolución vinculada: lo que queda por devolver del gasto elegido. Regla 3 del trigger. */
  pendienteGastoOriginal?: string | null;
}

export const usaCategoria = (tipo: TipoMovimiento) => tipo === 'gasto' || tipo === 'ingreso' || tipo === 'devolucion';
export const usaMetodo = usaCategoria;
export const tipoCategoria = (tipo: TipoMovimiento) => (tipo === 'ingreso' ? 'ingreso' : 'gasto');

/** Una cuenta se puede usar en un movimiento si existe y no está cerrada (proteger_cuenta_cerrada). */
export function cuentaUsable(c: Cuenta | undefined): c is Cuenta {
  return c !== undefined && c.fecha_cierre === null;
}

export function crearEsquemaMovimiento(ctx: ContextoEsquema) {
  const { t, locale, hoy, cuentas, categorias } = ctx;
  const euros = (importe: string) => formatearEuros(importe, locale);
  const cuenta = (id: string) => cuentas.find((c) => c.id === id);

  return z
    .object({
      tipo: z.enum(['gasto', 'ingreso', 'devolucion', 'traspaso', 'ajuste']),
      importe: z.string(),
      categoria_id: z.string(),
      cuenta_id: z.string(),
      cuenta_destino_id: z.string(),
      metodo: z.enum(['', 'tarjeta', 'apple_pay', 'efectivo', 'transferencia', 'bizum', 'domiciliacion']),
      devolucion_de: z.string(),
      sentido: z.enum(['suma', 'resta']),
      fecha: z.string(),
      concepto: z.string(),
      notas: z.string(),
    })
    .superRefine((v, c) => {
      const error = (path: keyof ValoresMovimiento, message: string) => c.addIssue({ code: 'custom', path: [path], message });

      // Importe (> 0, cabe en numeric(12,2); el signo del texto se ignora como en leer_importe)
      const importe = importePositivo(v.importe);
      if (importe === null) error('importe', t('validacion.importe'));

      // Categoría según el tipo (check categoria_segun_tipo + regla 1 del trigger)
      if (usaCategoria(v.tipo)) {
        const cat = categorias.find((x) => x.id === v.categoria_id);
        if (cat === undefined) error('categoria_id', t('validacion.categoria'));
        else if (cat.tipo !== tipoCategoria(v.tipo)) error('categoria_id', t('validacion.categoriaTipo'));
      }

      // Cuentas (existen, abiertas, distintas en un traspaso)
      const origen = cuenta(v.cuenta_id);
      if (origen === undefined) error('cuenta_id', t('validacion.cuenta'));
      else if (!cuentaUsable(origen)) error('cuenta_id', t('validacion.cuentaCerrada'));
      let destino: Cuenta | undefined;
      if (v.tipo === 'traspaso') {
        destino = cuenta(v.cuenta_destino_id);
        if (destino === undefined) error('cuenta_destino_id', t('validacion.cuenta'));
        else if (!cuentaUsable(destino)) error('cuenta_destino_id', t('validacion.cuentaCerrada'));
        else if (destino.id === v.cuenta_id) error('cuenta_destino_id', t('validacion.traspasoMismaCuenta'));
      }

      // Método
      if (v.tipo === 'gasto' && v.metodo === '') error('metodo', t('validacion.metodo'));

      // Fecha: real, no futura, no anterior a la fecha de partida de las cuentas (regla 2)
      if (!esFechaValida(v.fecha)) {
        error('fecha', t('validacion.fecha'));
      } else if (v.fecha > hoy) {
        error('fecha', t('validacion.fechaFutura'));
      } else {
        const tarde = [origen, destino].find((x) => x !== undefined && v.fecha < x.fecha_inicial);
        if (tarde) error('fecha', t('validacion.fechaAntesDeCuenta', { cuenta: tarde.nombre, fecha: formatearFecha(tarde.fecha_inicial, locale, 'corta') }));
      }

      // Concepto y notas
      const concepto = v.concepto.trim();
      if (concepto === '') error('concepto', t('validacion.concepto'));
      else if (concepto.length > CONCEPTO_MAXIMO) error('concepto', t('validacion.conceptoLargo', { maximo: CONCEPTO_MAXIMO }));
      const notas = v.notas.trim();
      if (v.tipo === 'ajuste' && notas === '') error('notas', t('validacion.notaAjuste'));
      if (notas.length > NOTAS_MAXIMO) error('notas', t('validacion.notasLargas', { maximo: NOTAS_MAXIMO }));

      // Devolución vinculada: no puede superar lo pendiente del gasto (regla 3)
      if (
        v.tipo === 'devolucion' &&
        v.devolucion_de !== '' &&
        importe !== null &&
        ctx.pendienteGastoOriginal != null &&
        aCentimos(importe) > aCentimos(ctx.pendienteGastoOriginal)
      ) {
        error('importe', t('validacion.devolucionSupera', { pendiente: euros(ctx.pendienteGastoOriginal) }));
      }

      // Gasto con devoluciones: ni baja de lo devuelto ni cambia de tipo (regla 4)
      if (ctx.tipoOriginal === 'gasto' && ctx.devueltoOriginal != null && aCentimos(ctx.devueltoOriginal) > 0n) {
        if (v.tipo !== 'gasto') error('tipo', t('validacion.gastoConDevolucionesTipo'));
        else if (importe !== null && aCentimos(importe) < aCentimos(ctx.devueltoOriginal)) {
          error('importe', t('validacion.gastoConDevolucionesImporte', { devuelto: euros(ctx.devueltoOriginal) }));
        }
      }
    })
    .transform((v): PayloadMovimiento => aPayload(v));
}

/**
 * Valores del formulario (ya validados) → fila de la base. Cada tipo usa sus columnas
 * (reglas, sección 10) y el resto va a null, también al editar (si cambias de gasto a traspaso,
 * la categoría y el método desaparecen):
 * - gasto: cuenta_id = de dónde sale; categoría de gasto; método.
 * - ingreso / devolución: cuenta_id = DÓNDE ENTRA (no hay cuenta origen); categoría; método opcional.
 * - traspaso: cuenta_id = desde, cuenta_destino_id = hacia.
 * - ajuste: cuenta_id = cuenta corregida, sentido suma/resta.
 */
export function aPayload(v: ValoresMovimiento): PayloadMovimiento {
  const notas = v.notas.trim();
  return {
    tipo: v.tipo,
    importe: importePositivo(v.importe) ?? '',
    fecha: v.fecha,
    concepto: v.concepto.trim(),
    notas: notas === '' ? null : notas,
    categoria_id: usaCategoria(v.tipo) ? v.categoria_id : null,
    metodo: usaMetodo(v.tipo) && v.metodo !== '' ? v.metodo : null,
    cuenta_id: v.cuenta_id,
    cuenta_destino_id: v.tipo === 'traspaso' ? v.cuenta_destino_id : null,
    devolucion_de: v.tipo === 'devolucion' && v.devolucion_de !== '' ? v.devolucion_de : null,
    sentido: v.tipo === 'ajuste' ? v.sentido : null,
  };
}

/** Movimiento guardado → valores para editarlo (importe en el formato del idioma). */
export function valoresDesdeMovimiento(m: Movimiento, importeEditable: string): ValoresMovimiento {
  return {
    tipo: m.tipo,
    importe: importeEditable,
    categoria_id: m.categoria_id ?? '',
    cuenta_id: m.cuenta_id,
    cuenta_destino_id: m.cuenta_destino_id ?? '',
    metodo: m.metodo ?? '',
    devolucion_de: m.devolucion_de ?? '',
    sentido: m.sentido ?? 'suma',
    fecha: m.fecha,
    concepto: m.concepto,
    notas: m.notas ?? '',
  };
}

/**
 * Cuenta por defecto (como el atajo): la de efectivo si el método es efectivo; si no, la principal.
 * Si no hay ninguna de esas abierta, la primera abierta.
 */
export function cuentaPorDefecto(cuentas: readonly Cuenta[], metodo: MetodoPago | ''): string {
  const abiertas = cuentas.filter(cuentaUsable);
  const preferida =
    metodo === 'efectivo' ? abiertas.find((c) => c.tipo === 'efectivo') : abiertas.find((c) => c.es_principal);
  return (preferida ?? abiertas[0])?.id ?? '';
}
