# Ganancia y bajo voltaje coherentes en la sobrecarga del VD

Base: PR39 integrado, `d2babc398a246787fbb8e3156668b90a31781f30`.

## Cambio causal

`qrsKernels` añadía un componente VD después del bucle que aplicaba la ganancia y
la atenuación. Sus tres coordenadas permanecían fijas al modificar `qrsAmp` o
activar bajo voltaje. En VD crónico, reducir la ganancia podía aumentar la R de V1.

Una expresión aplica `qrsAmplitudeScale(c)` al componente añadido. Se conserva
su forma, orientación, duración y la distinción aguda/crónica; la función de
escala y el factor 0,38 ya existían. Sin nuevo control, estado, dependencia o
modelo. Esto corrige consistencia del programa, no valida voltajes clínicos.

## Preset predeterminado que cambia deliberadamente

`rv_chronic` utiliza ganancia 1,2: su contribución VD ahora aumenta también 20 %.
Por ello no se afirma que los 61 presets conserven sus muestras. Los otros 60
presets (240 escenarios con cuatro filtros) permanecen exactamente iguales.
El preset agudo usa ganancia 1 y también permanece exacto. No se alteran presets
para ocultar el cambio ni se añade una modalidad histórica al producto.

Sólo se actualiza el snapshot de II de `rv_chronic`, después de verificar la señal
completa. En los validadores existentes se exige para ese preset:

`nuevo = anterior + (ganancia * atenuación - 1) * componenteVD_anterior_a_ganancia1`

El componente se extrae de dos señales del generador congelado: con y sin VD,
con P/T/ST cero, igual calendario y mismo filtro. El oráculo no importa las
constantes del kernel nuevo. Rechaza cambios ajenos, datos no finitos, modificación
de tiempos, dejar el fallo intacto o una diferencia vacía. Su ámbito se limita a
casos sinusales normales/BRD incompleto sin otra lesión ni extrasístoles.
Los baselines y aserciones previos para posterior/WPW no se retiran ni relajan.

## Reproducción local

Trece pruebas nuevas: diez fallan sobre PR39 y las trece pasan tras corregir.
Incluyen VD agudo/crónico, cuatro filtros, cinco ganancias y ambos estados de
voltaje; prueba de los tres ejes para distintos orígenes de activación, combinación
WPW+posterior, reversión de electrodos y conservación fuera del QRS+antialias.
Seis pruebas adicionales protegen el oráculo de aceptación. Ejecución focal nativa
con transformación TypeScript/node:test; no equivale a la suite Vitest de CI.

Comparación nativa contra PR39: 80 escenarios VD; máximo error de proporcionalidad
1,957477 mV -> 1,43e-12 mV. Se mantiene la tolerancia numérica 1e-10 mV.
240 escenarios predeterminados exactos y cuatro cambios crónicos explicados
muestra a muestra por el oráculo; 192 controles personalizados sin VD exactos.
En el preset crónico, diferencias máximas según filtro: 0,158 a 0,196 mV.
Esos valores son cambios/errores matemáticos, no exactitud frente a pacientes.

## Cierre y límites

El workflow de fidelidad existente amplía sus comparaciones y recorrido de
navegador, sin infraestructura nueva. Chromium sobre producto compilado:
VD agudo/crónico -> reducir ganancia -> restaurarla -> exportar JSON -> importar
bajo voltaje -> reimportar normal -> canvas completo idéntico al inicial.
Escritorio 1440x1000 y móvil emulado 390x844; Browser plugin no disponible.
Se conserva el mismo recorrido para posterior/WPW. La ganancia de referencia del
preset crónico es 1,2, no se confunde una captura a 1 con su valor predeterminado.

No cambia el código del analizador ni los tiempos eléctricos. Las mediciones de
las señales corregidas pueden variar o abstenerse. La conservación temporal de
P/ST/T se prueba en los presets sinusales normales/BRD incompleto sin filtro;
no se extrapola a otras combinaciones que generan ST secundario desde el QRS,
a filtros de soporte extendido ni a fidelidad de toda mezcla de patologías.

Revisar CI, artefactos y capturas antes de integrar y repetir comprobación en main.
No nuevo holdout, calibración contra amplitudes PTB incompatibles, despliegue,
nueva licencia/versión ni validación clínica.
