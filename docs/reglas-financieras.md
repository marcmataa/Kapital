# Reglas financieras de Mis Finanzas

> Transcripción fiel de `docs/reglas-financieras.docx` (Oct 15, 2026 · @Marc). Si los dos difieren, actualizar ambos.

La app maneja tres medidas distintas que nunca se mezclan: **balance mensual** (lo que ingresas menos lo que gastas), **patrimonio** (lo que tienes en una fecha) y **variación patrimonial** (cuánto cambia lo que tienes entre dos fechas). Estas reglas son la referencia para todo el código: si un cálculo no las cumple, el cálculo está mal.

## 1. Principios generales

- **Moneda:** euros, con 2 decimales. Se guarda como número decimal exacto (`numeric(12,2)`), nunca como coma flotante, para que 0,10 + 0,20 dé 0,30.
- **Importes siempre positivos.** El signo lo decide el tipo de movimiento, no el número. Un gasto de 38,50 € se guarda como 38.50 con tipo Gasto, no como -38.50.
- **Zona horaria:** Europe/Madrid. La fecha de un movimiento es el día en Madrid en que ocurrió, no el día en que lo apuntaste.
- **Cierre de día:** el valor de un día D es el que hay a las 23:59:59 de D en Madrid, con todos los movimientos de ese día incluidos.
- **Activo:** algo que vale dinero y es tuyo: cuentas bancarias, efectivo, inversiones, dinero que te deben.
- **Pasivo:** dinero que debes: tarjeta de crédito pendiente, préstamos, dinero que debes a amigos.
- **Cuenta interna:** cualquier cuenta tuya (BBVA, Efectivo, Trade Republic). Mover dinero entre cuentas internas no es ingreso ni gasto.
- **Redondeo:** se calcula con todos los decimales y se redondea solo al mostrar. Los porcentajes se muestran con 1 decimal.

## 2. Tipos de movimiento y su efecto

Cada movimiento tiene un solo tipo, y el tipo decide qué hace con cada medida. Una valoración de inversión no es un movimiento: se guarda aparte (sección 6).

| Tipo | Ejemplo | Balance mensual | Patrimonio | Cuentas |
|---|---|---|---|---|
| Gasto | Cena 38,50 € | Suma a gastos | Baja | Sale de la cuenta origen |
| Ingreso | Nómina 1.258 € | Suma a ingresos | Sube | Entra en la cuenta destino |
| Devolución | Carlota te devuelve 24 € de un regalo | Resta del gasto original: de su categoría y del mes de la compra; no es ingreso | Sube en la fecha real del reembolso | Entra en la cuenta destino en la fecha real del reembolso |
| Traspaso interno | BBVA → Trade Republic 100 €; sacar 50 € del cajero | No cuenta | No cambia | Sale de una cuenta tuya y entra en otra |
| Rendimiento cobrado | Intereses o dividendos que llegan a la cuenta | Suma a ingresos, categoría Rendimientos | Sube | Entra en la cuenta donde se cobra |
| Ajuste | Corregir un descuadre del saldo real | No cuenta | Cambia | Corrige una cuenta |

Reglas de clasificación:

- Si el dinero sale de una cuenta tuya y llega a otra cuenta tuya, es traspaso, aunque el banco lo llame transferencia.
- Si alguien te devuelve dinero de algo que pagaste tú, es devolución del gasto original, no ingreso. Toda devolución nueva va vinculada al gasto exacto que devuelve y hereda su categoría (sección 3, «Devoluciones»).
- Si te pagan por algo que no es un gasto previo (nómina, regalo, venta), es ingreso.
- Un ajuste solo se usa para cuadrar con el saldo real del banco y se muestra aparte, nunca mezclado con gastos o ingresos.

## 3. Balance mensual y ahorro

El balance mensual mide lo que te sobra del mes con tu actividad normal. Septiembre 2026: 1.508,00 € de ingresos menos 1.168,28 € de gastos = 339,72 € de balance, un 22,5 % de ahorro.

