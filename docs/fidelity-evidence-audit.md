# Auditoría de exposición y aptitud de las referencias

## Criterios fijados antes de ejecutar

Base de esta ronda: `cdd55811bf260e0b74c564d454f658495f72d67e`.
Esta auditoría identifica evidencia disponible y límites; no modifica pacientes,
generador, analizador, constantes ni los datos históricos.

1. La identidad se expresa como conjunto de origen y paciente canónico, con
   versión conservada como procedencia. PTB-XL+ usa la identidad PTB-XL;
   cambiar de versión no convierte un paciente conocido en independiente.
   Sin correspondencia completa entre versiones, la independencia queda
   pendiente. Varios registros del mismo paciente cuentan una vez y conservan
   todos sus usos; un identificador de registro no se inventa como paciente.
2. Entrenamiento, elección de casos, ajuste y benchmarks ya inspeccionados son
   exposición. Un pliegue fuera del entrenamiento no acredita independencia
   frente a decisiones tomadas con sus resultados.
3. La ausencia de identidades, manifiestos o cobertura de una fuente produce
   `unknown`/`incomplete`, nunca cero solapamientos demostrados. Una reserva solo
   queda elegible si el inventario declarado está completo y todas sus
   identidades están resueltas, sin exposición ni inconsistencias.
4. Las reglas escritas de selección son evidencia de una política, no prueba
   de qué pacientes entraron en un modelo publicado. Se distinguen los IDs
   observados de las cohortes descritas únicamente por reglas o tamaños.
5. Aptitud de unidades se declara por fuente y métrica. Las observaciones LUDB
   se limitan a la selección auditada; no se generaliza a todo el conjunto.
   Las referencias 12SL en conflicto no se rescatan con un factor silencioso.
6. Deben fallar los controles de identidades ausentes, duplicados de registro
   inconsistentes, pliegues incompatibles, entrada mal formada y reserva expuesta.
   El informe conserva faltantes, conflictos y fuentes con hash.

No se descarga ni inspecciona una nueva reserva para conseguir una aprobación.
La revisión humana y una evaluación externa apropiada siguen siendo condiciones
distintas para elevar plausibilidad clínica.

## Resultado de la auditoría local

El inventario contiene 24 fuentes/rutas y no acredita ninguna reserva adecuada.
La unión de identidades de paciente explícitas disponible contiene 605 pacientes
PTB-XL y seis pacientes STAFF de la exploración histórica. Los 512 pacientes
recuperados del artifact existente y los 94 de fenotipos aislados comparten un
paciente; las 64 medianas son un subconjunto, no otros 64 pacientes.
Los tres IDs de reserva histórica STAFF están descritos,
pero su independencia actual sigue desconocida: faltan las identidades del
entrenamiento y evaluación posteriores. El informe conserva
`overlapCount: null`, `overlapStatus: unknown`, `holdoutReady: false`.
El cero de `observedOverlapCount` es únicamente un límite inferior observado,
no una prueba de ausencia de solapamiento.

La unión de registros LUDB ya observados llega a los 200 IDs de la colección:
ocho fixtures, 80 de desarrollo/calibración, 40 de la antigua reserva T-end,
40 de reconciliación QT y 32 del consenso terminal. Los últimos tres grupos
tienen resultados publicados; sus protocolos históricos no los vuelven a hacer
inéditos. El inventario cuenta registros, sin fabricar una correspondencia de
pacientes que los manifiestos no codifican. Los fallos prospectivos y las
excepciones conservadas en esos informes permanecen intactos.

Los modelos publicados declaran 2381 sujetos NORM, 406 LAFB, 383 IRBBB,
60 CRBBB, 160 CLBBB, 437 LVH, 420 ASMI, 499 IMI, 346 PVC y 80 VPACE.
Estos números no son sumables como pacientes independientes: las familias
pueden solaparse. Los modelos contienen coeficientes y recuentos, pero no
listas de pacientes aceptados/rechazados. El inventario incluye también FA,
flutter mixto PTB-XL/Georgia, FV de VFDB/CUDB y STAFF; ni una política de
selección ni un recuento reconstruyen sus miembros efectivos.

Faltan principalmente:

- Manifiestos ejecutados de entrenamiento por familia, con paciente, registro,
  versión, motivo de rechazo y ruta de preparación.
- `holdout_norm600.txt` y su cruce con `ptbxl_database.csv`; el nombre histórico
  no evita que los resultados de folds 9–10 ya hayan sido usados para desarrollo.
- Identidades exactas de los subgrupos secundarios CLBBB/CRBBB/WPW de 13/13/1
  pacientes. El informe recuperado está vinculado por hash a los 512 expuestos;
  esto cubre su exposición, pero sus agregados no permiten reconstruir los IDs
  concretos de cada subgrupo ni excluir un posible solapamiento entre ellos.
- Manifiestos STAFF actuales de entrenamiento y evaluación. La división actual
  por pacientes múltiplos de cinco difiere de la selección histórica por arteria.
