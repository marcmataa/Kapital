// Comprueba la respuesta de la IA contra los datos reales del mes, antes de guardarla:
//   · una acción «crear_limite» solo vale para una categoría de gasto del análisis que
//     todavía no tiene límite, y con un importe positivo y exacto;
//   · un texto que habla de límites o presupuestos solo vale si se refiere a límites que
//     existen (o a la categoría de su propia acción «crear_limite»).
// Lo que no cumple se descarta. Si no queda al menos una observación y una
// recomendación, la respuesta entera es inválida (y el análisis se reintenta).
import type {
  AccionCrearLimite,
  ContenidoAnalisis,
  DatosAnalisis,
  RespuestaIA,
} from './esquemas.ts';

/** Palabras de límite o presupuesto en es/en/ca. */
const PALABRAS_LIMITE = /l[íi]mit|presupuest|budget|pressupost/iu;

/** Máximo de numeric(12,2). */
const MAX_IMPORTE_CENTIMOS = 999_999_999_999n;

interface CategoriaConocida {
  nombre: string;
  clave: string | null;
  etiqueta: string;
}

const normal = (s: string) => s.trim().toLocaleLowerCase('es');
const escapar = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** ¿Aparece `nombre` como palabra completa en `texto`? (sin importar mayúsculas). */
function menciona(texto: string, nombre: string): boolean {
  return new RegExp(`(^|[^\\p{L}\\p{N}])${escapar(nombre)}($|[^\\p{L}\\p{N}])`, 'iu').test(texto);
}

/** '250' | '250,5' | '250.00' → '250.00'; null si no es un importe positivo válido. */
export function normalizarImporte(valor: string): string | null {
  const m = /^(\d{1,10})(?:[.,](\d{1,2}))?$/.exec(valor.trim());
  if (!m) return null;
  const enteros = (m[1] ?? '').replace(/^0+(?=\d)/, '');
  const decimales = (m[2] ?? '').padEnd(2, '0');
  const centimos = BigInt(enteros + decimales);
  if (centimos <= 0n || centimos > MAX_IMPORTE_CENTIMOS) return null;
  return `${enteros}.${decimales}`;
}

function catalogo(datos: DatosAnalisis) {
  // Categorías de gasto que la IA ve, por el nombre que ve (el traducido).
  const porEtiqueta = new Map<string, CategoriaConocida | 'ambigua'>();
  for (const c of [...datos.categorias, ...datos.categorias_mes_anterior]) {
    const etiqueta = c.etiqueta ?? c.nombre;
    const k = normal(etiqueta);
    const previa = porEtiqueta.get(k);
    if (previa === undefined) porEtiqueta.set(k, { nombre: c.nombre, clave: c.clave, etiqueta });
    else if (previa !== 'ambigua' && previa.nombre !== c.nombre) porEtiqueta.set(k, 'ambigua');
  }
  // Límites reales, por nombre de la base y por el nombre que ve la IA.
  const conLimite = new Set<string>();
  const etiquetasConLimite: string[] = [];
  for (const o of datos.objetivos) {
    if (o.tipo !== 'limite_categoria' || o.categoria === null) continue;
    conLimite.add(o.categoria);
    etiquetasConLimite.push(o.etiqueta ?? o.categoria);
  }
  const etiquetasSinLimite = [...porEtiqueta.values()]
    .filter((c): c is CategoriaConocida => c !== 'ambigua' && !conLimite.has(c.nombre))
    .map((c) => c.etiqueta);
  return { porEtiqueta, conLimite, etiquetasConLimite, etiquetasSinLimite };
}

export function validarContenido(respuesta: RespuestaIA, datos: DatosAnalisis): ContenidoAnalisis | null {
  const { porEtiqueta, conLimite, etiquetasConLimite, etiquetasSinLimite } = catalogo(datos);

  function accionValida(accion: RespuestaIA['recomendaciones'][number]['accion']): AccionCrearLimite | null {
    if (accion === null) return null;
    const c = porEtiqueta.get(normal(accion.categoria));
    if (c === undefined || c === 'ambigua' || conLimite.has(c.nombre)) return null;
    const importe = normalizarImporte(accion.importe);
    if (importe === null) return null;
    return { tipo: 'crear_limite', categoria: c.nombre, clave: c.clave, etiqueta: c.etiqueta, importe };
  }

  /** Un texto que habla de límites solo puede referirse a límites que existen (o al que propone crear). */
  function textoCoherente(texto: string, propia: string | null): boolean {
    if (!PALABRAS_LIMITE.test(texto)) return true;
    const sinLimite = etiquetasSinLimite.filter((e) => e !== propia && menciona(texto, e));
    if (sinLimite.length > 0) return false;
    if (propia !== null) return true;
    return etiquetasConLimite.some((e) => menciona(texto, e));
  }

  if (!textoCoherente(respuesta.resumen, null)) return null;
  const observaciones = respuesta.observaciones.filter((o) => textoCoherente(o, null));

  const usadas = new Set<string>();
  const recomendaciones: ContenidoAnalisis['recomendaciones'] = [];
  for (const r of respuesta.recomendaciones) {
    const accion = accionValida(r.accion);
    // Una acción que no cuadra con los datos invalida la recomendación entera: su texto la propone.
    if (r.accion !== null && accion === null) continue;
    if (accion !== null) {
      if (usadas.has(accion.categoria)) continue;
      usadas.add(accion.categoria);
    }
    if (!textoCoherente(r.texto, accion?.etiqueta ?? null)) continue;
    recomendaciones.push({ texto: r.texto, accion });
  }

  if (observaciones.length === 0 || recomendaciones.length === 0) return null;
  return { version: 2, resumen: respuesta.resumen, observaciones, recomendaciones };
}
