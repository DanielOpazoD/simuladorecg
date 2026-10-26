# Auditoría temporal ST–T ventricular

Estado: caracterización de ingeniería, sin corrección del modelo y sin validación clínica. El protocolo `benchmarks/fidelity/ventricular-timing-protocol.json` se escribió antes de ejecutar la matriz. No autoriza cambiar parámetros ni elevar plausibilidad por aprobar controles internos.

## Procedencia y unidades

| Etapa | RR y referencia temporal |
| --- | --- |
| `build_pvc_model.py` | `diff(pk)/FS` produce segundos. `rr_norm` es la mediana de RR precedentes a complejos dominantes; puede incluir pausas postectópicas. El acoplamiento de la EV se conserva aparte como cociente respecto a `rr_norm`. La forma es mediana de EV similares del registro. No es una secuencia de adaptación individual ni el RR de una TV sostenida. |
| `build_paced_model.py` | Guarda la mediana de todos los intervalos detectados, en segundos, junto a una forma mediana estimulada. No normaliza temporalmente la forma a un ciclo de 800 ms. |
| `build_shape_model.py` | Apila `log(RR)` sin conversión. La ruta normal recibe `RR_Mean_Global` en milisegundos; las dos rutas anteriores suministran segundos. P/PQ/QRS/STT se guardan en milisegundos. El comentario genérico de unidades no resuelve esa heterogeneidad. |
| `shape-model.ts` | `rrMs = exp(log_rr)` conserva el número suministrado; el nombre induce a interpretar milisegundos también para PVC/VPACE, donde no corresponde. Es una muestra del modelo latente conjunto, no el RR medido de un paciente identificable. |
| `repolarization.ts` | RR, RR adaptado y tiempo de eventos están en segundos. La historia arranca en el RR nominal. El filtro exponencial usa una constante de ingeniería de aproximadamente 40,1 s (95 % en 120 s). Reiniciar el caso reinicia la historia. |
| `learnEctopicDurations` | Para `ventricular`: STT propio × raíz cúbica de `max(0.25, adaptedRR)/0.8`, recortado a 0.12–0.5 s. PVC y paced mantienen STT propio, con el mismo recorte. QRS propio se recorta a 0.1–0.2 s para PVC/ventricular y 0.12–0.24 s para paced. No consume `rrMs`. |

Los valores 0.8 s, exponente 1/3, pisos y techos son reglas ilustrativas de ingeniería. Los builders no demuestran que cada forma se observara a 0.8 s. Sustituir esa referencia por `rrMs` sin auditar unidades multiplicaría el error y tampoco demostraría una relación fisiológica correcta.

En las tres semillas predeclaradas, el campo llamado `rrMs` vale 0.751–1.310 para PVC y 0.746–0.825 para VPACE: magnitudes en segundos coherentes con la ruta del builder. El problema de nombre/unidades queda registrado; no se modifica el modelo ni sus hashes congelados.

## Qué mide el instrumento

Se sintetiza la señal final de producción a 500 Hz, incluyendo su antialias, proyección y ensamblado. Se elige adquisición ideal, filtros apagados, P=0, sin artefactos para aislar el mecanismo. Esto no cubre todas las configuraciones de pantalla/adquisición/exportación. La auditoría conjunta caracteriza ganancias y eje en señal final; pantalla/exportación mantienen su verificación de metrología separada.

El instrumento calcula energía, centroide temporal y máximo de magnitud sobre ocho derivaciones independientes. Resta la media de los 40–10 ms previos al inicio QRS y usa una ventana fija de J+20 a J+500 ms. Inicio QRS y J provienen del generador y se identifican como tales; no son anotaciones clínicas independientes. No se consulta T pico/T final del modelo ni geometría del renderer. Los descriptores no son QT, JT, duración de potencial de acción ni una delineación clínica de T.

Las ventanas que alcanzan el siguiente QRS o el borde del registro se excluyen con motivo explícito. Puede persistir cola del complejo precedente o mezcla de componentes; especialmente PVC no permite atribuir toda variación del centroide a su adaptación. No se recorta adaptativamente la ventana para recuperar artificialmente cobertura favorable a alta frecuencia.

## Matriz y resultados conservados

Semillas 17, 91, 701; cinco familias (idioventricular, VT, escape ventricular en bloqueo completo, PVC y VVI), cinco frecuencias (40, 60, 75, 100, 140 lpm), 12 s por registro: 75 celdas. Se usan las mismas semillas/foco en cada intervención. Frecuencias fuera de la presentación típica de una familia son sondas mecánicas, no casos clínicos declarados típicos. Hay además 12 sondas PVC de acoplamiento 0.45/0.7 y variabilidad 0/0.15 a 60 lpm.

