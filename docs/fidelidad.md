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

**Modelo** (`scripts/fidelity/build_shape_model.py` → `normal-shape-model.json`;
ver F2.2 para la versión actual: 2.381 medianas de registros crudos):
en F2, 3.733 latidos medianos 12SL de pacientes adultos distintos, pliegues 1–8,
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

## F2.1 · Textura de ruido y variación entre latidos

La prueba ciega de F2 señaló que los sintéticos se veían «demasiado limpios y
constantes». El banco añade ahora rasgos de variación de T, ST y P entre
latidos, no estacionariedad del ruido (dispersión del RMS entre segmentos TP),
curtosis y pendiente espectral del ruido. Con ellos el grupo de ruido de F2
volvió a AUC 1,00: el ruido real es impulsivo (curtosis ≈8–11 frente a 3),
llega en ráfagas (0,32 frente a 0,10) y concentra su energía bajo 60 Hz.

**Cambios** (`acquisition.ts`, `beat.ts`):
- Ruido muscular = fondo gaussiano con espectro descendente desde ≈15 Hz más un
  tren de potenciales de unidad motora (transitorios bifásicos de ≈3,5 ms,
  amplitud log-normal con tope), modulados por una envolvente lenta que da las
  ráfagas entre latidos. Una primera versión con envolvente log-normal rápida
  alcanzaba la curtosis pero producía espigas raras de hasta 0,9 mV que el
  analizador leía como QRS (10/300 FC erróneas); con los transitorios acotados
  el pico del piso queda ≤ 0,39 mV y las FC erróneas en 0/300.
- Movimiento electrodo-piel en 0,5–3 Hz (el ST tiembla entre latidos).
- Amplitud de P con modulación respiratoria y dispersión latido a latido
  (acotada a 0,6–1,4).
- Niveles por paciente log-normales acotados a ±2 DE.

| Rasgo (mediana) | Real | F2 | F2.1 |
|---|---|---|---|
| Curtosis del ruido, I / V2 | 8,2 / 11,4 | 3,0 / 3,0 | 7,6 / 10,5 |
| Ráfagas (sd log RMS), I / V2 | 0,32 / 0,34 | 0,11 / 0,10 | 0,35 / 0,40 |
| Pendiente espectral del ruido, I | +0,13 | −1,07 | +0,06 |
| Ruido > 25 Hz, I / V2 (µV) | 4,6 / 1,7 | 3,8 / 1,7 | 5,1 / 1,8 |
| Variación de P entre latidos (II) | 13 % | 4 % | 14 % |
| Desviación del ST entre latidos, V2 (µV) | 15,7 | 10,7 | 16,3 |

| Banco con todos los rasgos | F2 | F2.1 |
|---|---|---|
| AUC ruido (GB / RL) | 1,00 / 1,00 | 0,97 / 0,87 |
| AUC dinámica (GB / RL) | 0,95 / 0,92 | 0,88 / 0,76 |
| AUC morfología (GB / RL) | 0,98 / 0,91 | 0,97 / 0,91 |

**Prueba visual a ciegas** con un set nuevo (10 reales de la reserva no usados
antes, 10 de una versión intermedia de F2.1) y dos revisores automáticos
independientes: 10/20 y 9/20 (F2: 15/20). Calificaron como reales 6 de los 10
sintéticos. Con n = 20 el intervalo es de ±22 puntos: es compatible con el azar,
no lo demuestra; el discriminador profundo (siguiente etapa) da la cota fina.

El costo de síntesis del piso de ruido sube (≈45 ms por 10 s de señal).

Queda por cerrar: contenido no dipolar algo alto (0,75 % frente a 0,51 %) y
pendiente máxima del QRS ≈15 % menor (detalle fino que el modelo de 64 modos
suaviza).

## Validación profunda y F2.2 · Morfología sin firma de laboratorio

### Herramientas (`scripts/fidelity/`)

- **Clasificador diagnóstico** (`diag_classifier.py`): ResNet 1D entrenada solo con
  ECG reales de PTB-XL (100 Hz, pliegues 1–8, 46 declaraciones SCP con ≥ 100
  registros). AUC macro 0,932 en el pliegue 10, a la par de lo publicado. Aplicado
  a los presets reconoce 24/39 evaluables: sinusal (NORM 0,996), bradi/taqui,
  arritmia sinusal, FA, BAV 1.°, BRD, BRI, HVI, extrasístoles, marcapasos y bajo
  voltaje. No reconoce la isquemia del motor de núcleos (inferior, lateral,
  Wellens), ni HVD/TEP, ni BRD incompleto (lo llama BRD completo): guía para F3/F4.
