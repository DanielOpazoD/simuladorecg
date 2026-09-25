# Auditoría profunda PR2 — evaluación LUDB preseleccionada

## Qué se fija antes de observar resultados

`tests/reference/ludb-expansion/protocol.json` define 40 IDs seleccionados por el
orden SHA-256 de una semilla publicada. Excluye 1–4 y 101–104, los ocho registros
ya conocidos. La selección no usa trazados, diagnósticos, calidad ni resultados.
Se fija en Git antes de que CI descargue/evalúe el conjunto. Tras esa ejecución
se denomina **cohorte externa evaluada**, no holdout reutilizable.

Se congela por hash el analizador y todas sus dependencias reales. El bundle se
limita a `measure.ts`; no contiene generador, calendario o auditoría del modelo.
El PR no ajusta detector, tolerancias ni perfiles para mejorar el resultado.

## Referencia, denominadores y límites

Se reutiliza la calibración del lector LUDB 1.0.1 y sin cambios la agregación I/II/V1/V5.
La corrección del lector tras el fallo inicial se documenta abajo.
No equivale a una anotación global original: II ancla identidades, los extremos
son min/max entre cuatro derivaciones con cobertura completa. Los grupos no
emparejables y los límites ausentes se contabilizan; no se imputan.

Emparejamiento de eventos uno-a-uno, cardinalidad máxima, tolerancia 150 ms;
**no es tolerancia de precisión de límites**. Se evalúa la ventana anotada y se
publica también el número de detecciones externas a ella. Onset, offset y duración
tienen sus propios n, MAE, sesgo, p95 absoluto y máximo. Se publica cobertura
respecto de referencias elegibles y de todos los eventos, agregación micro y
media de MAE por registro. Sin presentar latidos como pacientes independientes,
intervalos de confianza ficticios, ni afirmaciones de superioridad sin comparador.

Las descargas fallan por checksum o falta de datos: nunca excluyen silenciosamente
un ECG difícil. La comprobación WFDB independiente compara cada muestra física y
cada anotación antes de evaluar. El loader existente convierte a Float32; la
verificación de lectura compara Float64 antes de esa conversión.

## Ejecución (fuera del producto)

```sh
python -m pip install wfdb==4.3.1
python scripts/prepare-ludb-expansion.py --output .sites-runtime/ludb-expansion --crosscheck
node scripts/validate-ludb-expansion.mjs --fixtures .sites-runtime/ludb-expansion/fixtures --output .sites-runtime/ludb-expansion/report.json
```

El workflow `external-reference.yml` ejecuta esta evaluación separada del suite
sin red. Un éxito CI significa protocolo/integridad/ejecución correctos, **no**
aprobación de exactitud clínica. Las cifras se conservan en su artefacto incluso
si son malas; los comentarios/demografía del header no se redistribuyen.

Fuente: Kalyakulina et al., LUDB v1.0.1, DOI 10.13026/eegm-h675; publicación IEEE
Access 2020, DOI 10.1109/ACCESS.2020.3029211.
https://physionet.org/content/ludb/1.0.1/
Licencia de datos: Open Data Commons Attribution 1.0, conservada en el artefacto.
No cambia LICENSE del código. No valida P/PR/T/QT, ST, población clínica, ni el
realismo del generador. Nuevas mejoras del detector requieren otro protocolo;
no cambiar estos hashes para aparentar que el analizador permaneció congelado.

## Corrección de adquisición antes de evaluar (PR #17)

La primera ejecución 36178101569 se detuvo en un marcador de límite sin pico
asignable, antes de ejecutar el detector. La cohorte de 40 IDs y los hashes del
analizador no se cambian. El lector conserva ahora esos paréntesis como eventos
no asignados en cada registro/derivación y en `annotation-integrity.json`.
No inventa ondas ni asocia límites no adyacentes. Picos sin onset/offset siguen
con null. Se cuentan estos eventos aparte: no equivalen a QRS de referencia
elegibles. Se mantienen todos los registros y la lista completa de eventos se
coteja con `wfdb.rdann`. El comportamiento estricto histórico sigue por defecto.

Las pruebas del parser usan bytes construidos independientemente, cubren marcas
huérfanas, límites ausentes, SKIP y truncamiento. Esta enmienda de preparación no
es un ajuste del detector tras observar precisión; tampoco corrige manualmente
las anotaciones humanas. Los resultados publican los límites de la referencia.
