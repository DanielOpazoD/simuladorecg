# Adaptación ventricular y relaciones QRS–ST–T: decisión de esta ronda

## Protocolo de decisión previo a cualquier ajuste

Base: `cdd55811bf260e0b74c564d454f658495f72d67e`. Fecha: 2026-10-26.
El objetivo es profundizar dos mecanismos existentes, sin añadir diagnósticos,
controles, nuevas fuentes fisiológicas ni cambios al analizador congelado.

Esta ronda separa tres preguntas: qué hace el generador completo, qué permiten
medir las referencias disponibles y qué corrección puede aceptarse. Una
discrepancia de unidades, una correlación sintética o el cumplimiento de una
fórmula no acreditan por sí solos una mejora clínica.

Antes de ejecutar las caracterizaciones se fijan los protocolos específicos:

- [Exposición y aptitud de referencias](fidelity-evidence-audit.md).
- [Adaptación temporal ventricular](ventricular-timing-audit.md).
- [Relaciones conjuntas de la señal final](joint-morphology-audit.md).

## Condiciones de aceptación

1. **Identidad y exposición.** Debe existir una lista verificable de pacientes
   de entrenamiento, selección, ajuste y evaluaciones previas. La independencia
   se comprueba a nivel de paciente y fuente original, incluyendo sus derivados.
   Una política de partición o la ausencia de archivos no prueban independencia.
2. **Aptitud para la pregunta.** Para adaptar ST–T hacen falta secuencias con
   historia RR, anclas temporales y medidas de repolarización comparables. Una
   mediana aislada con un RR resumen no identifica una constante de adaptación.
   Para relaciones QRS–ST–T hacen falta amplitudes y tiempos trazables, medidas
   conjuntas en el mismo paciente y familia, y métodos compatibles. No se mezclan
   ST en J, J60 y una muestra que ya cae dentro de T como si fueran equivalentes.
3. **Criterio externo congelado.** Antes de abrir una nueva reserva se fijarán
   las relaciones prioritarias, el estimando por paciente, las exclusiones,
   la precisión y el tamaño necesarios por familia. Los márgenes de mejora y
   no inferioridad deben justificarse mediante incertidumbre de medición y
   relevancia de la relación; no se elegirán a partir del candidato o la reserva.
   Sin esa justificación, la evaluación será descriptiva e inconclusa.
4. **Comparación emparejada.** Basal y candidato usan las mismas entradas,
   versiones y semillas. Se evalúan las muestras finales tras las transformaciones
   del escenario. Las semillas y derivaciones no cuentan como pacientes nuevos.
   Se informan resultados y faltantes por familia; una mejora agregada no
   compensa un deterioro relevante en otra familia.
5. **Contratos y controles negativos.** Deben conservarse los contratos causales,
   la continuidad local y las rutas que no son objeto de la intervención. Los
   instrumentos deben detectar alteraciones deliberadas de unidades, escala,
   polaridad o referencia temporal. Los eventos del generador pueden delimitar
   ventanas internas, pero no actúan como anotaciones humanas independientes.
6. **Conservación y decisión.** Se preservan el protocolo, las entradas y sus
   huellas, los fallos del instrumento, las exclusiones y cada resultado adverso.
   Solo se acepta una corrección con mejora externa en las relaciones priorizadas,
   reserva adecuada y ausencia de regresiones relevantes. Superar pruebas de
   software autoriza el instrumento, no un ajuste fisiológico.
7. **Plausibilidad clínica.** Además de lo anterior, elevar una afirmación de
   plausibilidad requiere revisión humana independiente documentada. Una revisión
   por agentes, un informe automático o un paquete sin lecturas no la sustituyen.

## Referencias que delimitan la inferencia

