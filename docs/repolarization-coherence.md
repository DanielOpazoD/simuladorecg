# Coherencia de repolarización — entrega A01 → A02/A03

Nota de versión: esta entrega histórica documenta el ST ausente y un candidato rechazado.
La implementación posterior y sus límites están en [secondary-st-resolution.md](secondary-st-resolution.md).

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

## Segunda etapa: A03 y corrección explícita del alcance A02

A01 se integró mediante PR46 (`31e3751079c2fd00da75bf62f9a12d6422ac8114`).
La segunda etapa conserva sus pruebas discriminativas y usa el mismo origen
congelado `b744caca`. Un oráculo separado modifica literalmente sólo el factor T
de esa fuente antigua; no importa el nuevo `tVector` ni los módulos del candidato.

El vector que entrega `tVector` es ahora el que se emite. Hipokalemia/hiperkalemia
y fases permitidas actúan después de elegir la dirección secundaria. Se rechaza
la combinación de potasio alterado y fase isquémica activa sobre T secundaria.
No se inventa una composición clínica multiplicando indiscriminadamente capas.
La sobrecarga participa mediante QRS; el Eje T no gobierna la T secundaria.
Estas fronteras se explican en los controles existentes.

La matriz fijada contiene seis familias × tres estados de potasio × tres fases:
54 combinaciones, 30 representadas y 24 rechazadas explícitamente. Los 244
preset/filtro predeterminados deben permanecer exactamente iguales a la fuente
congelada. En combinaciones personalizadas se exige coincidencia con la predicción
independiente a 1e-12 mV, sin modificar tolerancias de los gates históricos.

### Resultado negativo conservado: no promover el candidato ST

Se ensayó una contribución `ST = -0,20 × suma(kernel.vector × sigma)` para BRI y
fuentes ventriculares, sin torsades. Comenzaba después de J, con rampa de 12 ms;
no dependía de `tAmp` y era distinta de la lesión primaria. El coeficiente se fijó
antes de evaluar. No procedía de una calibración clínica y nunca se presentó como
perfil aprobado por especialistas humanos.

En los 920 escenarios de ruido ya expuestos del proyecto, la comparación local
mostró:

| Métrica agrupada del ensayo | Fuente histórica | Candidato ST rechazado |
|---|---:|---:|
| Complejos emparejados (TP) | 9868 | 9866 |
| Detecciones extra (FP) | 5240 | 5317 |
| Complejos omitidos (FN) | 252 | 254 |
| QRS erróneos etiquetados utilizables | 160 | 185 |
| QT erróneos etiquetados utilizables | 146 | 146 |

Son escenarios repetidos de software, **no pacientes independientes**. Las bandas
de error son las del protocolo de ingeniería existente, no umbrales diagnósticos.
La evaluación usó las mismas funciones TypeScript transformadas y Node22.16 local;
no se presenta como un run de GitHub ni un ensayo clínico. Las señales de ruido
procedían del artefacto previamente expuesto, con hash verificado. Una comparación
pareada usando la misma fuente nueva en ambos lados aprobó, pero eso **no anulaba
el deterioro respecto de la fuente histórica**. Por ello no se usó ese resultado
para reemplazar el gate de no regresión.

Árbol local del candidato NO publicado:
`8a421b19dfe0edca9bec935b48f284c9747da36f`.
SHA256 de su `signal.ts`:
`bea139c8e914cac676404e5d61129bb6a828ff987cf7a78ccc5b333d985b18c7`.
El código, patch y reportes negativos se conservan en la evidencia de esta entrega,
fuera del código de producción. Los scripts/protocolo/gates de ruido del PR final
permanecen intactos respecto de A01; no hay excepciones nuevas de fuente ni
actualización de snapshots para ocultar el resultado.

**Estado A02:** corregida la discrepancia de documentación/interfaz y declarada la
contribución ausente. **No se ha recuperado una síntesis ST secundaria aceptable.**
Ese objetivo numérico permanece abierto; no se considera cubierto por corregir T.

### Verificaciones de la segunda etapa

- Pruebas de T final, respuesta real en las doce derivaciones, modificadores y
  rechazo explícito; el ST primario y la U no se confunden con T.
- Comparación congelada 244 casos exactos + predicción independiente de la matriz.
- Mismo analizador y protocolos externos; sin uso de otro holdout.
- Recorrido de navegador sobre build: BRI normal → T apagada → hipokalemia →
  hipokalemia/T apagada → combinación no admitida → recuperación exacta.
  Se comparan las muestras exportadas, no sólo el texto de los controles.

Comando de la segunda etapa:
`node scripts/validate-repolarization-scope.mjs /tmp/repolarization-scope-results.json --coherence`.
Los resultados completos de CI y SHA final se registran en el PR; este documento
no afirma una ejecución antes de que exista su artefacto.
