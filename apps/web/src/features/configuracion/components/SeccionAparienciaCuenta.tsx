import { useUsuario } from '@/app/auth';
import { useCerrarSesion } from '@/shared/hooks/useCerrarSesion';
import { useNombreUsuario } from '@/shared/hooks/useNombreUsuario';
import { useT } from '@/shared/i18n';
import { useTema, type Tema } from '@/shared/layout';
import { Button, Card, SegmentedControl } from '@/shared/ui';

/**
 * Apariencia (tema de este dispositivo) y cuenta (nombre, email, proveedor y cerrar sesión).
 * En el móvil es donde se cierra sesión (Más → Configuración): la bottom nav no tiene hueco.
 */
export function SeccionAparienciaCuenta() {
  const t = useT('configuracion');
  const { tema, setTema } = useTema();
  const usuario = useUsuario();
  const { completo } = useNombreUsuario();
  const { salir, saliendo } = useCerrarSesion();

  const proveedor = usuario.app_metadata.provider === 'google' ? t('cuenta.google') : t('cuenta.email');
  const opcionesTema: { valor: Tema; etiqueta: string }[] = [
    { valor: 'oscuro', etiqueta: t('apariencia.oscuro') },
    { valor: 'claro', etiqueta: t('apariencia.claro') },
    { valor: 'sistema', etiqueta: t('apariencia.sistema') },
  ];

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card aria-labelledby="config-apariencia" className="flex flex-col gap-3">
        <h2 id="config-apariencia" className="text-base font-semibold text-texto">
          {t('apariencia.titulo')}
        </h2>
        <SegmentedControl
          etiqueta={t('apariencia.etiqueta')}
          opciones={opcionesTema}
          valor={tema}
          onChange={setTema}
          className="self-start"
        />
        <p className="text-xs text-apagado">{t('apariencia.ayuda')}</p>
      </Card>

      <Card aria-labelledby="config-cuenta" className="flex flex-col gap-3">
        <h2 id="config-cuenta" className="text-base font-semibold text-texto">
          {t('cuenta.titulo')}
        </h2>
        {completo !== null && <p className="font-medium break-words text-texto">{completo}</p>}
        <p className="text-sm break-all text-apagado">
          {t('cuenta.resumen', { email: usuario.email ?? '', proveedor })}
        </p>
        <Button variante="secundario" className="self-start" cargando={saliendo} onClick={() => void salir()}>
          {t('cuenta.cerrarSesion')}
        </Button>
      </Card>
    </div>
  );
}
