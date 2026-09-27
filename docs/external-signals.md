# Lector local de señales externas (WFDB 16 / CSV)

`Abrir señal` abre un espacio independiente. No reemplaza el caso sintético,
no ejecuta su auditoría contra el modelo y no usa diagnósticos ni anotaciones
para calcular las medidas. No digitaliza fotografías ni PDF.

## Formatos

**WFDB:** seleccionar juntos `.hea` y el `.dat` indicado. Subconjunto explícito:
un solo registro, un archivo multiplexado, 12 canales estándar, formato `16`
(entero con signo little-endian), una muestra por canal por frame, sin skew,
offsets ni bloques especiales. Frecuencia entera 100–1000 Hz; 10–60 segundos.
Cada canal requiere ganancia positiva, unidad `mV` o `uV`/`µV`, resolución,
cero ADC, valor inicial, checksum, bloque 0 y etiqueta de derivación. Se validan
longitud exacta, primera muestra y checksum de 16 bits por canal. Se rechaza
`-32768` (ausencia WFDB); no se interpola. La conversión física es
`(digital − baseline) / gain`, dividida por 1000 cuando se declaran microvoltios.
Si no hay baseline entre paréntesis, se usa el cero ADC explícito.

No es un lector universal WFDB: no acepta 212, FLAC, multisegmentos,
2/3/8 canales ni nombres de derivaciones modificadas como MLII. No crea
las derivaciones que faltan. Los formatos fuera del subconjunto fallan
con explicación, en vez de producir una escala plausible pero errónea.

**CSV:** coma separadora, punto decimal, una muestra simultánea por fila,
12 columnas con nombres `I,II,III,aVR,aVL,aVF,V1,V2,V3,V4,V5,V6` (orden libre,
mayúsculas/minúsculas equivalentes). `time_s` es opcional; cuando está presente,
debe comenzar en cero y coincidir con `índice / Hz` a 1 µs. No se aceptan
celdas vacías, fórmulas, comillas, saltos interiores, NaN o infinitos. El usuario
debe declarar Hz y unidades, o el archivo debe comenzar con:

```text
# ECG-LAB CSV 1; fs=500; units=mV
time_s,I,II,III,aVR,aVL,aVF,V1,V2,V3,V4,V5,V6
```

El CSV exportado incluye esa cabecera y conserva los valores físicos de
doble precisión, sin redondear para la presentación. No copia datos de paciente.
La escala se toma de la declaración, no se verifica contra el equipo adquisidor.
Máximo técnico: 32 MiB por archivo, 60 000 muestras/canal y |amplitud| <= 10 000 mV.
Estos límites de recursos no son criterios de plausibilidad clínica.

## Vista y análisis

Se elige una ventana de 10 s; el visor muestra 2, 5 o 10 s dentro de ella,
siempre con ejes compartidos entre canales, sin normalización ni filtros nuevos.
El tiempo inicial se redondea a la muestra más cercana. Se informa recorte visual,
pero el CSV completo y las muestras JSON no se recortan.

El mismo `analyzeSamples({fs, leads})` existente analiza una copia de esos 10 s
en un worker. No recibe eventos, truth, parámetros, nombre ni diagnóstico. Sus
estados `usable`, `review` y `unavailable` se conservan. «Consistente» significa
consistencia interna, no precisión, validación clínica o probabilidad de acierto.
El algoritmo puede fallar, especialmente en ruido, ritmos complejos y registros
con muestreo distinto al evaluado previamente. No se ha recalibrado aquí.

Las marcas Q/J/T son candidatos multiderivación, no anotaciones independientes
por canal. Al cambiar la ventana se retiran inmediatamente las medidas y se
bloquean PNG/informe hasta obtener un resultado nuevo. La copia CSV completa
no depende del análisis. El informe `ecg-external-analysis` guarda la ventana
muestreada, frecuencia, conversión y medidas; tiempos del detector relativos
a esa ventana. La tabla convierte esos tiempos a segundos absolutos del registro.

## Privacidad / ciclo de vida

Sólo lectura local de archivos seleccionados explícitamente. No almacenamiento,
subida de archivos, fetch a datos, envío de diagnósticos ni registros de paciente.
El archivo vive en memoria hasta borrarlo/cerrar. Una nueva selección invalida
la anterior; el worker anterior se termina y sus respuestas tardías se ignoran.
Errores y timeout no activan un servidor alternativo ni mantienen cifras antiguas.
No se exportan nombres de archivo, comentarios de encabezado o campos de paciente.
Esto NO garantiza anonimato de una señal biomédica; usar sólo datos autorizados.

## Verificación y referencias

Pruebas de decodificación sintética adversaria, tiempos CSV, unidades, checksum,
canales, bytes ausentes/sobrantes, ida/vuelta exacta y copias de ventana.
Los registros LUDB de desarrollo 1–4 ya presentes/expuestos en el repositorio
se leen mediante encabezados desidentificados reconstruidos desde sus metadatos;
se comparan 240 000 muestras físicas contra lectura independiente del DAT.
No se consume otro holdout ni se incluyen nuevos datos de pacientes en producción.
El ensayo de navegador usa el DAT de desarrollo 1 y prueba importación,
exportación, navegación, invalidación, error/recuperación, cierre y estado sintético.

- Encabezado WFDB: https://physionet.org/physiotools/wag/header-5.htm
- Formato 16: https://physionet.org/physiotools/wag/signal-5.htm
- LUDB 1.0.1: https://physionet.org/content/ludb/1.0.1/
- Procedencia y licencia conservadas: `tests/reference/ludb/README.md`.

Pruebas de software/decodificación, no validación clínica, dispositivo médico,
informe diagnóstico ni sustituto de lectura profesional. El PNG tiene ejes
explícitos, pero no representa papel calibrado a 25 mm/s.