- **Discriminador profundo** (`discriminator.py`): ResNet 1D real/sintético sobre
  10 s crudos (3.000 reales de entrenamiento, reserva de 600). Control real contra
  real: AUC 0,48. Ablaciones: latido mediano repetido (solo morfología) y banda
  0,5–40 Hz. Mapa de saliencia (`--saliency`). Calibración con 15 ECG normales de
  LUDB (otro equipo y población): los llama reales al 100 % y PTB-XL frente a LUDB
  da AUC 0,45, así que lo que detecta es síntesis, no firma de equipo.
- **Discriminador de latidos** (`beat_discriminator.py`): compara conjuntos de
  latidos medianos (crudo, 12SL, reconstrucción, sintético).

### Lo que encontraron y se corrigió

1. **Firma de 12SL**: el mediano 12SL y el mediano crudo del mismo paciente se
   distinguen con AUC 0,999. El modelo se aprende ahora de medianas de los
   registros crudos de PTB-XL alineadas al latido 12SL (que aporta los puntos
   fiduciales).
2. **Modos finos anulados**: la escala por modo se guardaba redondeada a 6
   decimales; 11 de 64 modos quedaban en cero. Ahora float32.
3. **Población no gaussiana**: en el espacio de modos, los pacientes reales se
   distinguen de muestras gaussianas (AUC 0,85) y no de una mezcla de 8
   gaussianas (≈0,35); el motor muestrea de la mezcla. Casos atípicos (|z| > 5)
   fuera antes del ACP.
4. **Ejes de P y T**: estaban fijos por los controles (P 55°, T 40°) y rompían la
   relación natural QRS–T. Ahora cada paciente conserva sus ejes y los acopla al
   QRS con las pendientes medidas en 6.574 ECG normales (P 0,14; T 0,25). Mover un
   control de eje lo fija.
5. **Onda U y TP**: la saliencia se concentraba tras el fin de T en V2–V3; la cola
   post-T pasa de 160 a 260 ms (sin alcanzar la P siguiente) y se apaga solo en su
   último 20 %.
6. **Inicio de la P**: la saliencia se movió entonces a los 80 ms previos a la P;
   se añadió una fase previa aprendida con entrada suave.

| Medida | v1.5 | F2.1 | F2.2 |
|---|---|---|---|
| Discriminador, solo latido mediano (AUC) | — | 0,998 | 0,972 |
| Discriminador, señal completa (AUC) | — | 0,999 | 0,999 |
| Banco, morfología (GB / RL) | 1,00 / 1,00 | 0,97 / 0,91 | 0,92 / 0,87 |
| Banco, KS mediano morfología | 0,40 | 0,10 | 0,10 |

La saliencia del discriminador de latido mediano quedó repartida de forma pareja
entre derivaciones y tiempos (sin foco). Con la señal completa la red aún separa
(0,999): lo que queda está en la dinámica y el ruido (respiración sinusoidal
perfecta, variación gaussiana, forma de los impulsos musculares). Eso no lo
distinguen revisores humanos ni automáticos a ojo (pruebas ciegas en azar).

**Analizador y P realista.** El analizador congelado mide el PR solo en 16 de 100
ECG normales reales de la reserva; en el sinusal de F2.2 lo mide en 8 de 60 (antes,
con una P de inicio abrupto, en 17 de 60: más fácil que la realidad). La P nueva
es tan sutil como la real; por eso las tarjetas muestran los valores del modelo.

El paciente de libro pasa a la semilla 1951 (P bifásica visible en V1,
terminal negativa pequeña). Las pruebas de analizador que usaban el sinusal como
fijación pasan al modelo de núcleos, como las demás del analizador congelado.

## F3.1 · Conducción e hipertrofia con modelos por clase

Cada trastorno se aprende de sus propios pacientes de PTB-XL (pliegues 1–8, ritmo
sinusal, sin diagnósticos que cambien la morfología; `build_shape_model.py
--class CODE`), con la misma segmentación por fases y referencia TP que el
normal. La cola post-T se acorta a 200 ms en las clases (QRS y QT más largos
dejan menos TP) y se toleran registros con deriva (la mediana la atenúa).

| Población | Pacientes | Modos (varianza) | QRS mediano | Eje mediano |
|---|---|---|---|---|
| BRI (CLBBB) | 101 | 10 (0,91) | 156 ms | −23° |
| BRD incompleto (IRBBB) | 289 | 29 (0,97) | 100 ms | 8° |
| HBAI (LAFB) | 294 | 29 (0,97) | 100 ms | −49° |
| HVI (LVH) | 316 | 31 (0,98) | 96 ms | 21° |

