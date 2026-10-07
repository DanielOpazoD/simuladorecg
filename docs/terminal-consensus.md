# Reemplazo numérico del final T y QT

Estado: candidato congelado; no integrar hasta completar el conjunto reservado,
la regresión de ruido, pruebas de navegador y todos los controles del commit.
No es validación clínica ni un dispositivo diagnóstico.

## Problema y solución

El retorno al nivel basal podía confundir una cola de filtrado con repolarización,
y el corte posterior por pendiente podía truncar una T bifásica débil. Una
corrección por área añadida después del cálculo tampoco resolvió ambos errores.
Se conserva su resultado fallido en `evidence/qt-reconciliation-v1-results.json`
y su protocolo original, sin renombrar los 40 registros como una nueva reserva.
Ese candidato y su commit histórico no se integran.

El reemplazo calcula un único final T a partir de las muestras:

- Copia de análisis privada, filtrado de fase cero y banco estacionario de wavelets.
- Búsqueda de ambas polaridades fuera del QRS realmente detectado; nunca usa
  tiempos, diagnósticos ni eventos del generador.
- Un retorno basal observado requiere corroboración wavelet en tres derivaciones.
  Se admiten dos solo cuando las otras proyecciones son exactamente constantes
  en ese intervalo, sin inventar una dirección frontal.
- Una tangente necesita cuatro derivaciones concordantes, acuerdo terminal de
  20 ms y ausencia de un lóbulo posterior competidor. El punto resultante combina
  ambas estimaciones.
- Si lo anterior no basta, prominencia y wavelets deben coincidir en pico y final
  en al menos tres derivaciones, dentro de 40 ms. Un lóbulo posterior competidor
  impide aceptar prematuramente el final.
- QT/QTc, marcas y exportación derivan del mismo límite elegido. Un pico visible
  puede permanecer sin QT cuando el final no queda respaldado.
- La confianza de QT no puede superar la de sus límites QRS. Se conserva la
  dirección frontal respecto de su línea basal local, no del desplazamiento del filtro.

Estos límites son condiciones de ingeniería seleccionadas sobre datos expuestos;
no son probabilidades, umbrales diagnósticos ni garantía universal de exactitud.
La implementación comparte el banco wavelet entre ambas polaridades: se verificó
igualdad exacta de todas las mediciones en los 120 registros antes y después de
esa optimización. No añade dependencias en producción.

## Evidencia de desarrollo, con denominadores

Comparación emparejada contra `10e3f39764ca3bf83f2fc9b543d4960ee12c1080`:
120 registros LUDB ya expuestos, 119 con referencia QT elegible.

- QT numérico: 29 → 51 registros.
- En los mismos 15 registros medibles por ambos: MAE 37,13 → 14,35 ms;
  error máximo 149 → 31 ms.
- En todos los números de cada versión, con poblaciones distintas: MAE
  59,93 → 13,96 ms; máximo 240 → 46 ms. No confundir esto con la comparación
  sobre los mismos sujetos.
- 36 nuevos resúmenes; 14 retirados, incluidos cuatro con errores previos ≤8 ms.
  Siete pares empeoran: se conservan sus IDs y errores completos en el informe.
- Finales T evaluables: 276/955 → 536/955; MAE 84,59 → 13,01 ms.
  Persiste un marcador con error de 153,30 ms en un registro sin resumen QT.
  La mediana de un registro no oculta ese extremo en la aceptación ni en el informe.

Las anotaciones globales se construyen con el mínimo inicio QRS y máximo final T
en I, II, V1 y V5; no son intervalos globales adjudicados independientemente.
Se comparan números reales, no solo estados de advertencia.

## Reserva y reproducibilidad

`terminal-consensus-prospective-protocol.json` congela el algoritmo, lector,
evaluador, 168 exclusiones y los 32 registros restantes completos antes de su
adquisición. Tras evaluarlos se consideran expuestos y no pueden ajustar este
candidato. Deben pasar los objetivos originales QT de MAE ≤25 ms, p95 ≤60 ms y
máximo ≤100 ms, además de cobertura, extremos terminales y confianza explícitos.
La cohorte sigue perteneciendo a LUDB: no equivale a validación clínica externa.

`validate-terminal-consensus.mjs` conserva cada registro, comparación, retirada,
empeoramiento y fuente. Exige muestras idénticas, el mismo detector, latidos,
P, QRS, FC y ejes no terminales. El resultado previo fallido no se sobrescribe.

## Procedencia

Se adaptan primitivas de NeuroKit2 0.2.13 bajo MIT, con licencia íntegra en
`third_party/NeuroKit2-LICENSE`. La adaptación añade corroboración, ventanas
basadas en QRS observado y búsqueda de ambas polaridades; utiliza interpolación
lineal en vez de la cúbica de referencia. No hereda sus cifras publicadas de
validación. No se copió el repositorio independiente con licencia GPL.

- NeuroKit2: https://neuropsychology.github.io/NeuroKit/_modules/neurokit2/ecg/ecg_delineate.html
- Martínez et al., wavelets: https://diec.unizar.es/~laguna/personal/publicaciones/wavedet_tbme04.pdf
- Emrich et al., prominencia: https://eurasip.org/Proceedings/Eusipco/Eusipco2024/pdfs/0001402.pdf
- LUDB: https://physionet.org/content/ludb/1.0.1/

Los resultados de otras publicaciones, incluyendo evaluaciones por mejor
canal, no se transfieren a este QT global de cuatro derivaciones.
