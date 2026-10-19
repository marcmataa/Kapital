import { recursos, type ClaveDe, type Namespace } from './registro';
import { IDIOMA_RESPALDO, type Idioma, type Mensajes } from './tipos';

export type Variables = Readonly<Record<string, string | number>>;

/** Sustituye `{nombre}` por su valor. Las variables que faltan se dejan tal cual. */
export function interpolar(texto: string, variables?: Variables): string {
  if (!variables) return texto;
  return texto.replace(/\{(\w+)\}/g, (original, nombre: string) => {
    const valor = variables[nombre];
    return valor === undefined ? original : String(valor);
  });
}

export function traducir<N extends Namespace>(
  idioma: Idioma,
  namespace: N,
  clave: ClaveDe<N>,
  variables?: Variables,
): string {
  const ns: Record<Idioma, Mensajes> = recursos[namespace];
  const texto = ns[idioma][clave] ?? ns[IDIOMA_RESPALDO][clave] ?? clave;
  return interpolar(texto, variables);
}
