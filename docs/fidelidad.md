# Ciclo de fidelidad de la señal

Objetivo: que un electrofisiólogo no pueda distinguir con seguridad un trazado de
ECG Lab de un ECG real digitalizado. Este ciclo va antes de las mejoras visuales,
clínicas y educativas.

## Decisiones (8 de octubre de 2026)

- **Analizador congelado** en el estado de PR #155. Sus 13 workflows de referencia
  pasan a ejecución manual (`workflow_dispatch`); la CI obligatoria es `ci.yml`:
  pruebas, tipos, build y un recorrido en navegador de todos los presets.
- **Generador híbrido**: la morfología se aprende de ECG públicos (PTB-XL / PTB-XL+,
  CC BY 4.0). El producto incluye solo coeficientes derivados (forma media y modos
  de variación), nunca el trazado de un paciente, con atribución en
  `THIRD_PARTY_NOTICES.md`. Ritmo, intervalos, eje y patologías siguen siendo
  controlables.
- **Pruebas**: las huellas numéricas exactas del generador se retiran a medida que
  el motor cambia y se reemplazan por contratos fisiológicos (polaridad, R/S por
  derivación, intervalos, Einthoven/Goldberger) y por el banco de realismo.

## Etapas

1. **F0 · Congelar el analizador y simplificar la CI.**
2. **F1 · Banco de realismo.** Mismo extractor de rasgos para ECG reales y
   sintéticos; distancia por rasgo, un clasificador real/sintético (AUC 0,5 =
   indistinguible) y un cuestionario a ciegas para revisión humana.
3. **F2 · Sinusal normal de alta fidelidad.** Modelo de forma por fases (P, PR,
   QRS, ST-T, U) en 8 derivaciones independientes, dinámica latido a latido
   (respiración, variabilidad RR, QT-RR) y ruido de adquisición por electrodo.
4. **F3 · Conducción e hipertrofia** con modelos por clase (BRD, BRI, hemibloqueos,
   HVI, HVD, WPW, Q de necrosis).
5. **F4 · Isquemia aguda y electrolitos** sobre la base realista.
6. **F5 · Ritmos**: ondas f de FA, flutter, extrasístoles y TV, FV caótica,
   marcapasos.

Cada etapa se integra cuando la CI está verde, un revisor independiente la aprueba
y el banco de realismo no empeora.

## Banco de realismo (F1)

Código en `scripts/fidelity/`. Los datos quedan fuera del repo.

```bash
python3 -m venv ~/datos/ecg-referencia/.venv
~/datos/ecg-referencia/.venv/bin/pip install -r scripts/fidelity/requirements.txt
~/datos/ecg-referencia/.venv/bin/python scripts/fidelity/prepare_data.py --dest ~/datos/ecg-referencia
node scripts/fidelity/export-synthetic.mjs ~/datos/ecg-referencia/work/syn 300
~/datos/ecg-referencia/.venv/bin/python scripts/fidelity/benchmark.py \
  --real-list ~/datos/ecg-referencia/ptb-xl/holdout_norm600.txt \
  --real-root ~/datos/ecg-referencia/ptb-xl \
  --synthetic ~/datos/ecg-referencia/work/syn --out informe.json
```

- **Real**: 600 pacientes adultos distintos de PTB-XL, muestra aleatoria fija de
  los pliegues 9–10 (NORM = 100, ritmo sinusal, sin marcas de ruido, deriva,
  latidos extra ni electrodos). Ningún paciente de PTB-XL está en más de un
  pliegue, y los pliegues 9–10 nunca entrenan el modelo.
- **Sintético**: el preset sinusal con FC, PR, QRS, QTc, eje y amplitudes repartidos
  en rangos de adultos sanos (generador mulberry32 sembrado por índice), cuantizado
  a 1 µV como PTB-XL.
- **Rasgos** (`features.py`): el mismo código para ambos, sin anotaciones ni verdad
  del generador. Morfología del latido mediano por derivación, progresión
  precordial, contenido no dipolar, energía de alta frecuencia del QRS, forma de T,
  variación latido a latido, ruido en segmentos TP (ventana escalada con el RR) y
  deriva de la línea basal.
- **Resultado**: KS y distancia de Wasserstein normalizada por el IQR real (W1) por
  rasgo, y un clasificador real/sintético con validación cruzada de 5 particiones
  (AUC 0,5 = indistinguible). W1 da gradiente cuando el AUC está saturado.
- **Salvaguardas**: si más del 2 % de los sintéticos no se puede medir, el banco se
  niega a dar un resultado; los rasgos con más de 10 % de valores ausentes se
  informan. Real contra real (dos mitades de la reserva) da AUC 0,46–0,50.
- **Alcance**: el banco mide parecido con ECG de reposo adquiridos como en PTB-XL.
  También detecta diferencias de cadena de adquisición (filtrado, ganancia, ruido
  blanco añadido), así que bajar el AUC con trucos de adquisición no prueba
  fisiología: siempre se revisan los rasgos morfológicos por separado.

