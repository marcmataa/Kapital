import { Monitor, Moon, Sun } from 'lucide-react';
import { useT } from '@/shared/i18n';
import { SegmentedControl, type OpcionSegmento } from '@/shared/ui';
import { useTema, type Tema } from './useTema';

interface Props {
  /** Solo iconos (menú lateral); el nombre de cada opción sigue en aria-label y title. */
  compacto?: boolean;
  anchoCompleto?: boolean;
  className?: string;
}

/**
 * El único control de tema de la app: Oscuro / Claro / Automático. Todas sus apariciones (menú
 * lateral, Más, Configuración) leen y escriben el mismo estado (`useTema`).
 */
export function SelectorTema({ compacto = false, anchoCompleto = false, className }: Props) {
  const t = useT('common');
  const { tema, setTema } = useTema();
  const opcion = (valor: Tema, Icono: typeof Moon, clave: 'tema.oscuro' | 'tema.claro' | 'tema.sistema'): OpcionSegmento<Tema> => ({
    valor,
    etiqueta: compacto ? (
      <span title={t(clave)} className="flex items-center">
        <Icono aria-hidden="true" className="size-4" />
        <span className="sr-only">{t(clave)}</span>
      </span>
    ) : (
      t(clave)
    ),
  });
  return (
    <SegmentedControl
      etiqueta={t('tema.titulo')}
      tamano="sm"
      anchoCompleto={anchoCompleto}
      opciones={[opcion('oscuro', Moon, 'tema.oscuro'), opcion('claro', Sun, 'tema.claro'), opcion('sistema', Monitor, 'tema.sistema')]}
      valor={tema}
      onChange={setTema}
      {...(className !== undefined && { className })}
    />
  );
}
