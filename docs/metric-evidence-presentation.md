# Presentación de medidas ausentes

## Problema
PR y eje podían mostrar una cifra conservada aunque su evidencia fuera
«No estimable». La frecuencia de monitor sustituía null por cero. Un contexto
que ocultaba una cifra podía conservar un indicador de reproducibilidad.
Esto puede enseñar una certeza o una ausencia de actividad que no se ha medido.

## Contrato
Todas las tarjetas retiran la cifra si su evidencia es unavailable. Un valor
no finito/ausente o suprimido por el contexto nunca se presenta con estado usable.
El monitor muestra «—», no 0, ante frecuencia ausente/no finita. Un cero realmente
medido no se confunde con null. La ventana rotulada procede de los límites del
análisis, no de una constante independiente. No se modifican medidas ni muestras.

## Refutación
Fixtures con números retenidos y evidencia unavailable en las cinco métricas,
FC null/NaN/Infinity, BAV completo y ventana distinta de 10 s. Los valores válidos
y su redondeo siguen los contratos previos. Cambiar presentación no valida el
analizador; tampoco convierte las restricciones de contexto en imposibilidades
clínicas.
