# Aceptación inicial de los fenotipos existentes

Este documento define una primera base de **regresión semántica del generador**.
Comprueba características observables de las muestras: polaridad, relación entre
derivaciones, secuencia de deflexiones y separación entre componentes. No certifica
el diagnóstico, la equivalencia con ECG de pacientes ni una valoración humana.

Las pruebas están en [`tests/phenotype-acceptance.test.ts`](../tests/phenotype-acceptance.test.ts).
No añaden patrones, controles ni módulos. Complementan las pruebas de señal,
delineación independiente, auditoría y geometría existentes.

## Tres capas que deben mantenerse separadas

| Capa                                                                     | Qué comprueba                                                                                         | Qué no demuestra                                                                             |
| ------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Generador: este conjunto                                                 | Que las muestras conservan rasgos previstos en el catálogo y contratos eléctricos/de reproducibilidad | Que un paciente con ese aspecto tenga determinada enfermedad; exactitud de un analizador     |
| Analizador: `delineation`, `discrimination`, `external`, `audit`         | Estimación a partir de muestras y comportamiento de la auditoría posterior                            | Que un rasgo sintético coincida con la distribución clínica o que el render lo conserve      |
| Presentación: pruebas de layout, calibres, exportación y revisión visual | Transformación de tiempo/amplitud a papel y funcionamiento de la interfaz                             | Validación fisiológica del generador ni recuperación independiente de la curva desde píxeles |

Las pruebas nuevas **no llaman a `measure`, `auditMeasurement`, `qrsKernels`,
`tVector` ni a las funciones de corrección local**. Los eventos del generador
únicamente sitúan las ventanas que se van a inspeccionar; los valores evaluados
proceden de `signal.leads`. Usar esos eventos como anclas es adecuado para probar
el generador, pero impide presentar estos resultados como delineación independiente.

## Contrato común de los 61 presets actuales

Cada preset no pendiente se sintetiza dos veces. La segunda ejecución cambia solo
la presentación: vista, formato, velocidad, ganancia general y precordial, Cabrera,
paleta, ajuste al ancho y píxeles por milímetro.

En **I, II y V1–V6**, la longitud debe coincidir con duración × frecuencia de
muestreo, todas las muestras deben ser finitas y cada muestra debe coincidir
exactamente con la primera ejecución. Así se comprueban reproducibilidad e
independencia respecto de la presentación en las ocho entradas independientes,
incluidas las precordiales con correcciones locales.

La igualdad exacta tiene aquí un motivo físico: cambiar los mm/mV o invertir la
presentación de aVR en Cabrera no debe cambiar el ECG almacenado en mV. No es una
exigencia de que una versión futura del motor produzca las mismas muestras.

La prueba eléctrica existente en `engine.test.ts` ahora comprueba
`abs(III − (II − I)) < 1e−9`, corrigiendo una desigualdad unilateral que podía
aceptar errores negativos grandes. Las relaciones de Goldberger siguen comprobadas
contra cero. Esta tolerancia expresa cierre algebraico en coma flotante, no
precisión de un electrocardiógrafo. Se mantiene la prueba con ruido, deriva,
electrodo suelto y filtros.

Los hashes históricos de DII conservan su papel de alarma ante cambios. **No se
introdujeron nuevos hashes ni se actualizaron masivamente los anteriores para
aprobar esta batería.** Se revisó y cambió solamente la referencia de
`lowvoltage`, por la corrección de amplitud de T realizada en esta entrega:

- La componente Z de T ahora escala con `tAmp` igual que el resto del vector;
  con `tAmp = 0,15`, pasa de −0,07 a −0,0375. Esto corrige una componente
  precordial residual que no respetaba el control de amplitud.
- La comparación contra `tests/reference/baseline-v1.1.mjs` reproduce exactamente
  el hash DII histórico del preset. Ese generador había mantenido sus muestras
  durante v1.2. En las derivaciones de miembros el cambio máximo es inferior a
  `1e−15 mV`, atribuible a redondeo; en V2 alcanza `0,04054342104079958 mV`, por el
  cambio intencional de T. No se atribuye al QRS una modificación morfológica.
- Hash DII anterior:
  `0df37ee8aedd5661ec3a2daf64cb8069825d0e30981cda718bd1596f4715865c`.
- Hash DII revisado:
  `2582dce139bb8306a0e3e40f7c74afb5d488760158428a54988b061c168639f9`.

Los otros 60 hashes permanecen intactos. Las futuras modificaciones intencionales
de la señal deben revisar su causa y su efecto por separado antes de actualizar
una referencia. Esta excepción ilustra también por qué un hash de DII no basta
para describir un cambio precordial y se necesitan criterios semánticos en más
derivaciones.

## Condiciones de las pruebas específicas

- Parámetros de cada preset, con variabilidad de RR en cero para comparar la forma.
- Frecuencia de salida nativa: 500 Hz.
- Sin artefactos añadidos; se ejecutan por separado con filtro `off` y
  `diagnostic`. `off` conserva el antialias de la cadena de salida.
