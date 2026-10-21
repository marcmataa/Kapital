import { fileURLToPath, URL } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv, type Plugin } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

// Los .env viven en la raíz del repo (junto a .env.example).
const envDir = fileURLToPath(new URL('../..', import.meta.url));

const COLOR_FONDO = '#07110e';

const COMODIN_SUPABASE = ['https://*.supabase.co', 'wss://*.supabase.co'];

/**
 * Orígenes de Supabase permitidos en connect-src: el origen EXACTO de VITE_SUPABASE_URL
 * (https://<ref>.supabase.co y wss://<ref>.supabase.co, o el stack local en 127.0.0.1:54321).
 * Solo si falta o no es una URL válida se usa el comodín *.supabase.co (con aviso en el build).
 * `exacto: false` = se usó el comodín. La URL no es secreta, pero no hace falta imprimirla.
 */
export function origenesSupabase(url: string | undefined): { origenes: string[]; exacto: boolean } {
  if (!url) return { origenes: COMODIN_SUPABASE, exacto: false };
  try {
    const u = new URL(url);
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return { origenes: COMODIN_SUPABASE, exacto: false };
    const ws = u.protocol === 'https:' ? 'wss:' : 'ws:';
    return { origenes: [u.origin, `${ws}//${u.host}`], exacto: true };
  } catch {
    return { origenes: COMODIN_SUPABASE, exacto: false };
  }
}

export function construirCsp(supabaseUrl: string | undefined): string {
  return [
    "default-src 'self'",
    "script-src 'self'",
    // 'unsafe-inline' en estilos: Recharts y react-hot-toast inyectan estilos en línea
    // (atributos style y una etiqueta <style>). Los scripts siguen siendo solo 'self'.
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    `connect-src 'self' ${origenesSupabase(supabaseUrl).origenes.join(' ')}`,
    "worker-src 'self'",
    "manifest-src 'self'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
  ].join('; ');
}

/**
 * Inyecta la CSP como <meta> solo en el build. En desarrollo Vite necesita
 * scripts en línea y websockets para el HMR, así que no se aplica.
 * frame-ancestors no funciona en <meta>: se configura como cabecera en el hosting.
 */
function cspEnBuild(supabaseUrl: string | undefined): Plugin {
  return {
    name: 'kapital-csp',
    apply: 'build',
    buildStart() {
      if (!origenesSupabase(supabaseUrl).exacto) {
        this.warn(
          'VITE_SUPABASE_URL falta o no es una URL válida: la CSP usa el comodín *.supabase.co en connect-src. ' +
            'Defínela en el .env de la raíz para fijar el origen exacto del proyecto.',
        );
      }
    },
    transformIndexHtml: {
      order: 'post',
      handler: () => [
        {
          tag: 'meta',
          attrs: { 'http-equiv': 'Content-Security-Policy', content: construirCsp(supabaseUrl) },
          injectTo: 'head-prepend',
        },
      ],
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, envDir, 'VITE_');
  return {
    envDir,
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
        '@db': fileURLToPath(new URL('../../supabase/types', import.meta.url)),
      },
    },
    server: { port: 5173, strictPort: true },
    build: {
      rolldownOptions: {
        output: {
          // Librerías en chunks propios: cachean mejor entre despliegues.
          codeSplitting: {
            groups: [
              { name: 'react', test: /node_modules[\\/](react|react-dom|scheduler)[\\/]/ },
              { name: 'router', test: /node_modules[\\/](react-router|@remix-run)[\\/]/ },
              { name: 'supabase', test: /node_modules[\\/]@supabase[\\/]/ },
              { name: 'redux', test: /node_modules[\\/](@reduxjs|redux|react-redux|immer|reselect)[\\/]/ },
              { name: 'recharts', test: /node_modules[\\/](recharts|d3-[a-z-]+|victory-vendor)[\\/]/ },
            ],
          },
        },
      },
    },
    plugins: [
      react(),
      tailwindcss(),
      cspEnBuild(env.VITE_SUPABASE_URL),
      VitePWA({
        registerType: 'autoUpdate',
        injectRegister: 'script-defer',
        includeAssets: ['favicon.ico', 'apple-touch-icon-180x180.png', 'brand/kapital-marca-96.png', 'bancos/*.svg'],
        manifest: {
          name: 'Kapital',
          short_name: 'Kapital',
          description: 'Mis finanzas personales',
          lang: 'es',
          start_url: '/',
          scope: '/',
          display: 'standalone',
          orientation: 'portrait',
          theme_color: COLOR_FONDO,
          background_color: COLOR_FONDO,
          icons: [
            { src: 'pwa-64x64.png', sizes: '64x64', type: 'image/png' },
            { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
            { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
            { src: 'maskable-icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          ],
        },
        workbox: {
          globPatterns: ['**/*.{js,css,html,svg,png,ico,webmanifest}'],
          // Originales de marca a tamaño completo: no hacen falta offline.
          globIgnores: ['brand/kapital-icono.png', 'brand/kapital-marca.png'],
          navigateFallback: 'index.html',
          cleanupOutdatedCaches: true,
          runtimeCaching: [
            {
              // Datos financieros y auth: nunca se cachean.
              urlPattern: ({ url }) => url.hostname.endsWith('.supabase.co') || url.pathname.startsWith('/auth/v1') || url.pathname.startsWith('/rest/v1'),
              handler: 'NetworkOnly',
            },
          ],
        },
      }),
    ],
  };
});
