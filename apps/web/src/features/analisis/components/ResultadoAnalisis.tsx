import { useColorCategoriaCatalogo, useNombreCategoriaCatalogo } from '@/shared/hooks/useNombreCategoria';
import { useT } from '@/shared/i18n';
import { aCentimos, formatearEuros, formatearPorcentaje } from '@/shared/lib/dinero';
import type { CategoriaGasto } from '@/shared/lib/resultadoMes';
import { ResultadoMes } from '@/shared/ui/graficos/ResultadoMes';
import { useLocale } from '../hooks/useLocale';
import { conclusionesMes, type Conclusion } from '../lib/conclusiones';
import type { DatosAnalisis } from '../schemas/esquemas';

const COLOR_POR_DEFECTO = '#8f9bbd';

/**
 * «De tus ingresos a tu balance» del análisis: el mismo componente que Estadísticas › Balance
 * (ResultadoMes), con dos añadidos debajo:
 * - una conclusión breve hecha con reglas fijas a partir de las cifras del mes (sin IA);
 * - por qué el balance no coincide con la variación patrimonial (secciones 3 y 5), con las piezas
 *   del mes en texto.
 */
export function ResultadoAnalisis({ datos }: { datos: DatosAnalisis }) {
  const t = useT('analisis');
  const locale = useLocale();
  const nombreCategoria = useNombreCategoriaCatalogo();
  const colorActual = useColorCategoriaCatalogo();
  const { resumen, variacion } = datos;

  // `datos.categorias` no trae id: el nombre es único por usuario y sirve de id. El color, el de hoy
  // (no el guardado en el snapshot): el mismo que en Inicio y Estadísticas (auditoría F07).
  const categorias: CategoriaGasto[] = datos.categorias.map((c) => ({
    id: c.nombre,
    nombre: nombreCategoria({ nombre: c.nombre }),
    color: colorActual(c.nombre, c.color) ?? COLOR_POR_DEFECTO,
    gasto: c.gasto,
  }));
  const conclusiones = conclusionesMes({
    ingresos: resumen.ingresos,
    gastosNetos: resumen.gastos_netos,
    balance: resumen.balance,
    ahorroPct: resumen.ahorro_pct,
    categorias,
  });
  const euros = (v: string) => formatearEuros(v, locale);
  const conSigno = (v: string) => formatearEuros(v, locale, { signo: 'siempre' });
  const pct = (v: string) => formatearPorcentaje(v, locale);
  const frase = (c: Conclusion): string => {
    switch (c.tipo) {
      case 'sinIngresos':
        return t('conclusion.sinIngresos');
      case 'gastasteMas':
        return t('conclusion.gastasteMas', { importe: euros(c.importe) });
      case 'ahorraste':
        return t('conclusion.ahorraste', { porcentaje: pct(c.porcentaje) });
      case 'aCero':
        return t('conclusion.aCero');
      case 'mayorCategoria':
        return t('conclusion.mayorCategoria', { categoria: c.nombre, porcentaje: pct(c.porcentaje) });
      case 'sinGastos':
        return t('conclusion.sinGastos');
    }
  };
  const saldos = aCentimos(variacion.saldos_iniciales) !== 0n;

  return (
    <ResultadoMes
      ingresos={resumen.ingresos}
      gastosNetos={resumen.gastos_netos}
      balance={resumen.balance}
      categorias={categorias}
      mes={datos.mes}
      enCurso={false}
    >
      {conclusiones.length > 0 && (
        <section aria-labelledby="conclusion-mes" data-testid="conclusion-mes" className="rounded-xl bg-superficie-2 p-3 sm:p-3.5">
          <h3 id="conclusion-mes" className="text-sm font-semibold text-texto">
            {t('conclusion.titulo')}
          </h3>
          <p className="mt-1 text-sm text-texto">{conclusiones.map(frase).join(' ')}</p>
          <p className="mt-1 text-xs text-apagado">{t('conclusion.nota')}</p>
        </section>
      )}
      <details data-testid="explicacion-variacion" className="border-t border-borde pt-3">
        <summary className="cursor-pointer text-sm font-medium text-apagado hover:text-texto">{t('variacion.pregunta')}</summary>
        <div className="mt-2 flex flex-col gap-2 text-sm text-texto">
          <p>{t('variacion.explicacion')}</p>
          <p>{t('variacion.saldosIniciales')}</p>
          <p data-testid="piezas-variacion" className="cifras">
            {t('variacion.piezas', {
              balance: conSigno(variacion.balance),
              revalorizacion: conSigno(variacion.revalorizacion),
              ajustes: conSigno(variacion.ajustes),
              variacion: conSigno(variacion.variacion),
            })}
          </p>
          {saldos && <p className="cifras">{t('variacion.saldosDelMes', { saldos: euros(variacion.saldos_iniciales) })}</p>}
        </div>
      </details>
    </ResultadoMes>
  );
}
