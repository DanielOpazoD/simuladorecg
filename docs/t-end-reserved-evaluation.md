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

## Estado

Preparación del protocolo. La reserva todavía no ha sido descargada ni evaluada
por este flujo. Los resultados y el commit de congelación se agregarán después de
su ejecución sin modificar las reglas.
