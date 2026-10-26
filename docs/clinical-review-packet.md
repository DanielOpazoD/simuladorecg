# Paquete ciego para revisar fenotipos actuales

La herramienta prepara material y verifica su integridad y el expediente de
revisión. No produce lecturas humanas, no autentica credenciales y nunca declara
`clinicalValidation: true`. Un expediente completo y una validación clínica son
estados distintos.

## Protocolo inicial y material disponible

`benchmarks/clinical-review/protocol-v1.json` selecciona cinco familias actuales:
sinusal, Wenckebach, BRI, VVI y lesión anterior. Cada una aporta el caso docente
actual y las semillas 17 y 91. Son 15 trazados sintéticos de desarrollo. Este
muestreo pequeño no representa los 63 presets, su población ni sus combinaciones.
Las semillas nuevas tampoco establecen por sí mismas independencia clínica.

Se incluyen los ocho registros LUDB 1.0.1 ya incorporados al proyecto:
desarrollo 1–4 y control 101–104. Sus bytes y metadatos se verifican mediante el
lector existente y se incluyen en la procedencia congelada. **Ambos grupos están
expuestos en pruebas previas; ninguno constituye una reserva independiente nueva.**
La etiqueta histórica `control` no cambia este hecho. Se preservan licencia,
atribución y procedencia en las carpetas correspondientes.

La preparación no descarga datos. La inspección del checkout encontró estos ocho
registros originales disponibles y los coeficientes distribuidos del generador;
no se presupone que existan cachés completas STAFF III/PTB-XL fuera del proyecto.
Una futura evaluación poblacional necesita auditar los pacientes ya utilizados
para ajuste o selección y reservar otros antes de inspeccionarlos.

El protocolo se puede editar para seleccionar otras familias **actuales** antes
de generar una nueva ronda. Cambiarlo después de inspeccionar los resultados
inicia otra ronda de desarrollo; no conserva el carácter de una reserva previa.

## Generar y congelar

Usar Node 22.16.0 o la versión fijada por `.nvmrc` y las dependencias del proyecto.
Las dos carpetas de salida deben ser nuevas, con padre existente, disjuntas y
fuera del checkout. Nunca se sobrescribe un paquete.

```sh
node scripts/prepare-clinical-review.mjs generate "C:/ruta/lector" "C:/ruta/coordinador"
```

La preparación retorna `pending-human-review` y código de salida **2** aunque el
paquete se haya generado correctamente. El código 1 señala un error de entrada,
integridad o ejecución. Conservar `sealSha256` en un registro aparte de ambas
carpetas: esa referencia externa es necesaria para detectar cambios coordinados
del manifiesto y sus propias sumas. No calcular una referencia nueva después de
alterar el paquete.

- **Lector:** SVG, índice HTML, manifiesto, atribución/licencia y dos plantillas
  vacías. Los ID HMAC opacos y el orden usan una clave aleatoria privada.
- **Coordinador:** protocolo, clave, correspondencia de cada ID, configuración
  efectiva, procedencia del código/modelos/fixtures, muestras físicas, métricas,
  resumen por familia, exclusiones, duplicados y plantilla de adjudicación.

Compartir solamente la carpeta del lector. No se envía automáticamente ningún
mensaje ni se contacta con evaluadores. La separación es operativa y de nombres;
no es cifrado ni una garantía de cegamiento frente a quien intente reconstruir
los casos a partir del código o reconocer morfologías. Los hashes de muestras
físicas y las semillas quedan fuera del manifiesto público para evitar una tabla
directa de correspondencia.

Los SVG utilizan las instrucciones reales de `renderPaper`, incluidas cuadrícula,
calibración, ajuste vertical a la amplitud y selección de extremos de muestras.
El adaptador cambia los rótulos de origen por un ID y un encabezado común. No
invoca el analizador, dibuja intervalos verdaderos ni revela el nombre del patrón.
Las proporciones señal/cuadrícula se conservan al ampliar; las dimensiones físicas
de impresión requieren tamaño real/100 %, no ajuste automático de página.

Todos los trazados duran 10 s a 500 Hz, con papel a 25 mm/s y 10 mm/mV. En los
sintéticos se conserva la configuración docente o su variante natural por semilla,
con adquisición ideal, filtro apagado, notch desactivado y artefactos añadidos a
cero. Eso aísla morfología y no evalúa el realismo del ruido de adquisición.
Los controles LUDB conservan su adquisición original, decodificada a mV por el
lector existente (Float32 y después almacenamiento Float64), sin nuevo filtrado.
Igualar el papel no iguala la adquisición ni elimina posibles pistas de origen.

Una combinación rechazada con `ModelScopeError` permanece como exclusión visible
del protocolo. Un error de lectura externa, checksum o muestreo detiene la
preparación. El manifiesto no presenta una exclusión como un fenotipo aprobado.
Las señales idénticas se agrupan por su hash; nunca se cuentan como observaciones
independientes adicionales.

