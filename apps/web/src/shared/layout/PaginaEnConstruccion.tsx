import { Hammer } from 'lucide-react';
import { useT } from '@/shared/i18n';
import { Card, EmptyState } from '@/shared/ui';
import { CabeceraPagina } from './CabeceraPagina';

interface Props {
  titulo: string;
  descripcion?: string;
  volverA?: string;
}

/** Marcador de posición para páginas que aún implementa su feature. */
export function PaginaEnConstruccion({ titulo, descripcion, volverA }: Props) {
  const t = useT('common');
  return (
    <>
      <CabeceraPagina
        titulo={titulo}
        {...(descripcion !== undefined && { descripcion })}
        {...(volverA !== undefined && { volverA })}
      />
      <Card>
        <EmptyState titulo={t('estado.enConstruccion')} icono={<Hammer className="size-6" />} />
      </Card>
    </>
  );
}
