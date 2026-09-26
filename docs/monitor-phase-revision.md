# Monitor 0,5–40 Hz: fase cero y compromiso explícito de filtrado

## Alcance y motivo

Primera de las tres mejoras autorizadas tras PR21. `monitor` cambia de secciones
causales a Butterworth bidireccional (HP2+LP2, ambas pasadas), con corrección
bilineal de las frecuencias para que 0,5 y 40 Hz sean los puntos finales −3 dB.
No es un filtro de adquisición causal ni un equipo certificado: la aplicación
reproduce un buffer ya calculado. Usa muestras futuras. El selector indica fase cero; Modelo ya explica la reproducción de un buffer.

`off`, `diagnostic` 0,05 Hz y `aggressive` causal 2–40 Hz quedan bit-idénticos.
El último conserva su propósito explícito de demostrar distorsión; NO se afirma
que proteja ST/T. El generador, calendario y analizador no cambian. Únicamente
la adquisición monitor recibe 4 s de señal futura real además de su guarda
previa. El filtro extiende hasta 4 s mediante reflexión impar en sus bordes;
no utiliza eventos, diagnósticos, señal limpia ni límites QRS/T para filtrar.
La banda limitada todavía puede modificar amplitudes, QRS finos y bordes.

## Validación física independiente

`tests/monitor-phase.test.ts`: respuesta −3 dB y fase en 0,5/10/40 Hz a250/500/1000Hz,
DC, linealidad, finitud, preservación histórica y comparación con un oráculo
SciPy independiente (`butter`+`sosfiltfilt`) de pulsos y sinusoides.
En cinco casos y ambas clases de latido de la EV: J60 <0,025mV, QRSpp <0,05mV,
área absolutaT <0,004mV·s; extremos positivo/negativoT <0,04mV. Son contratos de
regresión sintética, no tolerancias clínicas. El último margen se fijó tras
observar 0,033mV en desarrollo; una aspiración inicial de0,03 no se cumplió enEV.
No se oculta como una precisión adquirida ni se denomina reserva a esos datos.

## Enmienda al contrato PR21, sin borrar sus resultados

Una migración de fase no puede conservar todos los errores puntuales de una
realización de ruido: un sesgo causal puede cancelar accidentalmente ese ruido.
La referencia histórica sigue siendo aee59f6. Se ejecuta su comparación estricta
completa, se conserva su resultado y CADA deterioro en el artefacto. El checker
no permite cambios fuera de `monitor` y requiere el hash revisado del filtro.
En monitor exige: ninguna media morfológica peor; medias deJ60/Tpico/áreaT almenos
15% menores; RMSE medio almenos2% menor; sin pérdida agregadaTP ni aumentoFP/FN.
No aumentan errores usable ni disminuyen observaciones correctas usable/retenidas
en FC/QRS/QT al agregar las 230 condiciones monitor. Se publica también
cualquier empeoramiento por estrato; no se afirma no-inferioridad en cada uno. Se permite hasta
10% en p95/máximo (compromiso explícito del nuevo operador, no margen clínico).
No se actualizan ni el protocolo de ruido ni la identidad de las señales limpias.

Los resultados de desarrollo reducen medias deST/T y ruido pero aumentan la cola
de errorQRS. El picoT con signo es discontinuo si dos lóbulos casi iguales cambian
cuál domina: V5 enEV conserva esa bandera (~0,439mV), mientras ambos extremos
cambian <0,04mV. Se retiene la métrica histórica y se comprueban ambos extremos;
NO se elimina el caso, ni se llama a esa diferencia cero.

El ensayoNSTDB ya fue expuesto. Nuevas ventanas de las mismas fuentes solo serían
réplica temporal, no pacientes independientes. No hay validación clínica nueva.
La aprobación depende de tests, informe completo, revisión y CI de producción.

## Fuentes metodológicas

SciPy sosfiltfilt: https://docs.scipy.org/doc/scipy/reference/generated/scipy.signal.sosfiltfilt.html
Filtrado bidireccional, condiciones iniciales y extensión: https://docs.scipy.org/doc/scipy/reference/generated/scipy.signal.filtfilt.html
NSTDB: https://physionet.org/content/nstdb/1.0.0/
La fuente sustenta el método, no los coeficientes ni el rendimiento clínico local.
