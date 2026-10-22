import { useState } from 'react';
import { Provider } from 'react-redux';
import { RouterProvider } from 'react-router';
import { Toaster } from 'react-hot-toast';
import { I18nProvider } from '@/shared/i18n';
import { ErrorBoundary } from '@/shared/ui';
import { AuthProvider } from './auth';
import { crearRouter } from './router';
import { store } from './store';

export function App() {
  const [router] = useState(crearRouter);
  return (
    <Provider store={store}>
      <I18nProvider>
        <ErrorBoundary>
          <AuthProvider>
            <RouterProvider router={router} />
          </AuthProvider>
          <Toaster
            position="top-center"
            containerStyle={{ top: 'calc(env(safe-area-inset-top) + 0.75rem)' }}
            toastOptions={{
              className: '!bg-superficie-2 !text-texto !border !border-borde !rounded-xl !text-sm',
            }}
          />
        </ErrorBoundary>
      </I18nProvider>
    </Provider>
  );
}
