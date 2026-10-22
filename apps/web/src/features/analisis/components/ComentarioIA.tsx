import type { ReactNode } from 'react';
import { Sparkles } from 'lucide-react';
import { useT } from '@/shared/i18n';
import type { ContenidoAnalisis } from '../schemas/esquemas';

interface Props {
  contenido: ContenidoAnalisis;
  /** Pie: «Generado el …» y el botón Regenerar. */
  pie: ReactNode;
}

/**
 * Texto de la IA, siempre como texto plano (React escapa; nunca HTML). La IA no calcula:
 * comenta los totales; las cifras de la pantalla salen de la base.
 */
export function ComentarioIA({ contenido, pie }: Props) {
  const t = useT('analisis');
  const subtitulo = 'text-xs font-semibold tracking-wider text-apagado uppercase';
  return (
    <section
      aria-labelledby="analisis-ia-titulo"
      className="flex flex-col gap-5 rounded-2xl border border-borde bg-superficie p-5 shadow-tarjeta sm:p-6"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="analisis-ia-titulo" className="flex items-center gap-2 text-base font-semibold text-texto">
          <Sparkles aria-hidden="true" className="size-5 text-enlace" />
          {t('ia.titulo')}
        </h2>
        <p className="text-xs text-apagado sm:text-sm">{t('ia.nota')}</p>
      </div>
      <div className="flex flex-col gap-1.5">
        <h3 className={subtitulo}>{t('ia.resumen')}</h3>
        <p className="max-w-[72ch] text-base leading-relaxed whitespace-pre-line text-texto">{contenido.resumen}</p>
      </div>
      <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
        <div className="flex flex-col gap-2">
          <h3 className={subtitulo}>{t('ia.destacados')}</h3>
          <ul className="flex list-disc flex-col gap-2 pl-5 text-[15px] leading-normal text-texto">
            {contenido.destacados.map((d, i) => (
              <li key={i}>{d}</li>
            ))}
          </ul>
        </div>
        <div className="flex flex-col gap-2">
          <h3 className={subtitulo}>{t('ia.recomendaciones')}</h3>
          <ul className="flex list-disc flex-col gap-2 pl-5 text-[15px] leading-normal text-texto">
            {contenido.recomendaciones.map((r, i) => (
              <li key={i}>{r}</li>
            ))}
          </ul>
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-borde pt-4">{pie}</div>
    </section>
  );
}
