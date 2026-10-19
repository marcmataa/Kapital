import toast from 'react-hot-toast';
import { useUsuario } from '@/app/auth';
import { IDIOMAS, useIdioma, useT, type Idioma } from '@/shared/i18n';
import { Card, SegmentedControl } from '@/shared/ui';
import { useConfigActualizarIdiomaMutation } from '../api/configuracionApi';

/** Idioma de la interfaz: cambia al momento y se guarda en `perfiles.idioma`. */
export function SeccionIdioma() {
  const t = useT('configuracion');
  const tc = useT('common');
  const usuario = useUsuario();
  const { idioma, setIdioma } = useIdioma();
  const [guardar] = useConfigActualizarIdiomaMutation();

  const cambiar = async (nuevo: Idioma) => {
    if (nuevo === idioma) return;
    const anterior = idioma;
    setIdioma(nuevo);
    try {
      await guardar({ userId: usuario.id, idioma: nuevo }).unwrap();
    } catch {
      setIdioma(anterior);
      toast.error(t('idioma.error'));
    }
  };

  return (
    <Card aria-labelledby="config-idioma" className="flex flex-wrap items-center justify-between gap-4">
      <div>
        <h2 id="config-idioma" className="text-base font-semibold text-texto">
          {t('idioma.titulo')}
        </h2>
        <p className="mt-1 text-sm text-apagado">{t('idioma.descripcion')}</p>
      </div>
      <SegmentedControl
        etiqueta={t('idioma.titulo')}
        opciones={IDIOMAS.map((i) => ({ valor: i, etiqueta: tc(`idioma.${i}`) }))}
        valor={idioma}
        onChange={(i) => void cambiar(i)}
      />
    </Card>
  );
}