La distinción entre cuánto cambia QT con RR y a qué velocidad se adapta está
descrita en [Malik et al., 2018](https://link.springer.com/article/10.1007/s10928-018-9587-8).
Ese trabajo no valida una constante universal ni el mecanismo ventricular de
este simulador. [PTB-XL](https://physionet.org/content/ptb-xl/1.0.3/) ofrece
identidades y particiones por paciente; respetarlas es necesario, pero no borra
la exposición posterior de una partición durante el desarrollo.

Los resultados de esta ronda se incorporarán a continuación sin reescribir estos
criterios para acomodarlos a los hallazgos.

## Resultado y decisión

**Se acepta el instrumento de auditoría; no se acepta una corrección fisiológica
ni una elevación de plausibilidad clínica.** El generador y el analizador no se
modifican. Los informes conservan separados el resultado de controles de software,
la cobertura de medición y la aptitud de la evidencia externa.

| Mecanismo | Caracterización | Límite que impide aceptar un ajuste |
| --- | --- | --- |
| Adaptación ST–T ventricular | 75 celdas y 12 sondas adicionales de historia PVC; 408 latidos medidos y 630 excluidos en la matriz principal. Pasan 12 controles QTc inactivos y seis de duración propia. | Las rutas ventriculares regulares arrancan en equilibrio; el barrido no identifica cinética. La ventana fija pierde cobertura ventricular/VVI a 100 y 140 lpm. |
| Relaciones QRS–ST–T finales | 144 registros sintéticos en NORM/CLBBB/CRBBB; 5.184 controles matemáticos finales sin fallos. Se conservan 3.683 ventanas sin ambos cruces de media altura y 78 extremos a J60 o anteriores. | No hay delineación externa de T. La falta de soporte de anchura es especialmente importante en CLBBB y no equivale a una anchura patológica demostrada. |

La auditoría temporal rastrea una inconsistencia de unidades concreta: PVC y
VPACE entregan segundos al campo latente que el runtime llama `rrMs`, mientras
NORM entrega milisegundos. La ruta ventricular actual no usa ese campo para
adaptar ST–T. La referencia de 0,8 s no procede de una normalización temporal
demostrada de cada forma de origen. Corregir nombres o sustituir el denominador
no demostraría por sí solo una relación fisiológica mejor.

La caracterización conjunta conserva el cambio de signo del máximo absoluto
de repolarización en CLBBB, semilla 3313, derivación II, al multiplicar la
ganancia QRS por 1,2. La estadística puede cambiar de lóbulo en una forma bifásica;
no se presenta como inversión clínica de T ni se elimina el caso. Las variantes
con controles naturales y configurados son idénticas en BBB por diseño y cambian
varios controles en NORM: no aíslan el efecto causal de la normalización de fases.

El inventario incorpora la selección histórica de PTB-XL recuperada del
[run 37578264897](https://github.com/DanielOpazoD/simuladorecg/actions/runs/37578264897),
con huella del ZIP cotejada frente a GitHub. Recuperar un manifiesto mejora la
trazabilidad, pero no convierte sus pacientes ya evaluados en una reserva nueva.
La unión acreditada contiene 611 pacientes expuestos: 605 de PTB-XL y seis de
STAFF. Los 512 recuperados y los 94 fenotipos aislados comparten un paciente;
las 64 medianas/originales pertenecen al conjunto de 512 y no se suman otra vez.
Son un mínimo observado, no el total demostrado de exposición de los modelos.
La [auditoría de exposición](fidelity-evidence-audit.md) detalla los manifiestos
ejecutados todavía ausentes, las reservas históricas ya expuestas y la aptitud
de unidades por fuente. No se inspeccionó una nueva reserva para elegir un ajuste.

## Verificación y conservación

Las pruebas del instrumento emplean señales analíticas y alteraciones deliberadas
de tiempo, ganancia, polaridad, valores no finitos, referencias inválidas y
soporte ausente. La revisión técnica cruzada encontró defectos del propio
instrumento: aceptación de una referencia NaN, tiempo de pico sin amplitud
suficiente, QRS negativo y errores de ejecución que impedían conservar el informe.
Se corrigieron con pruebas específicas. Las corridas anteriores permanecen
conservadas; los documentos de cada instrumento registran las enmiendas sin
cambiar semillas ni umbrales para mejorar las cifras.

CI ejecuta las tres auditorías y conserva sus JSON en el artefacto
`fidelity-characterization`, también si fallan. Los informes completos contienen
procedencia, huellas y resultados por familia. Los errores de instrumento producen
fallo de software; la falta de reserva, soporte o revisión humana permanece
explícita y no se transforma en una aprobación clínica. La metrología independiente
de pantalla/PNG y los contratos causales existentes siguen en la verificación
general, separados de estas mediciones sobre muestras.

Para la siguiente decisión siguen faltando los manifiestos de entrenamiento y
exposición necesarios para acreditar una reserva, referencias temporales y
morfológicas aptas para cada pregunta, márgenes de comparación justificados antes
de abrirla y revisión humana independiente para elevar plausibilidad. Los datos
actuales no permiten elegir una nueva constante de adaptación, atribuir la
discrepancia conjunta a una transformación específica ni demostrar superioridad
clínica de un candidato.
