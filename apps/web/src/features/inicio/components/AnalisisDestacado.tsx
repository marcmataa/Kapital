import { Link } from 'react-router';
import { Sparkles } from 'lucide-react';
import { useIdioma, useT } from '@/shared/i18n';
import { useInicioUltimoAnalisisQuery } from '../api/inicioApi';
import { mesLargo } from '../lib/calculos';

/**
 * Bajo el donut: 2 destacados del último análisis listo, como texto plano, y enlace al análisis
 * completo (`/analisis/YYYY-MM`). Sin análisis: aviso de que el primero llega el día 1.
 * Si falla la carga no se muestra nada: es un complemento, no un dato financiero.
 */
export function AnalisisDestacado() {
  const t = useT('inicio');
  const { locale } = useIdioma();
  const { data, isLoading, isError } = useInicioUltimoAnalisisQuery();

  if (isLoading || isError) return null;

  if (!data) {
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
