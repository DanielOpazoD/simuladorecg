# Flutter con secuencias variables de conducción

## Defecto y mecanismo
El simulador solo ofrecía relaciones AV fijas; una respuesta ventricular irregular no podía explorarse manteniendo actividad auricular organizada. Se añaden dos secuencias docentes deterministas: alternancia 2:1/3:1 y 3:1/4:1. Cada intervalo ventricular contiene exactamente el número indicado de ciclos auriculares. No se introduce azar para hacer parecer irregular el trazado.

Es una programación de respuestas, no un modelo del nodo AV, refractariedad, fármacos ni circuito anatómico de reentrada. La actividad F y su frecuencia permanecen independientes de esta selección. El modo fijo sigue siendo predeterminado y conserva exactamente los casos históricos.

## Predicciones e invariantes
A frecuencia auricular de 300/min, los RR alternan 400/600 ms o 600/800 ms. La condición inicial QT usa el RR ventricular medio de la secuencia; después adapta su historia con los RR reales. El control de relación fija queda desactivado en modo variable; su valor y la frecuencia base inactiva no pueden alterar muestras ni eventos. La semilla no cambia esta secuencia. Fuera del flutter el parámetro no tiene efecto.

No se proporciona una interpretación diagnóstica exclusiva: irregularidad ventricular no demuestra FA. Los patrones alternantes son ejemplos docentes, no una distribución poblacional ni todos los patrones posibles de conducción variable. La morfología F sigue siendo una aproximación del generador previo.

## Verificación
Cinco pruebas inicialmente rojas reproducen la ausencia de secuencias, efectos del control inactivo y falta de integración de configuración. Se prueban tiempos, escalado con frecuencia auricular, inicialización QT, conservación del modo histórico, normalización y estados de controles. Se actualiza únicamente la huella revisada del archivo de inicialización QT porque delega la relación media al nuevo módulo; no se alteran constante de adaptación, límites ni predicción de la referencia histórica.

Se requieren CI completo e inspección de capturas reales del modo nuevo antes de integrar. Validación clínica independiente pendiente.

## Evidencia y frontera fisiológica
[Tanaka y Fujimura, 2019](https://pmc.ncbi.nlm.nih.gov/articles/PMC6522435/) presentan flutter con conducción variable y analizan bloqueo multinivel. Su caso también muestra por qué los RR no tienen que ser múltiplos enteros del ciclo auricular cuando cambia el retraso de conducción. Este PR representa únicamente secuencias con retraso AV constante; no reproduce ese caso ni el mecanismo de Wenckebach multinivel. Las alternancias elegidas son ejemplos de ingeniería, no valores calibrados a esa publicación.
