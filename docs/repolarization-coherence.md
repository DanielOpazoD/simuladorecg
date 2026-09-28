# Coherencia de repolarización — entrega A01 → A02/A03

## A01: evidencia antes de cambiar el motor

Fuente congelada: `b744caca103f0aeefcdb7ddfd98fd5fea9f08588`.
Este primer PR NO cambia muestras, presets, analizador ni sus protocolos. El nuevo
comparador ejecuta la fuente congelada y la actual en el mismo runtime y exige
identidad de las doce derivaciones, eventos, referencias y advertencias en los
61 presets × cuatro filtros (244 escenarios; 14 640 000 pares de muestras).

Las pruebas anteriores de alcance sólo exigían finitud y dividían `beat.qrs` por
1000 aunque ya está expresado en segundos. Ahora se compara realmente la ventana
QRS completa de nueve familias con T activada/apagada. Se usan latidos separados,
no ruido ni IIR, y se declara el soporte de 40 ms del FIR de adquisición; no se
atribuye a fisiología un cambio de muestras causado por el filtro.

Un fixture manual independiente del generador comprueba que seis mutaciones no
puedan pasar: desplazar QRS, invertir T, alterar ST, escalar V6, perder un evento y
usar milisegundos donde se esperan segundos. La prueba comprueba también una
alteración terminal de QRS y rechaza ventanas vacías. No se instala un framework
de mutación ni se cambian tolerancias de pruebas históricas.

### Deudas conocidas de esta referencia

1. El ST secundario pre-PR43 ya no se sintetiza. La documentación que afirmaba
   conservarlo no describe esta versión. A01 lo congela como observación de
   software, NO como morfología aprobada.
2. Cuando existe `secondary.t`, se evita el camino de modificadores de `tVector`.
   La atenuación de T de BRI+hipokalemia puede ignorarse; la U sí se agrega aparte.
3. Torsades y WPW no se amplían en este bloque. No se modifica QT automático.

A02/A03 tendrá su propio diff causal, muestras antes/después, contribuciones
separadas, matriz de combinaciones y limitaciones. No se reinterpretará un verde
A01 como aprobación clínica ni se sustituirá la revisión humana por una prueba.

## Reproducción

`npm test` ejecuta las pruebas de regiones y mutaciones.
`node scripts/validate-repolarization-scope.mjs /tmp/repolarization-scope-results.json`
ejecuta la comparación congelada. Requiere historia Git y las dependencias de
desarrollo del proyecto. El informe se archiva en el job existente de fidelidad.
