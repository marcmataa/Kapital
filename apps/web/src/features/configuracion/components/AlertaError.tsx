import { TriangleAlert } from 'lucide-react';

/** Error de una acción, anunciado a lectores de pantalla. */
export function AlertaError({ mensaje }: { mensaje: string | null }) {
  if (mensaje === null) return null;
  return (
    <div
      role="alert"
      className="flex items-start gap-2 rounded-xl border border-negativo/30 bg-negativo-suave px-3 py-2.5 text-sm text-negativo"
    >
      <TriangleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
      <span>{mensaje}</span>
    </div>
  );
}
