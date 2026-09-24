# LUDB: pequeño conjunto de regresión externa

Contiene datos de **Lobachevsky University Electrocardiography Database (LUDB),
versión 1.0.1**, disponibles bajo **Open Data Commons Attribution License v1.0**.

- Fuente: https://physionet.org/content/ludb/1.0.1/
- DOI del conjunto: https://doi.org/10.13026/eegm-h675
- Licencia: https://physionet.org/content/ludb/view-license/1.0.1/
- Texto original de licencia: `fixtures/LICENSE-LUDB.txt`.
- Publicación: Kalyakulina AI et al. *LUDB: A New Open-Access Validation Tool for
  Electrocardiogram Delineation Algorithms*. IEEE Access. 2020;8:186181–186190.
  DOI: https://doi.org/10.1109/ACCESS.2020.3029211
- Plataforma: Pollard T et al. *PhysioNet as a global platform for biomedical research*. Nature Health. 2026. https://doi.org/10.1038/s44360-026-00096-z
- Texto de autores: https://arxiv.org/html/1809.03393v4

La selección fue fijada antes de ejecutar el detector:

| Partición | Registros | Uso |
|---|---|---|
| Desarrollo | 1, 2, 3, 4 | Detectar fallos y ajustar reglas |
| Control reservado | 101, 102, 103, 104 | Evaluar una versión congelada; no usar para ajustar umbrales |

Es una selección determinista de conveniencia, sin balance clínico y sin elegir
los registros según el resultado del detector. Las ocho personas son distintas
según la relación de un registro por persona descrita por los autores. El tamaño
sirve para regresiones reproducibles, no para estimar desempeño poblacional ni
validar clínicamente el simulador. Una vez visto el control, debe considerarse
expuesto en futuras iteraciones y reservar otros registros para una nueva
evaluación independiente.

**Estado en v1.2:** el control fue evaluado tras congelar el algoritmo y ya está expuesto. Los resultados y sus limitaciones están en [verificacion.md](../../../docs/verificacion.md); los hashes previos están en [analysis-freeze.json](../../../docs/analysis-freeze.json). Una corrección posterior de auditoría sintética se documenta aparte y no participa en la evaluación externa.

## Datos conservados y transformación

Se conservan los ocho archivos `.dat` originales, cada uno con 12 derivaciones,
5000 muestras por derivación, 500 Hz y 10 segundos. Se retienen las 12 anotaciones
por derivación como inicio/pico/final P-QRS-T, expresadas en índices de muestra,
y la secuencia original de eventos de anotación. Algunos picos originales no
tienen ambos límites: se conservan esos límites como `null`, sin interpolarlos
ni descartarlos para la evaluación de detección. Los encabezados originales se usan únicamente para interpretar el
formato y verificar su integridad; los fixtures derivados no contienen los
comentarios de edad, sexo o diagnóstico.

El archivo binario usa enteros con signo de 16 bits, little-endian, intercalados
por derivación. La conversión exacta es
`mV = (valor_digital - baseline) / adcGain`, usando los valores de cada canal de
la versión **1.0.1**, que corrigió la información de escala de la versión anterior.
No se interpola, filtra, normaliza por amplitud ni sintetiza ninguna derivación.
`load-ludb.mjs` convierte a Float32Array como el motor del simulador.

`prepare_ludb.py` descarga los archivos desde rutas versionadas y comprueba sus
112 SHA256 contra el manifiesto oficial. Además, verifica cada canal mediante el
checksum y la primera muestra del encabezado WFDB. `manifest.json` registra la
selección, el hash del manifiesto oficial y el hash de cada JSON derivado; cada JSON conserva los hashes y URLs
de su señal, encabezado y anotaciones originales. La licencia se comprueba contra
el manifiesto y se conserva sin modificaciones.

## Qué representan las anotaciones

La publicación describe un marcado conjunto de dos cardiólogos por consenso,
realizado por separado en cada derivación. **No hay dos archivos independientes
por observador ni un límite global multiderivación original.** El pico QRS marcado
no es necesariamente el máximo positivo R ni el máximo de pendiente que produce
un detector. Por ello se separan dos evaluaciones:

1. **Identificación de complejos:** emparejamiento temporal uno a uno, máximo
   número de coincidencias y mínimo error entre ellas, tolerancia 150 ms. Se
   reportan TP, FP, FN, sensibilidad y valor predictivo positivo.
