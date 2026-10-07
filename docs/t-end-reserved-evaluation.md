# Evaluación prospectiva del final T reservado

## Pregunta y alcance

¿Se transporta el estrato de concordancia interna seleccionado retrospectivamente
con los registros expuestos a los 40 registros que el repositorio reservó antes?
Se estudia la ayuda de revisión manual existente. No se habilita QT automático,
no se recalibra su algoritmo y no se convierte concordancia en probabilidad clínica.

LUDB contiene registros de 10 segundos, 12 derivaciones y muestreo de 500 Hz,
con anotaciones por derivación. Esta reserva procede de la misma base: no es
validación externa independiente. Fuente: [LUDB 1.0.1](https://physionet.org/content/ludb/1.0.1/),
Kalyakulina et al., DOI 10.13026/eegm-h675.

## Antes de abrir la reserva

Publicar un commit con `t-end-reserved-protocol.json`, los evaluadores y sus
pruebas. Debe identificar el candidato exacto, selección de registros, algoritmo,
lector, referencia y estadísticos. Sólo después se adquieren los datos. Conservar
el SHA y la fecha de esa publicación en el resultado final. El protocolo conserva
los límites retrospectivos de error y la regla de concordancia; no pueden ajustarse
para aprobar una vez que se conozcan los errores.

La selección original y sus archivos históricos siguen intactos. Su
`holdoutEnabled: false` describe el flujo de calibración original. Este protocolo
separado autoriza el primer uso reservado de la ayuda actual, no declara que se
haya validado un nuevo delineador automático.

## Resultados exigidos

- Todos los registros seleccionados, propuestas y referencias elegibles
- Errores firmados/absolutos, cola, extremos y cobertura, también fuera del estrato alto
- Promedio agrupado y promedio con el mismo peso por registro
- Intervalo exploratorio por remuestreo de registros, sin tratar cada latido como paciente independiente
- Detecciones QRS/T, referencias incompletas, propuestas no emparejadas y ausencias
- Muestras inalteradas y mediciones automáticas idénticas antes/después de invocar la ayuda

Menos de diez registros contribuyentes se informa como evidencia insuficiente.
Los criterios de error son de ingeniería, no umbrales de seguridad clínica. Un
resultado desfavorable debe publicarse como tal; no se corrige entrenando sobre
esta reserva. Una vez evaluada, deja de ser un conjunto intacto para futuros cambios.

## Reproducción

Desde el commit congelado, ejecutar los tests `t-end-reserved-*.node.mjs`, adquirir
con `scripts/prepare-t-end-reserved.py --output DIRECTORIO --crosscheck` usando
WFDB Python 4.3.1 y evaluar con `scripts/evaluate-t-end-reserved.mjs --fixtures
DIRECTORIO/fixtures --output INFORME`. El lector coteja bytes con los SHA256 del
proveedor y contrasta muestras físicas/anotaciones con WFDB. No publicar headers
crudos con comentarios demográficos ni diagnósticos.

## Primera evaluación: criterios no cumplidos

Protocolo/evaluadores publicados en
[`d0a45b85`](https://github.com/DanielOpazoD/simuladorecg/commit/d0a45b85d40e640eeafebf5d6c6ad336c80b8cfc)
a las 01:31:53 UTC del 7 de octubre de 2026, antes de adquirir la reserva.
Candidato: `9c94d8755330ade42224c548ee9713a00740b4d4`, posteriormente integrado
sin cambios de árbol de producto mediante PR116. Primera evaluación completada
01:49:30 UTC. Las interrupciones de ejecución durante la adquisición se retomaron
con el mismo lector/protocolo y archivos cacheados comprobados; no se sustituyó
ningún registro ni se observó rendimiento parcial para seleccionar casos.

Los 560 archivos se verificaron contra el manifiesto de origen. La comprobación
independiente con WFDB 4.3.1 coincidió exactamente en 2.400.000 muestras físicas y
36.005 eventos de anotación. Todos los 40 registros seleccionados se conservaron.

- 343 finales T de referencia elegibles; 171 propuestas emparejadas (49,85%)
- Todas las propuestas emparejadas: MAE 16,96 ms; p95 100 ms; máximo 136 ms
- Estrato alto: 41 finales de 21 registros; cobertura 11,95% de las referencias,
  23,98% de las propuestas emparejadas; MAE 8,24 ms; p95 32 ms; máximo 56 ms
- Los límites congelados p95 ≤30 ms y máximo ≤50 ms **no se cumplen**
- Dos errores de 56 ms permanecen dentro del estrato alto, ambos en el registro 15
- MAE con igual peso por registro del estrato alto: 9,06 ms. Intervalo exploratorio
  de MAE por bootstrap de registros: 4,27–14,39 ms; no es confianza diagnóstica

La suma hipotética inicio-QRS detectado → final-T propuesto tampoco valida QT:
40 parejas del estrato alto tienen MAE 15,55 ms, p95 48 ms y máximo 60 ms. Sobre
170 parejas de todos los estratos: MAE 24,04 ms, p95 102 ms, máximo 138 ms. Es un
cálculo del evaluador, nunca se introduce en las mediciones del producto.

El QT automático existente está disponible en 6/40 registros: uno marcado como
consistente internamente y cinco para revisión; 34 se abstienen. Las seis cifras
frente a la referencia agregada tienen MAE 113 ms y máximo 262 ms; en las cinco de
revisión MAE 135,2 ms. La única consistente tiene error 2 ms: un caso no prueba
seguridad. Las asociaciones de referencia siguen siendo descriptivas y pueden
necesitar adjudicación. Estos errores no deben ocultarse detrás del promedio del
estrato alto de final T, que responde a otra pregunta.

No se cambió el algoritmo, la regla, los umbrales, los datos ni la disponibilidad
automática después de observar el resultado. Todas las propuestas de menor
concordancia permanecen. El resultado es evidencia contra promover este estrato
como garantía de precisión clínica o habilitar QT automático desde esa ayuda.
Los registros dejan de ser una reserva intacta; cualquier ajuste posterior debe
tratarlos como datos expuestos y requerirá otra evaluación independiente.

## Evidencia conservada

`docs/evidence/t-end-reserved-results.json` conserva todos los registros, errores,
denominadores, propuestas no emparejadas, resúmenes automáticos, hashes físicos,
protocolo, fuentes y comprobación WFDB. Incluye el SHA256 del informe completo
reproducible, sin copiar señales ni encabezados demográficos al repositorio.
Las pruebas recomputan el resultado adverso desde sus filas, preservan la cobertura
y prueban conjuntos vacíos, correlación intrarregistro, errores extremos y datos
no finitos. CI verde aquí significa integridad/reproducibilidad; **no** que se
hayan cumplido los criterios de precisión.

## Aclaración posterior sobre la escala de origen

La comprobación con WFDB acredita aritmética idéntica según los encabezados, no
una verificación independiente del voltaje original. La [auditoría de escala y
morfología](annotated-morphology-reference.md) posterior encontró ganancias
compatibles con normalización por canal en los 80 registros de desarrollo. Por
eso estos resultados temporales describen la conversión literal de la fuente y
no validan calibración absoluta ni transportabilidad multiderivación. No se
modificaron el protocolo prospectivo, sus umbrales ni su resultado adverso.
