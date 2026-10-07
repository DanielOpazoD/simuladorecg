# Referencias originales: morfología y auditoría de escala

La coincidencia entre nuestro lector y WFDB demuestra que aplicamos las mismas
reglas de decodificación. No demuestra que la escala publicada represente el
voltaje original del paciente. Antes de calibrar el generador se contrastaron
las ganancias, el rango digital y las identidades entre derivaciones.

## Hallazgo en LUDB

En los 80 registros previamente expuestos (original40 y calibration40), las
960 ganancias declaradas coinciden exactamente con el rango digital de su canal.
La conversión literal produce un rango de 1 mV declarado en cada canal. Los
80 registros cumplen exactamente II = I + III en valores digitales; después
de aplicar ganancias distintas por canal, la mediana del residuo RMS es
0,061688 mV declarados.

Es evidencia compatible con normalización independiente por canal, no una prueba
del procedimiento interno del publicador. No inferimos una ganancia original
alternativa ni dividimos arbitrariamente por 1000. Se bloquean esas amplitudes
absolutas como objetivos para el simulador. Tampoco se usan relaciones de voltaje
entre derivaciones para validar el eje o la progresión precordial.

El extractor conserva las características invariantes ante una ganancia positiva
por derivación: anchura T a media altura, simetría y T/QRS dentro de la misma
derivación. Usa límites humanos originales, sin el detector ni eventos del
simulador. Cada registro aporta una mediana por derivación/métrica; no se cuentan
sus latidos como pacientes independientes. No se interpretan distribuciones
heterogéneas como rangos normales.

Se conservaron 8.746 QRS anotados en 960 registros-derivación. Hubo 6.961 ventanas
admitidas; 898 no tenían asociación T única disponible, 819 tenían solapamiento
anotado en la ventana basal y 68 tenían límites QRS incompletos. Las ausencias
permanecen en los denominadores. En 810 ventanas J+60 caía dentro de T: no se
presenta automáticamente como una medida aislada del ST. Una ventana sin
solapamiento anotado tampoco certifica una línea isoeléctrica ni ausencia de ruido.

## Control con PTB-XL original

Se releyeron los 64 registros originales de la selección previa, sin seleccionar
nuevos pacientes. Se cotejaron sus archivos con SHA256SUMS y cada una de las
3.840.000 muestras con el dato digital convertido según el encabezado. Las
768 ganancias son 1000 cuentas/mV, coherentes con la resolución de 1 µV/LSB
publicada para los originales de 500 Hz. Ninguna coincide con el rango digital
del canal en esta selección. El residuo RMS máximo de II−I−III es 0,000436 mV,
compatible con la cuantización. Los rangos completos son variables, no todos 1.

Esto respalda la escala declarada de esos originales; no convierte el rango
completo de diez segundos en amplitud QRS/T anotada. Los latidos medianos 12SL
continúan separados y en cuarentena por el conflicto de unidades previo. No se
trasladan al original sus ventanas de tiempo de 1,2 segundos.

## Reproducción y límites

- `scripts/reference-annotated-morphology.mjs --original RUTA_ORIGINAL40 --calibration RUTA_CALIBRATION40 --output SALIDA` verifica identidades de las cohortes, produce todas las filas y bloquea referencias absolutas LUDB
- `scripts/audit-original-source-scale.mjs --original RUTA_ORIGINALES_PTBXL --raw RUTA_RAW_PTBXL --output INFORME` contrasta originales con sus bytes y manifiesto verificados
- `tests/source-scale.node.mjs` demuestra que una aritmética WFDB coherente puede conservar una normalización, sin establecer calibración clínica
- Las pruebas de morfología comprueban unidades, invariancia a DC/ganancia, ausencia, ambigüedad, solapamiento y conservación de entradas

No se modifican registros, detectores ni generador. La reserva usada por la
evaluación de final T permanece fuera de esta referencia morfológica de 80
registros. Los resultados temporales previos siguen describiendo el desempeño
sobre la conversión literal publicada; no certifican amplitudes clínicas ni
transportabilidad a otras escalas. No se ajustan resultados adversos ni umbrales.

Fuentes primarias:
- [LUDB 1.0.1 y descripción de anotaciones](https://physionet.org/content/ludb/1.0.1/)
- [README original de LUDB](https://physionet.org/files/ludb/1.0.1/README)
- [Artículo original de LUDB](https://arxiv.org/abs/1809.03393)
- [PTB-XL 1.0.3: resolución y originales](https://physionet.org/content/ptb-xl/1.0.3/)
