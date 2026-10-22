# Tests de integración (Supabase local)

Prueban Kapital contra el stack **local** de Supabase (Docker): GoTrue, PostgREST, PostgreSQL 17 y Mailpit de verdad, con las migraciones de `supabase/migrations/`. Complementan los tests de `tests/db` (PGlite), que no necesitan Docker.

## Qué cubren

| Fichero | Qué comprueba |
|---|---|
| `registro.integration.ts` | Registro cerrado por defecto; un email fuera de `registro_permitidos` no se registra; uno permitido sí, el perfil nace con `onboarding_completado = false`, el email de confirmación llega a Mailpit y el enlace lo confirma |
| `onboarding.integration.ts` | `completar_onboarding` por RPC; no se puede marcar ni desmarcar el onboarding con un UPDATE; el sexto banco se rechaza (`23514`) |
| `rls.integration.ts` | Un usuario no ve, crea, modifica ni borra filas de otro, ni usa sus cuentas |
| `calculos.integration.ts` | Importes exactos con `select('importe::text')` (0,10 + 0,20 = 0,30), caso de balance de la sección 11 y `serie_patrimonio` |
| `atajo.integration.ts` | `crear_token` con sesión y `registrar_movimiento` con la clave anon; token revocado rechazado y no reactivable |
| `analisis.integration.ts` | El usuario solo lee su `analisis_mensuales` y no escribe; `datos_analisis` devuelve importes como texto; `datos_analisis_usuario` solo para `service_role` |

## Cómo ejecutarlos

```bash
npm install --prefix tests/integration   # solo la primera vez
npx supabase start                        # Docker Desktop arrancado
npm run test:integration
```

- Si el stack no está arrancado, los tests **se saltan solos** (no fallan).
- No forman parte de `npm test`: necesitan Docker.
- `global-setup.ts` lee las URLs y las claves locales con `supabase status -o env` y se las pasa a los tests en memoria. **No se imprimen ni se escriben en ningún fichero** y no hace falta ningún `.env`.
- Solo aceptan URLs de `127.0.0.1` o `localhost`: nunca se ejecutan contra un proyecto remoto.

## Datos de prueba

- Cada ejecución usa emails únicos `test+<ejecución>-<id>@kapital.test`, sin datos personales. La única excepción son las cifras de la sección 11 de `docs/reglas-financieras.md`.
- Los usuarios se crean con la API admin (ya confirmados), salvo el del flujo de registro, que pasa por el email real. Así no se agota el límite de emails por hora de GoTrue.
- Al terminar, cada fichero borra sus usuarios de `auth.users` (en cascada se borra todo lo suyo) y sus emails de `registro_permitidos`.
- Para comprobar el email de confirmación, `[local_smtp]` tiene que estar activado en `supabase/config.toml` (Mailpit en http://127.0.0.1:54324).