Clases con muy pocos pacientes (BRD completo 44, WPW 20) y los infartos antiguos
(IMI 328, ASMI 287, que necesitan presets nuevos) quedan para F3.2.

**Producto.** `realisticModelFor(c)` (scope.ts) elige la población: conducción
normal → NORM, BRI → CLBBB, BRD incompleto → IRBBB, HBAI → LAFB, sobrecarga VI con
conducción normal → LVH. Una población es un latido completo: no se apilan
modificadores entre poblaciones (HVI con BRI sigue en núcleos hasta tener un
modelo conjunto). Cada modelo de clase es un trozo aparte que el worker carga
la primera vez que un caso lo usa (`models.ts`); el sinusal normal no descarga
nada nuevo. Un modelo no cargado falla de forma explícita, nunca cae en otra
población.

**Repolarización secundaria.** En BRI, BRD incompleto y HVI la ST-T entera es
la del paciente: los controles de eje y de amplitud de T quedan inactivos y sin
efecto, y la ganancia del QRS escala también la ST-T, de modo que las razones
ST/QRS (Sgarbossa) se conservan. En el HBAI la T es primaria y sus controles
actúan. (Con el filtro diagnóstico de 0,05 Hz, un QRS ancho y grande deja tras
de sí la respuesta del paso alto, ≈ 0,2 mV en V1 en el BRI: es la física del
filtro, no repolarización; con el filtro apagado y T anulada no queda nada.)
El preset de HVI ya no multiplica el voltaje (×1,5) ni fija la T (160°): ambos
salen de la población.

**Paciente de libro por clase.** Se exportaron 300 semillas de cada preset. Entre
las que el clasificador diagnóstico (entrenado solo con pacientes reales)
reconoce con probabilidad a ≤ 0,03 de la mejor, se eligió la que el analizador
congelado mide más cerca del QRS programado, con QT medible (empates de ≤ 2 ms por
QT utilizable y luego probabilidad): BRI 24, BRD incompleto 34, HBAI 225, HVI 285.
Elegir solo por el clasificador daba pacientes típicos que el analizador medía
mal (BRI: QRS 234 ms frente a 160 programados).

**Carga robusta.** Si la descarga de un modelo falla, el worker lo informa como
fallo de transporte y el controlador lo reinicia una vez (módulos nuevos, nueva
descarga); un error de dominio no se reintenta. El laboratorio de activación
carga todos los modelos de clase al abrirse (≈ 770 KB sin comprimir, una vez),
porque cualquier alternativa puede necesitar uno. Los scripts de Node
(`scripts/`) los leen del disco; el navegador y las pruebas nunca: ahí un modelo
ausente es un error explícito, y una prueba ejecuta el worker real con el
registro vacío.

### Resultado

Clasificador diagnóstico sobre el catálogo: 25 de 39 presets reconocidos
(F2.2: 24). BRI 1,00; BRD incompleto 0,96 (antes lo llamaba BRD completo);
HBAI 0,999; HVI 0,96 (con «isquemia/sobrecarga» 0,85).

Sobre poblaciones (300 semillas por clase, presets con sus QRS y ejes fijos)
frente a los pacientes reales de la reserva (pliegue 10) con el mismo umbral:

| Clase | Reconocidos, sintéticos | Reconocidos, reales |
|---|---|---|
| BRI | 100 % | 96 % |
| BRD incompleto | 27 % | 40 % |
| HBAI | 77 % | 61 % |
| HVI | 61 % | 43 % |

Las tasas sintéticas quedan en el rango de las reales: la clase aprendida trae la
misma mezcla de casos claros y limítrofes que los pacientes. Las diferencias
vienen de fijar QRS y eje por preset (los reales los varían).

**Pruebas.** Criterios de libro medidos en las muestras de cada preset (BRI:
QS/rS en V1 y ST-T discordante; BRD incompleto: r' terminal en V1; HBAI: eje
≤ −45°, qR en aVL, rS inferior con S III > S II; HVI: Sokolow-Lyon ≥ 3,5 mV y
sobrecarga lateral), la linealidad exacta de la ST-T secundaria con el QRS y el
analizador congelado sobre cada paciente de libro con adquisición realista (QRS a
±10 ms, QT medible). Sobre otras semillas el analizador mide peor que en el
sinusal (QT ausente en ≈ 2/3 de los BRI y HVI): es el límite conocido del
analizador congelado, y las tarjetas muestran los valores del modelo. Las
pruebas de los mecanismos de los núcleos (fuente ST secundaria, vector T
primario, fixtures del analizador) corren sobre los núcleos.

