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

// Cuando una versión nueva de la PWA toma el control (skipWaiting + clientsClaim en vite.config),
// se recarga una vez para usarla. La primera instalación no recarga: no había versión anterior.
if ('serviceWorker' in navigator) {
  const habiaVersion = navigator.serviceWorker.controller !== null;
  let recargando = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!habiaVersion || recargando) return;
    recargando = true;
    window.location.reload();
  });
}
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