- Correspondencias de paciente para los registros LUDB, INCART, LTAFDB y
  fuentes mezcladas, donde la documentación disponible no las codifica.

La búsqueda local fue acotada a `~/datos/ecg-referencia`,
`~/Documents/datos/ecg-referencia`, `~/Documents/ECG-QA` y
`~/Documents/ECG-Q`; los dos primeros no existen en esta máquina. Se listaron
solo nombres relevantes hasta tres niveles, sin leer señales nuevas ni buscar
secretos. Los paquetes de revisión clínica encontrados no sustituyen los
manifiestos de entrenamiento. No se declara agotado el historial remoto.

## Recuperación de evidencia expuesta

Después del primer inventario se recuperó el artifact existente
`11463268449` del run `37578264897`, de 2026-10-07. Se verificó el SHA-256 del
ZIP contra el digest comunicado por GitHub:
`2ca39a3e77279fc12f80fb097fcc1e04813ad1ace2e62b77f1e1abab01d9a1d1`.
No se descargó una nueva reserva. Se extrajo al repositorio solo el mínimo de
identificadores, pliegues y procedencia en
`benchmarks/fidelity/ptbxl-exposed-selection.json`, sin informes clínicos ni
demografía. El resultado anterior queda conservado, con sus faltantes tal como
eran antes de recuperar el artifact; la nueva corrida se guarda por separado.

`selection.json` contiene 512 pacientes únicos y 64 IDs de medianas. Su hash
coincide con la entrada del informe secundario y el protocolo coincide con el
hash de selección. Los 64 IDs coinciden exactamente con el control original de
escala; ahora pueden unirse a sus pacientes. La selección aislada recuperada
tiene el mismo hash que la del repositorio. Todas estas personas ya estaban
expuestas: recuperar identidad mejora la auditoría, no crea independencia.

La procedencia conserva tres roles de commit: cabeza de la PR
`b39a5efe03d42713cdd8882c73f2e91a4612d9d8`, checkout de integración del run
`5ee10fbffd16dd44c9bdcd028c06a7c2ae751c1d` y adquisición congelada
`b783fbae5819c3bb3313931d8f2fce43420a9d85`. El workflow crea explícitamente el
worktree de adquisición y comprueba scripts/protocolo contra esa revisión.
Los tres identificadores no se confunden ni se presentan como una contradicción
de datos. El inventario sigue incompleto por los manifiestos de entrenamiento
y demás correspondencias faltantes, y ninguna corrección fisiológica se aprueba.

## Unidades y referencias: qué se puede comparar

| Fuente concreta | Evidencia admisible | Límite que permanece |
| --- | --- | --- |
| 80 registros LUDB auditados | Cocientes dentro de una derivación y tiempos anotados, con exclusiones originales | Ganancias iguales al rango digital, compatibles con normalización por canal; amplitud absoluta y relaciones de voltaje entre derivaciones bloqueadas. No se generaliza a todo LUDB. |
| 64 registros originales PTB-XL auditados | Voltajes, ganancias y relaciones de miembros verificadas en bytes originales | Expuestos; el control de escala no aporta anotación humana independiente de QRS/ST/T. |
| 64 medianas 12SL históricas | Comparaciones invariantes a escala dentro de derivación | Conflicto muestra/tabla cercano a factor 1000 conservado; sin corrección silenciosa. |
| Ruta actual de modelos de forma | La procedencia declara medianas de crudos alineadas a 12SL | Su afirmación de contraste de unidades no resuelve por sí sola el conflicto de otra ruta/cohorte. |
| Variables tabulares PTB-XL+ | Unidades armonizadas documentadas y métricas descriptivas | ST_Amp es STJ, no J+60; QRS_AmpPP es pico a pico. Límites temporales automáticos del proveedor no equivalen a revisión humana. |

La elegibilidad de una métrica no significa aptitud para calibración ni
plausibilidad clínica confirmada. El informe de adaptación temporal de esta
ronda audita por separado las referencias RR y los límites QRS/ST/T.

## Reproducción y controles

```sh
node scripts/audit-fidelity-evidence.mjs --output /ruta/evidence-audit.json
node node_modules/vitest/vitest.mjs run tests/fidelity-evidence-ledger.test.mjs
```

La salida incluye SHA-256 del protocolo, inventario, instrumentación, modelos y
evidencia leída, procedencia por fuente, faltantes y unión de usos. Una auditoría
incompleta finaliza con código cero y conserva su decisión negativa. Un archivo
mal formado, esquema inesperado o argumento inválido produce error de ejecución.
La salida debe ser nueva: el programa rechaza sobreescribir cualquier resultado
previo, favorable o adverso; cada repetición necesita otra ruta de salida.
La incertidumbre no se convierte en error técnico ni se oculta como éxito clínico.

Los controles prueban el mismo paciente en varios registros, IDs ausentes,
selección declarada sin ejecución observada, pliegues incompatibles, identidades
contradictorias, versiones distintas, recuentos incompletos, requisitos vacíos,
unidades por métrica y entradas mal formadas. No se ha modificado el generador.
