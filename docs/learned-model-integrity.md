# Integridad atómica de los modelos aprendidos

El objetivo es impedir que una carga incompleta se convierta en una población
aparentemente disponible que genere valores no finitos. No se cambia el
analizador, los coeficientes distribuidos ni la forma de una señal válida.

## Fallo reproducible

Antes de esta corrección, `registerShapeModel("IRBBB", { ...raw, basis: "" })`
aceptaba una base truncada. Al sintetizar el preset BRD incompleto, adquisición
ideal, durante 10 s a 500 Hz, V1 tenía 5000/5000 muestras no finitas. Los accesos
a posiciones inexistentes de la base se multiplicaban por sus escalas, y el
registro publicaba ese resultado en caché.

## Contrato

La validación se completa antes de publicar el modelo. Comprueba:

- Schema, diagnóstico, derivaciones y orden/rejilla de fases. La rejilla común
  de los formatos actuales es necesaria para sumar un delta isquémico a las
  mismas posiciones de la plantilla ventricular.
- Dimensiones exactas de los bloques Float32/Int16 y sus escalas, base64 válido
  y coeficientes finitos. Los tamaños de modo son enteros positivos.
- Nombres conjuntos únicos y completos, dimensiones y finitud de medias y
  covarianza, simetría y varianzas no negativas.
- Mezcla no vacía con pesos no negativos y suma unitaria con tolerancia 1e-5,
  por el redondeo del formato a seis decimales. No se renormalizan los pesos.
- Dimensiones de medias y Cholesky de la mezcla, y diagonales no negativas.
- Duraciones, magnitudes de referencia, escala de muestreo y, para VPACE,
  espiga completa con coeficientes finitos.
- Las tres arterias y los dos estados esperados por el modelo de isquemia.
  Un fallo en la última arteria no publica las anteriores ni vacía la caché de
  deltas de un modelo ya válido.

Las arrays de metadatos publicadas no comparten referencias mutables con el
objeto de entrada. Se conserva el contrato previo de clases: la primera carga
válida gana, y un registro posterior no sustituye ni invalida esa población.
Una carga rechazada antes de que exista una clase permite reintentar con datos
válidos. El modelo de isquemia solo sustituye el anterior tras validar todas sus
arterias.

La validación comprueba integridad estructural y numérica del formato. No
certifica distribución poblacional, calibración anatómica ni validez clínica.

## Jueces ejecutables

```bash
npx vitest run tests/learned-model-integrity.test.ts \
  tests/class-model-loading.test.ts tests/realistic-shape-model.test.ts \
  tests/engine.test.ts tests/realistic-signal.test.ts --maxWorkers=1
npx tsc --noEmit
```

Las pruebas adversariales truncan bloques, cambian tipos, introducen NaN e
infinito, alteran fases, pesos y covarianzas, omiten una arteria y dañan una
espiga. Comprueban rechazo sin contaminación del registro, recuperación con la
carga válida y conservación de objetos/deltas previamente publicados.

Se comparó además el motor con los decodificadores originales del commit
`507751c509012af080139044d65cf6caa09d0053`: los 63 presets activos, con sus
parámetros y semillas de catálogo, 10 s, adquisición ideal, filtro de catálogo,
12 derivaciones a 500 Hz. Las muestras, eventos y medidas del modelo se
conservaron exactamente; la comparación de muestras se hizo por bytes.
El script y resultado local están en `.sites-runtime/model-integrity-paired.mjs`
y `.sites-runtime/model-integrity-paired.json`. Entorno: Windows, Node 24.19.0.
Esto demuestra preservación de los datos válidos; no es una nueva evaluación
clínica ni una ejecución de CI.
