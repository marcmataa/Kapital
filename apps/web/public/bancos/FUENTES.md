# Logos de bancos: fuentes

Todos los ficheros vienen de Wikimedia Commons. Se descargaron el 2026-10-19 en una carpeta aparte, porque se trataban como contenido no confiable.

## Cómo se sanearon

Se reconstruyeron con una lista blanca de elementos y atributos:

- **Elementos permitidos:** `svg`, `g`, `path`, `rect`, `circle`, `defs`, gradientes, `clipPath`, `mask`, `use` y `style`.
- **Eliminado:**
  - `<script>`, `<foreignObject>`, `<metadata>` y `<title>`;
  - los atributos de Inkscape y Sodipodi;
  - los atributos `on*`;
  - `javascript:` y `data:`;
  - los `href` que no son `#fragmento`;
  - `url()` externas, `@import`, DOCTYPE, entidades y comentarios.
- **Se conserva el `viewBox`.** En algunos logos se recortó al símbolo para que se lea en la baldosa de 40 px. En esos casos también se quitaron los trazos del texto.

Los logos son **marcas registradas** de sus titulares. Commons los publica como dominio público por ser logotipos simples (umbral de originalidad), pero eso no afecta a los derechos de marca. Aquí se usan solo para identificar el banco de cada cuenta.

| Fichero | Original en Commons | Licencia en Commons | Variante usada |
|---|---|---|---|
| `caixabank.svg` | [File:Logo CaixaBank.svg](https://commons.wikimedia.org/wiki/File:Logo_CaixaBank.svg) | Dominio público | Símbolo (estrella), sin el texto |
| `santander.svg` | [File:Banco Santander Logotipo.svg](https://commons.wikimedia.org/wiki/File:Banco_Santander_Logotipo.svg) | Dominio público | Símbolo (llama), recortando el `viewBox` |
| `bbva.svg` | [File:BBVA logo 2025.svg](https://commons.wikimedia.org/wiki/File:BBVA_logo_2025.svg) | Dominio público | Logotipo completo |
| `sabadell.svg` | [File:Logotipo del Banco Sabadell.svg](https://commons.wikimedia.org/wiki/File:Logotipo_del_Banco_Sabadell.svg) | Dominio público | Símbolo cuadrado «BS» (se corrigió el `viewBox`, que en el original no encuadraba el dibujo) |
| `bankinter.svg` | [File:Bankinter.svg](https://commons.wikimedia.org/wiki/File:Bankinter.svg) | Dominio público | Logotipo completo (se añadió el `viewBox` 0 0 400 70) |
| `ing.svg` | [File:ING Group (wordmark).svg](https://commons.wikimedia.org/wiki/File:ING_Group_(wordmark).svg) | Dominio público | Logotipo «ING», sin león: no hay versión del león en Commons |
| `unicaja.svg` | [File:Unicaja logo.svg](https://commons.wikimedia.org/wiki/File:Unicaja_logo.svg) | Dominio público | Símbolo (abanico verde), sin el texto |
| `revolut.svg` | [File:Revolut logo.svg](https://commons.wikimedia.org/wiki/File:Revolut_logo.svg) | Dominio público | Logotipo completo |
| `trade_republic.svg` | [File:Trade Republic logo 2021.svg](https://commons.wikimedia.org/wiki/File:Trade_Republic_logo_2021.svg) | Dominio público | Logotipo apilado completo |

**Sin logo:** `openbank`. En Commons no hay ningún SVG oficial de Openbank (solo un GIF y fotos), así que la app muestra sus iniciales (respaldo de `BankLogo`).
