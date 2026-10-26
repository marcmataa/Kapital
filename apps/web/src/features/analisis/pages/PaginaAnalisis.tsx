import { Navigate } from 'react-router';
import { useHoyUsuario } from '@/shared/hooks/useHoyUsuario';
import { rutaDeMes, ultimoMesCerrado } from '../lib/meses';

/**
 * «Análisis» abre directamente el último mes cerrado (el anterior al actual en la zona del
 * usuario). Los demás meses se eligen con los chips del detalle.
 */
export default function PaginaAnalisis() {
  const { hoy } = useHoyUsuario();
  return <Navigate to={rutaDeMes(ultimoMesCerrado(hoy))} replace />;
}
