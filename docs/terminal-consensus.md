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

## Resultado reservado y decisión pendiente

La reserva de 32 registros se adquirió tras congelar el candidato. El lector
WFDB 4.3.1 confirmó exactamente 1.920.000 muestras físicas y 28.101 eventos de
anotación. Ningún resultado ajustó el algoritmo.

El primer intento abortó por un contrato estructural del evaluador: en el registro
138, tanto el producto anterior como el candidato sitúan un centro de detección
QRS una muestra (2 ms a 500 Hz) después del límite QRS. El QT está ausente en ambos.
La reparación versionada `terminal-consensus-evaluation.mjs` admite únicamente
esa discretización de una muestra para centros QRS previstos. No mueve valores,
referencias ni límites; conserva y puntúa el error y registra cada excepción.
P/T y referencias siguen estrictos; dos muestras todavía fallan. El evaluador
original y su protocolo permanecen intactos. El addendum fija los nuevos archivos
sin cambiar el algoritmo, cohorte ni metas.

Resultado completo con esa reparación:

- QT: 3/31 → 11/31 registros con referencia elegible. MAE de los 11 nuevos
  resúmenes: 14,80 ms; máximo 24,17 ms. Siete se consideran utilizables por los
  criterios de ingeniería, con máximo 23 ms.
- Final T: 53/244 → 125/244; MAE 90,83 → 12,57 ms, p95 45 ms, máximo 116 ms.
- Cumplen las metas absolutas QT, cobertura, terminales y confianza.
- **No cumple la meta emparejada**: solo hay dos pares (se exigían tres), cuyo
  MAE pasa de 7 a 20,90 ms. Registro 30: +4 → −24,17 ms; registro 72:
  +10 → −17,62 ms. Un resumen previo se retira. El resultado global del protocolo
  sigue siendo **fallido**, sin redefinirlo como éxito.

Se ha solicitado al mantenedor una decisión explícita sobre este intercambio
entre cobertura y precisión de esos pares. Hasta esa decisión y el cierre de
los demás controles, el PR permanece en borrador.

## Ruido: intercambio explícito, no regeneración del resultado anterior

En los 920 escenarios conocidos, permanecen idénticas las muestras generadas,
73.440 comparaciones morfológicas, detección, FC y QRS. En QT:

- Observaciones utilizables correctas: 1.014 → 1.448.
- Observaciones utilizables erróneas: 146 → 1.
- Observaciones correctas conservadas: 1.143 → 2.161.
- Observaciones erróneas conservadas: 320 → 69.

La comparación estricta por estrato conserva 23 fallos; 22 estratos pierden alguna
observación correcta/utilizable. **No se presenta como no-regresión estricta.**
El criterio revisado exige conservar cada escenario limpio y la cobertura
correcta agregada, reducir al menos 90% los errores utilizables y 50% los retenidos,
y no introducir errores utilizables en un modo de adquisición disponible.
El único error utilizable nuevo del analizador bruto ocurre con ruido basal
0 dB y filtro demostrativo de 2 Hz; el contrato de adquisición ya retira su
confianza en la interfaz. Se conserva ese resultado bruto, no se borra.

El comparador verifica que el informe fue producido por exactamente los archivos
congelados. Conserva la referencia histórica, todos los fallos por estrato y los
resultados adversos. Es un intercambio de ingeniería posterior al desarrollo,
no validación clínica ni una reserva nueva de ruido.

La migración histórica de ST se reproduce con el producto ST publicado
`10e3f39764ca3bf83f2fc9b543d4960ee12c1080`, no con el nuevo delineador QT.
Así no se atribuyen cambios de QT al antiguo contrato del generador. En paralelo,
la comparación actual sigue exigiendo identidad de fuente y morfología frente
al baseline ST y aplica el intercambio QT solo con `--terminal-consensus`.
El comando sin ese argumento conserva su rechazo estricto original.
