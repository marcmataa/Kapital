# Edge Functions de Kapital

## `analisis-mensual`

Genera el análisis mensual con IA (OpenAI `gpt-4o-mini`) a partir de los agregados de `datos_analisis_usuario`. A OpenAI solo viajan agregados del mes; nunca conceptos, comercios ni notas.

- `analisis-mensual/index.ts`: pegamento de Deno (clientes de Supabase y `Deno.serve`).
- `_shared/analisis/`: lógica pura, sin globals de Deno, testeada con Vitest en Node (`tests/functions/`).
- `analisis-mensual/deno.json`: import map (`zod`, `@supabase/supabase-js` vía `npm:`).

### Modos

| Modo | Cómo se llama | Qué hace |
|---|---|---|
| Cron | `POST` con cabecera `x-cron-secret: <CRON_SECRET>` | Crea la fila `pendiente` del mes anterior para cada usuario con onboarding completado y procesa las `pendiente` y las `error` con menos de 3 intentos. |
| Usuario | `POST { "mes": "YYYY-MM-01" }` con `Authorization: Bearer <JWT del usuario>` | Primera generación de un mes cerrado (hasta 12 meses atrás) o regeneración vía `solicitar_regeneracion` (máx. 1). |

Respuestas: `{ "ok": true }` o `{ "error": "<código>" }`. Códigos: `no_autenticado` (401), `no_autorizado` (401, cron), `origen_no_permitido` (403), `onboarding_pendiente` (403), `metodo_no_permitido` (405), `cuerpo_invalido` (400), `mes_no_disponible` (400), `en_curso` (409), `cuerpo_demasiado_grande` (413), `limite_regeneracion` (429), `generacion_fallida` (502), `error_interno` (500).

### Desplegar

```sh
npx supabase login
npx supabase link --project-ref <ref-del-proyecto>
npx supabase functions deploy analisis-mensual
```

Se deja activada la verificación de JWT de Supabase (opción por defecto). Por eso la llamada del cron incluye, además de `x-cron-secret`, la cabecera `Authorization: Bearer <clave anon>` (la clave anon es pública; `supabase/setup/cron-analisis-mensual.sql` la lee de Vault como `kapital_anon_key`).

### Secretos (los pones tú, nunca en el repo ni en el chat)

En el panel de Supabase → **Edge Functions → Secrets** (o con `npx supabase secrets set NOMBRE=...` escrito por ti en tu terminal):

| Secreto | Valor |
|---|---|
| `OPENAI_API_KEY` | Crea una clave **nueva y exclusiva para Kapital** en OpenAI, en un proyecto con **límite de gasto** mensual. No reutilices claves de otros proyectos. |
| `CRON_SECRET` | Cadena aleatoria de al menos 32 caracteres (por ejemplo, `openssl rand -hex 32`). Con menos de 32 caracteres el modo cron se rechaza siempre. La misma cadena va en la tarea de pg_cron. |
| `APP_ORIGIN` | Orígenes de la web separados por comas, por ejemplo `https://kapital.example.com,http://localhost:5173`. Nunca `*`. |

`SUPABASE_URL`, `SUPABASE_ANON_KEY` y `SUPABASE_SERVICE_ROLE_KEY` los inyecta Supabase automáticamente: no hay que definirlos. La clave `service_role` nunca sale del entorno de la función.

Reglas:
- Ningún secreto se escribe en el repositorio, en `.env` versionado ni en la conversación con el asistente.
- Los logs de la función son JSON con el id del análisis y un código; nunca importes, emails ni datos del usuario.

### Comprobar en local

```sh
npx vitest run tests/functions
npx tsc -p tsconfig.functions.json
```
