import { Link } from 'react-router';
import { skipToken } from '@reduxjs/toolkit/query';
import { Sparkles } from 'lucide-react';
import { useIdioma, useT } from '@/shared/i18n';
import { useInicioAnalisisMesQuery, useInicioUltimoAnalisisQuery } from '../api/inicioApi';
import { mesLargo } from '../lib/calculos';

interface Props {
  /**
   * Mes cerrado elegido en Inicio ('YYYY-MM-01'): se muestran los destacados de ESE mes.
   * Sin mes (mes en curso): los del último análisis listo.
   */
  mes?: string | undefined;
}

/**
 * Bajo el donut: 2 destacados del análisis, como texto plano, y enlace al análisis completo
 * (`/analisis/YYYY-MM`).
 * - Mes en curso sin análisis: aviso de que el primero llega el día 1.
 * - Mes cerrado sin análisis listo: aviso y enlace a su página de Análisis, que decide si se
 *   puede generar (como la propia página Análisis).
 * Si falla la carga no se muestra nada: es un complemento, no un dato financiero.
 */
export function AnalisisDestacado({ mes }: Props) {
  const t = useT('inicio');
  const { locale } = useIdioma();
  const ultimo = useInicioUltimoAnalisisQuery(mes === undefined ? undefined : skipToken);
  const delMes = useInicioAnalisisMesQuery(mes ?? skipToken);
  // `currentData`: al cambiar de mes no se muestran los destacados del mes anterior mientras carga.
  const { currentData: data, isError } = mes === undefined ? ultimo : delMes;

  if (isError || data === undefined) return null;

  if (!data) {
    if (mes !== undefined) {
      return (
        <p className="mt-auto flex flex-col gap-1.5 rounded-xl border border-borde bg-superficie-2 p-4 text-sm text-apagado">
          <span>{t('analisis.sinAnalisisMes', { mes: mesLargo(mes, locale) })}</span>
          <Link to={`/analisis/${mes.slice(0, 7)}`} className="font-semibold text-enlace hover:underline">
            {t('analisis.irAnalisis')}
          </Link>
        </p>
      );
    }
    return (
      <p className="mt-auto rounded-xl border border-borde bg-superficie-2 p-4 text-sm text-apagado">
        {t('analisis.pendiente')}
      </p>
    );
  }

  return (
    <aside className="mt-auto flex flex-col gap-2.5 rounded-xl border border-acento-borde bg-acento-suave p-4">
      <div className="flex items-center justify-between gap-2.5">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-texto">
          <Sparkles aria-hidden="true" className="size-4.5 text-enlace" />
          {t('analisis.titulo', { mes: mesLargo(data.mes, locale) })}
        </h3>
        <span className="text-xs text-apagado">{t('analisis.ia')}</span>
      </div>
      <ul className="flex list-disc flex-col gap-1.5 pl-4.5 text-sm leading-relaxed text-texto">
        {data.destacados.map((d, i) => (
          <li key={i}>{d}</li>
        ))}
      </ul>
      <Link to={`/analisis/${data.mes.slice(0, 7)}`} className="text-sm font-semibold text-enlace hover:underline">
        {t('analisis.verCompleto')}
      </Link>
    </aside>
  );
}