## F3.2 · BRD completo e infartos antiguos; más pacientes por clase

**Más pacientes.** La cola post-T de 200 ms exigía que el fin de T + 200 ms no
alcanzara la P siguiente: descartaba a un tercio de los pacientes con FC ≥ 90.
Con 120 ms (la onda U cae casi entera en ese tramo) y tolerando ruido y deriva en
las clases (la mediana los atenúa; los atípicos se descartan), todas crecen. El
modelo normal no cambia (regeneración idéntica byte a byte).

| Población | Pacientes F3.1 → F3.2 | Modos (varianza) |
|---|---|---|
| BRI (CLBBB) | 101 → 160 | 17 (0,95) |
| BRD completo (CRBBB) | 44 → 60 | 19 (0,95) |
| BRD incompleto (IRBBB) | 289 → 383 | 38 (0,98) |
| HBAI (LAFB) | 294 → 406 | 41 (0,98) |
| HVI (LVH) | 316 → 437 | 44 (0,99) |
| Infarto inferior antiguo (IMI) | — → 499 | 50 (0,99) |
| Infarto anteroseptal antiguo (ASMI) | — → 420 | 42 (0,98) |

**Clases pequeñas.** Con n/10 modos el BRD completo explicaba el 84 % y perdía
las muescas: ahora se admiten los modos del 95 % de la varianza (tope n/3) con una
gaussiana conjunta contraída (Ledoit-Wolf). Aun así, las colas de una gaussiana
sobre 60 pacientes heterogéneos producen mezclas que ningún paciente tiene (V1 con
R' y T positiva): el clasificador reconocía el 73 % frente al 100 % de los reales.
Una mezcla de 2 gaussianas no ayudó (77 %; con 3, un grupo de un solo paciente:
descartada). El muestreo de esa clase se acota a 0,7 desviaciones (`sampleScale`
en el modelo, medido: 0,8 → 86 %, 0,7 → 88 %, 0,65 → 93 %). WPW (22 pacientes)
no da para un modelo honesto y sigue en núcleos.

**Infarto antiguo.** La fase «crónica» de la lesión inferior (CD o Cx) y anterior
usa la población de infarto antiguo correspondiente: ondas Q y repolarización de
pacientes reales. Antes resolvía el ST sin Q de necrosis; en núcleos (otros
territorios o combinaciones) sigue así. Presets nuevos: «Infarto inferior
antiguo» y «Infarto anteroseptal antiguo» (entrada «Infarto antiguo»). El BRD
completo pasa al latido aprendido con ST-T secundaria (como BRI); su preset pasa
de eje 35° a 60°, cerca de la mediana de los BRD aislados (66°).

**Pacientes de libro** (misma regla que F3.1, rehecha con los modelos nuevos):
BRI 15, BRD 276, BRD incompleto 201, HBAI 9, HVI 154, IM inferior 52,
IM anteroseptal 105.

### Resultado

Clasificador sobre el catálogo: 28 de 41 presets reconocidos (F3.1: 25 de 39).
BRD 0,99; IM inferior antiguo 0,97 (como inferolateral, ILMI); IM anteroseptal
antiguo 0,999.

Poblaciones de 300 semillas con adquisición realista, frente a los pacientes
reales de la reserva (pliegue 10) con el mismo umbral:

| Clase | Sintéticos | Reales |
|---|---|---|
| BRI | 100 % | 96 % |
| BRD completo | 88 % | 100 % |
| BRD incompleto | 37 % | 40 % |
| HBAI | 78 % | 61 % |
| HVI | 62 % | 43 % |
| IM inferior antiguo | 70 % | 25 % |
| IM anteroseptal antiguo | 77 % | 59 % |

Los infartos antiguos sintéticos se reconocen más que los reales: los pacientes
etiquetados IMI en PTB-XL incluyen muchos con Q mínimas; los presets fijan QRS y
eje, y el modelo excluye comorbilidades que enmascaran el patrón.

**Pruebas nuevas:** rsR' y S terminal ancha (≥ 30 ms) del BRD; Q ≥ 30 ms en aVF
y QS en III del infarto inferior; QS en V1–V2 del anteroseptal; analizador sobre
los siete pacientes de libro (QRS ±10 ms, QT medible).
