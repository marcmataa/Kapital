import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from '@/app/App';
import { PantallaConfigFaltante } from '@/app/PantallaConfigFaltante';
import { capturarErrorOAuth } from '@/features/auth/api/errorOAuth';
import { I18nProvider } from '@/shared/i18n';
import { iniciarTema } from '@/shared/layout/useTema';
import { configApp } from '@/shared/lib/env';
import './index.css';

iniciarTema();
// Antes de renderizar: el router redirige a /login y perdería los parámetros de error OAuth.
capturarErrorOAuth();

const raiz = document.getElementById('root');
if (!raiz) throw new Error('No existe #root');

createRoot(raiz).render(
  <StrictMode>
    {configApp.ok ? (
      <App />
    ) : (
      <I18nProvider>
        <PantallaConfigFaltante faltan={configApp.faltan} />
      </I18nProvider>
    )}
  </StrictMode>,
);
