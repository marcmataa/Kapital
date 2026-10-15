# Kapital — Mis Finanzas

App de finanzas personales, instalable en iPhone como PWA y usable desde el ordenador.

## Fuente de verdad financiera

**`docs/reglas-financieras.md` es la referencia de todo cálculo financiero.** Es la transcripción de `docs/reglas-financieras.docx`. Si un cálculo no cumple ese documento, el cálculo está mal.

- Todo cálculo financiero (balance, gastos netos, ahorro, patrimonio, variación patrimonial, revalorización, comparativas, gasto por categoría o por método de pago) **debe tener test**.
- Los casos de prueba de la sección 11 son obligatorios y deben dar los valores exactos.
- Las tres medidas nunca se mezclan: **balance mensual**, **patrimonio a una fecha** y **variación patrimonial**.
- Si una petición contradice el documento, se señala antes de implementarla. No se resuelve en silencio.

## Reglas de clasificación
- Una devolución resta del gasto de su categoría. Nunca es un ingreso.
- Mover dinero entre cuentas propias es un traspaso, aunque el banco lo llame transferencia. No afecta al balance ni al patrimonio.
- Un traspaso es UNA fila con cuenta origen y cuenta destino distintas.
- Los ajustes no cuentan en el balance y se muestran aparte.
- Importes del atajo:
  - Llegan como texto ("38,5", "1.258,00", "-24").
  - Se convierten a un importe positivo exacto con un parser propio (`leer_importe` en SQL). Nunca con parseFloat.

## Stack (Supabase nativo)

| Pieza | Tecnología |
|---|---|
| Base de datos | PostgreSQL en Supabase. Migraciones SQL en `supabase/migrations/` y rollback en `supabase/rollback/` |
| Autenticación | Supabase Auth, con RLS en todas las tablas (`user_id = auth.uid()`, solo para el rol `authenticated`) |
| Lógica financiera | Funciones y vistas SQL (`security invoker`), testeadas con Vitest + PGlite (sin red ni Docker) |
| Atajo del iPhone | RPC `registrar_movimiento` |
| Web | React 19, Vite, TypeScript estricto, Tailwind, React Router, supabase-js, react-hook-form + zod, Recharts, vite-plugin-pwa |

No hay API propia (`apps/api`). Si algún día hace falta, se añade.

Sobre el atajo del iPhone (`registrar_movimiento`):
- Se autentica con la clave `anon` (que es pública) y un token personal. En la base solo se guarda el hash SHA-256 del token, y el token se puede revocar.
- La clave `service_role` **nunca** sale del panel de Supabase: ni en el teléfono, ni en la web, ni en el repo.

Toda función `security definer` debe:
- fijar `search_path`;
- revocar `execute` a `public`;
- conceder `execute` solo al rol que la necesite.

App de un solo usuario, pero todo lleva `user_id`. Además, las claves foráneas compuestas `(id, user_id)` impiden referencias cruzadas entre usuarios.

## Dinero

- **Tipo en la base: `numeric(12,2)`.** Es exacto: 0,10 + 0,20 = 0,30. Nunca `float`, `real` ni `double`.
- **En TypeScript los importes llegan como string y nunca se opera con `parseFloat`.**
  - Las sumas y los cálculos se hacen en SQL.
  - Si hay que operar en el cliente, se convierten a céntimos enteros con un parser propio.
- **Los importes son siempre positivos y el tipo de movimiento decide el signo.** La base rechaza importes negativos o cero.
- Moneda: solo EUR.
- Se calcula con precisión completa y **se redondea solo al mostrar**.
  - Los porcentajes se muestran con 1 decimal.
  - Si los ingresos son 0, el ahorro es `NULL` en la base y se muestra «—».
- Las valoraciones de inversión **no son movimientos**: viven en la tabla `valoraciones`, con una por cuenta y día.

## Fechas y zona horaria

- La zona horaria es **`Europe/Madrid`**, guardada en `perfiles.zona_horaria`, que tiene ese valor por defecto.
- La fecha de un movimiento es el día en Madrid en que ocurrió, no el día en que se apuntó. `created_at` guarda la hora de registro solo como dato técnico.
- El valor de un día D es el valor al cierre de D (23:59:59 en Madrid), con todos los movimientos de D incluidos.
- Los timestamps técnicos se guardan en `timestamptz`.

## Idiomas

- La interfaz está en **es / en / ca**, con español como idioma de respaldo.
- Ningún texto visible va hardcodeado en los componentes.

## Secretos

- **Los secretos nunca pasan por la conversación.** Ni contraseñas, ni tokens, ni claves de Supabase, ni cadenas de conexión: el usuario los escribe directamente en `.env`.
- No se leen, imprimen ni registran en logs los valores de `.env`. Solo se comprueba si existen.
- `.env*` está en `.gitignore`. Solo se versiona `.env.example`, con las claves y sin valores.
- Nada de datos personales en logs ni en fixtures.

## Tests con datos reales
- Los casos de la sección 11 de `docs/reglas-financieras.md` usan cifras reales del usuario. Son la única excepción permitida a la regla de usar datos inventados.

## Despliegue
- La sesión de Supabase Auth en una PWA se guarda en el almacenamiento del navegador. Por eso:
  - la web debe estar protegida contra XSS: CSP estricta, sin `dangerouslySetInnerHTML` y sin scripts de terceros;
  - la sesión debe tener una duración razonable.

## Convenciones

- Frontend organizado por funcionalidad: `features/<feature>/{components,api,hooks,schemas}`. Los componentes compartidos van en `shared/ui` y `shared/layout`.
- Cada migración tiene su script de rollback en `supabase/rollback/` y sus tests en `tests/db/` (PGlite + `tests/db/supabase-stub.sql`).
- Supabase da permisos por defecto a `anon` y `authenticated` sobre todo lo nuevo en `public`. Por eso cada migración que crea una tabla o una función debe:
  - activar RLS con una política `to authenticated`;
  - quitar a `anon` el acceso a las tablas;
  - revocar `execute` a las funciones y concederlo solo a quien lo necesite.

  El test `seguridad.test.ts` comprueba que la única función que puede ejecutar `anon` es `registrar_movimiento`.
- Revixy (`Documents/Revixy`) es referencia de patrones de frontend; Proyecto-rustic solo como lista de errores a evitar. No se copia código sin reescribirlo y testearlo.

## Cuándo está terminado
- Una tarea solo está terminada con lint, typecheck y tests en verde, ejecutados de verdad.
- Un commit por tarea o fase. No hacer push ni tocar el remoto sin que el usuario lo pida.