```
Gastos netos = Σ Gastos del mes − Σ Devoluciones imputadas al mes
Balance      = Σ Ingresos − Gastos netos
Ahorro (%)   = Balance / Σ Ingresos × 100
```

- **Entra:** gastos, ingresos y rendimientos cobrados con fecha dentro del mes, y las devoluciones imputadas al mes (ver «Devoluciones» abajo).
- **No entra:** traspasos internos, ajustes y cambios de valor de las inversiones.
- **Mes:** del día 1 a las 00:00 al último día a las 23:59:59, hora de Madrid, por la fecha del movimiento (en una devolución, por la fecha de su compra).
- **Ahorro sin ingresos:** si los ingresos del mes son 0 €, el porcentaje no se calcula y se muestra «—».
- **Balance negativo:** se muestra en rojo con signo menos; el ahorro también sale negativo (por ejemplo, −15,0 %).
- **Mes en curso:** el balance es provisional hasta que acaba el mes y se marca como «hasta hoy».
- **Mes cerrado:** también puede cambiar después, si llega una devolución de una compra de ese mes. Se muestra siempre con los datos de hoy.

### Devoluciones: fecha real e imputación

*(Cambio del 28/10/2026: antes la devolución restaba en su propia fecha y en su propia categoría. Por eso una devolución de octubre de una compra de septiembre salía en octubre como gasto negativo.)*

Una devolución tiene dos fechas que no se mezclan:

- **Fecha real:** el día en que el dinero entra en la cuenta. Es la fecha del movimiento. Decide el saldo de la cuenta, el patrimonio (sección 4) y en qué día aparece en la lista de movimientos.
- **Imputación:** el gasto original. La devolución resta del gasto neto **de la categoría del gasto original y del día y el mes de la compra**, aunque llegue semanas después. Decide el balance mensual, el gasto por categoría, el gasto por día, los objetivos, las comparativas y el análisis mensual.

```
Devoluciones imputadas al mes M = Σ devoluciones vinculadas a gastos con fecha en M
                                + Σ devoluciones antiguas sin vincular con fecha en M
Gasto neto de una compra        = Importe del gasto − Σ sus devoluciones   (nunca < 0)
```

- **Vínculo obligatorio:** toda devolución nueva se vincula al gasto exacto que devuelve, venga de la web, del atajo o de una importación. No se puede guardar sin vínculo.
- **Categoría heredada:** la devolución tiene siempre la categoría de su gasto. Si cambia la categoría del gasto, cambia la de sus devoluciones.
- **Límite:** lo devuelto de un gasto, sumado, no puede superar su importe. Se admiten varias devoluciones parciales. El límite se cumple también si se registran varias devoluciones del mismo gasto a la vez.
- **No es ingreso:** una devolución nunca suma a los ingresos.
- **Fecha:** la fecha real de una devolución no puede ser anterior a la de su compra. Por la misma razón, un gasto con devoluciones no puede cambiar a una fecha posterior a la de alguna de ellas.
- **Recalcular el pasado:** al registrar, editar o borrar una devolución se recalculan todas las vistas del mes de la compra, también si ese mes está cerrado. Eso incluye el balance, las categorías, los objetivos, las comparativas, la media mensual y las cifras del análisis mensual. La fecha real del movimiento no cambia.
- **Análisis mensual:** sus cifras se calculan siempre con los datos de hoy. El comentario de la IA no se regenera solo. Si se escribió con cifras que después han cambiado, se muestra un aviso de que puede estar desactualizado y una acción para regenerarlo a mano. Esa acción respeta el límite de regeneraciones que ya existe: el aviso no da regeneraciones adicionales y, si el límite está agotado, la acción explica por qué no se puede usar. Regenerarlo de forma automática queda fuera hasta que se definan su coste y sus condiciones.
- **Devoluciones antiguas sin vincular:** las registradas antes de este cambio sin gasto original se quedan como estaban. Restan en su fecha y en su categoría y pueden dejar una categoría en negativo (sección 8). Se listan como «pendientes de revisión» y nunca se vinculan solas. Al vincular una, pasa a seguir las reglas de arriba.
- **Devoluciones antiguas que incumplen las reglas:** también se marcan para revisión, sin cambiar su fecha ni su categoría automáticamente. Son las vinculadas con fecha anterior a su compra y las vinculadas con una categoría distinta de la de su gasto.
- **El gasto original no se borra:** un gasto con devoluciones vinculadas no se puede borrar. El aviso dice cuántas devoluciones tiene y cuánto suman. No se borran ni se desvinculan solas.
- **Cambiar el gasto original:** se puede corregir a qué gasto pertenece una devolución, pero solo editando esa devolución. Hay que confirmar de forma explícita que el nuevo gasto es la compra que de verdad se devolvió. No se ofrece como atajo para desbloquear el borrado del gasto anterior.

