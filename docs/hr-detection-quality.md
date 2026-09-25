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
idénticos. Se publican errores todavía `usable`, avisos nuevos con error >5 lpm
y avisos sobre cifras dentro del margen (error ≤5 lpm), ausentes y denominadores.
Una FC dentro del margen no prueba que el aviso sea innecesario: el conteo puede
coincidir pese a detecciones ambiguas. `accurateNewReviews` nombra ese subconjunto
operativo en el JSON; no es adjudicación clínica de una falsa alarma. `review`
conserva el error bruto; una reducción de errores `usable` no equivale a mejor detección.

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

## Resultado del candidato antes de merge

Evaluación del código `171d4d0b6b8c2ab8247f9facf71ba09a75523aff` en el
merge temporal `e40452f03c8eee138c8c3e324ed36de851acba64`. Workflow
`36201288076` (calidad) y `36201288043` (fidelidad), ambos correctos.
Esta tabla no acredita por sí sola integración o despliegue posterior.

| Escenarios | N | FC con error >5 lpm y usable: antes → después | Nuevos avisos | Avisos sobre cifras dentro de 5 lpm | FC ausente |
|---|---:|---:|---:|---:|---:|
| Desarrollo expuesto: 60/180/300 s | 920 | 494 → 146 | 360 | 12 | 0 |
| Réplica temporal: 90/210/330 s | 920 | 485 → 169 | 327 | 11 | 3 |

Los errores brutos >5 lpm permanecen en **511** y **491** respectivamente.
La mejora consiste en advertir incertidumbre, NO en corregir la estimación.
En movimiento de electrodos a 0 dB, sin filtro: desarrollo 15 → 0 errores aún
`usable` sobre 15 escenarios; réplica 12 → 5 sobre 15. Se conserva el resultado menos favorable de la réplica.
No se ajustaron parámetros tras observarla. Los 20 controles limpios se repiten
en cada conjunto, por lo que tampoco representan 40 casos independientes.

Se comprueba igualdad de todas las cifras/picos/límites en 981 entradas por
conjunto (920 de estrés y 61 presets). De los 61 defaults, solo la aproximación
de TV polimórfica/torsades pasa a revisión; la auditoría posterior sigue siendo
una etapa distinta. Los ocho LUDB conocidos conservan números y estado de FC
en la inspección complementaria local; no constituyen una cohorte nueva.

CI: 574/574 pruebas, 31 archivos; TypeScript/build; 16 comprobaciones Chromium
generales y 5 del nuevo flujo. El recorrido nuevo muestra 75 lpm con aviso en
EV/ruido muscular nativo, permite leer el motivo y lo retira al volver al caso
limpio. Pantallas 1440×1000 y 390×844 emuladas, no dispositivo físico.
El primer intento falló por importar el lector JavaScript desde un test
TypeScript sin declaración; se separó la prueba, sin desactivar strict.

Artefacto de calidad 10891359443, SHA256:
`789afd2c84c786cb1e09e125651f5d7c6344007829caf3bf5aa50004eb5ca9de`.
Incluye resultados desfavorables, fuentes de ruido, licencias y código exacto.