### Línea base: motor v1.5 (main, 8-10-2026)

AUC global 1,00 (gradient boosting y regresión logística); 1,00 en morfología y
ruido, 0,999 en dinámica. W1 mediano: morfología 0,58, dinámica 1,37, ruido 1,30.
Rasgos más delatores (mediana real → sintética):

| Rasgo | Real | Sintético | KS |
|---|---|---|---|
| Ruido > 25 Hz en TP, derivación I | 4,6 µV | 0,17 µV | 1,00 |
| Energía no dipolar del latido | 0,51 % | 0 | 1,00 |
| Variación de amplitud del QRS latido a latido (V5) | 2,9 % | 0,12 % | 1,00 |
| P en V3 | 0,059 mV | 0,273 mV | 0,99 |
| Energía del QRS sobre 40 Hz | 1,9 % | 0,13 % | 0,96 |
| ST a +80 ms en V2 | +0,091 mV | +0,004 mV | 0,96 |
| Pendiente máxima del QRS en V2 | 116 mV/s | 37 mV/s | 0,95 |
| Asimetría de T (V5, log caída/subida) | −0,04 | 0,49 | 0,95 |
| Deriva de línea basal (V2) | 43 µV | 5,5 µV | 0,91 |
| Variabilidad RR (CV) | 2,2 % | 0,7 % | 0,90 |

### Escala de los latidos medianos de PTB-XL+

Los latidos medianos 12SL de PTB-XL+ 1.0.1 declaran mV en el encabezado WFDB,
pero sus muestras están en µV. Medido en 150 registros NORM: la regresión del
latido mediano 12SL contra la mediana calculada desde el registro crudo de
PTB-XL 1.0.3 da un factor de 1018 (p5–p95: 975–1076) con correlación de forma
0,998 (revisión independiente: 1016, p5–p95 984–1067). El modelo de forma
divide por 1000.

## F2 · Sinusal de alta fidelidad

**Qué cambia en el producto.** Los ritmos supraventriculares con conducción normal
(sinusal y variantes, FA, flutter, unión, ESA, bloqueos AV con escape de la unión,
QT largo/corto y bajo voltaje) usan latidos aprendidos de ECG reales. El resto de
los presets conserva los núcleos vectoriales históricos hasta su etapa, para no
mezclar ambos estilos en un trazado (`src/engine/realistic/scope.ts`).

**Modelo** (`scripts/fidelity/build_shape_model.py` → `normal-shape-model.json`):
3.733 latidos medianos 12SL de pacientes adultos distintos, pliegues 1–8,
NORM = 100. Cada latido se referencia a la línea TP previa a la P y se divide en
P, PQ, QRS, ST (hasta el ápice espacial de T), T y post-T, remuestreados en las
8 derivaciones independientes. ACP con 64 modos: 99,3 % de la varianza, error de
reconstrucción mediano 12 µV. Sin el registro por el ápice de T, el promedio de
ondas T desfasadas quedaba más asimétrico que cualquier T real.

**Paciente y controles.** La semilla define a la persona (muestra de los 64 modos y de
las duraciones de P, PQ y ápice de T). Los controles actúan como transformaciones
exactas sobre ella: deformación temporal por fase (PR, QRS, QT del calendario),
rotación del vector cardiaco (ejes P/QRS/T exactos por área neta, transición como
rotación horizontal) y ganancia por onda. Mover un control no deforma otra onda.
El eje (área neta desde el nivel de fin del PR, como miden los electrocardiógrafos)
se busca en todo el círculo: parte dipolar que rota más residuo no dipolar fijo.
Un paciente cuya curva de área no rodea el origen con margen (eje indeterminado,
≈30 % de los sorteos) se descarta y la semilla pasa de forma determinista al
siguiente candidato; la elección no depende del eje pedido, así que mover el eje
rota a la misma persona. La verdad del eje se mide sobre el componente generado
sin ruido, así que la tarjeta dice el eje que muestra el trazado: frente a la
medición en las muestras (150 semillas, revisión independiente) ≤ 3° entre −90° y
90° y ≤ 10° en ejes extremos (150°–180°). Esas cifras suponen restar el nivel
previo al QRS, como hacen los electrocardiógrafos; integrar el QRS en bruto
mezcla la Ta y la deriva y puede desviar el eje decenas de grados. Error frente al eje pedido: mediana
1–3°; máximo 8° entre −90° y 90°, 25° en 180°/−150° (lectura clínica ±15°). El latido conducido se une
sin costura: el PQ termina en el nivel de inicio del QRS aprendido y la Ta se
escala con la P. En J,
el operador del QRS cede al de la repolarización de forma gradual (4 + 12 puntos),
sin escalón aunque QRS y T tengan ganancias muy distintas.
Los presets muestran el paciente de libro (`TEXTBOOK_SEED`, elegido por
`choose-textbook-seed.mjs`: el más cercano a la media entre los 143/4.000 que
cumplen todos los criterios clásicos); la semilla explora la variedad real.