## 4. Patrimonio

El patrimonio a una fecha D es la suma del valor de todas tus cuentas al cierre de D, restando lo que debes. Siempre lleva fecha: «patrimonio a 15/10/2026», nunca «patrimonio» a secas.

```
Patrimonio(D) = Σ Valor de los activos(D) − Σ Saldo de los pasivos(D)
```

Cómo se calcula el valor de cada cuenta según su tipo:

| Tipo de cuenta | Ejemplo | Valor al cierre de D |
|---|---|---|
| Banco | BBVA | Saldo inicial + efecto de todos sus movimientos hasta D incluido |
| Efectivo | Cartera | Igual que un banco |
| Inversión | Trade Republic | Última valoración con fecha ≤ D, ajustada por los movimientos posteriores a esa valoración (sección 6) |
| Pasivo | Tarjeta de crédito, préstamo | Lo que debes al cierre de D; resta del patrimonio |
| Por cobrar (opcional) | Dinero que te debe un amigo | Lo pendiente de cobrar al cierre de D |

- **Saldo inicial:** cada cuenta tiene un saldo y una fecha de partida. Los movimientos anteriores a esa fecha no se suman, porque ya están dentro del saldo inicial.
- **Antes de la fecha de partida:** la cuenta no existe para la app. El gráfico no inventa valores para esos días.
- **Cuenta cerrada:** se archiva con saldo 0 y deja de sumar desde su fecha de cierre, pero su historia se conserva.

## 5. Variación patrimonial

La variación patrimonial es la diferencia entre el patrimonio de dos fechas, y siempre se explica con tres piezas: el balance del periodo, el rendimiento de las inversiones y los ajustes. Cuando una devolución cruza de periodo, se suma una cuarta pieza de conciliación, las devoluciones desplazadas. Los traspasos internos suman cero.

```
ΔPatrimonio = Patrimonio(D2) − Patrimonio(D1) = Balance + Devoluciones desplazadas + Revalorización + Ajustes
Revalorización de una inversión = (Valor(D2) − Valor(D1)) − Flujos netos registrados en esa cuenta
Devoluciones desplazadas = Σ devoluciones vinculadas con fecha real en el periodo y compra fuera de él
                         − Σ devoluciones vinculadas de compras del periodo con fecha real fuera de él
```

*(Cambio del 28/10/2026.)* Las devoluciones desplazadas existen porque el patrimonio usa la fecha real del reembolso y el balance usa la fecha de la compra (sección 3). Ejemplo: una compra de 80 € el 28/09, de la que te devuelven 20 € el 03/10.
- El balance de septiembre la cuenta como 60 € de gasto.
- El patrimonio de septiembre no ve esos 20 €, porque llegan en octubre.
- La variación de septiembre lleva −20 € de devoluciones desplazadas y la de octubre +20 €.

