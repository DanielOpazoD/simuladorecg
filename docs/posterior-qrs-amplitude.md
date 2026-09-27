# Corrección acotada: la R posterior debe obedecer a la amplitud QRS

## Defecto y causa

Al revisar el patrón posterior se reprodujo que bajar la amplitud QRS a 0,1×
podía aumentar la R positiva de V1. El generador escalaba los kernels vectoriales,
pero sumaba una corrección local constante de 0,75 en V1–V3. Esa corrección también
es despolarización: no debe quedar fuera del control de amplitud QRS.

Cambio de producto: `0.75` pasa a `0.75 * c.qrsAmp` en esa única corrección.
No se cambian perfiles, ejes, calendario eléctrico, filtros, ST primario ni T.
No se añade una capa, parámetro, dependencia o persistencia. No se ajusta ningún
coeficiente para acercarlo a PTB-XL: sus amplitudes siguen en cuarentena por la
inconsistencia de escala documentada en el PR34. El ranking descriptivo motivó
revisar componentes del patrón, no constituye el oráculo de esta corrección.

## Evidencia antes/después

Base reproducible `91519b2ea3b052f5cd22db6802f674bab6981b96` (PR33; PR34 no toca src).
Señal aislada, HR60, P=0, T=0, intensidadST=0, filtrooff:

| Ganancia QRS | R positiva V1 antes | Después |
|---|---:|---:|
| 0,1× | 0,676135 mV | 0,022320 mV |
| 0,5× | 0,391985 mV | 0,111601 mV |
| 1× | 0,223203 mV | 0,223203 mV |
| 2× | 0,342759 mV | 0,446405 mV |
| 3× | 0,493311 mV | 0,669608 mV |

El error máximo frente al escalado esperado en el barrido sin filtro pasa de
1,499570mV a 2,7e-15mV. Es una identidad matemática del control del modelo,
NO una métrica de error frente a pacientes. Cinco de siete pruebas nuevas fallan
con el código anterior y las siete pasan tras la corrección.

La comparación local nativa comprobó igualdad exacta de las señales, eventos,
truth y avisos en244 escenarios:61presets×4filtros. No cambian los defaults:
el posterior usa ganancia1 y los demás no entran en esta corrección.

## Límites y compatibilidad

Los casos posteriores personalizados con ganancia distinta de1 SÍ cambian.
Sus mediciones automáticas pueden variar legítimamente al cambiar la señal;
el código del analizador sigue congelado, no se promete invariancia de sus
resultados en esos casos. QT programado y tiempos de P/QRS/T permanecen iguales.
La repolarización generada no cambia; los filtros pueden propagar diferencias
de QRS fuera de su ventana por su respuesta temporal. La prueba de aislamiento
sin filtro incluye el soporte FIR de40ms a cada lado.

No corrige todas las limitaciones de combinaciones con sobrecarga, bajo voltaje,
fuentes ventriculares o enfermedad posterior. No implica validación anatómica
ni clínica del perfil local, ni completa V7–V9.

## Cierre de ciclo

CI ejecuta siete pruebas focales, comparación pareada de244defaults y20casos de
ganancia, más suite histórica/build/benchmarks. No se relaja ningún snapshot o
margen anterior. Navegador: posterior→ganancia1→0,1→1, cambio visible y restauración
exacta del canvas con metadatos constantes, escritorio1440×1000 y móvil390×844.
Se reutiliza Playwright del repositorio; Browser plugin no disponible. Se usan
eventosinput de la interfaz real, no una prueba física de gestos de iPhone.
No despliegue, nueva dependencia ni cambio de licencia/versión.

## Bajo voltaje combinado con patrón posterior (extensión posterior al PR35)

El mismo problema persistía al importar un caso posterior con
`electrolyte: lowvoltage`: el vector QRS se atenuaba por el factor existente 0,38,
pero la corrección local posterior no. A ganancia QRS 1, la R positiva aislada
de V1 subía de 0,223203 a 0,473436 mV en vez de bajar a 0,084817 mV.

La función pura `qrsAmplitudeScale` comparte la ganancia y el factor ya existentes
entre vector y corrección posterior. No añade un parámetro ni redefine un umbral
clínico: 0,38 es una decisión previa del modelo, no una regla clínica universal.
Esta extensión cambia sólo la combinación posterior+bajo voltaje; no rediseña
las sobrecargas del VD ni resuelve otras mezclas de patologías.

Los 61 presets predeterminados permanecen idénticos. Se conservan los 20 casos de
ganancia anteriores y se añaden 20 con bajo voltaje frente al PR35 integrado
`e8bb934d9b5b78e15a99d447e2ed61b2279df16c`. Cuatro pruebas nuevas reproducen el
defecto anterior; cinco pruebas nuevas verifican atenuación e independencia de
P/ST/T fuera de QRS más soporte antialias. No cambia el analizador; las mediciones
de los casos personalizados afectados sí pueden variar al cambiar sus muestras.

Navegador: exportar caso posterior personalizado → importar con bajo voltaje →
cambio visible → reimportar sin bajo voltaje → restauración exacta del canvas.
Se usa la ruta de importación real y el Playwright existente en escritorio/móvil
emulado, sin control nuevo ni prueba física de iPhone.
