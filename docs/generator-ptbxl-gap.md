# Comparación morfológica: reparar resultados vacíos antes de ajustar el generador

Base revisada: PR33, `91519b2ea3b052f5cd22db6802f674bab6981b96`.

## Fallos reproducidos

El comparador buscaba `q25/q75` en resúmenes que sólo exponen `p05/median/p95`.
Con el artefacto real del PR33 terminaba correctamente pero producía 385 filas
sin ninguna referencia, cero discrepancias y `largestMI: []`. Eso NO demostraba
que el generador concordara con ECG reales. La prueba anterior sólo examinaba
texto del script, no ejecutaba la comparación.

Además, la tarea separada esperaba otra ejecución mediante GitHub CLI, aunque
no declaraba `actions: read` y podía activarse sin que se activara su productor.
Ahora la comparación es un paso obligatorio del workflow PTB-XL+ existente,
inmediatamente después del cálculo de muestras: mismos archivos, mismo commit,
sin descargas duplicadas ni espera entre workflows. La adquisición histórica,
cohorte, lectores, hashes y comprobación `product freeze` permanecen intactos.

## Comparación corregida

Se calculan cuartiles tipo 7 directamente de los registros ya medidos, sin
inventarlos a partir de percentiles extremos. Las 400 combinaciones previstas
(10 presets × 8 derivaciones × 5 métricas) permanecen en el informe. Ausencias,
IQR cero y errores de esquema son explícitos; nunca se divide por un epsilon
artificial. Un conjunto sin comparaciones útiles falla, en vez de aparentar éxito.

## Discrepancia de escala: NO corregida por conjetura

En 488 parejas de QRS pico-pico (mismo ECG/derivación/proveedor), el cociente
muestras/tablas tiene mediana 999,618 y cuartiles 996,638–1003,950. La comparación
WFDB anterior confirma la decodificación según encabezados, NO que la escala
publicada sea fisiológicamente correcta. Los encabezados 12SL dicen mV, mientras
la documentación general declara 1 µV/LSB y formato 16; los archivos observados
son formato 32. No se cambia la ganancia ni se aplica /1000 silenciosamente.

Una comprobación de ingeniería cruza QRS pico-pico medido con la tabla armonizada
12SL. Un cociente mediano fuera de 0,5–2 señala conflicto grueso de escala; ese
intervalo NO es un umbral clínico ni certifica las unidades. Sin soporte tabular,
la amplitud queda no verificada. En estos datos se bloquean las 240 comparaciones
de amplitud por grupo; siguen utilizables FWHM T y T/QRS, invariantes ante un
factor de voltaje positivo común dentro de cada derivación. Las 15 métricas
sintéticas ausentes se conservan. Quedan 145 comparaciones por grupo.

Fuentes primarias para la discrepancia documental:
- https://physionet.org/content/ptb-xl-plus/1.0.1/
- https://physionet.org/content/ptb-xl-plus/1.0.1/median_beats/12sl/14000/14203_medians.hea
- https://doi.org/10.1038/s41597-023-02153-8

El origen exacto del factor de escala permanece pendiente de confirmación;
no se atribuye al generador ni se presenta el bloqueo como corrección de los datos.

## Alcance

Las clases NORM/MI/STTC son superpuestas, no cohortes de oclusión aguda/territorio.
Las ventanas externas son automáticas 12SL; las sintéticas usan eventos conocidos.
El ranking es descriptivo: ningún coeficiente puede cambiarse sólo para acercarlo
al IQR. No modifica `src/`, señales, QT, filtros, catálogo ni protocolos históricos.
Los SHA256 de los tres informes de entrada quedan dentro del informe de salida.

Nueve pruebas funcionales cubren cuartiles, ceros, ausencias, IQR cero, escala1000,
no mutación, duplicados y resultados vacíos. Se ejecutan en Vitest/CI; las mismas
aserciones se ejecutaron localmente con Node22.16 y node:test. La instalación
limpia y la suite completa se verifican en CI, no se presuponen del ensayo local.
