import { LogOut } from 'lucide-react';
import { useAuth } from '@/app/auth';
import { useCerrarSesion } from '@/shared/hooks/useCerrarSesion';
import { useNombreUsuario } from '@/shared/hooks/useNombreUsuario';
import { useT } from '@/shared/i18n';
import { cx } from '@/shared/lib/cx';
import { Button } from '@/shared/ui';
import { BotonTema } from './BotonTema';

/**
 * Pie del menú lateral: con qué cuenta estás conectado, cerrar sesión y, a su lado, el botón de
 * tema (claro/oscuro). La elección completa (también «Automático») está en Configuración.
 */
export function BloqueCuenta({ className }: { className?: string }) {
  const t = useT('common');
  const { usuario } = useAuth();
  const { completo } = useNombreUsuario();
  const { salir, saliendo } = useCerrarSesion();
  const email = usuario?.email ?? '';

  return (
    <section aria-label={t('cuenta.region')} className={cx('flex flex-col gap-3 border-t border-borde pt-4', className)}>
      <div className="min-w-0 px-2">
        {completo !== null && (
          <p className="truncate text-sm font-medium text-texto" title={completo}>
            {completo}
          </p>
        )}
        {email !== '' && (
          <p className={cx('truncate text-apagado', completo !== null ? 'text-xs' : 'text-sm')} title={email}>
            {email}
          </p>
        )}
      </div>
      <div className="flex items-center gap-2">
        <Button
          variante="fantasma"
          className="min-w-0 flex-1 justify-start text-apagado hover:text-texto"
          icono={<LogOut aria-hidden="true" className="size-4" />}
          cargando={saliendo}
          onClick={() => void salir()}
        >
          {t('cuenta.cerrarSesion')}
        </Button>
        <BotonTema />
      </div>
    </section>
  );
}