2. **Delineación:** para complejos emparejados se reporta error firmado, error
   absoluto y dispersión del inicio, final y duración QRS. La tolerancia de 150 ms
   usada para identificar un complejo **no** es un umbral aceptable de precisión
   para esos límites.

La referencia global de este benchmark toma las anotaciones de **I, II, V1 y V5**,
las mismas cuatro derivaciones que usa el detector. II identifica el latido y se
asocia al QRS más cercano aún no usado de cada una de las otras tres derivaciones
a ≤150 ms. Se requiere presencia en las cuatro. El inicio global es el mínimo de
los cuatro inicios, el final global el máximo de los cuatro finales y el pico de
emparejamiento la mediana de los cuatro picos. Cuando falta un inicio o final de
origen en cualquiera de los cuatro canales, ese límite global se considera no
disponible y se mantiene el pico para evaluar detección. Se registra cualquier exclusión
por asociación incompleta. **Esta agregación es una regla de evaluación del
proyecto; no debe atribuirse a los cardiólogos ni presentarse como adjudicación
clínica global.**

El detector recibe únicamente muestras y frecuencia de muestreo. La auditoría que
compara con la referencia del modelo sintético no se usa en estos datos externos.
El protocolo fija la ventana de evaluación de cada registro desde 150 ms antes
del primer pico QRS anotado hasta 150 ms después del último. Los candidatos fuera
de esa ventana se cuentan por separado como extremos sin cobertura; no se
adjudican como falsos positivos. Esta regla se adoptó al inspeccionar la cobertura
de desarrollo y se congeló antes de evaluar control. No se atribuye a los autores
de LUDB una regla universal de exclusión del primer/último latido: no se halló
tal afirmación en la documentación primaria consultada. Se usa la misma regla
en ambas particiones. Conviene reportar
además cuántos latidos carecen de límites estimables, para que un buen error medio
no oculte una baja cobertura.

LUDB no marca onda U; este conjunto no puede validar la discriminación T/U. Los
límites manuales y la agregación global tienen incertidumbre. Tampoco se obtiene
de ocho registros evidencia de equivalencia entre la morfología del simulador y
la distribución de todos los ECG clínicos.

## Reproducir y leer

```sh
python prepare_ludb.py --root /ruta/a/ludb-regression
```

```js
import { loadLudb, fourLeadQrsReference, matchQrsEvents } from './load-ludb.mjs';
const { signal, metadata } = loadLudb('/ruta/a/ludb-regression/fixtures', 'development', 1);
// measure(signal) recibe fs y leads; no recibe metadata ni las anotaciones.
const reference = fourLeadQrsReference(metadata);
```

El conversor utiliza solo la biblioteca estándar de Python. El lector de pruebas
utiliza módulos incorporados de Node. No se añaden dependencias al navegador.

Como verificación independiente del formato se contrastó el conversor con
**WFDB Python 4.3.1**: coincidencia exacta de 480 000 muestras físicas (antes de
convertir a Float32) y de los símbolos e índices de muestra de 6474 eventos de
anotación en los 96 canales. El resultado está en `reader-crosscheck.json` y se
reproduce con `verify_ludb_reader.py` después de instalar WFDB en un entorno Python
separado. Esta comprobación solo verifica lectura y escala: no ejecuta el detector
ni evalúa su desempeño en desarrollo o control.

## Por qué LUDB para esta iteración

MIT-BIH Arrhythmia es una referencia más amplia para detección de latidos (48
registros de aproximadamente media hora, 2 canales, 360 Hz), pero sus anotaciones
de latido no delimitan sistemáticamente inicio/final QRS. QT Database aporta
límites P-QRS-T y U en latidos seleccionados, también en dos canales. LUDB permite
ejercitar las cuatro entradas reales del detector sin duplicar canales ni crear
derivaciones artificiales, y añade límites para comprobar el ancho del QRS.

Fuentes comparativas:
https://physionet.org/content/mitdb/1.0.0/
https://physionet.org/content/qtdb/1.0.0/

## Especificaciones del formato

- https://physionet.org/physiotools/wag/signal-5.htm
- https://physionet.org/physiotools/wag/header-5.htm
- https://physionet.org/physiotools/wag/annot-5.htm
- https://physionet.org/physiotools/wpg/wpg_36.htm
