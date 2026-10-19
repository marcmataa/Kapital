import { useCallback, useContext } from 'react';
import { I18nContext, type ValorI18n } from './contexto';
import type { ClaveDe, Namespace } from './registro';
import { traducir, type Variables } from './traducir';

export function useIdioma(): ValorI18n {
  const valor = useContext(I18nContext);
  if (!valor) throw new Error('useIdioma debe usarse dentro de <I18nProvider>');
  return valor;
}

export type FuncionT<N extends Namespace> = (clave: ClaveDe<N>, variables?: Variables) => string;

/**
 * Textos tipados de un namespace:
 *   const t = useT('movimientos');
 *   t('nuevo.titulo');            // clave comprobada en compilación
 *   t('detalle.titulo', { mes }); // interpolación de {mes}
 */
export function useT<N extends Namespace>(namespace: N): FuncionT<N> {
  const { idioma } = useIdioma();
  return useCallback<FuncionT<N>>(
    (clave, variables) => traducir(idioma, namespace, clave, variables),
    [idioma, namespace],
  );
}
