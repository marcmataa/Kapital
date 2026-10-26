import { IDIOMAS, useIdioma, useT, type Idioma } from '@/shared/i18n';
import { SegmentedControl, type OpcionSegmento } from '@/shared/ui';

/**
 * Selector de idioma compacto (ES · EN · CA) para pantallas sin sesión (login, registro). Cambia
 * la interfaz al momento y lo recuerda en este dispositivo; cada opción se anuncia con su nombre
 * completo en su propio idioma.
 */
export function SelectorIdiomaCompacto({ className }: { className?: string }) {
  const t = useT('common');
  const { idioma, setIdioma } = useIdioma();
  const opciones: OpcionSegmento<Idioma>[] = IDIOMAS.map((valor) => ({
    valor,
    etiqueta: (
      <span lang={valor} title={t(`idioma.${valor}`)}>
        <span aria-hidden="true" className="uppercase">
          {valor}
        </span>
        <span className="sr-only">{t(`idioma.${valor}`)}</span>
      </span>
    ),
  }));
  return (
    <SegmentedControl
      etiqueta={t('idioma.titulo')}
      tamano="sm"
      opciones={opciones}
      valor={idioma}
      onChange={setIdioma}
      {...(className !== undefined && { className })}
    />
  );
}