**Repolarización auricular.** La P parte de la línea TP; el PR queda por debajo
(onda Ta) y esa desviación decae dentro del QRS-ST (τ = 80 ms). Un latido
conducido conserva la plantilla, con la Ta escalada con su P; una P bloqueada o
un latido sin aurícula organizada (FA, unión) siguen siendo fisiológicos.

**Vida entre latidos.** Rotación respiratoria del vector (1,5° frontal, 6°
horizontal), ganancia respiratoria 2,5 % y variación morfológica AR(1) de 0,05 DE;
variabilidad RR de reposo 0,035 en los presets sinusales (CV ≈ 2 %).

**Adquisición** (`src/engine/realistic/acquisition.ts`, por defecto «realista»):
ruido por electrodo medido en 300 registros PTB-XL. Ruido muscular en los
electrodos de los brazos (I 5,7 µV; II 3,3; III 4,3; correlación I–II +0,59),
precordiales ≈2 µV e independientes, deriva respiratoria dominada por la pierna
(II–III +0,81), nivel propio de cada paciente (lognormal) y cuantización a 1 µV.
«Ideal» desactiva todo eso; las pruebas de contrato lo usan por defecto
(`tests/setup/ideal-acquisition.ts`).

**Tarjetas de medidas.** Las tarjetas muestran ahora los valores del modelo que
generó el trazado (PR progresivo como rango en Wenckebach; QRS y QTc del latido
conducido, así que el bigeminismo no mezcla extrasístoles). El analizador
congelado sigue disponible como estimación en «Medidas» y para señales importadas.

**Atribución.** El pie de la app acredita PTB-XL y PTB-XL+ (CC BY 4.0), porque el
bundle distribuye coeficientes derivados.

### Resultado en el banco (8-10-2026)

| | Motor v1.5 | F2 |
|---|---|---|
| AUC global (GB / RL) | 1,00 / 1,00 | 0,99 / 0,96 |
| AUC morfología (GB / RL) | 1,00 / 1,00 | 0,98 / 0,91 |
| AUC dinámica (GB / RL) | 1,00 / 1,00 | 0,82 / 0,76 |
| AUC ruido (GB / RL) | 1,00 / 1,00 | 0,99 / 0,87 |
| KS mediano morfología / dinámica / ruido | 0,40 / 1,00 / 0,87 | 0,12 / 0,16 / 0,17 |

**Prueba visual a ciegas.** 20 ECG (10 reales de la reserva, 10 de F2) dibujados
igual y mezclados; un revisor automático con criterio de electrofisiólogo acertó
15/20 (esperaba ~60 %). Tomó 3 sintéticos por reales (uno por patológico) y 2
reales limpios por sintéticos. Su pista principal: los reales muestran más ruido
muscular y deriva visibles y más variación de T entre latidos. Es el objetivo de F2.1.

Rasgos antes delatores (mediana real → v1.5 → F2): ruido > 25 Hz en I 4,6 → 0,17 →
3,8 µV; variación del QRS latido a latido 2,9 → 0,12 → 3,3 %; P en V3 0,059 →
0,273 → 0,045 mV; energía del QRS > 40 Hz 1,9 → 0,13 → 1,7 %; ST a +80 ms en V2
0,091 → 0,004 → 0,097 mV; pendiente máxima del QRS en V2 116 → 37 → 121 mV/s.
Ningún rasgo supera KS 0,45; los que quedan son la estructura de correlación del
ruido entre derivaciones y el contenido no dipolar (0,8 % frente a 0,5 %).

El rasgo de asimetría de T se reescribió con pendientes sobre 20 ms: con
diferencias de una muestra medía sobre todo ruido residual (real −0,04 frente a
+0,28 con la medida robusta; latidos 12SL +0,31; F2 +0,33).

### Límites conocidos del analizador congelado sobre la base aprendida

El analizador (PR #155) se diseñó y validó sobre la morfología antigua. Sobre
latidos reales: mide el QT 15–40 ms más corto que el fin de T de 12SL, puede no
estimar el PR por la P de amplitud real con depresión Ta, y con QRS de 10 % de
amplitud y P/T máximas cuenta ondas T como latidos. Por eso las tarjetas usan los
valores del modelo. Una prueba acota el sesgo para que no empeore sin aviso
(FC ±2 lpm, QRS ±20 ms, QT ±50 ms en sinusal a 60/72/90 lpm). Sus pruebas de regresión siguen corriendo sobre el modelo de
núcleos (`synthesize(..., { learnedBase: false })`), una costura temporal que
desaparece cuando cada grupo de patologías migre.
