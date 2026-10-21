# Kapital — web (`@kapital/web`)

PWA de finanzas personales: React 19 + Vite + TypeScript estricto + Tailwind 4 + Supabase.
Las reglas del proyecto están en el `CLAUDE.md` de la raíz y el contrato en `docs/diseno/web-v1.md`.

## Variables de entorno

Los `.env` viven en la **raíz del repositorio** (Vite usa `envDir: '../..'`), junto a `.env.example`:

```bash
cp .env.example .env   # desde la raíz del repo
```

| Variable | Qué es |
|---|---|
| `VITE_SUPABASE_URL` | URL del proyecto (Supabase → Project Settings → API) |
| `VITE_SUPABASE_ANON_KEY` | Clave `anon` (pública por diseño; RLS protege los datos) |

- **Los secretos los escribe el usuario directamente en `.env`.** Nunca se pegan en un chat, un issue ni un commit.
- La clave `service_role` **nunca** va en la web.
- Si falta alguna variable, la app muestra una pantalla «Falta configuración» con el nombre de la variable (nunca su valor).

## Comandos

Desde la raíz del repo:

```bash
npm install
npm run dev                         # http://localhost:5173
npm run build                       # typecheck + build de producción en apps/web/dist
npm run test -w @kapital/web        # Vitest + Testing Library (jsdom)
npm run typecheck -w @kapital/web
npm run lint                        # ESLint de todo el repo
npm run preview -w @kapital/web     # sirve el build (con CSP y service worker)
npm run generate-pwa-assets -w @kapital/web   # regenera los iconos desde public/brand/kapital-marca.png
```

## Seguridad: CSP

La sesión de Supabase vive en el almacenamiento del navegador, así que la defensa principal es impedir XSS.

- En el **build**, un plugin de Vite (`kapital-csp` en `vite.config.ts`) inyecta esta CSP como `<meta>`:
  `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self' https://<ref>.supabase.co wss://<ref>.supabase.co; worker-src 'self'; manifest-src 'self'; base-uri 'self'; form-action 'self'; object-src 'none'`.
- `connect-src` usa el **origen exacto** de `VITE_SUPABASE_URL` en el momento del build (`https://<ref>.supabase.co` y `wss://<ref>.supabase.co`, o el stack local `http://127.0.0.1:54321` + `ws://…`). Solo si la variable falta o no es una URL válida se usa el comodín `*.supabase.co`, y el build lo avisa (sin imprimir ningún valor). La clave `anon` no interviene.
- En **desarrollo** no se inyecta: el HMR de Vite necesita scripts en línea y websockets.
- `style-src 'unsafe-inline'`: Recharts usa atributos `style` y react-hot-toast inyecta una etiqueta `<style>`. Los **scripts** siguen limitados a `'self'`.

### Cabeceras HTTP del hosting

`frame-ancestors` y `X-Frame-Options` **no funcionan en `<meta>`**: van como cabeceras HTTP. Están en
`public/_headers` (formato **Netlify / Cloudflare Pages**; Vite lo copia tal cual a `dist/`):

```
/*
  X-Frame-Options: DENY
  Content-Security-Policy: frame-ancestors 'none'
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(), usb=()
  Strict-Transport-Security: max-age=63072000; includeSubDomains
```

En otro hosting hay que replicarlas. En **Vercel**, un `vercel.json` en la raíz del proyecto desplegado:

```json
{
  "headers": [
    {
      "source": "/(.*)",
      "headers": [
        { "key": "X-Frame-Options", "value": "DENY" },
        { "key": "Content-Security-Policy", "value": "frame-ancestors 'none'" },
        { "key": "X-Content-Type-Options", "value": "nosniff" },
        { "key": "Referrer-Policy", "value": "strict-origin-when-cross-origin" },
        { "key": "Permissions-Policy", "value": "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
        { "key": "Strict-Transport-Security", "value": "max-age=63072000; includeSubDomains" }
      ]
    }
  ]
}
```

En nginx, Caddy, etc., las mismas seis cabeceras con `add_header` / `header`. Esta cabecera CSP solo lleva
`frame-ancestors`: el navegador aplica a la vez la del `<meta>` y la de la cabecera (se suman las restricciones).
- ESLint prohíbe `dangerouslySetInnerHTML`, `parseFloat` y `Number.parseFloat`. Sin scripts, fuentes ni imágenes de terceros.

## PWA

