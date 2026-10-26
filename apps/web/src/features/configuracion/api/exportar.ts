import type { Categoria, Cuenta } from '@/shared/api/catalogos';
import { supabase } from '@/shared/lib/supabase';

/**
 * Exportación de movimientos a CSV, en el cliente. Los importes se piden como texto
 * (`importe::text`) y se escriben tal cual: '1258.00' es exactamente lo que guarda la base.
 * Nunca se convierten a número.
 */
export const COLUMNAS_EXPORTAR =
  'id, fecha, tipo, sentido, importe::text, concepto, comercio, categoria_id, metodo, cuenta_id, cuenta_destino_id, notas';

/** Filas por petición (PostgREST corta por defecto en 1000). */
export const TAMANO_PAGINA = 1000;

export interface MovimientoExportar {
  id: string;
  fecha: string;
  tipo: string;
  sentido: string | null;
  importe: string;
  concepto: string;
  comercio: string | null;
  categoria_id: string | null;
  metodo: string | null;
  cuenta_id: string;
  cuenta_destino_id: string | null;
  notas: string | null;
}

/** Todos los movimientos del usuario (RLS), por páginas, del más antiguo al más reciente. */
export async function leerMovimientosExportar(): Promise<MovimientoExportar[]> {
  const todas: MovimientoExportar[] = [];
  for (let desde = 0; ; desde += TAMANO_PAGINA) {
    const { data, error } = await supabase
      .from('movimientos')
      .select(COLUMNAS_EXPORTAR)
      .order('fecha', { ascending: true })
      .order('created_at', { ascending: true })
      .order('id', { ascending: true })
      .range(desde, desde + TAMANO_PAGINA - 1);
    if (error) throw error;
    const pagina = (data ?? []) as unknown as MovimientoExportar[];
    for (const fila of pagina) {
      if (typeof fila.importe !== 'string') throw new Error('importe_no_texto');
      todas.push(fila);
    }
    if (pagina.length < TAMANO_PAGINA) return todas;
  }
}

/**
 * Celda CSV (RFC 4180 con `;`, que es lo que espera Excel en es/ca). Se entrecomilla si hace
 * falta y, para que una hoja de cálculo no ejecute fórmulas escritas en un concepto, un texto
 * que empieza por = + - @ o tabulador lleva delante un apóstrofo.
 */
export function celdaCsv(valor: string | null): string {
  if (valor === null) return '';
  const seguro = /^[=+\-@\t\r]/.test(valor) ? `'${valor}` : valor;
  return /[";\r\n]/.test(seguro) ? `"${seguro.replace(/"/g, '""')}"` : seguro;
}

export interface CabecerasCsv {
  fecha: string;
  tipo: string;
  sentido: string;
  importe: string;
  concepto: string;
  comercio: string;
  categoria: string;
  metodo: string;
  cuenta: string;
  cuentaDestino: string;
  notas: string;
}

/**
 * CSV de movimientos. Los nombres de cuenta y categoría salen de los catálogos ya cargados
 * (`nombreCategoria` traduce las categorías por defecto). Importes: texto exacto de la base.
 */
export function generarCsv(
  movimientos: readonly MovimientoExportar[],
  catalogos: { cuentas: readonly Pick<Cuenta, 'id' | 'nombre'>[]; categorias: readonly Categoria[] },
  cabeceras: CabecerasCsv,
  nombreCategoria: (c: Categoria) => string,
): string {
  const cuentas = new Map(catalogos.cuentas.map((c) => [c.id, c.nombre]));
  const categorias = new Map(catalogos.categorias.map((c) => [c.id, c]));
  const nombreCuenta = (id: string | null) => (id === null ? null : (cuentas.get(id) ?? null));
  const nombreCat = (id: string | null) => {
    const c = id === null ? undefined : categorias.get(id);
    return c === undefined ? null : nombreCategoria(c);
  };

  const lineas = [
    [
      cabeceras.fecha,
      cabeceras.tipo,
      cabeceras.sentido,
      cabeceras.importe,
      cabeceras.concepto,
      cabeceras.comercio,
      cabeceras.categoria,
      cabeceras.metodo,
      cabeceras.cuenta,
      cabeceras.cuentaDestino,
      cabeceras.notas,
    ],
    ...movimientos.map((m) => [
      m.fecha,
      m.tipo,
      m.sentido,
      m.importe,
      m.concepto,
      m.comercio,
      nombreCat(m.categoria_id),
      m.metodo,
      nombreCuenta(m.cuenta_id),
      nombreCuenta(m.cuenta_destino_id),
      m.notas,
    ]),
  ];
  return lineas.map((l) => l.map(celdaCsv).join(';')).join('\r\n') + '\r\n';
}

/** Descarga un texto como fichero (con BOM para que Excel lea bien los acentos). */
export function descargarTexto(nombre: string, contenido: string, tipo = 'text/csv;charset=utf-8'): void {
  const blob = new Blob(['﻿', contenido], { type: tipo });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nombre;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
