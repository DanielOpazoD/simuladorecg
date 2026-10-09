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
