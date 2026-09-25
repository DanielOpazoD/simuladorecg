# P8 · Feedback de los catorce ejercicios existentes

La pregunta evalúa la coincidencia con el caso configurado, no un diagnóstico
inferido del ECG. Se mantienen los mismos 14 presets; tres distractores por
familia sustituyen el orden por longitud del identificador. Los contrastes son
instrucciones de inspección, no hallazgos automáticamente atribuidos al paciente.

## Contratos

- Antes de contestar no se expone el feedback ni la referencia. Sin señal vigente
  no se puede contestar. Editar fisiología/filtro/artefactos o cargar otro hash
  termina el ejercicio; cambiar vista conserva la pregunta.
- Observaciones y referencia aparecen separadas. FC/PR/QRS provienen de medidas
  estimadas y su calidad; no se rellenan con parámetros del generador. La auditoría
  del producto puede retirar esas medidas antes de este feedback.
- En inferior/anterior, ST* se calcula sobre muestras con límites QRS medidos:
  PR local entre inicio estimado -35 y -20 ms; J* = final estimado; lectura J*+60 ms.
  Se requiere QRS usable, tres latidos y basal estable (rango ≤0,02 mV), sin ruido
  configurado, inversión ni filtros distintos de apagado/diagnóstico. Se publica
  la mediana por derivación. No se pasan events/truth al lector de ST*.
- El margen 0,02 mV solo decide si el orden II/III o signo I del ejercicio puede
  describirse. No es umbral de isquemia. La comparación no identifica arteria,
  OMI ni tratamiento. J* puede tener el sesgo conocido del delineador.
- Con adquisición alterada o límites insuficientes se retira esa lectura. Las
  advertencias P2 siguen visibles tras contestar; no se ocultan simplificaciones.

## Aceptación

Tests con muestras sintéticas conocidas en I/II/III/aVL/aVF/V1–V4, señal real del
simulador y medición analítica. Alterar las muestras cambia el orden observado;
NaN, basal inestable, ruido/inversión o QRS no usable retiran ST*. Conservación de
muestras en doce canales y getters prohibidos para events/truth. El navegador
prueba una pregunta real, feedback tras responder y salida al editar fisiología.
Las pruebas del feedback no validan por sí solas el generador ni el analizador.

Base pedagógica: guía original §3.5 y enfoque-clinico.md (observación ≠ inferencia).
La revisión clínica aportada §7/§9.5 inspira la comparación de rasgos, no se adopta
su propuesta de clasificador, angiografía simulada o reglas automáticas OMI.