Para reproducir los mismos ID, orden y trazados con las mismas fuentes y protocolo,
se puede pasar como cuarto argumento la clave privada guardada. Usar carpetas
nuevas y conservar también el protocolo original. Esto es una reproducción de la
misma ronda, nunca una nueva reserva o una lectura independiente:

```sh
node scripts/prepare-clinical-review.mjs generate "C:/ruta/lector-replay" "C:/ruta/coordinador-replay" "C:/ruta/coordinador/protocol.json" "C:/ruta/coordinador/blinding-key.bin"
```

## Dos lecturas y adjudicación posterior

Cada lector independiente completa una copia de su plantilla, guardada **fuera**
de la carpeta congelada del lector. Debe declarar identidad y credencial, autoría
humana, independencia de los autores, lectura sin claves y fecha UTC ISO 8601.
Por cada ID registra:

- plausibilidad del trazado (`plausible`, `implausible` o `indeterminate`);
- error docente mayor presente o ausente;
- legibilidad;
- observaciones concretas de ritmo, conducción, QRS y repolarización visibles.

No se puntúa acertar una etiqueta ni se adjudica una arteria por el nombre del
preset. Un error docente mayor es una representación que podría enseñar una
relación equivocada relevante, por ejemplo una activación ventricular añadida
tras una P bloqueada o una explicación de lesión apoyada en un cambio basal
inadvertido. El criterio exige juicio clínico, no una clasificación automática.

Después de ambas lecturas, un tercer evaluador declarado independiente utiliza la
clave para contrastar el fenotipo pretendido con los hallazgos de ambos lectores.
Completa una copia de `adjudication-template.json`, guardada fuera de las carpetas
congeladas, para **cada** caso, con decisión `accepted`,
`major-error` o `unresolved`, motivo y confirmación de que revisó la intención.
`readingSha256` debe contener los SHA-256 de los dos archivos de lectura exactos.
La fecha de adjudicación debe ser posterior a ambas lecturas. Las discrepancias
se conservan aunque la adjudicación las resuelva.

El verificador no puede comprobar que una persona sea quien declara, que haya
mantenido el cegamiento ni que su argumento clínico sea correcto. Informa
`authenticatedHumanCredentials: false`; las declaraciones y los motivos deben
ser examinados por el responsable de la revisión.

## Comprobar sin inventar aprobación

```sh
node scripts/prepare-clinical-review.mjs verify "C:/ruta/lector" "C:/ruta/coordinador" SHA256_CONSERVADO
node scripts/prepare-clinical-review.mjs verify "C:/ruta/lector" "C:/ruta/coordinador" SHA256_CONSERVADO lectura-a.json lectura-b.json adjudicacion.json
```

Se verifican protocolo, fuentes congeladas, SVG, muestras físicas y plantillas
contra el sello. Contenido adicional en la carpeta del lector, incluido una clave
copiada por error, invalida el paquete. No se reescribe ningún artefacto al verificar.

| Estado | Significado | Salida CLI |
| --- | --- | --- |
| `pending-human-review` | Faltan lectores, declaraciones, casos o adjudicación completa. | 2 |
| `incomplete-protocol-coverage` | El generador excluyó casos previstos; el conjunto revisado no cubre todo el protocolo. | 2 |
| `needs-remediation` | El expediente registra errores mayores o casos no resueltos. | 2 |
| `review-records-complete-not-clinical-validation` | Expediente declarado completo, sin errores mayores ni casos no resueltos. No autentica lectores ni valida clínicamente el simulador. | 0 |
| error de integridad/esquema | Bytes alterados, otro paquete, duplicados, autodeclaración de validación clínica o autor automático. | 1 |

Las métricas privadas se calculan desde muestras: amplitud pico a pico y RMS del
registro, y amplitud/área QRS en ventanas declaradas. Para sintéticos esas ventanas
provienen de eventos del generador; para LUDB, de anotaciones humanas por
derivación. El área usa cero de señal, no una línea isoeléctrica adjudicada. La
actividad auricular puede superponerse. No se mezclan esas referencias para
afirmar error clínico, normalidad, indistinguibilidad ni mejora estadística.

## Verificación de la herramienta

```sh
node node_modules/vitest/vitest.mjs run tests/clinical-review-packet.test.mjs
```

Las pruebas incluyen un paquete real pequeño generado desde síntesis y LUDB, uso
desde otro directorio con espacios/#, cegamiento de metadatos, falta de lecturas,
identidades duplicadas, autoría automática, adjuntos de otra ronda, vinculación de
adjudicación a los archivos exactos, fechas, alteración de SVG/muestras y edición
conjunta del manifiesto/sello. Los formularios favorables dentro de estos tests
son fixtures explícitos, nunca resultados humanos reutilizables.