- `vite-plugin-pwa` (`generateSW`): precachea los estáticos, `navigateFallback: index.html`.
- Las peticiones a Supabase son `NetworkOnly`: los datos financieros y la sesión nunca se cachean en el service worker.
- Manifest «Kapital», `display: standalone`, `lang: es`, `theme_color`/`background_color` `#07110e`. Iconos en `public/` generados desde `public/brand/kapital-marca.png` (recorte de la «K» del logo `public/brand/kapital-icono.png`); el generador los deja en `public/brand/` y hay que moverlos a `public/`.

## Google (Supabase Auth)

1. Google Cloud Console → APIs y servicios → Credenciales → **ID de cliente OAuth** (aplicación web).
   - URI de redirección autorizado: `https://<proyecto>.supabase.co/auth/v1/callback`.
2. Supabase → **Authentication → Providers → Google**: activar y pegar el Client ID y el Client Secret
   (los escribe el usuario en el panel; nunca pasan por el chat ni por el repo).
3. Supabase → **Authentication → URL Configuration**:
   - Site URL: la URL de producción.
   - Redirect URLs: `http://localhost:5173`, `http://localhost:5173/restablecer`, `https://<producción>` y `https://<producción>/restablecer`.
4. El botón «Continuar con Google» llama a `signInWithOAuth({ provider: 'google', options: { redirectTo: window.location.origin } })`.

Recomendado en Supabase → Authentication: confirmación de email activada y «Secure password change» activado.

## Estructura

```
src/
  app/            router, store (RTK Query), AuthProvider y guards, perfil
  shared/
    lib/          supabase, dinero, fechas, periodos, bancos, esquemas zod
    hooks/        useHoyUsuario (hoy en perfiles.zona_horaria, Europe/Madrid por defecto)
    i18n/         i18n propio (es/en/ca), registro de namespaces
    ui/           componentes base (Button, Card, StatCard, Input, MoneyInput, Sheet…)
    layout/       AppLayout, Sidebar, BottomNav, MobileHeader, tema
  features/<f>/   auth, onboarding, inicio, movimientos, estadisticas, analisis, configuracion
    routes.tsx    rutas de la feature (las monta src/app/router.tsx)
    i18n/         es.ts (claves), en.ts, ca.ts
    api/          endpoints (api.injectEndpoints)
    components/ hooks/ schemas/ pages/
```

### Cómo añade una feature páginas, textos y datos (sin tocar ficheros centrales)

**Rutas** — `src/features/<f>/routes.tsx` exporta un `RutasFeature` (`src/app/rutas.ts`) con paths relativos:

```tsx
const PaginaNuevo = lazy(() => import('./pages/PaginaNuevoMovimiento'));
const rutas: RutasFeature = {
  app: [{ path: 'movimientos', children: [{ path: 'nuevo', element: <PaginaNuevo /> }] }],
};
export default rutas;
```

Zonas: `publicas` (sin sesión), `libres` (sin guard), `onboarding` (sesión + onboarding pendiente), `app` (sesión + onboarding completado, con layout).

**Textos** — `src/features/<f>/i18n/es.ts` define las claves; `en.ts` y `ca.ts` usan `satisfies Traduccion<typeof es>`
(si falta o sobra una clave, no compila). En los componentes: `const t = useT('<f>'); t('clave', { variable })`.

**Datos** — `src/features/<f>/api/*.ts`:

```ts
import { api, ejecutar } from '@/app/api';
import { supabase } from '@/shared/lib/supabase';

export const cuentasApi = api.injectEndpoints({
  endpoints: (b) => ({
    listarCuentas: b.query<Cuenta[], void>({
      queryFn: () => ejecutar(supabase.from('cuentas').select('*').order('created_at')),
      providesTags: ['Cuentas'],
    }),
  }),
});
export const { useListarCuentasQuery } = cuentasApi;
```

## Dinero en el cliente

- Los importes llegan de la base como **string** y se formatean con `formatearEuros(importe, locale)` (Intl sobre el string, exacto).
- Entrada del usuario: `<MoneyInput>` + `esquemaImporte(mensaje, locale)` (zod), que usa `parsearImporteLocal(texto, locale)`:
  en es/ca es `parsearImporte` (réplica de `leer_importe` en SQL, coma decimal); en en la coma separa miles y el punto es
  decimal (`'1,000'` → `'1000.00'`), y una coma ambigua (`'1,5'`) se rechaza. A la base siempre va `'dddd.dd'`.
  Todo formulario vuelve a leer el texto con el idioma al validar y al enviar (Enter no pasa por `onBlur`).
- Si hay que operar en el cliente: `aCentimos` → `bigint`. Nunca `parseFloat` ni `Number()` sobre importes.
- Porcentajes: `formatearPorcentaje(valor, locale)` → 1 decimal, o «—» si es `null`.