Si no hay devoluciones entre periodos, esta pieza vale 0.

Es solo una pieza de conciliación, no un movimiento:
- No crea ni cambia movimientos bancarios.
- Cada devolución vinculada cuenta una sola vez en el balance (en el periodo de su compra) y una sola vez en el patrimonio (en su fecha real).
- Si la compra y el reembolso caen en el mismo periodo, la devolución no entra en esta pieza.
- Una devolución entre dos periodos aparece con el mismo importe y signo contrario en cada uno, así que la suma de los dos es 0.

Los flujos netos de una cuenta de inversión son lo que entra (aportaciones, ingresos cobrados en ella) menos lo que sale (retiradas, comisiones registradas como gasto). Así, meter 100 € no cuenta como ganancia y sacar 100 € no cuenta como pérdida.

Ejemplo de un mes con patrimonio inicial de 2.000,00 €:

| Pieza | Importe | De dónde sale |
|---|---|---|
| Balance del mes | +300,00 € | Ingresos menos gastos netos |
| Traspaso BBVA → Trade Republic | 0,00 € | −100 € en BBVA y +100 € en Trade Republic |
| Devoluciones desplazadas | 0,00 € | Ninguna devolución cruza de periodo |
| Revalorización | +27,44 € | Trade Republic pasa de 1.472,56 € a 1.600,00 € (+127,44 €) con 100 € aportados |
| Ajustes | 0,00 € | Ninguno |
| **Variación patrimonial** | **+327,44 €** | Patrimonio final: 2.327,44 € |

La app debe mostrar el balance y la variación patrimonial por separado. Si la variación es mayor que el balance, la diferencia viene de las inversiones, de ajustes o de devoluciones desplazadas, nunca de «ingresos ocultos».

## 6. Inversiones y valoraciones históricas

El valor de una inversión no se puede calcular sumando movimientos, porque cambia solo con el mercado. Por eso las cuentas de inversión tienen valoraciones: anotaciones de «esta cuenta valía X € al cierre del día D», guardadas aparte de los movimientos.

Regla para saber cuánto vale una cuenta de inversión al cierre de cualquier día D:

- Busca la última valoración con fecha ≤ D.
- Si existe: valor = esa valoración + flujos netos de la cuenta con fecha posterior a la valoración y ≤ D.
- Si no existe: valor = saldo inicial + flujos netos desde la fecha de partida, igual que un banco.

```
Valor(D) = V_k + Σ_{f_k < fecha ≤ D} Flujos netos,   V_k = última valoración con f_k ≤ D
```

- Una valoración ya incluye los movimientos de su propio día. Si el 15 aportas 100 € y anotas que la cuenta vale 1.600 €, esos 1.600 € ya contienen los 100 €; no se vuelven a sumar.
- Entre dos valoraciones no se inventa rentabilidad. El valor se queda plano y solo se mueve con aportaciones y retiradas. No se interpola: un salto el día de la nueva valoración es más honesto que una curva inventada.
- Comprar o vender acciones dentro de Trade Republic no es un movimiento. El dinero no sale de la cuenta; el cambio se recoge en la siguiente valoración.
- Intereses del efectivo o dividendos cobrados en Trade Republic se registran como Ingreso (categoría Rendimientos) con destino Trade Republic.
- Frecuencia mínima: una valoración el último día de cada mes, para que las comparativas mensuales sean reales. Recomendado: una por semana.
- Una valoración por cuenta y día. Si se anota otra el mismo día, sustituye a la anterior.
- Historial: las valoraciones nunca se borran al cambiarlas; se corrige la de ese día para que el gráfico del pasado no cambie por sorpresa.

## 7. Serie diaria y comparación con el mes anterior

Cada punto del gráfico es el patrimonio al cierre de un día, y se compara con el cierre del mismo día del mes anterior; si ese día no existe, con el último día de ese mes.

```
d' = min(d, último día del mes anterior)
```