| Familia | Celdas | Latidos medidos | Excluidos | Centroide mediano post-J a 40 / 60 / 75 lpm, ms |
| --- | ---: | ---: | ---: | --- |
| Idioventricular | 15 | 96 | 153 | 187.064 / 163.696 / 151.992 |
| VT | 15 | 96 | 153 | 187.064 / 163.696 / 151.992 |
| Escape ventricular | 15 | 96 | 153 | 187.071 / 163.696 / 151.999 |
| PVC | 15 | 24 | 18 | 153.783 / 154.068 / 154.285 |
| VVI | 15 | 96 | 153 | 165.287 / 165.336 / 165.454 |

Total de la matriz principal: 408 medidos y 630 excluidos. Ninguna celda de síntesis rechazada y ningún recorte superior STT en esta muestra. La ausencia de recortes en tres semillas no valida los límites ni excluye saturación en otras semillas. A 100 y 140 lpm no hay cobertura medible de la ventana fija en las familias ventriculares ni VVI; el resultado es `null`, nunca cero ni aprobado. PVC conserva medida a 100 lpm (centroide agregado 175.017 ms), con cambio que no debe interpretarse como adaptación causal de su STT propio. Las 12 sondas adicionales PVC conservan 12 medidas y 12 exclusiones; cambia RR adaptado, mientras la duración propia permanece fija.

Los 12 controles negativos de QTc solicitado (350 frente a 550 ms) sobre señal ventricular aislada y VVI pasan con diferencia máxima ≤1e-10 mV. Los seis controles por semilla/familia PVC/VPACE mantienen STT propio entre frecuencias e historias con tolerancia 1e-8 ms. Estos límites son de invariancia numérica, no márgenes clínicos.

Los calendarios ventriculares disponibles son regulares y se inicializan en equilibrio. Por tanto, esta matriz no identifica la cinética de adaptación ST–T ante un escalón de frecuencia ni compara igual RR actual con distinta historia ventricular controlada. Las sondas de PVC verifican la ruta negativa, no subsanan esa falta de identificabilidad. No se añade una nueva entrada de historia ni se cambia el alcance para fabricar la prueba que falta.

## Reproducción y decisión

```powershell
node scripts/audit-ventricular-timing.mjs --output C:/Users/Daniel/Documents/ECG-QA/nueva-corrida/ventricular-timing.json
node node_modules/vitest/vitest.mjs run tests/ventricular-timing-audit.test.mjs
```

La salida debe ser nueva y externa al repositorio. Conserva commit base, hash del protocolo, script, fuentes y modelos, hash de cada señal, observaciones por latido y exclusiones. El CLI escribe el informe antes de devolver código 1 si fallan sus controles de software. La cobertura incompleta se conserva explícitamente y no se convierte en evidencia clínica por devolver código 0.

Los tests falsifican el instrumento con traslación conocida, ganancia, desplazamiento DC, señal plana, NaN, ventanas incompletas y solapamiento. También verifican movimiento en muestras finales, controles QTc inactivos, historias PVC y falta de cobertura a alta frecuencia.

Decisión: `correctionAccepted:false`, `clinicalValidation:false`. Aprobar controles numéricos solo permite conservar el instrumento de caracterización. Para aceptar una corrección hacen falta una reserva independiente por paciente con unidades y referencias temporales verificadas, criterios emparejados de mejora y no inferioridad por familia congelados antes del acceso, contratos causales y ausencia de regresiones relevantes. Para elevar plausibilidad clínica hace falta además revisión humana independiente. No se dispone de esos resultados aquí; los datos no permiten elegir otra constante de adaptación, justificar una ley universal STT–RR, ni atribuir precisión clínica al descriptor de energía.

## Enmienda del instrumento tras revisión técnica

La revisión cruzada encontró que una duración QRS negativa podía colocar una ventana válida por accidente y producir un centroide plausible. También encontró que una excepción de síntesis en un control QTc abortaba el informe, y que una celda rechazada no intervenía en la decisión de software. Son defectos del instrumento de auditoría, no hallazgos fisiológicos. Se corrigen validando inicio/QRS finitos, QRS positivo y siguiente inicio finito cuando existe; QT sigue deliberadamente fuera de esta medida de ventana fija. Se rechaza además desbordamiento numérico de la acumulación de energía.

Las excepciones de configuración, síntesis o medición se conservan como celdas/controles `rejected`, con motivo; hacen fallar `softwareControlsPass` y el CLI después de guardar el informe. Las exclusiones válidas por borde o solapamiento permanecen problemas de cobertura y no fallos de ejecución. Tests adversarios inyectan estos errores para comprobar la distinción. No se cambian matriz, ventanas, umbrales, semillas ni criterios clínicos. Se conservan las corridas v1/v2 anteriores y se emite v3 con hash de instrumento nuevo; los resultados originales no se reemplazan.