- Registro de 10 s; el caso de extrasístole ventricular usa 20 s para disponer de
  varios complejos prematuros interiores sin cambiar su acoplamiento.
- Se exige más de un latido interior y se inspeccionan hasta tres, excluyendo el
  primer y último segundo del registro y los finales T que quedarían fuera.
- La referencia de amplitud habitual es la media entre 35 y 20 ms antes del QRS.
  En WPW y ectopia no se presupone un segmento PR isoeléctrico: se utiliza un
  control emparejado o ventanas explícitas, según el criterio de abajo.

## Criterios iniciales comprobados

Los intervalos de esta tabla están referidos al inicio QRS programado, salvo que
se indique J, donde J = inicio + duración QRS programada. Son ventanas de prueba
del generador, no estimaciones del punto J de un ECG clínico.

| Fenotipo                       | Criterio sobre muestras                                                                                                                                 | Margen inicial y propósito                                                                                                                                                                       |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Sinusal                        | P positiva en II y negativa en aVR entre −145 y −75 ms; QRS neto positivo en I/II; predominio S en V1/V2, aumento R/S de V2 a V3 y R dominante en V4–V6 | Media P II >0,04 mV y aVR <−0,03; media QRS I >0,05 y II >0,1; R/S >2 en V4–V6. Detecta pérdida de polaridad o de progresión, sin imponer crecimiento monótono de R hasta V6.                    |
| BRD                            | V1 con deflexión inicial positiva, intermedia negativa y terminal positiva; positividad terminal en V2 y S terminal lateral; T negativa en V1           | Primera r >0,02 mV, S <−0,3, terminal V1/V2 >0,3, terminal I/V5/V6 <−0,2; media T V1 <−0,05. Añade relaciones entre derivaciones a la prueba de anchura existente.                               |
| BRI                            | Activación predominantemente negativa en V1 y positiva en I/V5/V6 durante 30–140 ms; T secundaria de signo contrario entre 230–360 ms                   | QRS medio V1 <−0,3 mV y lateral >0,2; T media V1 >0,1 y lateral <−0,1. No afirma que toda localización de BRI clínico siga una única plantilla.                                                  |
| WPW                            | Deflexión precoz adicional frente a un control con el mismo PR y QRS ancho, pero conducción normal; actividad auricular visible antes del QRS           | Diferencia media en II >0,1 mV entre 6–26 ms; rango de P antes del QRS >0,04 mV. Evita aprobar preexcitación por haber ensanchado únicamente el QRS. No valida localización de la vía accesoria. |
| Extrasístole ventricular       | Polaridad QRS/T discordante en V1 y V6 en varios complejos prematuros                                                                                   | QRS medio V1 <−0,2 mV y V6 >0,1 entre 25–130 ms; T V1 >0,08 y V6 <−0,04 entre 280–350 ms. Usa la configuración predeterminada; no cubre cualquier prematuridad.                                  |
| Lesión inferior representativa | Elevación ST en II/III/aVF y reciprocidad en I/aVL entre J+20 y J+60 ms                                                                                 | II/aVF >0,1 mV; III supera II por >0,03; I <−0,04 y aVL <−0,08. Protege la dirección territorial del caso actual; no adjudica arteria culpable ni diagnóstico de infarto.                        |
| Wellens A                      | ST próximo a basal en V2/V3 y T bifásica con componente positivo previo al negativo                                                                     | ST absoluto <0,03 mV; máximo T >0,12 y mínimo <−0,25; el máximo precede al mínimo. No reproduce ni certifica todo el síndrome clínico.                                                           |
| Wellens B                      | ST próximo a basal y T predominantemente negativa en V2/V3                                                                                              | ST absoluto <0,03 mV; máximo T <0,04, mínimo <−0,25 y media <−0,1. La simetría exacta y su variación clínica siguen pendientes.                                                                  |
| De Winter                      | Depresión ST temprana, ascenso posterior y T mayor que en el control sinusal, en V2/V3/V4                                                               | J+4–12 ms <−0,08 mV; aumento hasta J+40–60 >0,03; pico T supera al control en >0,25. Conserva el patrón parcial actual; no comprueba ni añade elevación de aVR.                                  |
| AAI                            | Estímulo visible y conservación de polaridad ventricular intrínseca                                                                                     | Rango local de espiga en II >0,7 mV; media QRS V1 <−0,2 y V6 >0,1. La anchura automática sigue cubierta en otras pruebas; no demuestra sensado o demanda.                                        |
| VVI y DDD                      | Estímulo visible, activación ventricular representativa y T secundaria discordante                                                                      | Rango local de espiga >0,7 mV; QRS V1 <−0,2/V6 >0,1; T V1 >0,08/V6 <−0,03. La ventana evita medir la espiga como amplitud del QRS. No valida sitio de implante, fusión ni fallos de captura.     |