| Día del mes actual | Se compara con | Motivo |
|---|---|---|
| 15 de octubre | 15 de septiembre | El día existe |
| 31 de octubre | 30 de septiembre | Septiembre no tiene día 31 |
| 29, 30 y 31 de marzo | 28 de febrero (29 en año bisiesto) | Varios días comparten la misma referencia |
| 31 de enero | 31 de diciembre del año anterior | El mes anterior cruza de año |

Reglas del gráfico:

- Eje horizontal: días 1 a 31. Cada línea se dibuja sobre sus propios días: la del mes anterior termina en su último día, sin estirarla.
- Días sin movimientos: el patrimonio es el del día anterior. La línea sigue plana; nunca baja a cero ni se corta.
- Días futuros: no se dibujan. La línea del mes actual termina en hoy, sin caer a cero.
- Día actual: es provisional, porque aún pueden entrar movimientos. Se dibuja con un punto hueco y la etiqueta «hoy, provisional», y su diferencia se compara con el cierre completo del día equivalente.
- Antes de la fecha de partida de los datos: no hay punto. La línea empieza el primer día con datos.
- Diferencia en euros: patrimonio(d) − patrimonio(d').
- Diferencia en porcentaje: solo si patrimonio(d') es mayor que 0; si no, se muestra solo la diferencia en euros.

Las tarjetas de ingresos y gastos del mes en curso usan la misma idea: del día 1 a hoy, contra del día 1 al mismo día d' del mes anterior. Al cerrar el mes, la comparación pasa a ser mes completo contra mes completo. Los gastos de los dos tramos se cuentan con las devoluciones imputadas a sus compras (sección 3). Por eso el mes anterior puede tener ya devoluciones que el mes en curso todavía no ha recibido. *(Nota del 28/10/2026.)*

## 8. Comparativas, categorías y métodos de pago

Toda comparación enfrenta periodos de la misma longitud y del mismo tipo; si falta uno de los dos, no se muestra porcentaje.

```
Variación (%) = (Actual − Anterior) / |Anterior| × 100
```

- Base cero o sin datos: si el periodo anterior vale 0 € o no existe, se muestra «Sin datos del mes anterior» en lugar de un porcentaje.
- Balance (y cualquier medida que pueda ser 0 o negativa): se muestra siempre la diferencia en euros (Actual − Anterior) y el porcentaje solo si los dos valores son mayores que 0, igual que el patrimonio de la sección 7. Ejemplo: de +243,32 € a −204,13 € se muestra «−447,45 €», no «−183,9 %». *(Cambio del 27/10/2026: antes se mostraba el porcentaje con cualquier base distinta de 0, que con un cambio de signo no se puede interpretar.)*
- Color por significado, no por signo: que suban los ingresos o el balance es verde; que suban los gastos es rojo.
- Interanual: solo aparece cuando hay al menos 12 meses de datos. Compara un mes con el mismo mes del año anterior (octubre 2026 con octubre 2025) o el año en curso hasta hoy con el mismo tramo del año anterior.
- Media mensual: se calcula solo con meses completos; el mes en curso no entra. Puede cambiar si llega una devolución de una compra de un mes ya cerrado (sección 3).
- Objetivos: el progreso de un objetivo (ahorro mensual o límite de categoría) usa el balance y el gasto por categoría con las devoluciones imputadas. Una devolución que llega más tarde puede cambiar el estado del objetivo de un mes cerrado, por ejemplo de «Límite excedido» a «Dentro del límite». *(Nota del 28/10/2026.)*

Gasto por categoría:

```
Gasto de la categoría c en M = Σ Gastos de c en M − Σ Devoluciones imputadas a c en M
```

Una devolución vinculada se imputa a la categoría y al mes de su compra, y una compra nunca queda por debajo de 0 €. Por eso **una devolución vinculada nunca crea una categoría en negativo ni una barra de gasto negativa**: si gastas 80 € en Ocio y te devuelven 20 €, Ocio muestra 60 €.

- El porcentaje de cada categoría se calcula sobre la suma de las categorías con gasto positivo del mes, así que las del gráfico suman siempre 100 %. Si no hay ninguna categoría en negativo, esa suma coincide con los gastos netos. *(Cambio del 19/10/2026: antes decía «sobre los gastos netos», que con una categoría en negativo daba más de 100 %.)*
- Si una categoría queda en negativo, se muestra el número en negativo pero no entra en el gráfico circular, que solo admite valores positivos, y no lleva porcentaje. Desde el 28/10/2026 solo puede pasar con devoluciones antiguas sin vincular que están pendientes de revisión (sección 3).
- Los ingresos tienen sus propias categorías (Nómina, Otros ingresos, Rendimientos) y nunca se mezclan con las de gasto.

Métodos de pago: suma de gastos por método (tarjeta, Apple Pay, efectivo, Bizum, transferencia, domiciliación). Las devoluciones no restan aquí, porque esta vista responde a «cómo pago», no a «cuánto gasto». No cambia con la imputación de la sección 3.

Lista de movimientos *(cambio del 28/10/2026)*: cada movimiento sale en su fecha real, también las devoluciones. Sus totales (el resumen del filtro y los subtotales de cada día) son **movimientos de dinero**, no balance ni gastos netos:

```
Entradas = Σ Ingresos + Σ Devoluciones        (por fecha real)
Salidas  = Σ Gastos                           (por fecha real)
Neto     = Entradas − Salidas
```

- Una devolución es una entrada real de dinero, pero no es un ingreso. El resumen la muestra dentro de Entradas, con su detalle aparte.
- Los traspasos entre tus cuentas no entran en Entradas, Salidas ni Neto. Se muestran aparte.
- Los ajustes tampoco entran: se muestran aparte, como hasta ahora.
- El resumen lleva una aclaración visible: «Movimientos de dinero por su fecha real. No equivalen necesariamente a los ingresos y gastos del periodo, donde cada devolución cuenta en el mes de su compra».

## 9. Casos especiales

Estos son los casos que ya han aparecido en tus datos y cómo se registran para que los números cuadren.

| Situación | Cómo se registra | Efecto en el balance |
|---|---|---|
| Pagas 100 € de entradas y 4 amigos te hacen Bizum de 15 € | 1 Gasto de 100 € (Ocio) + 4 Devoluciones de 15 € vinculadas a ese gasto | Gasto neto de Ocio: 40 €, en el mes de las entradas |
| Amazon te devuelve 9,91 € de un pedido | Devolución vinculada al pedido, no Ingreso; hereda su categoría | Baja el gasto de esa categoría en el mes del pedido |
| Compras algo el 28/09 por 80 € y te devuelven 20 € el 03/10 | Gasto de 80 € el 28/09 + Devolución de 20 € el 03/10 vinculada al gasto | Septiembre pasa a 60 € de gasto neto; octubre no cambia. El saldo sube 20 € el 03/10 |
| Quieres borrar un gasto que tiene devoluciones | No se puede. El aviso dice cuántas devoluciones tiene y cuánto suman. Si alguna estaba mal vinculada, se corrige desde esa devolución confirmando cuál es su compra real; nunca como paso para borrar | Ninguno |
| El atajo recibe una devolución | Se rechaza mientras el atajo no permita elegir el gasto original. El mensaje pide registrarla desde el formulario de Kapital | Ninguno |
| Sacas 50 € del cajero | Traspaso BBVA → Efectivo; el gasto se apunta cuando gastas ese efectivo | Ninguno al sacar |
| Retiras 30 € de Trade Republic a BBVA | Traspaso Trade Republic → BBVA | Ninguno |
| Ahorras 200 € en Trade Republic | Traspaso BBVA → Trade Republic | Ninguno; tu ahorro ya está en el balance |
| Trade Republic te paga intereses o dividendos | Ingreso, categoría Rendimientos, destino Trade Republic | Suma a ingresos |
| Tu cartera sube 27 € sin que metas dinero | Valoración nueva; no es movimiento | Ninguno; sube el patrimonio |
| La nómina llega en varios pagos | Un Ingreso por cada pago, categoría Nómina | Suman todos en su mes |
| Un regalo de cumpleaños por Bizum | Ingreso, categoría Otros ingresos | Suma a ingresos |
| El saldo de la app no coincide con el banco | Ajuste por la diferencia, con nota | Ninguno; se muestra aparte |
| Pagas una cena de 80 € y te deben 60 € que aún no han pagado | Gasto de 80 €; cuando llegue el Bizum, Devolución de 60 € con su fecha real, vinculada a la cena | El mes de la cena cuenta 80 € hasta que llega el dinero y 20 € desde entonces, aunque el Bizum llegue el mes siguiente |

Regla de fechas: cada movimiento lleva la fecha en que ocurrió. Si apuntas el martes un gasto del sábado, su fecha es el sábado; la hora de registro se guarda aparte, solo como dato técnico. Una devolución lleva la fecha real del reembolso y se imputa a la fecha de su compra (sección 3).

## 10. Modelo de datos mínimo

Con cinco tablas se pueden calcular todas las medidas de este documento; la clave es que las valoraciones vivan en su propia tabla y no como movimientos.

| Tabla | Campos clave | Para qué sirve |
|---|---|---|
| cuentas | nombre, tipo (banco, efectivo, inversión, pasivo, por cobrar), saldo inicial, fecha de partida, fecha de cierre, principal | Saber qué tienes y desde cuándo |
| movimientos | fecha, hora, tipo, importe (positivo), categoría, método, cuenta origen, cuenta destino, concepto, comercio, devolución de, origen del registro | Balance, categorías, métodos y saldos de bancos y efectivo |
| valoraciones | cuenta, fecha, valor, nota; una por cuenta y día | Valor real de las inversiones en cualquier fecha |
| categorias | nombre, tipo (gasto o ingreso), color, icono, orden | Agrupar gastos e ingresos |
| objetivos | tipo (ahorro mensual o límite de categoría), categoría, importe | Barras de objetivos del resumen |

Qué cuenta usa cada tipo de movimiento:

| Tipo | Cuenta origen | Cuenta destino |
|---|---|---|
| Gasto | Obligatoria | Vacía |
| Ingreso, Rendimiento | Vacía | Obligatoria |
| Devolución | Vacía | Obligatoria; además, «devolución de» (el gasto original) es obligatorio en toda devolución nueva |
| Traspaso | Obligatoria | Obligatoria y distinta |
| Ajuste | Una de las dos, según el signo | Una de las dos, según el signo |

Cambios pendientes en el schema.sql que ya tienes: añadir el campo tipo a cuentas, la tabla valoraciones, la categoría de ingreso Rendimientos y la fecha de cierre de cuenta. Hoy cada movimiento guarda una única cuenta_id más cuenta_destino_id para traspasos; funciona igual, pero conviene documentarlo con esta tabla.

## 11. Casos de prueba

Si tu app da exactamente estos resultados, cumple las reglas. Márcalos a medida que los compruebes.

Datos de partida para las pruebas de inversión: Trade Republic vale 1.472,56 € el 30/09 (valoración), aportas 100 € el 05/10 y anotas una valoración de 1.600,00 € el 15/10.

- [ ] Balance de septiembre: ingresos 1.508,00 € y gastos netos 1.168,28 € dan balance 339,72 € y ahorro 22,5 %.
- [ ] Devoluciones de amigos: un gasto de 100 € en Ocio y cuatro devoluciones de 15 € en Ocio dan 40,00 € de gasto en Ocio, y los ingresos no cambian.
- [ ] Traspaso: pasar 100 € de BBVA a Trade Republic deja el balance igual y el patrimonio igual; BBVA baja 100 € y Trade Republic sube 100 €.
- [ ] Valor sin valoración nueva: Trade Republic vale 1.572,56 € el 10/10 (1.472,56 + 100 aportados).
- [ ] Valor con valoración: Trade Republic vale 1.600,00 € el 15/10 y sigue en 1.600,00 € el 20/10 si no hay más movimientos ni valoraciones.
- [ ] Revalorización: del 30/09 al 15/10 es +27,44 € (127,44 € de subida menos 100 € aportados), y no aparece en el balance.
- [ ] Mes sin ingresos: el ahorro muestra «—» y no un error ni infinito.
- [ ] Fin de mes: el 31/10 se compara con el 30/09; el 29/03/2027 se compara con el 28/02/2027.
- [ ] Día sin movimientos: el patrimonio del día es igual al del día anterior y la línea no baja a cero.
- [ ] Hoy: el punto de hoy aparece como provisional y no se dibujan días futuros.
- [ ] Fecha real: un gasto apuntado el martes 20/10 con fecha sábado 17/10 aparece el 17/10 en el gráfico, la lista y el balance.
- [ ] Categoría en negativo (solo devoluciones antiguas sin vincular, pendientes de revisión): si en un mes Otros gastos tiene 20 € de gasto y 50 € de devoluciones sin vincular, muestra −30,00 € sin porcentaje y no entra en el gráfico circular; el resto de categorías suman 100 %.
- [ ] Devolución en otro mes *(cifras inventadas)*: un gasto de 80,00 € en Ocio el 28/09 y una devolución vinculada de 20,00 € el 03/10 dan 60,00 € de Ocio en septiembre y no cambian octubre; los ingresos no cambian; el saldo de la cuenta sube 20,00 € el 03/10; las devoluciones desplazadas valen −20,00 € en la variación de septiembre y +20,00 € en la de octubre.
- [ ] Devolución sin vínculo *(cifras inventadas)*: una devolución nueva de 10,00 € sin gasto original se rechaza, venga de la web, del atajo o de un insert directo.
- [ ] Fecha de la devolución *(cifras inventadas)*: con un gasto del 10/10, una devolución vinculada con fecha 09/10 se rechaza; con fecha 10/10, se acepta.
- [ ] Devoluciones desplazadas sin duplicar *(cifras inventadas)*: en el caso «Devolución en otro mes», la suma de septiembre y octubre de las devoluciones desplazadas es 0,00 €; los 20,00 € suben el patrimonio una sola vez, el 03/10, y restan del gasto una sola vez, en septiembre.
- [ ] Resumen del filtro *(cifras inventadas)*: con un ingreso de 100,00 €, un gasto de 30,00 €, una devolución de 10,00 € y un traspaso de 50,00 € en el filtro, da Entradas 110,00 € (de ellas 10,00 € de devoluciones), Salidas 30,00 € y Neto 80,00 €, con el traspaso aparte; los ingresos del periodo siguen siendo 100,00 €.
- [ ] Devoluciones que superan el gasto *(cifras inventadas)*: con un gasto de 80,00 € y una devolución vinculada de 60,00 €, otra de 20,01 € se rechaza y otra de 20,00 € se acepta (gasto neto 0,00 €, nunca negativo).
- [ ] Borrar el gasto original *(cifras inventadas)*: un gasto con una devolución vinculada no se puede borrar; al borrar antes la devolución, sí.
- [ ] Porcentaje con base cero: si el mes anterior tuvo 0 € de ingresos, la tarjeta dice «Sin datos del mes anterior».
- [ ] Importes positivos: la base rechaza un importe negativo o cero. Un importe que llega como «-24» se normaliza a 24,00 € (parser propio, sin depender del canal), y una devolución con ese importe, vinculada a su gasto, se guarda como 24,00 € con tipo Devolución.
