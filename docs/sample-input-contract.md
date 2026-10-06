# Entrada del analizador: integridad antes de medir

## Defecto y contrato
Una entrada con NaN, canales desalineados o frecuencia inválida podía entrar al
analizador y devolver resultados vacíos o incoherentes, confundiendo corrupción
de datos con falta de ondas reconocibles. La entrada pública `analyzeSamples`
rechaza estos registros con derivación y causa antes de invocar el detector.

Se exige el dominio de adquisición ya declarado por el lector externo: fs entera
100–1000 Hz, doce vectores Float32Array o Float64Array no vacíos, de igual longitud y finitos.
Es una restricción de ingeniería, no una recomendación de frecuencia clínica.
No se rellenan canales ni se normalizan/resamplean valores. Ninguna muestra de
entrada se modifica. `measure()` permanece congelado para las regresiones
históricas: el contrato pertenece a la entrada pública utilizada por el worker.

Las unidades siguen siendo mV y segundos, según el contrato previo. No pueden
inferirse a partir de amplitudes plausibles. La relación entre muestras, frecuencia
y tiempo se describe en la documentación primaria WFDB:
https://physionet.org/physiotools/wpg/wpg_3.htm

## Refutación y verificación
Pruebas de corrupción en las doce derivaciones, canal ausente, longitud distinta,
registro vacío y frecuencias inválidas; pruebas de no mutación a 100/250/500/1000 Hz.
La batería preexistente compara resultados numéricos en todos los presets activos.
Una entrada finita no demuestra exactitud del detector ni valida una patología.
