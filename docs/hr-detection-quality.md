# FC: incertidumbre de detección antes de la auditoría del modelo

## Problema y alcance

PR19 mostró 15/15 estimaciones brutas de FC con error >5 lpm, clasificadas
`usable`, en movimiento de electrodos a 0 dB sin filtro. Es un resultado de
estrés conocido, no 15 pacientes. La guía de datos propone evaluar cuándo
corresponde declarar calidad insuficiente, no confundir limpieza con exactitud.

Se añade `analyzeSamples({fs, leads})` como entrada del worker. Ejecuta el
primitivo numérico `measure()` sin modificarlo y una comprobación independiente
**de las referencias del generador**, pero NO un segundo detector independiente.
La auditoría `auditMeasurement()` continúa después, exclusivamente en la UI.

- Generador, filtros, perfiles, eventos, medidas y límites no cambian.
- Solo `evidence.hr` puede pasar de `usable` a `review`, con motivo visible.
- `review` CONSERVA la cifra para revisión manual; no significa corrección del
  error. No se borran picos ni se reemplaza la FC por la referencia sintética.
- No se promociona una medida `review`/`unavailable` ni se alteran otras variables.
- El analizador completo de la aplicación es ahora `analyzeSamples`, no una
  llamada aislada a `measure`. Los benchmarks históricos de este último siguen
  describiendo el primitivo congelado, no el nuevo control de calidad.

## Regla interpretable, no probabilidad calibrada

Se repite la selección de candidatos con fracción 0,60 en vez de 0,35.
Se emparejan los picos uno a uno a 40 ms. Se solicita revisión SOLO si concurren:

1. mediana de energía / percentil 98 de energía >0,10;
2. al menos dos candidatos no emparejados;
3. fracción no emparejada ≥0,075 del mayor conjunto.

La energía es la del detector; el cociente NO es SNR ni energía fisiológica.
Los 40 ms emparejan salidas del mismo algoritmo; no son tolerancia de exactitud
clínica. No se emplean frecuencia configurada, etiqueta de ruido, SNR conocido,
regularidad RR, origen del latido, eventos, `truth` ni resultados de auditoría.
La conjunción evita rechazar ectopia solamente porque algunos QRS sean menores.

Constantes elegidas durante desarrollo con las ventanas EXPUESTAS de PR19 y
controles sintéticos. No son derivadas de una norma clínica. Los artefactos que
persisten en ambos umbrales pueden seguir pareciendo utilizables. Una variante
legítima de baja amplitud con actividad de fondo puede recibir una advertencia.
No distingue ruido de arritmia ni identifica con certeza sobredetección.

## Aceptación y evaluación separadas

`heart-rate-quality.test.ts`: pulsos triangulares analíticos con dos amplitudes
y fondo sinusoidal; invariancia numérica de los 61 presets; FA/ectopia/bloqueos
limpios; input Proxy que falla ante referencias no autorizadas; DC, 250/500 Hz,
asistolia y enrutamiento del worker. `hr-quality-external.test.mjs` comprueba
los ocho registros LUDB ya conocidos. La prueba de 250 Hz no valida espigas a esa
frecuencia ni resuelve el fallo histórico correspondiente.
El recorrido Chromium importa un caso de EV con ruido muscular nativo, comprueba
la FC conservada con «Revisar» y motivo en el diálogo, y retorna a EV limpia.
Una advertencia no afirma que la cifra sea necesariamente incorrecta.

`compare-hr-quality.mjs`: misma señal → primitivo de 784173f frente a pipeline
actual. Todos los valores, picos, límites y evidencias ajenas a FC deben ser
idénticos. Se publican errores todavía `usable`, advertencias nuevas acertadas
e innecesarias (error ≤5 lpm), ausentes y denominadores. `review` conserva el
error bruto; una reducción de errores `usable` no equivale a mejor detección.

Se reproducen los 920 escenarios PR19 y se fijan antes de ejecutar otros 920
con ventanas NSTDB de 90/210/330 s, sin sustituir casos. Son réplicas temporales
con las MISMAS tres fuentes y cinco presets, no cohortes clínicas independientes.
No se reajusta la regla después de ver estas ventanas. Se conservan las licencias
y los controles WFDB del lector anterior; no se incorpora ruido en la app.

Los benchmarks históricos congelan producto/protocolo: ejecútalos en su
`sourceBaseCommit`; no cambies sus hashes para hacer aceptar un producto nuevo.
El workflow dedicado restaura 784173f en un worktree temporal para adquirir datos
y compara después el código actual, preservando ambos commits y hashes.

## Ejecución

```sh
npm ci
npm run check
git worktree add --detach /tmp/hr-baseline 784173f94bc103686efb321fc13f1b8f40913f76
python -m pip install wfdb==4.3.1
python scripts/prepare-hr-quality.py --baseline /tmp/hr-baseline --output /tmp/hr-quality
node scripts/compare-hr-quality.mjs /tmp/hr-baseline /tmp/hr-quality/known /tmp/hr-quality/known-results.json
node scripts/compare-hr-quality.mjs /tmp/hr-baseline /tmp/hr-quality/replication /tmp/hr-quality/replication-results.json
```

No se realizan diagnóstico, validación clínica, cambios de licencia o despliegue.
La identidad de versión continúa en 1.5.0; el commit identifica esta modificación.

## Referencia que motiva el ensayo, no los umbrales

Moody, Muldrow y Mark, *A noise stress test for arrhythmia detectors* (1984).
NSTDB 1.0.0: https://physionet.org/content/nstdb/1.0.0/ . La fuente describe
movimiento de electrodos capaz de imitar ectopia; no valida nuestra regla.
