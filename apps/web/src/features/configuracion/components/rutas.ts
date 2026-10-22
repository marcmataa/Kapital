/** Alta de un ajuste para una cuenta (formulario de la feature movimientos). */
export function rutaAjuste(cuentaId: string): string {
  const params = new URLSearchParams({ tipo: 'ajuste', cuenta: cuentaId });
  return `/movimientos/nuevo?${params.toString()}`;
}
