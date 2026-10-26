# Continuidad local de los controles actuales

## Protocolo previo a la ejecución

Este contrato se fija antes de ejecutar la nueva matriz. No modifica modelos,
adquisición, calendario ni analizador. Audita muestras originales a 500 Hz,
adquisición ideal, filtro apagado y variabilidad RR nula. El antialias del motor
sigue activo. No utiliza el analizador para aprobar al generador.

Las semillas 1129 y 2081 son casos de software fijados para esta ronda; no son
pacientes independientes ni una reserva clínica. Se ensayan por separado NORM
aprendido y núcleos explícitos (`learnedBase: false`), sin tratar estos últimos
como una caída automática del producto. Se conservan los mismos 10 s y semilla
en cada pareja. El rango examinado no representa todo el dominio de controles.

| Control | Barrido fijado | Criterio previo y control negativo |
| --- | --- | --- |
| PR | 240, 242, 244, 246, 248 ms, 40 lpm | Mismas P y duraciones ventriculares; cada QRS se desplaza 2 ms. La P temprana aislada por sustracción P=0 permanece igual a `1e-10 mV`. Las muestras ventriculares deben cambiar: un control inerte no pasa. La revisión añadió, antes de ejecutar ese subensayo, distancia RMS <20 % en QRS alineado con P=0; véase la enmienda abajo. |
| Duración QRS | 116, 118, 120, 122, 124 ms, 60 lpm | Mismo calendario de activación y QT. Las muestras dentro del complejo cambian; la intervención no puede sustituir la familia. La distancia RMS de una pareja local es <20 % del RMS de ambos registros en ventanas QRS, con señal no vacía. |
| QTc | 440, 442, 444, 446, 448 ms, 60 lpm | Mismo calendario y QRS temprano aislado de la transición a ST (50 ms antes de J). El QT realizado crece y la repolarización muestreada responde. Distancia RMS local <20 % del RMS de ambas señales en repolarización. |
| Frecuencia | 59, 59,5, 60, 60,5, 61 lpm | Los ciclos ventriculares interiores se acortan estrictamente y el registro cambia. Tras alinear un complejo interior por su activación, su distancia RMS QRS es <20 %; no se exige igualdad de QT ni de la fase respiratoria. |
| Ganancia QRS | 0,6, 0,8, 1,0, 1,2, 1,4 | Calendario idéntico. Las segundas diferencias de las muestras son <`1e-10 mV` (respuesta afín dentro de la familia); incrementos no nulos. La ganancia de presentación, como control negativo, no cambia ninguna muestra. |

El límite relativo del 20 % es una alarma de discontinuidad de software para
estos incrementos pequeños, fijada antes de observar resultados. No demuestra
diferenciabilidad global, fidelidad clínica ni una tolerancia de medición. El
comparador calcula diferencias directamente de las muestras, sin invocar el
renderer, kernels, fórmulas de amplitud o corrección QT como oráculo. Los eventos
solo sitúan las ventanas y permiten inspeccionar el calendario del propio modelo.
La igualdad aritmética de P requiere aislarla: mover QRS puede desplazar Ta o
colas previas legítimamente. Para frecuencia se interpola linealmente la señal
muestreada en coordenadas relativas al QRS; se informa esa limitación.

Los cambios discretos normal→BRI, normal→HVI y BRI→BRI+HVI se ensayan aparte.
Se exige que la procedencia efectiva cambie con la población/ruta, que la señal
cambie y que ninguna ruta afirme validación clínica completada. No se exige
continuidad morfológica entre poblaciones diferentes, ni se suaviza ese salto.

## Decisión y resultados

### Enmienda de revisión previa al subensayo adicional

La revisión independiente identificó que calendario correcto y respuesta no nula
no excluyen un salto arbitrario de morfología QRS al mover PR. Antes de ejecutar
esa comprobación adicional se fija: comparar las dos señales P=0 en la ventana
desde activación hasta +170 ms, alineándolas por el desplazamiento de sus QRS;
RMS de señal >0,01 mV y distancia RMS relativa <20 %. Se usa el mismo comparador
y alarma técnica ya fijados para otros controles, sin imponer identidad exacta
de fase respiratoria. Este criterio no estaba cubierto por los 22 primeros pases.
Se explicitan además las parejas de transición normal→BRI, normal→HVI y
BRI→BRI+HVI: comparar solo cada ruta contra normal no comprobaba la última pareja.
Resultado de la ejecución posterior a la enmienda: **22/22 tests pasan**, incluidos
el QRS alineado para cada paso PR y las tres parejas de transición. No apareció
un fallo nuevo y el margen del 20 % se conservó sin cambios. No se añadieron
registros: se reutilizan las señales P=0 y las rutas de la matriz original.

La primera ejecución de la matriz pasó los **22 tests** con los márgenes y valores
anteriores intactos: 20 ensayos (cinco controles × dos familias × dos semillas) y
dos ensayos de transiciones discretas. Se sintetizan 132 registros, incluidos los
controles de aislamiento P=0 y de presentación. No son 132 pacientes ni medidas
independientes de prevalencia. No se detectó un resultado adverso en este dominio
local y no se modificó código productivo para obtener el resultado.

No se ensayaron aquí artefactos, filtros diagnósticos/monitor, prematuridad,
confluencia P/T, extremos que activan límites de soporte ni todo el catálogo.
Esos dominios conservan sus contratos previos; este resultado no los sustituye.
La invariancia del ruido frente a la duración continúa pendiente y su candidato
con regresiones no forma parte de este cambio. Ningún margen fue ampliado después
de ver los resultados. Si una extensión falla, debe conservarse el caso y su
resultado, e investigarse tanto el modelo como la hipótesis de invariancia antes
de cambiar código.

```sh
node node_modules/vitest/vitest.mjs run tests/control-continuity.test.ts tests/electrophysiology-interventions.test.ts tests/causal-comparison.test.ts
```

No se elevan afirmaciones de plausibilidad sin evidencia externa y revisión
clínica independiente. La comprobación de procedencia en transiciones verifica
el contenido que consume el panel existente, no una lectura humana de ese panel.
