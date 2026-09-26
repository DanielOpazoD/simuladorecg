# Conservación de las medidas retiradas entre etapas

## Problema reproducido

`attachMeasurementSupport` puede retirar PR/QRS/QT/eje antes de la auditoría del
modelo y guarda el valor anterior en `rejected`. `auditMeasurement` reiniciaba ese
objeto, perdiendo la trazabilidad y el registro de una segunda auditoría. No se
había demostrado que restaurara una cifra retirada en la pantalla.

## Contrato

La auditoría clona la entrada, conserva los valores ya retirados y añade sus
propios rechazos sin sustituirlos por la referencia. Las cifras ausentes siguen
ausentes. Los motivos del primer rechazo, candidatos y soporte de muestras no
se borran. Una FC previamente rechazada conserva la cascada de invalidez de sus
intervalos dependientes. Reauditar no elimina el registro de rechazos.

No cambia `measure`, los filtros, fuentes, calendario, parámetros, umbrales ni
la política de calidad. No corrige precisión numérica ni acredita validación
clínica. Las doce señales permanecen intactas.

## Pruebas

`tests/audit-provenance.test.ts`: ocho casos con salida real del generador y del
analizador, retiradas selectivas, rechazo posterior adicional, cascada de FC,
no mutación y reauditoría. Cinco fallaban antes de la corrección.

El comparador de repolarización conserva la congelación exacta del delineador,
detector, supresión de impulsos y estadísticas. Identifica aparte el hash de
`model-audit.ts`: es una etapa posterior, no parte del analizador independiente.
Las pruebas de separación siguen prohibiendo importar referencia/verdad/modelo
en el bundle de análisis. No se regenera ninguna referencia de señal.
