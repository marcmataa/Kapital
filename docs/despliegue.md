# Despliegue en producción — lista de comprobación

Lo que hay que configurar a mano en Supabase y en el hosting de la web. `supabase/config.toml` solo afecta al entorno **local**: en producción todo esto se configura en el panel de Supabase.

> **Secretos.** Ningún valor secreto va en este documento, en el repositorio ni en la conversación con el asistente. Los escribes tú directamente en el panel, en el SQL Editor o en tu terminal.

## 1. Migraciones

Aplica, en orden, las de `supabase/migrations/`:

1. `20261015000000_esquema_inicial.sql`
2. `20261019000000_onboarding_y_analisis.sql`
3. `20261020000000_correcciones.sql`

Cada una tiene su rollback en `supabase/rollback/`. Los rollbacks se ejecutan en orden **inverso**.

> **Aviso.** `20261019000000_onboarding_y_analisis.down.sql` borra el trigger del registro restringido. Si lo ejecutas, cualquiera puede registrarse. Antes, desactiva las altas en Authentication.

## 2. Authentication → Sign In / Providers

**Email:**
- [ ] *Confirm email* activado (`enable_confirmations`).
- [ ] *Secure password change* activado: para cambiar la contraseña hay que haber iniciado sesión hace poco o volver a autenticarse.
- [ ] *Minimum password length*: **12**.
- [ ] *Password requirements*: **lowercase, uppercase letters and digits** (`lower_upper_letters_digits`).
- [ ] *Leaked password protection* activado (comprueba HaveIBeenPwned). Está en Authentication → Attack Protection; según el plan, puede requerir Pro.

**Google:**
- [ ] Crea un cliente OAuth en Google Cloud Console (tipo «Aplicación web»).
  - *Authorized redirect URI*: `https://<ref-del-proyecto>.supabase.co/auth/v1/callback`.
- [ ] Copia el *Client ID* y el *Client secret* en Supabase → Providers → Google.
  - El secret lo pegas tú en el panel. Nunca va al repositorio.
- [ ] **Ojo:** un *Client secret* nuevo de Google puede tardar unos minutos en funcionar. Si al volver de Google el login falla y los logs de Auth (Dashboard → Logs → Auth) muestran `invalid_client "The provided client secret is invalid."`:
  - comprueba que el secret pegado es el correcto: empieza por `GOCSPX-` y solo se puede copiar al crearlo (si ya no lo tienes, crea otro);
  - espera unos minutos antes de volver a probar.

**Altas:**
- [ ] *Allow new users to sign up* puede quedar activado: el registro está restringido en la base por `registro_permitidos` (ver el punto 4).
- [ ] *Anonymous sign-ins* desactivado.

## 3. Authentication → URL Configuration

- [ ] *Site URL*: la URL de la web en producción: `https://kapital-pd1.pages.dev`.
- [ ] *Redirect URLs*: solo las de la web, exactas:
  - `https://kapital-pd1.pages.dev/**` (o las rutas concretas de vuelta de login y de recuperación de contraseña);
  - si hace falta en desarrollo, `http://localhost:5173/**`.
  - Nunca `*` a secas.

## 4. Authentication → Sessions (plan Pro)

La sesión de la PWA vive en el almacenamiento del navegador, así que debe caducar:
- [ ] *Time-box user sessions*: por ejemplo **7 días**. Pasado ese tiempo, hay que volver a iniciar sesión.
- [ ] *Inactivity timeout*: por ejemplo **24 h**.
- [ ] *JWT expiry* (Settings → JWT): 3600 s (valor por defecto).
- [ ] *Refresh token rotation* activado (valor por defecto).

Si el proyecto está en el plan Free, estas opciones no existen. Se quedan pendientes hasta pasar a Pro.

## 5. Registro restringido: el email del propietario

Hasta el lanzamiento público solo se registran los emails de `registro_permitidos`. En el **SQL Editor** (rol `postgres`), escribe tu email directamente:

```sql
insert into registro_permitidos (email) values ('<tu-email>');
-- Comprobar:
select email, created_at from registro_permitidos;
```

Para abrir el registro a todo el mundo (solo cuando se decida):

```sql
update registro_config set abierto = true;
```

Si te diste de alta con `preparar_usuario` antes del onboarding, la migración `20261020000000_correcciones.sql` ya marca tu onboarding como completado.

## 6. Edge Function `analisis-mensual`

Despliegue: ver `supabase/functions/README.md`.

En **Edge Functions → Secrets**, escritos por ti:

| Secreto | Valor |
|---|---|
| `OPENAI_API_KEY` | Clave **nueva y exclusiva** de Kapital, en un proyecto de OpenAI con **límite de gasto** mensual. No reutilices claves de otros proyectos. |
| `CRON_SECRET` | Aleatorio, de 32 caracteres como mínimo (recomendado: 64 hexadecimales). Con menos, el modo cron se rechaza siempre. |
| `APP_ORIGIN` | Orígenes de la web separados por comas: en producción, `https://kapital-pd1.pages.dev`. Nunca `*`. |

`SUPABASE_URL`, `SUPABASE_ANON_KEY` y `SUPABASE_SERVICE_ROLE_KEY` los inyecta Supabase. La clave `service_role` **nunca** sale del panel de Supabase:
- ni en la web;
- ni en el teléfono;
- ni en el repositorio.

## 7. Vault y cron del análisis mensual

1. [ ] Activa las extensiones `pg_cron` y `pg_net` (Database → Extensions).
2. [ ] Guarda en Vault, desde el SQL Editor, los valores que necesita el cron:
   - `kapital_project_url`;
   - `kapital_cron_secret` (el mismo valor que `CRON_SECRET`);
   - `kapital_anon_key`.

   Las instrucciones exactas están en la cabecera de `supabase/setup/cron-analisis-mensual.sql`.
3. [ ] Ejecuta `supabase/setup/cron-analisis-mensual.sql` entero en el SQL Editor.
4. [ ] Comprueba que el trabajo existe:

   ```sql
   select jobname, schedule, active from cron.job where jobname = 'kapital-analisis-mensual';
   ```

## 8. Hosting de la web (cabeceras HTTP)

La web ya lleva una CSP en `index.html`. Además, el hosting debe enviar estas cabeceras en todas las respuestas:

- [ ] `Content-Security-Policy`: la misma que la de `index.html`, más `frame-ancestors 'none'`, que no funciona en `<meta>`. Sin `unsafe-eval` y sin scripts de terceros.
- [ ] `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload`.
- [ ] `X-Content-Type-Options: nosniff`.
- [ ] `Referrer-Policy: strict-origin-when-cross-origin`.
- [ ] `Permissions-Policy: camera=(), microphone=(), geolocation=()`.
- [ ] `X-Frame-Options: DENY`, para navegadores antiguos.
- [ ] Solo HTTPS, con redirección de HTTP a HTTPS.
- [ ] `index.html` y `sw.js` con `Cache-Control: no-cache`, para que las actualizaciones de la PWA lleguen.

Variables de la web: solo `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY` (la clave anon es pública). Se definen en el panel del hosting, nunca en el repositorio.

## 9. Comprobación final

- [ ] Registro con un email que no está en `registro_permitidos` → rechazado.
- [ ] Registro con el tuyo → llega el email de confirmación y el onboarding funciona.
- [ ] Una contraseña de menos de 12 caracteres, o sin mayúsculas, minúsculas y dígitos → rechazada.
- [ ] El atajo del iPhone registra un movimiento con su token.
- [ ] Una llamada manual al cron sin `x-cron-secret` → 401.
