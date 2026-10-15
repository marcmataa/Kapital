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
| Devolución | Carlota te devuelve 24 € de un regalo | Resta de los gastos de su categoría; no es ingreso | Sube | Entra en la cuenta destino |
| Traspaso interno | BBVA → Trade Republic 100 €; sacar 50 € del cajero | No cuenta | No cambia | Sale de una cuenta tuya y entra en otra |
| Rendimiento cobrado | Intereses o dividendos que llegan a la cuenta | Suma a ingresos, categoría Rendimientos | Sube | Entra en la cuenta donde se cobra |
| Ajuste | Corregir un descuadre del saldo real | No cuenta | Cambia | Corrige una cuenta |

Reglas de clasificación:

- Si el dinero sale de una cuenta tuya y llega a otra cuenta tuya, es traspaso, aunque el banco lo llame transferencia.
- Si alguien te devuelve dinero de algo que pagaste tú, es devolución de la categoría del gasto original, no ingreso.
- Si te pagan por algo que no es un gasto previo (nómina, regalo, venta), es ingreso.
- Un ajuste solo se usa para cuadrar con el saldo real del banco y se muestra aparte, nunca mezclado con gastos o ingresos.

## 3. Balance mensual y ahorro

El balance mensual mide lo que te sobra del mes con tu actividad normal. Septiembre 2026: 1.508,00 € de ingresos menos 1.168,28 € de gastos = 339,72 € de balance, un 22,5 % de ahorro.

```
Gastos netos = Σ Gastos − Σ Devoluciones
Balance      = Σ Ingresos − Gastos netos
Ahorro (%)   = Balance / Σ Ingresos × 100
```

- **Entra:** gastos, ingresos, devoluciones y rendimientos cobrados con fecha dentro del mes.
- **No entra:** traspasos internos, ajustes y cambios de valor de las inversiones.
- **Mes:** del día 1 a las 00:00 al último día a las 23:59:59, hora de Madrid, por la fecha del movimiento.
- **Ahorro sin ingresos:** si los ingresos del mes son 0 €, el porcentaje no se calcula y se muestra «—».
- **Balance negativo:** se muestra en rojo con signo menos; el ahorro también sale negativo (por ejemplo, −15,0 %).
- **Mes en curso:** el balance es provisional hasta que acaba el mes y se marca como «hasta hoy».

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

La variación patrimonial es la diferencia entre el patrimonio de dos fechas, y siempre se explica con tres piezas: el balance del periodo, el rendimiento de las inversiones y los ajustes. Los traspasos internos suman cero.

```
ΔPatrimonio = Patrimonio(D2) − Patrimonio(D1) = Balance + Revalorización + Ajustes
Revalorización de una inversión = (Valor(D2) − Valor(D1)) − Flujos netos registrados en esa cuenta
```

Los flujos netos de una cuenta de inversión son lo que entra (aportaciones, ingresos cobrados en ella) menos lo que sale (retiradas, comisiones registradas como gasto). Así, meter 100 € no cuenta como ganancia y sacar 100 € no cuenta como pérdida.

Ejemplo de un mes con patrimonio inicial de 2.000,00 €:

| Pieza | Importe | De dónde sale |
|---|---|---|
| Balance del mes | +300,00 € | Ingresos menos gastos netos |
| Traspaso BBVA → Trade Republic | 0,00 € | −100 € en BBVA y +100 € en Trade Republic |
| Revalorización | +27,44 € | Trade Republic pasa de 1.472,56 € a 1.600,00 € (+127,44 €) con 100 € aportados |
| Ajustes | 0,00 € | Ninguno |
| **Variación patrimonial** | **+327,44 €** | Patrimonio final: 2.327,44 € |

La app debe mostrar el balance y la variación patrimonial por separado. Si la variación es mayor que el balance, la diferencia viene de las inversiones o de ajustes, nunca de «ingresos ocultos».

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

Las tarjetas de ingresos y gastos del mes en curso usan la misma idea: del día 1 a hoy, contra del día 1 al mismo día d' del mes anterior. Al cerrar el mes, la comparación pasa a ser mes completo contra mes completo.

## 8. Comparativas, categorías y métodos de pago

