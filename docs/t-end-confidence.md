# Estratos de concordancia del final T — desarrollo, no confianza clínica

Base: PR30 integrado, `b46f11c0782add7d2081dd113f9c0b41a7339d6a`.

PR30 redujo muchos errores de final T, pero conservó una cola de hasta 120 ms. Este bloque no cambia el detector ni QT: caracteriza si propiedades internas disponibles sin referencia identifican un subconjunto más estable y documenta explícitamente la cobertura perdida.

Se analizaron sólo los 277 finales comparables ya expuestos: 124 original40 y 153 calibration40. Se exploraron dispersión interderivación, concordancia entre ventanas, número de derivaciones, heterogeneidad de amplitud, posición en ventana y demora desde el pico. La regla elegida **después de observar esos errores** es dispersión <=6 ms y razón de amplitud de área máxima/mínima <=3.

En la exploración combinada retuvo 91/277 (32,9%): MAE 6,95 ms, p95 21 ms, máximo 34 ms, frente a MAE 9,66 ms, p95 34 ms y máximo 120 ms en todos. Original40: 48/124, MAE 7,67 ms, p95 ~22 ms, máximo 30 ms. Calibration40: 43/153, MAE 6,14 ms, p95 ~20 ms, máximo 34 ms. Los 10 errores >=50 ms del conjunto combinado quedaron fuera del estrato alto.

Esto es descriptivo y probablemente optimista: los umbrales fueron seleccionados sobre los mismos datos y latidos/derivaciones están correlacionados. `high-agreement` no significa seguro, validado ni probabilidad. Todos los candidatos de menor concordancia permanecen visibles y en el informe; no se mejora el MAE ocultándolos.

La próxima compuerta antes de cualquier QT automático es evaluación con un conjunto externo intacto o protocolo prospectivo congelado antes de observar errores.

## Evaluación posterior de la reserva

La primera evaluación prospectiva posterior no cumplió los límites congelados
de p95 y error máximo, con sólo 11,95% de cobertura de referencias en el estrato
alto. Ver [resultados completos y límites](t-end-reserved-evaluation.md). Los
números de desarrollo anteriores siguen siendo retrospectivos; la reserva ahora
está expuesta y no debe volver a describirse como intacta. No se habilitó QT
automático ni se reajustaron umbrales para corregir el resultado.
