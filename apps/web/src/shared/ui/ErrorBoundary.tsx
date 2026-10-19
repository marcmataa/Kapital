import { Component, useContext, type ErrorInfo, type ReactNode } from 'react';
import { TriangleAlert } from 'lucide-react';
import { I18nContext } from '@/shared/i18n/contexto';
import { traducir } from '@/shared/i18n/traducir';
import { Button } from './Button';

interface Props {
  children: ReactNode;
  /** Fallback propio; si no, una pantalla genérica con «Reintentar». */
  fallback?: (reintentar: () => void) => ReactNode;
}

interface Estado {
  error: boolean;
}

/** Captura errores de render. Nunca muestra el mensaje ni la traza del error al usuario. */
export class ErrorBoundary extends Component<Props, Estado> {
  override state: Estado = { error: false };

  static getDerivedStateFromError(): Estado {
    return { error: true };
  }

  override componentDidCatch(error: unknown, info: ErrorInfo): void {
    // Solo el tipo de error y la pila de componentes: sin datos del usuario.
    const nombre = error instanceof Error ? error.name : typeof error;
    console.error('[ErrorBoundary]', nombre, info.componentStack);
  }

  reintentar = () => this.setState({ error: false });

  override render() {
    if (!this.state.error) return this.props.children;
    return this.props.fallback ? this.props.fallback(this.reintentar) : <FallbackError onReintentar={this.reintentar} />;
  }
}

/** Funciona también fuera de <I18nProvider> (usa español). */
export function FallbackError({ onReintentar }: { onReintentar: () => void }) {
  const i18n = useContext(I18nContext);
  const idioma = i18n?.idioma ?? 'es';
  return (
    <div role="alert" className="flex min-h-[50dvh] flex-col items-center justify-center gap-4 p-6 text-center">
      <div className="flex size-12 items-center justify-center rounded-full bg-negativo-suave text-negativo">
        <TriangleAlert aria-hidden="true" className="size-6" />
      </div>
      <h1 className="text-lg font-semibold text-texto">{traducir(idioma, 'common', 'error.inesperadoTitulo')}</h1>
      <p className="max-w-sm text-sm text-apagado">{traducir(idioma, 'common', 'error.generico')}</p>
      <div className="flex gap-2">
        <Button variante="secundario" onClick={onReintentar}>
          {traducir(idioma, 'common', 'accion.reintentar')}
        </Button>
        <Button onClick={() => window.location.reload()}>{traducir(idioma, 'common', 'error.recargar')}</Button>
      </div>
    </div>
  );
}