**Procedencia de estos criterios:** rasgos prometidos por el catálogo actual,
contratos físicos de las unidades y revisión de las muestras del modelo v1.2.
Los márgenes numéricos se fijaron como límites iniciales de regresión tras esa
inspección; no provienen de una cohorte de pacientes ni de una adjudicación
clínica ciega. Están alejados de los picos exactos de la plantilla para permitir
cambios razonables de forma sin aceptar la desaparición del rasgo. No deben
convertirse en umbrales diagnósticos.

## Matriz de cobertura y pendientes

Todos los IDs siguientes reciben el contrato común de ocho canales. La columna
específica describe exclusivamente la batería nueva, no reemplaza los tests
previos del reloj, filtros o analizador.

| Familia                     | Presets actuales cubiertos por el contrato común                                                                                                                       | Aceptación específica nueva                                  | Pendiente de ampliar                                                                                                  |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------- |
| Ritmos                      | `sinus`, `brady`, `tachy`, `rsa`, `af`, `af_fast`, `af_slow`, `flutter`, `flutter3`, `svt`, `junctional`                                                               | `sinus`                                                      | Morfología/variación de P, actividad auricular de FA/flutter y superposición a distintas frecuencias.                 |
| Ectopia                     | `pac`, `pvc`, `bigeminy`, `trigeminy`, `couplet`                                                                                                                       | `pvc`                                                        | P ectópica, diferentes acoplamientos, interacción con T y mezcla de morfologías sin ventanas inadecuadas.             |
| Ritmos ventriculares        | `idioventricular`, `aivr`, `vt`, `torsades`, `vf`, `asystole`                                                                                                          | Contrato común                                               | Rasgos morfológicos y temporales específicos; no inferir validación de torsades de la apariencia rotatoria.           |
| Conducción AV               | `av1`, `wenckebach`, `mobitz2`, `av21`, `highav`, `complete`, `complete_v`                                                                                             | Contrato común; el reloj tiene pruebas previas               | Aceptación conjunta de actividad auricular visible, relación AV y superposición en las muestras.                      |
| Conducción intraventricular | `rbbb`, `irbbb`, `lbbb`, `lafb`, `lpfb`, `bifascicular`, `bifascicular_pr`, `wpw`                                                                                      | `rbbb`, `lbbb`, `wpw`                                        | Fascículos, BRD incompleto, combinaciones y diversidad de ejes.                                                       |
| Isquemia y ST               | `inferior`, `inferior_lcx`, `anterior`, `lateral`, `posterior`, `rv_infarct`, `diffuse`, `subendo`, `wellens_a`, `wellens_b`, `de_winter`, `sgarbossa`, `pericarditis` | `inferior`, `wellens_a`, `wellens_b`, `de_winter`            | Otras distribuciones y fases; criterios proporcionales, diferenciales y variación clínica.                            |
| Sobrecarga                  | `rv_acute`, `rv_chronic`, `lvh`                                                                                                                                        | Contrato común                                               | Voltajes, relaciones espaciales y distinción de variaciones normales.                                                 |
| Marcapasos                  | `aai`, `vvi`, `ddd`                                                                                                                                                    | Los tres modos representados                                 | Anchos de espiga, filtrado monitor y frecuencia de muestreo; sensado/demanda/captura siguen fuera del alcance actual. |
| Otros patrones              | `hyperk`, `hypok`, `longqt`, `shortqt`, `lowvoltage`                                                                                                                   | Contrato común; existen pruebas previas de QT/discriminación | T/U, relaciones de amplitud y evolución de los cambios; diversidad de fenotipos reales.                               |

Los cinco elementos `pending_*` no generan casos aceptados y quedan fuera de esta
matriz. **61 contratos de integridad no equivalen a 61 fenotipos clínicamente
validados.** La aceptación morfológica nueva alcanza 12 presets, en dos condiciones
de filtrado: 24 comprobaciones específicas y 61 comprobaciones comunes, **85** en
total. Tampoco equivalen a 85 pacientes ni a observaciones independientes.

## Reproducción y uso al cambiar el motor

```sh
npx vitest run tests/phenotype-acceptance.test.ts
npx vitest run tests/engine.test.ts
```

Cuando falla una prueba, se debe inspeccionar qué rasgo se perdió y si el objetivo
clínico representado sigue siendo correcto. No se amplían los márgenes ni se
regeneran hashes únicamente para hacer pasar la suite. Un cambio intencional de
objetivo requiere actualizar el catálogo, su justificación y sus pruebas de forma
coordinada.

La fase siguiente debería incorporar referencias clínicas externas nuevas y
revisiones humanas independientes de los fenotipos. Los controles LUDB ya
inspeccionados permanecen como regresión expuesta. Esta batería no los sustituye,
no usa sus anotaciones para fijar las formas y no cambia el detector congelado.
