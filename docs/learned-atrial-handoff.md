# Unión PR–QRS sin impulso de frontera

Objetivo: que la partición numérica de una onda aprendida no introduzca una
espiga que no existe en su plantilla. Esta corrección no incorpora nuevos
pacientes, modifica el analizador ni acredita mayor parecido clínico.

## Plan aplicado con be-ambitious

- Altura: (1) reproducir un impulso aislado, (2) corregir su causa en las ocho
  poblaciones aprendidas, (3) proteger las uniones con un contrato que detecte
  futuras regresiones. Se completa el tercer nivel para esta unión concreta.
- Profundidad: partir de los acumuladores a 1000 Hz, antes de filtros y ruido;
  separar calendario, plantilla y adquisición; usar una señal de nivel constante
  como referencia analítica, y comparar cada muestra contra el motor original.
- Meta exigente: cero muestras compartidas entre una P conducida y su QRS,
  incluso entre posiciones de la rejilla; conservar la Ta de las P bloqueadas.
- Juez externo: pruebas ejecutables con niveles y soportes conocidos, la suite
  existente y un recorrido de la aplicación compilada en Chromium. No se ha
  ejecutado una nueva evaluación poblacional real/sintético ni revisión clínica.
- Acceso disponible: código, modelos distribuidos, historia Git, Node y
  Playwright. No se necesitan nuevas referencias de pacientes para esta
  corrección de discretización. Range se omite: este contrato tiene una
  solución matemática comprobable y no requiere ampliar funciones o diseño.

Prompt concretado:

```text
Mejora la fidelidad del simulador eliminando los impulsos que introduce la
discretización en la unión PR–QRS. Empieza por las muestras sin filtrar,
reproduce el error antes de corregirlo y conserva el calendario, los intervalos
y el resto de la plantilla. Extiende la corrección a las poblaciones aprendidas
y deja pruebas que eviten su regreso. Se acepta cuando una referencia analítica
no duplica la muestra de frontera, el delta contra el motor original está
acotado a esa frontera, la suite pasa y los presets funcionan en navegador.
```

## Problema y contrato

La P conducida ajustaba el final del PQ al nivel del inicio ventricular, pero
ambas colocaciones incluían esa muestra. El nivel Ta aparecía dos veces si la
unión coincidía con la rejilla. Reconstruir el instante de fin desde la entrada
pre-P y las duraciones también podía redondear de forma distinta al calendario.

La P conducida ocupa ahora las muestras anteriores a
`ceil(tQRS * fs)`; el QRS conserva la muestra de ese índice. `RealisticTrack`
transmite el instante absoluto del evento. No se redondea el calendario ni se
introduce una tolerancia temporal. Una P sin plantilla ventricular de destino
conserva su cola Ta; la unión de fases dentro de una plantilla no cambia.

## Reproducción y comparación emparejada

```bash
npx vitest run tests/learned-atrial-handoff.test.ts
node scripts/verify-learned-handoff.mjs
npm run check
```

La prueba nueva tiene ocho casos: nivel constante a 500/1000 Hz, uniones dentro
y fuera de la rejilla, ganancias P 0/0,5/1/2, P bloqueada, 32 pacientes de ocho
poblaciones y 16 combinaciones de instante/PR del calendario. Antes de corregir
se reprodujeron seis fallos de los siete casos iniciales; el caso de ganancia
se añadió después. La tolerancia de nivel (5e-13 mV) comprueba aritmética de
doble precisión, no exactitud clínica.

El script usa las versiones originales de `beat.ts` y `engine.ts` del commit
`507751c509012af080139044d65cf6caa09d0053`. Rechaza cambios en otros archivos de
`src/`, de modo que su bundle anterior reproduce esa fuente. Evalúa los 63
presets activos durante 10 s con sus parámetros y semillas de catálogo,
adquisición ideal y filtro de catálogo; compara las doce derivaciones a 500 Hz.
En paralelo compara las contribuciones auriculares a 1000 Hz, sin filtrar, en
I, II y V1–V6 durante 14,1 s (incluye calentamiento y guarda). Todo delta bruto
debe caer en las muestras vecinas de un inicio QRS. Ese margen de dos índices
cubre también recuperar una muestra PR perdida por cancelación numérica.

Se conserva cada evento, advertencia, intervalo y frecuencia exactamente. El
eje se integra desde las muestras QRS reales: se registra su delta y se exige
menos de 0,5°, la mitad de la unidad mostrada en la tarjeta. No se fuerza el eje
anterior sobre una señal corregida.

Resultado local, Windows con Node 24.19.0:

| Medida | Resultado |
|---|---:|
| Presets con muestras de salida idénticas | 36/63 |
| Presets con cambio explicado por la frontera | 27/63 |
| Mayor delta bruto, ocho derivaciones independientes | 68,225 µV |
| Mayor delta tras adquisición y remuestreo, doce derivaciones | 16,314 µV |
| Mayor cambio del eje medido | 0,01553° |
| Huellas de catálogo que necesitan nueva referencia | 19 |

El informe por preset queda en `.sites-runtime/learned-handoff/paired.json`.
Las 19 referencias nuevas están en `tests/__snapshots__/catalog-pr-qrs-v2.json`;
`catalog-fingerprints.json` queda intacto. El script verifica primero que el
motor anterior reproduce las huellas históricas que compara. La opción explícita
`--write-fingerprints` escribe únicamente las revisiones explicadas y mantiene
las demás referencias originales. Los otros ocho presets con cambios no
requieren nueva huella por las exclusiones previas de ese test o su tolerancia.

Verificación local: 2275 pruebas en 172 archivos, tipos y build correctos;
67 recorridos de biblioteca/variantes en Chromium. Comprobación adicional en
1440×960 y 390×844: sin errores de consola o de página, sin desbordamiento
horizontal y cambio Normal → Taquicardia que actualiza la FC de 72 a 125 lpm.
Las capturas y el script de esa comprobación están fuera del repositorio, en
la carpeta local `ECG-QA`. No se verificaron Firefox, WebKit ni dispositivos
físicos. La CI usa Node 22.16.0; estos resultados no son una ejecución de CI.

## Integridad en Windows

`.gitattributes` fija LF para las fuentes y metadatos cuyos hashes se verifican.
Los archivos DAT y la licencia LUDB con CRLF originales conservan sus bytes.
El inventario del contrafactual de confianza usa rutas POSIX para comparar sus
identidades con el manifiesto; las operaciones de disco siguen usando `path`.
Así, las pruebas de integridad no confunden los saltos de línea ni el separador
de Windows con un cambio del analizador.
