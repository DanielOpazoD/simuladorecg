# Delineación de T v2 — separación entre detección y QT

## Motivo

El benchmark LUDB prospectivo del PR #26 mostró que el analizador actual detectaba
correctamente QRS, pero la repolarización estaba artificialmente limitada por su
arquitectura:

- QRS: sensibilidad 96,6 %, PPV 96,1 %.
- T: sensibilidad 34,4 %, PPV 88,0 %.
- Cuando T aparecía, su pico era preciso: MAE 5,85 ms.
- El T-end existente tenía sesgo +72,3 ms y MAE 74,8 ms.
- QT sólo se publicaba en 13/40 registros.

La causa principal reproducida es que `tPeak` sólo se publicaba si el mismo recorrido
lograba además reconocer un retorno terminal suficientemente quieto. Por lo tanto una T
visible sin T-end seguro desaparecía también como evento.

## Cambio

### 1. T visible no implica QT medible

`tPeak` se conserva tan pronto como la onda supera los criterios de amplitud y ruido
ya existentes. `tEnd` y `qt` permanecen nulos cuando no existe un final defendible.

Esto permite representar la evidencia presente sin convertirla en una cifra de QT.

### 2. T-onset explícito

`DelineatedBeat` incorpora `tOnset`. Se obtiene exclusivamente desde muestras, nunca
desde el calendario del generador ni desde un diagnóstico.

### 3. Tangentes por derivación

En I, II, V1 y V5 se calcula la línea basal local ya usada por el delineador. Para cada
derivación con amplitud T suficiente:

- se identifican lóbulos significativos, incluidos patrones bifásicos;
- el inicio se estima por la intersección con basal de la pendiente inicial dominante;
- el final se estima por la intersección con basal de la pendiente terminal dominante;
- la búsqueda terminal se limita a Tpeak + 30 % del RR;
- una derivación con amplitud <0,05 mV no define el punto tangencial.

El límite de 30 % del RR y el umbral de 50 µV siguen principios publicados para
delineación automática del final de T. La tangente terminal es también el criterio
manual clásico para QT.

Referencias:
- Vink AS et al. *The development and validation of an easy to use automatic
  QT-interval algorithm*. PLoS One. 2017. PMCID: PMC5581168.
- Postema PG et al. *Accurate electrocardiographic assessment of the QT interval:
  teach the tangent*. Heart Rhythm. 2008. PMID: 18598957.

### 4. Agregación multiderivación

LUDB demostró que usar simplemente el final máximo de cuatro derivaciones amplifica
outliers. El producto usa el percentil 75 de los T-end tangenciales válidos. Es una
estimación tardía robusta: mantiene información de varias derivaciones sin permitir que
una sola defina el QT.

El T-onset utiliza el candidato más precoz válido, coherente con la construcción
multiderivación de referencia del benchmark.

## Datos de desarrollo

Estos números pertenecen a la cohorte **de calibración ya observada**, no al holdout:

- separar T de T-end, sin cambiar umbrales, elevó T TP de 117 a 307 y sensibilidad
  de 34,4 % a 90,3 %; PPV 84,6 %;
- con tangentes multiderivación: T-onset n=297, MAE 33,2 ms;
- T-end n=298, MAE 37,7 ms, sesgo -1,6 ms, p95 114,1 ms;
- QT numérico: 30/40 registros, frente a 13/40;
- QT MAE 42,1 ms y sesgo -1,6 ms, frente a 45,3 ms y +39,8 ms.

P y QRS no se modifican. El holdout LUDB reservado por PR #26 sigue sin ser evaluado.

## Contratos que no deben romperse

- QRS onset/offset/duración y detección deben permanecer sin regresión material.
- La T bifásica debe incluir su lóbulo terminal.
- Una U separada no debe incorporarse al QT.
- La inversión de T no debe cambiar sus límites.
- La ausencia de T no debe producir QT.
- Frecuencias de muestreo 250/500/1000 Hz deben conservar las señales analíticas.
- La calidad `usable/review/unavailable` continúa expresando evidencia de muestras,
  no probabilidad clínica.

## Siguiente compuerta

Después de CI pareada se congelarán los criterios de aceptación del candidato. Sólo
entonces podrá ejecutarse una vez el holdout de 40 registros preseleccionado en PR #26.
No se reajustará el algoritmo con los resultados del holdout.
