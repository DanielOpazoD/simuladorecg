# PR3 · Referencia morfológica PTB-XL+, sin modificar ECG Lab

## Alcance

Benchmark descriptivo offline del PR3 de la auditoría profunda, después de PR #17.
No es el antiguo P3 de CI. No modifica `src/`, `public/`, catálogo, filtros,
analizador, versión del producto ni dependencias del producto. Su huella conjunta
está congelada en `benchmarks/ptbxl-plus/protocol.json` desde `d4e4c7d`.
No entrena un modelo, no calibra perfiles, no diagnostica infarto y no usa los
ECG reales como imágenes o plantillas dentro de la aplicación.

## Selección fijada antes de medir

PTB-XL **1.0.3**, PTB-XL+ **1.0.1**. Se excluye por completo a cualquier paciente
con un registro en folds 9/10. Por paciente elegible se elige el menor ECG ID;
se ordenan pacientes por SHA256 de semilla pública + patient_id. Primeros **512**
para las tablas de características; primeros **64** para latidos medianos 12SL.
La selección se escribe antes de descargar características o latidos. No depende
de amplitudes, calidad o diagnóstico y no se reemplazan registros ausentes.
Los folds excluidos no se evalúan; no se afirma que los 512 sean representativos
de una población clínica ni una reserva ciega tras observarlos.

Los estratos ALL/NORM/MI/STTC/CD/HYP se obtienen de SCP con probabilidad positiva
y `diagnostic_class`. Son grupos superpuestos descriptivos, no diagnósticos
angiográficos ni cohortes equilibradas. NORM no se interpreta como normalidad
absoluta cuando coexisten otros códigos. Se conserva un solo ECG por paciente.

## Características y unidades

12SL y Uni-G se informan **por separado**, unidos por `ecg_id`, nunca por fila.
Los CSV publicados ya están armonizados: mV, ms, bpm, grados y mV·ms.
Se coteja cada columna con `feature_description.csv`; no se vuelven a aplicar
sus factores de conversión desde el formato propietario. S/T conservan signo.

Se describen PR, QRS, QT, P, FC; R/S/T, ST en J, amplitud pico-pico QRS, área T
y duración T completa en las doce derivaciones. **R_AxisFrontal_Global de 12SL
no se renombra QRS_AxisFront_Global de Uni-G**. Los ejes se resumen circularmente.
R≥|S| en precordiales es una descripción adicional: requiere las seis parejas,
signos compatibles y ninguna pareja 0/0; no fuerza progresión normal.

Media, desviación estándar muestral y cuantiles tipo 7 son descriptivos. Cada
variable incluye N disponible, N ausente y cobertura. Cero no es un ausente.
NaN/Inf se contabilizan como ausentes; texto numérico malformado y columnas
imprevistas detienen el proceso. No se exige una precisión clínica para CI verde.

## Latidos medianos y medición sobre muestras

Se cotejan los bytes con el SHA256SUMS de la versión. El lector admite WFDB16,
12 canales y 500 Hz, con ganancia, línea basal, unidades, valor inicial y checksum
explícitos. La conversión se contrasta muestra a muestra con **WFDB Python 4.3.1**.
El valor digital reservado −32768 permanece ausente, no voltaje extremo.

Si el productor incluyó prefijos de directorio en el encabezado, se retiran solo
en una copia temporal para WFDB. Se guardan los hashes original/temporal y los
nombres; no se corrigen ganancias mediante heurísticas ni se editan las fuentes.
Un error de integridad o desacuerdo entre lectores impide completar el benchmark.
La ausencia de un latido en el manifiesto queda registrada sin sustitución.

Los límites externos son **automáticos de 12SL**, no anotaciones humanas.
Se usa QRS_On/Off y T_On/Off en ms; basal QRS_On−35 a −20 ms. Límites ausentes,
fuera de señal o desordenados generan abstención explícita, sin inferirlos desde
el detector del simulador. T_On tiene ambigüedad reconocida en la propia fuente.

`tests/support/morphology-metrics.ts`, ya existente, mide ambas clases de señales:
J/J+60, pico-pico QRS, pico/área/anchura/asimetría T y T/QRS. Las áreas de este
extractor están en **mV·s**, a diferencia de las tablas mV·ms. Las claves conservan
la unidad. Se añaden extremos e integral QRS y eje de área desde I/II.

El generador se ejecuta en 61 configuraciones existentes con adquisición limpia
y sin filtro. Sus ventanas proceden de eventos sintéticos y del soporte nativo
de T, no del analizador. Se informa un ejemplar por preset y las abstenciones.
No son diferencias pareadas de pacientes, error diagnóstico ni igualdad de
oráculos. Un rango de referencia no es un objetivo para deformar el ECG hasta
hacerlo coincidir. Esta entrega no calcula una puntuación de fidelidad clínica.

## Ejecución reproducible

```bash
npm ci
python -m pip install wfdb==4.3.1
python -m unittest discover -s tests -p test_ptbxl_reference.py -v
npx vitest run tests/ptbxl-morphology.test.mjs
python scripts/ptbxl-benchmark.py --output .sites-runtime/ptbxl-reference
node scripts/benchmark-ptbxl-samples.mjs .sites-runtime/ptbxl-reference
```

La CI dedicada ejecuta estos pasos antes y después del merge. La CI general
conserva TypeScript/build, contratos de señal y navegador del producto.
El artefacto incluye selección, protocolo, mapeo verificado, distribuciones,
latidos seleccionados, razones de exclusión de ventanas, métricas sintéticas,
procedencia/paquetes, licencia y código exacto. No publica tablas completas,
comentarios clínicos ni datos demográficos. Los resultados nuevos no sobrescriben
la evidencia histórica de LUDB/STAFF; un fallo deja `failure.json` y CI rojo.

## Fuentes y derechos

- Strodthoff et al. PTB-XL+ 1.0.1, https://doi.org/10.13026/g6h6-7g88 ;
  https://physionet.org/content/ptb-xl-plus/1.0.1/ . Características y latidos
  derivados; CC BY 4.0. Se preserva LICENSE.txt de la versión en cada artefacto.
- Wagner et al. PTB-XL 1.0.3, https://physionet.org/content/ptb-xl/1.0.3/ .
  Se usa su metadata/definición SCP; licencia original preservada por separado.
- Diccionario usado: https://physionet.org/files/ptb-xl-plus/1.0.1/features/feature_description.csv .
- WFDB Python: https://wfdb.readthedocs.io/en/latest/wfdb.html .

Las anotaciones de algoritmo no son verdad humana infalible. No se atribuye
anatomía coronaria, mecanismo celular ni equivalencia a SCA agudo a las clases.
La licencia de las referencias no concede una licencia nueva al código ECG Lab.