Toda comparación enfrenta periodos de la misma longitud y del mismo tipo; si falta uno de los dos, no se muestra porcentaje.

```
Variación (%) = (Actual − Anterior) / |Anterior| × 100
```

- Base cero o sin datos: si el periodo anterior vale 0 € o no existe, se muestra «Sin datos del mes anterior» en lugar de un porcentaje.
- Color por significado, no por signo: que suban los ingresos o el balance es verde; que suban los gastos es rojo.
- Interanual: solo aparece cuando hay al menos 12 meses de datos. Compara un mes con el mismo mes del año anterior (octubre 2026 con octubre 2025) o el año en curso hasta hoy con el mismo tramo del año anterior.
- Media mensual: se calcula solo con meses completos; el mes en curso no entra.

Gasto por categoría:

```
Gasto de la categoría c = Σ Gastos de c − Σ Devoluciones de c
```

- El porcentaje de cada categoría se calcula sobre los gastos netos del mes; todos juntos suman 100 %.
- Si una categoría queda en negativo (te devuelven más de lo que gastaste ese mes en ella), se muestra el número en negativo pero no entra en el gráfico circular, que solo admite valores positivos.
- Los ingresos tienen sus propias categorías (Nómina, Otros ingresos, Rendimientos) y nunca se mezclan con las de gasto.

Métodos de pago: suma de gastos por método (tarjeta, Apple Pay, efectivo, Bizum, transferencia, domiciliación). Las devoluciones no restan aquí, porque esta vista responde a «cómo pago», no a «cuánto gasto».

## 9. Casos especiales

Estos son los casos que ya han aparecido en tus datos y cómo se registran para que los números cuadren.

| Situación | Cómo se registra | Efecto en el balance |
|---|---|---|
| Pagas 100 € de entradas y 4 amigos te hacen Bizum de 15 € | 1 Gasto de 100 € (Ocio) + 4 Devoluciones de 15 € (Ocio) | Gasto neto de Ocio: 40 € |
| Amazon te devuelve 9,91 € de un pedido | Devolución de la categoría del pedido, no Ingreso | Baja el gasto de esa categoría |
| Sacas 50 € del cajero | Traspaso BBVA → Efectivo; el gasto se apunta cuando gastas ese efectivo | Ninguno al sacar |
| Retiras 30 € de Trade Republic a BBVA | Traspaso Trade Republic → BBVA | Ninguno |
| Ahorras 200 € en Trade Republic | Traspaso BBVA → Trade Republic | Ninguno; tu ahorro ya está en el balance |
| Trade Republic te paga intereses o dividendos | Ingreso, categoría Rendimientos, destino Trade Republic | Suma a ingresos |
| Tu cartera sube 27 € sin que metas dinero | Valoración nueva; no es movimiento | Ninguno; sube el patrimonio |
| La nómina llega en varios pagos | Un Ingreso por cada pago, categoría Nómina | Suman todos en su mes |
| Un regalo de cumpleaños por Bizum | Ingreso, categoría Otros ingresos | Suma a ingresos |
| El saldo de la app no coincide con el banco | Ajuste por la diferencia, con nota | Ninguno; se muestra aparte |
| Pagas una cena de 80 € y te deben 60 € que aún no han pagado | Gasto de 80 €; cuando llegue el Bizum, Devolución de 60 € con su fecha real | El mes del gasto cuenta 80 € hasta que llegue el dinero |

Regla de fechas: cada movimiento lleva la fecha en que ocurrió. Si apuntas el martes un gasto del sábado, su fecha es el sábado; la hora de registro se guarda aparte, solo como dato técnico.

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
| Ingreso, Devolución, Rendimiento | Vacía | Obligatoria |
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
- [ ] Categoría en negativo: si en un mes Otros gastos tiene 20 € de gasto y 50 € de devoluciones, muestra −30,00 € y no entra en el gráfico circular.
- [ ] Porcentaje con base cero: si el mes anterior tuvo 0 € de ingresos, la tarjeta dice «Sin datos del mes anterior».
- [ ] Importes positivos: la base rechaza un importe negativo o cero, y una devolución que llega como «-24» se guarda como 24,00 € con tipo Devolución.
