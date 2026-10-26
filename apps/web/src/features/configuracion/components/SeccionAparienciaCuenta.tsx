import { useState } from 'react';
import toast from 'react-hot-toast';
import { Download, LogOut, Trash2 } from 'lucide-react';
import { useUsuario } from '@/app/auth';
import type { Categoria, Cuenta } from '@/shared/api/catalogos';
import { useCerrarSesion } from '@/shared/hooks/useCerrarSesion';
import { useHoyUsuario } from '@/shared/hooks/useHoyUsuario';
import { useNombreCategoria } from '@/shared/hooks/useNombreCategoria';
import { useNombreUsuario } from '@/shared/hooks/useNombreUsuario';
import { useT } from '@/shared/i18n';
import { useTema, type Tema } from '@/shared/layout';
import { Button, Card, SegmentedControl } from '@/shared/ui';
import { descargarTexto, generarCsv, leerMovimientosExportar } from '../api/exportar';
import { DialogoEliminarCuenta } from './DialogoEliminarCuenta';

/** Apariencia: tema de este dispositivo. */
export function SeccionApariencia() {
  const t = useT('configuracion');
  const { tema, setTema } = useTema();
  const opcionesTema: { valor: Tema; etiqueta: string }[] = [
    { valor: 'oscuro', etiqueta: t('apariencia.oscuro') },
    { valor: 'claro', etiqueta: t('apariencia.claro') },
    { valor: 'sistema', etiqueta: t('apariencia.sistema') },
  ];

  return (
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
  );
}

/** Exportar movimientos a CSV (en el cliente; importes como texto exacto de la base). */
function ExportarCsv({ cuentas, categorias }: { cuentas: readonly Cuenta[]; categorias: readonly Categoria[] }) {
  const t = useT('configuracion');
  const { hoy } = useHoyUsuario();
  const nombreCategoria = useNombreCategoria();
  const [exportando, setExportando] = useState(false);

  const exportar = async () => {
    setExportando(true);
    try {
      const movimientos = await leerMovimientosExportar();
      const csv = generarCsv(
        movimientos,
        { cuentas, categorias },
        {
          fecha: t('exportar.colFecha'),
          tipo: t('exportar.colTipo'),
          sentido: t('exportar.colSentido'),
          importe: t('exportar.colImporte'),
          concepto: t('exportar.colConcepto'),
          comercio: t('exportar.colComercio'),
          categoria: t('exportar.colCategoria'),
          metodo: t('exportar.colMetodo'),
          cuenta: t('exportar.colCuenta'),
          cuentaDestino: t('exportar.colCuentaDestino'),
          notas: t('exportar.colNotas'),
        },
        nombreCategoria,
      );
      descargarTexto(`kapital-movimientos-${hoy}.csv`, csv);
      toast.success(t('exportar.hecho', { n: movimientos.length }));
    } catch {
      toast.error(t('exportar.error'));
    } finally {
      setExportando(false);
    }
  };

  return (
    <div className="flex flex-col gap-2 border-t border-borde pt-3">
      <h3 className="text-sm font-semibold text-texto">{t('exportar.titulo')}</h3>
      <p className="text-sm text-apagado">{t('exportar.descripcion')}</p>
      <Button
        variante="secundario"
        className="self-start"
        cargando={exportando}
        icono={<Download aria-hidden="true" className="size-4" />}
        onClick={() => void exportar()}
      >
        {t('exportar.boton')}
      </Button>
    </div>
  );
}

interface PropsCuenta {
  cuentas: readonly Cuenta[];
  categorias: readonly Categoria[];
  /** En el menú del móvil «Cerrar sesión» va al final de la lista, no dentro de la sección. */
  conCerrarSesion?: boolean;
}

/** Cuenta: nombre, email y proveedor, exportar datos, cerrar sesión y eliminar la cuenta. */
export function SeccionCuenta({ cuentas, categorias, conCerrarSesion = true }: PropsCuenta) {
  const t = useT('configuracion');
  const usuario = useUsuario();
  const { completo } = useNombreUsuario();
  const { salir, saliendo } = useCerrarSesion();
  const [eliminando, setEliminando] = useState(false);
  const proveedor = usuario.app_metadata.provider === 'google' ? t('cuenta.google') : t('cuenta.email');

  return (
    <Card aria-labelledby="config-cuenta" className="flex flex-col gap-3">
      <h2 id="config-cuenta" className="text-base font-semibold text-texto">
        {t('cuenta.titulo')}
      </h2>
      {completo !== null && <p className="font-medium break-words text-texto">{completo}</p>}
      <p className="text-sm break-all text-apagado">{t('cuenta.resumen', { email: usuario.email ?? '', proveedor })}</p>
      {conCerrarSesion && (
        <Button
          variante="fantasma"
          className="self-start text-negativo hover:text-negativo"
          cargando={saliendo}
          icono={<LogOut aria-hidden="true" className="size-4" />}
          onClick={() => void salir()}
        >
          {t('cuenta.cerrarSesion')}
        </Button>
      )}

      <ExportarCsv cuentas={cuentas} categorias={categorias} />

      <div className="flex flex-col gap-2 border-t border-borde pt-3">
        <h3 className="text-sm font-semibold text-negativo">{t('eliminar.titulo')}</h3>
        <p className="text-sm text-apagado">{t('eliminar.descripcion')}</p>
        <Button
          variante="peligro"
          className="self-start"
          icono={<Trash2 aria-hidden="true" className="size-4" />}
          onClick={() => setEliminando(true)}
        >
          {t('eliminar.boton')}
        </Button>
      </div>
      {eliminando && <DialogoEliminarCuenta onCerrar={() => setEliminando(false)} />}
    </Card>
  );
}
