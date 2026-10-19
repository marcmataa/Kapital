# Kapital web v1 — diseño y contrato entre piezas

> Acordado con el usuario el 2026-10-19. Complementa `CLAUDE.md` y `docs/reglas-financieras.md` (que mandan sobre este documento).
> Diseño visual de referencia: `docs/diseno/estructura-kapital.png`.

## Alcance v1

- Registro e inicio de sesión con email + contraseña y con Google (Supabase Auth).
- Registro restringido por lista de emails permitidos hasta el lanzamiento público.
- Onboarding en el primer inicio de sesión: idioma → banco principal → su saldo → otros bancos (saltable, máx. 5 bancos) → efectivo → resumen.
- App: Inicio, Movimientos (lista, filtros, detalle, alta/edición), Estadísticas, Análisis (IA mensual), Configuración (idioma, bancos, efectivo, categorías, objetivos, tokens del atajo, tema, cerrar sesión).
- Fuera de alcance: inversiones y valoraciones en la UI, chat con IA, sugerencia de categoría, avisos push, lanzamiento público (privacidad, consentimiento, borrar cuenta).

## Bancos

Catálogo cerrado (`cuentas.entidad`), con logo SVG oficial alojado en `apps/web/public/bancos/<entidad>.svg`:

| entidad | Nombre |
|---|---|
| caixabank | CaixaBank |
| santander | Santander |
| bbva | BBVA |
| sabadell | Banco Sabadell |
| bankinter | Bankinter |
| ing | ING |
| unicaja | Unicaja |
| openbank | Openbank |
| revolut | Revolut |
| trade_republic | Trade Republic (como banco: su cuenta de efectivo) |

`entidad = null` → banco creado por el usuario («Otro»), con `nombre` y `color` propios. La UI lo muestra con iniciales sobre su color.

- Máximo **5 cuentas de tipo `banco` no cerradas** por usuario. Lo impone la base (trigger); la UI solo lo refleja.
- El efectivo es una cuenta de tipo `efectivo` y no cuenta en el límite.
- El saldo que se introduce es el `saldo_inicial` con `fecha_inicial = hoy_usuario()` (reglas, sección 4).

## Base de datos — migración `20261019000000_onboarding_y_analisis.sql`

Cambios:
- `perfiles.onboarding_completado boolean not null default false`.
- `cuentas.entidad text null` (check: catálogo de arriba) y `cuentas.color text null`.
- Trigger «máx. 5 bancos».
- Trigger `after insert on auth.users` (security definer): crea el perfil del usuario nuevo.
- Registro restringido: `registro_config (abierto boolean)` y `registro_permitidos (email)`; trigger `before insert on auth.users` que rechaza el alta si el registro está cerrado y el email no está permitido. Ambas tablas sin acceso para `anon` ni `authenticated` (se gestionan desde el SQL Editor).

RPC para `authenticated` (todas reciben importes como **texto** y los leen con `leer_importe`):
- `completar_onboarding(p_idioma text, p_bancos jsonb, p_efectivo text) returns void`
  - `p_bancos`: array de 1–5 `{ "entidad": string|null, "nombre": string, "color": string|null, "saldo": string }`; el primero es la cuenta principal.
  - Crea bancos, la cuenta «Efectivo», las categorías por defecto, fija `perfiles.idioma` y marca `onboarding_completado`. Error si ya estaba completado.
- `crear_banco(p_entidad text, p_nombre text, p_color text, p_saldo text) returns uuid` — añadir banco desde Configuración (siempre con saldo).

Análisis mensual:
- Tabla `analisis_mensuales`: `id, user_id, mes (día 1), estado ('pendiente'|'generando'|'listo'|'error'), mes_incompleto, datos jsonb, contenido jsonb, idioma, modelo, regeneraciones (0–1), intentos, error_codigo, generado_at, created_at, updated_at`, `unique (user_id, mes)`.
  - `authenticated` solo puede leer las suyas (RLS). Solo escribe `service_role` (Edge Function).
