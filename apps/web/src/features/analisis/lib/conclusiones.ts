import { lecturaAhorro } from '@/shared/lib/ahorro';
import { aCentimos } from '@/shared/lib/dinero';
import { categoriasDelResultado, importeAbsoluto, type CategoriaGasto } from '@/shared/lib/resultadoMes';

/**
 * Una frase de la conclusión del mes. Sale SOLO de las cifras del mes (snapshot de SQL), con
 * reglas fijas: sin IA y sin inventar nada. El texto lo pone la pantalla con sus traducciones.
 */
export type Conclusion =
  | { tipo: 'sinIngresos' }
  | { tipo: 'gastasteMas'; importe: string }
  | { tipo: 'ahorraste'; porcentaje: string }
  | { tipo: 'aCero' }
  | { tipo: 'mayorCategoria'; nombre: string; porcentaje: string }
  | { tipo: 'sinGastos' };

export interface DatosConclusion {
  ingresos: string;
  gastosNetos: string;
  balance: string;
  /** Balance / ingresos × 100 (SQL); null sin ingresos. */
  ahorroPct: string | null;
  /** Gasto neto por categoría, con el nombre ya traducido. */
  categorias: readonly CategoriaGasto[];
}

/**
 * Conclusión del mes en dos frases como mucho, siempre en este orden:
 * 1. El resultado: sin ingresos; gastaste más de lo que ingresaste (y cuánto); cuánto ahorraste
 *    (solo si la tasa es legible, `lecturaAhorro`); o justo a cero.
 * 2. La categoría que más pesa y su % sobre lo gastado (sección 8: sobre las categorías con gasto
 *    positivo); o que no hubo gastos.
 */
export function conclusionesMes(d: DatosConclusion): Conclusion[] {
  const conclusiones: Conclusion[] = [];
  const balance = aCentimos(d.balance);
  if (aCentimos(d.ingresos) <= 0n) {
    conclusiones.push({ tipo: 'sinIngresos' });
  } else if (balance < 0n) {
    conclusiones.push({ tipo: 'gastasteMas', importe: importeAbsoluto(d.balance) });
  } else if (balance === 0n) {
    conclusiones.push({ tipo: 'aCero' });
  } else {
    const ahorro = lecturaAhorro(d.ingresos, d.ahorroPct);
    if (ahorro.tipo === 'porcentaje') conclusiones.push({ tipo: 'ahorraste', porcentaje: ahorro.porcentaje });
  }

  const mayor = categoriasDelResultado(d.categorias).principales[0];
  if (mayor !== undefined && mayor.porcentaje !== null) {
    conclusiones.push({ tipo: 'mayorCategoria', nombre: mayor.nombre, porcentaje: mayor.porcentaje });
  } else if (aCentimos(d.gastosNetos) <= 0n) {
    conclusiones.push({ tipo: 'sinGastos' });
  }
  return conclusiones;
}
