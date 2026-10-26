# Final ventricular aprendido sin cola Ta artificial

## Contrato y objetivo

El objetivo es que una fase que ya termina en la línea TP no recupere su nivel
sin atenuar en la última muestra. Una cola Ta adicional corresponde únicamente
a una P bloqueada. No cambia el calendario, el modelo aprendido, los números
aleatorios, las duraciones ni la interpolación de las fases.

Este cambio continúa el contrato PR–QRS: sobre su guardia
`mode !== "atrial-conducted"`, se excluye también el modo ventricular y queda
`mode === "atrial-blocked"`. Si se aplica sobre una fuente anterior a PR–QRS,
ambos arreglos de modo se deben considerar al interpretar las diferencias.

## Reproducción anterior a la corrección

Con `addVentricular`, fs = 1000 Hz, inicio = 0,059 s, QRS = 80 ms,
ST-T = 250 ms y post-T = 260 ms, la última muestra cae en el índice 649.
Su tiempo local es `590.0000000000001 ms`, aunque la suma de fases es 590 ms.
Antes, la comparación `elapsed > phasesMs` entraba en la cola Ta de P bloqueada,
también para una plantilla ventricular. Así evitaba el ajuste final y la
envolvente de salida del post-T.

Una plantilla constante de −0,01 mV produce:

| Índice | Antes | Después |
|---|---:|---:|
| 648 | −3,50855e−8 mV | igual |
| 649 | −0,01 mV | 0 mV |
| 650 | 0 mV | igual |

Es una espiga de 10 µV de origen numérico, no una onda aprendida. Se reproduce
también con QRS de 90 y 100 ms. No se añade un épsilon al tiempo: el modo
ventricular sigue su rampa y su atenuación normales aunque el cálculo local
exceda la duración por una ULP. La P bloqueada conserva su cola exponencial.

## Plan be-ambitious

- **Altura:** reproducir la espiga; corregir su causa común en la colocación de
  fases; protegerla con un contrato analítico y comparación de muestras.
- **Profundidad:** empezar por los acumuladores independientes a 1000 Hz, antes
  del filtrado; observar el índice, el tiempo local y el nivel, sin recurrir al
  analizador. El objetivo exigente es cero cambios fuera de la muestra terminal.
- **Range:** aplicar aritmética de precisión finita y metrología de señal: una
  plantilla constante tiene una envolvente terminal conocida y permite
  distinguir un impulso de redondeo de un rasgo del modelo.
- **Acceso:** código y coeficientes ya distribuidos en el repositorio, Node,
  esbuild y Vitest disponibles. No se usan datos de referencia nuevos.
- **Juez:** expresión analítica de la envolvente, fallo reproducido antes de
  corregir y una comparación de cada muestra con el modo anterior.

```text
Elimina el impulso numérico al final post-T de las plantillas ventriculares.
Reproduce primero un final con nivel no nulo cuya última muestra exceda la
duración por redondeo. Conserva el calendario, las formas aprendidas y la cola
de las P bloqueadas. Se acepta cuando la envolvente analítica termina en cero,
las muestras fuera del índice terminal son idénticas al modo anterior y pasan
las regresiones de señal, tipos y CI.
```

## Pruebas y comparación emparejada

```bash
npx vitest run tests/ventricular-terminal-handoff.test.ts --maxWorkers=1
node scripts/verify-ventricular-terminal.mjs
npx tsc --noEmit
```

El archivo nuevo contiene seis pruebas. Cuatro fallaban antes de corregir y
las seis pasan después. Usa niveles constantes de magnitud 10–80 µV, con signos
alternos, en I, II y V1–V6; comprueba 500 y 1000 Hz, seis instantes alineados o
entre muestras, ganancias Ta heredadas 0/1/2 y una P bloqueada de control.
La tolerancia de nivel es 5e−13 mV, para aritmética de doble precisión; no es
una tolerancia clínica. La envolvente es una rampa post-T con atenuación
cosenoidal en su último 20 %, calculada directamente en la prueba.

El script forma dos bundles idénticos salvo una guardia de modo: el anterior
admite cola cuando `mode !== "atrial-conducted"`, como PR–QRS, y el candidato
solo cuando `mode === "atrial-blocked"`. Rechaza una fuente que no tenga
exactamente la guardia esperada. Es un contrafactual de una sola condición,
no una afirmación de identidad con un commit histórico completo.

Resultado local en Windows con Node 24.19.0:

| Medida | Resultado |
|---|---:|
| Plantillas: ocho poblaciones × cuatro semillas | 32 |
| Ensayos: cuatro pares QRS/ST-T × cinco inicios × tres ganancias | 1920 |
| Ensayos con cambio | 132 |
| Muestras modificadas entre las ocho derivaciones | 1056 |
| Mayor delta bruto | 79,5983 µV |
| Comparación fuera del único índice terminal permitido | igualdad exacta |
| Controles de P bloqueada | 32 con todas sus muestras idénticas |

Semillas 1, 13, 157 y 12066; poblaciones NORM, CLBBB, CRBBB, IRBBB, LAFB, LVH,
IMI y ASMI. Pares QRS/ST-T en ms: 80/250, 90/250, 100/250 y 120/200; instantes
0,059, 0,05900001, 0,05925, 0,0595 y 0,25 s. Son deformaciones temporales de
estrés para el colocador, no nuevos presets clínicos. Se comparan directamente
buffers de 2000 muestras a 1000 Hz, sin filtrado, ruido ni remuestreo. El post-T
es el del modelo de cada paciente. Las fases ventriculares y sus muestras
anteriores no se recalculan mediante otro algoritmo.

El informe reproducible y las huellas SHA-256 de ambas fuentes de la condición
quedan en `.sites-runtime/ventricular-terminal-handoff/paired.json`. No se
reescriben huellas históricas ni se sustituyen referencias para pasar pruebas.

El mismo script compara además la salida de los 63 presets activos durante
10 s, adquisición ideal y filtro de catálogo. Con el único cambio de modo
ventricular, 62 presets conservan todas sus muestras; cambia AAI. El informe
incluye las huellas anterior/candidata y si la referencia almacenada reproduce
la anterior. No las escribe automáticamente: al integrar sobre PR–QRS se debe
comprobar ese indicador antes de añadir una revisión selectiva para AAI.

Integración sobre PR–QRS: el indicador de AAI reproduce la referencia anterior.
Se añade exclusivamente `tests/__snapshots__/catalog-post-t-v3.json` para ese
caso, conservando las huellas originales y la revisión PR–QRS. El script también
comprueba el inventario y los valores de esta referencia nueva cuando existe.

Tras integrar sobre PR–QRS y verificar la revisión selectiva de AAI, pasan
113 pruebas en tres archivos: `ventricular-terminal-handoff.test.ts`,
`learned-atrial-handoff.test.ts` y `engine.test.ts`. `tsc --noEmit` también pasa.
Los tests de realismo y caché se habían comprobado adicionalmente en el worktree
del implementador. La CI verifica el artefacto del commit propuesto antes del merge.

## Límites

La prueba demuestra la eliminación de un artefacto de discretización. No mide
el parecido poblacional frente a ECG adquiridos, ni valida la fisiología o el
analizador. Un filtro puede extender el efecto de esa única muestra a muestras
vecinas de la salida; la igualdad exacta declarada corresponde a los
acumuladores previos al filtrado. La integración sobre PR–QRS necesita ejecutar
de nuevo las pruebas del repositorio y su CI sobre el commit final.
