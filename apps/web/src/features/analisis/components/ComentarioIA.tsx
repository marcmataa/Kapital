import { useState, type ReactNode } from 'react';
import { Sparkles, Target } from 'lucide-react';
import { useNombreCategoria } from '@/shared/hooks/useNombreCategoria';
import { useT } from '@/shared/i18n';
import { formatearEuros, normalizarCifrasTexto } from '@/shared/lib/dinero';
import { Button } from '@/shared/ui';
import { useLocale } from '../hooks/useLocale';
import type { AccionAnalisis, ContenidoAnalisis } from '../schemas/esquemas';
import { DialogoCrearLimite } from './DialogoCrearLimite';

interface Props {
  contenido: ContenidoAnalisis;
  /** Pie: «Generado el …» y el botón Regenerar. */
  pie: ReactNode;
}

/**
 * Texto de la IA, siempre como texto plano (React escapa; nunca HTML). La IA no calcula:
 * comenta los totales e insights que salen de la base. Las recomendaciones con acción
 * (validada en la Edge Function) llevan un botón «Crear límite» prellenado.
 */
export function ComentarioIA({ contenido, pie }: Props) {
  const t = useT('analisis');
  const locale = useLocale();
  const nombreDe = useNombreCategoria();
  const [accion, setAccion] = useState<AccionAnalisis | null>(null);
  // Mismo estilo de subtítulo que el resto de tarjetas: frase normal, sin mayúsculas forzadas (F29).
  const subtitulo = 'text-sm font-semibold text-texto';
  const hayObservaciones = contenido.observaciones.length > 0;
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
        <p className="max-w-[72ch] text-base leading-relaxed whitespace-pre-line text-texto">{normalizarCifrasTexto(contenido.resumen, locale)}</p>
      </div>
      <div className={hayObservaciones ? 'grid grid-cols-1 gap-5 md:grid-cols-2' : 'flex flex-col'}>
        {hayObservaciones && (
          <div className="flex flex-col gap-2">
            <h3 className={subtitulo}>{t('ia.observaciones')}</h3>
            <ul className="flex list-disc flex-col gap-2 pl-5 text-[15px] leading-normal text-texto">
              {contenido.observaciones.map((o, i) => (
                <li key={i}>{normalizarCifrasTexto(o, locale)}</li>
              ))}
            </ul>
          </div>
        )}
        <div className="flex flex-col gap-2">
          <h3 className={subtitulo}>{t('ia.recomendaciones')}</h3>
          <ul className="flex list-disc flex-col gap-3 pl-5 text-[15px] leading-normal text-texto">
            {contenido.recomendaciones.map((r, i) => (
              <li key={i}>
                <span>{normalizarCifrasTexto(r.texto, locale)}</span>
                {r.accion !== null && (
                  <Button
                    variante="secundario"
                    tamano="sm"
                    className="mt-2 flex"
                    icono={<Target aria-hidden="true" className="size-4" />}
                    onClick={() => setAccion(r.accion)}
                  >
                    {t('limite.boton', {
                      categoria: nombreDe({ nombre: r.accion.categoria, clave: r.accion.clave }),
                      importe: formatearEuros(r.accion.importe, locale),
                    })}
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-borde pt-4">{pie}</div>
      {accion !== null && <DialogoCrearLimite accion={accion} onCerrar={() => setAccion(null)} />}
    </section>
  );
}
