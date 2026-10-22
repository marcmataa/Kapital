import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router';
import { inicioDeMes } from '@/shared/lib/fechas';
import { mesDeParametro, mesesDisponibles, parametroDeMes } from '@/shared/lib/periodos';

export const PARAMETRO_MES = 'mes';

export interface MesSeleccionado {
  /** Mes mostrado (día 1, 'YYYY-MM-01'). */
  mes: string;
  /** Meses elegibles, del en curso al de la primera cuenta (mismo rango que Estadísticas). */
  meses: string[];
  enCurso: boolean;
  /** Mes anterior y siguiente dentro del rango; null en los límites. */
  anterior: string | null;
  siguiente: string | null;
  /**
   * false mientras la URL pide un mes y aún no se sabe si está en rango (las cuentas cargan).
   * Sin `?mes` el mes en curso está resuelto desde el principio.
   */
  resuelto: boolean;
  elegir: (mes: string) => void;
}

/**
 * Mes de Inicio reflejado en la URL (`?mes=2026-09`). Rango: del mes de la primera cuenta
 * (`inicioDatos`) al mes en curso. Un valor inválido o fuera de rango cae al mes en curso; el
 * mes en curso no lleva parámetro. Cambiar de mes reemplaza la entrada del historial.
 */
export function useMesSeleccionado(hoy: string, inicioDatos: string | null, datosCargados: boolean): MesSeleccionado {
  const [params, setParams] = useSearchParams();
  const mesActual = inicioDeMes(hoy);
  const meses = useMemo(() => mesesDisponibles(hoy, inicioDatos), [hoy, inicioDatos]);
  const pedido = mesDeParametro(params.get(PARAMETRO_MES));
  const mes = pedido !== null && meses.includes(pedido) ? pedido : mesActual;
  const i = meses.indexOf(mes);

  const elegir = useCallback(
    (nuevo: string) => {
      setParams(
        (previos) => {
          const siguientes = new URLSearchParams(previos);
          if (nuevo === mesActual) siguientes.delete(PARAMETRO_MES);
          else siguientes.set(PARAMETRO_MES, parametroDeMes(nuevo));
          return siguientes;
        },
        { replace: true },
      );
    },
    [setParams, mesActual],
  );

  return {
    mes,
    meses,
    enCurso: mes === mesActual,
    anterior: meses[i + 1] ?? null,
    siguiente: i > 0 ? (meses[i - 1] ?? null) : null,
    resuelto: pedido === null || pedido === mesActual || datosCargados,
    elegir,
  };
}