- `datos_analisis(p_mes date) returns jsonb` (security invoker, `authenticated`): agregados del mes del usuario actual, **importes como strings**. Forma:
  ```json
  { "mes": "2026-09-01", "mes_incompleto": false, "idioma": "es",
    "resumen": { "ingresos": "1508.00", "gastos": "...", "devoluciones": "...", "gastos_netos": "1168.28", "balance": "339.72", "ahorro_pct": "22.53...", "ajustes": "0.00" },
    "resumen_mes_anterior": { ...igual... },
    "categorias": [{ "nombre": "Ocio", "color": "#...", "gasto": "40.00" }],
    "categorias_mes_anterior": [...],
    "metodos": [{ "metodo": "tarjeta", "gasto": "..." }],
    "variacion": { "patrimonio_inicial": "...", "patrimonio_final": "...", "balance": "...", "revalorizacion": "...", "ajustes": "...", "saldos_iniciales": "...", "variacion": "..." },
    "objetivos": [{ "tipo": "ahorro_mensual", "categoria": null, "importe": "500.00", "actual": "339.72" }] }
  ```
  `mes_incompleto = true` si la cuenta más antigua del usuario empieza después del día 1 de ese mes.
- `datos_analisis_usuario(p_user uuid, p_mes date) returns jsonb` (security definer, **solo `service_role`**): fija el usuario de la sesión y devuelve `datos_analisis(p_mes)`.
- `solicitar_regeneracion(p_mes date) returns void` (security definer, `authenticated`): pasa el análisis del usuario a `pendiente` y suma 1 a `regeneraciones`, solo si está `listo` o `error` y `regeneraciones < 1`. Si no, error con código `P0001` y mensaje `limite_regeneracion`.

## Edge Function `analisis-mensual`

`supabase/functions/analisis-mensual/index.ts` (Deno) + lógica pura en `supabase/functions/_shared/analisis/` (testeable con Vitest en Node).

- **Modo cron**: cabecera `x-cron-secret` igual al secreto `CRON_SECRET`. Para cada usuario con onboarding completado crea (si no existe) la fila `pendiente` del mes anterior y procesa las `pendiente` y las `error` con `intentos < 3`.
- **Modo usuario**: `POST { "mes": "YYYY-MM-01" }` con el JWT del usuario. Llama a `solicitar_regeneracion` como ese usuario (aplica el límite) y procesa su fila.
- Procesar = `estado = generando` → `datos_analisis_usuario` → OpenAI (`gpt-4o-mini`, salida JSON schema estricta) → validar con zod → guardar `contenido`, `datos`, `estado = listo`.
- A OpenAI solo van agregados: nunca conceptos, comercios ni notas. La IA no calcula: comenta los números recibidos.
- Salida de la IA: `{ "resumen": string, "destacados": string[2..4], "recomendaciones": string[2..3] }`, en el idioma del usuario.
- Errores: el cliente recibe un código genérico, nunca el mensaje del proveedor. Logs sin datos personales.
- Secretos (los pone el usuario en Supabase → Edge Functions → Secrets): `OPENAI_API_KEY`, `CRON_SECRET`.
- Programación: `supabase/setup/cron-analisis-mensual.sql` (pg_cron + pg_net, día 1 a las 06:00 UTC); se ejecuta a mano en el SQL Editor.

## Web (`apps/web`)

- `src/app/` (router, store, providers), `src/shared/{ui,layout,lib,i18n}`, `src/features/<feature>/{components,api,hooks,schemas,i18n}`.
- Features: `auth`, `onboarding`, `inicio`, `movimientos`, `estadisticas`, `analisis`, `configuracion`.
- Datos: RTK Query con `fakeBaseQuery` + supabase-js; cada feature inyecta sus endpoints (`api.injectEndpoints`).
- i18n propio (es/en/ca, respaldo es); cada feature tiene sus textos en `features/<feature>/i18n/{es,en,ca}.ts`.
- Datos compartidos (cuentas con su valor de hoy, categorías, objetivos): `src/shared/api/catalogos.ts`. Los importes se piden con `::text` (PostgREST devuelve `numeric` como número JSON).
- Inicio: bajo el donut, 2 destacados del último análisis listo + enlace al análisis completo. Objetivos se añaden desde la propia tarjeta.
- Gráfico de capital: eje X cada 5 días, eje Y con escalones iguales ajustados a los datos (no desde 0), recorrido día a día con ratón/dedo/teclado, «19 oct (hoy)» en vez de «hoy».
- Logo: `public/brand/kapital-marca*.png` (transparente, sirve en los dos temas).
- Dinero: strings de la base; formato con `Intl.NumberFormat` sobre el string; entrada del usuario con parser propio; nunca `parseFloat`/`Number()` sobre importes.
- Guards: público, autenticado y onboarding (si `onboarding_completado = false` → `/bienvenida`).
- Navegación: sidebar en escritorio (Inicio, Movimientos, Estadísticas, Análisis, Configuración); bottom nav en móvil (Inicio, Movimientos, +, Estadísticas, Más).
- Seguridad: CSP estricta, sin `dangerouslySetInnerHTML`, sin scripts ni imágenes de terceros.
