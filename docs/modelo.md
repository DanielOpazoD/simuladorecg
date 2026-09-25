# Modelo electrocardiográfico y decisiones

> Documento acumulativo: para versión integrada y alcance por fase consultar [README](../README.md) y [matriz vigente](alcance-actual.md). Los apartados históricos no son una nueva validación.

## Plan aplicado

Se priorizó un motor independiente y verificable, con vista de papel como superficie inicial, un monitor y herramientas docentes. Los ritmos y bloqueos AV se describen mediante eventos; los bloqueos de rama y vectores de ST modifican el dipolo; algunos patrones regionales tienen correcciones locales identificadas. Los casos que no admitían una representación suficiente quedaron señalados como aproximados o pendientes.

El [enfoque clínico](enfoque-clinico.md) fija cómo interpretar estas aproximaciones y sus etiquetas. La entrega 1.3 fortalece contratos existentes; no incorpora nuevos módulos ni un clasificador diagnóstico.

## 1. Eventos, ritmo y reproducibilidad

La secuencia de P y QRS se genera antes del trazado. Cada evento auricular informa si conduce. Cada evento ventricular tiene tiempo, origen y RR previo. El reloj del monitor no define la fisiología.

- Sinusal: PP variable, modulado por una señal respiratoria, componente lento de 0,1 Hz y ruido sembrado pequeño. Es una simplificación de la variabilidad, no una reproducción espectral completa de ECGSYN.
- FA: ausencia de P organizadas, actividad auricular ondulante y RR aleatorios acotados. FC es un objetivo estocástico; la media de un fragmento corto puede diferir.
- Flutter: actividad auricular continua y conducción fija 2:1, 3:1 o 4:1.
- Wenckebach: PP 800 ms, PR 160/240/280 ms y cuarta P bloqueada. RR 880/840 ms y pausa 1.480 ms. Los RR se derivan del calendario, no de desplazamientos manuales de la imagen.
- BAV completo: relojes independientes. Cambiar la frecuencia auricular no cambia los QRS del escape.
- ESV: acoplamiento definido como fracción del RR basal. Se conserva la P sinusal intermedia no conducida y se evita programar activaciones fuera de orden tras duplas.
- TV y ritmos ventriculares: QRS ancho con eje efectivo superior y actividad auricular independiente en TV. No hay competencia de focos capaz de producir captura/fusión.
- Estimulación: espigas y captura periódica AAI/VVI/DDD. No se simula el comportamiento a demanda.

Mulberry32 provee números pseudoaleatorios reproducibles. El generador de ruido usa semillas derivadas distintas del de eventos. No se usa `Math.random()` en el motor.

### Frontera de representabilidad en v1.3

Después de asignar QRS y QT a los eventos, `engine/constraints.ts` comprueba la secuencia antes de producir muestras. Rechaza cualquier QRS que comience antes de terminar el soporte QRS anterior. Para ESV y ESA conducidas programadas rechaza también un QRS que comience antes del inicio del soporte T previo. El inicio de T utiliza la misma función `tWaveSupport` que la síntesis: `QT − duración_T`.

La respuesta es `ModelScopeError`, mostrada como «Fuera del alcance del modelo», con el motivo correspondiente. No modifica el acoplamiento, no recorta el soporte previo ni elimina eventos. La interfaz invalida señal, medidas y exportación del caso anterior cuando falla la nueva generación.

Esta frontera es una política conservadora del motor que suma ondas; **no estima el período refractario efectivo (ERP)**, la vulnerabilidad ni la viabilidad de un latido clínico. Admitir una extrasístole después del inicio de T no demuestra fidelidad de su interacción con la repolarización. Tampoco se rechaza toda ectopia anterior al final QT. Las P independientes y las espigas no se tratan como nuevas activaciones ventriculares por sí mismas. Los 61 presets por defecto pasan la comprobación; las variantes fuera de alcance se conservan identificadas en los reportes.

## 2. Morfología vectorial

Se construyen tres señales XYZ. Convención de Frank: X hacia izquierda, Y hacia inferior y Z hacia posterior. Los kernels QRS incluyen activación septal, fuerzas del VI, componente basal y fuerzas derechas. En BRD se retrasa el componente derecho, conservando su proyección terminal mientras se ajustan las fuerzas dominantes para el eje solicitado. En BRI se sustituye la secuencia por fuerzas anchas y bimodales con alteración secundaria del ST–T.

Las amplitudes y los vectores de este proyecto son **calibraciones propias**, inspiradas en modelos publicados. No son parámetros individuales extraídos de pacientes. Los kernels tienen soporte temporal finito mediante una ventana de borde; sigma no se presenta como duración clínica.

P usa dos componentes solapados en un soporte de 95 ms. Comparten dirección frontal y tienen distinta evolución anteroposterior. La amplitud tardía se limita para que el ejemplo sinusal de V1 tenga componentes pequeños, aproximadamente +0,05/−0,046 mV, sin imponer una P normal idéntica a todos los pacientes. Los eventos auriculares ectópicos/retrogrados conservan sus plantillas. Es una elección del simulador, no una reconstrucción anatómica individual.

T usa dos ramas de coseno con pico en el 62% de su soporte (50% y mayor concentración en el patrón de T picuda). Esta forma da continuidad de valor y derivada en extremos y pico. El 62% es una elección de diseño, no una constante fisiológica universal.

### Contrato de amplitud T

`tAmp` escala toda la T respecto de la amplitud de referencia 0,28: componentes X/Y/Z, variantes de conducción/sobrecarga y ajustes regionales de Wellens/de Winter. Cero anula esa contribución. No significa que toda la ventana de repolarización quede en cero: pueden persistir ST primario o secundario, U y artefactos independientes. El control QRS no actúa como escala oculta de los ajustes T locales.

El escalado de Z corrige un componente que antes permanecía fijo. Entre los presets por defecto cambia únicamente bajo voltaje, que usa `tAmp = 0,15`; los efectos cuantitativos y hashes se publican en [aceptacion-fenotipos.md](aceptacion-fenotipos.md).

### Memoria de QT

En segundos, con `tau = -120 / ln(0.05) ≈ 40.06`:

```text
RR_efectivo[n] = RR_efectivo[n-1]
  + (1 - exp(-RR[n]/tau)) * (RR[n] - RR_efectivo[n-1])
QT[n] = QTc_F * cbrt(RR_efectivo[n])
```

Se limita QT entre `QRS + 120 ms` y 900 ms. Se inicializa la historia con el RR ventricular nominal, incluyendo razón de conducción cuando corresponde. Los latidos conservan `qrs`, `qt` y `adaptedRR`; el resumen de referencia usa los valores realmente sintetizados.

La recurrencia de memoria infinita es una adaptación de ingeniería inspirada en Malik et al.; el artículo emplea una ventana finita de cinco minutos y pesos exponenciales. La escala universal de adaptación es 95% en dos minutos. No implementa restitución rápida del potencial de acción ni adaptación individual. [Malik et al., 2018, método y apéndice](https://link.springer.com/article/10.1007/s10928-018-9587-8).

ECGSYN original contiene tres variables dinámicas, pero estas no equivalen a las tres componentes anatómicas de Frank. Por eso se describe este trabajo como una **adaptación paramétrica inspirada en ECGSYN y Clifford**, no como implementación literal. [ECGSYN/PhysioNet](https://physionet.org/content/ecgsyn/1.0.0/), [Clifford et al., 2010](https://pmc.ncbi.nlm.nih.gov/articles/PMC2927500/).

## 3. Proyección

La matriz hacia delante está en `src/engine/leads.ts`, con el orden I, II, V1–V6. Sus coeficientes conservan los de la guía. La pseudoinversa de esa matriz reproduce a tres decimales la matriz Inverse Dower publicada en la tabla 2 de Vondrak et al. Es una comprobación algebraica indirecta; no equivale a cotejo visual del original completo de Dower 1980. [Vondrak et al., 2022](https://pmc.ncbi.nlm.nih.gov/articles/PMC9106114/), [Dower et al., 1980](https://onlinelibrary.wiley.com/doi/10.1002/clc.1980.3.2.87).

Tras filtrar las ocho señales independientes se calculan:

```text
III = II − I
aVR = −(I + II)/2
aVL = I − II/2
aVF = II − I/2
```

aVR puede tener deflexiones positivas. El orden de Cabrera utiliza −aVR y cambia su etiqueta. La inversión RA/LA se aplica como transformación de derivaciones después del filtrado.

Para los ejes se integran áreas netas de QRS y se usa `atan2((2·II−I)/sqrt(3), I)`. El ángulo de Frank X/Y no se intercambia con el eje clínico. El control del eje intenta fijar el eje frontal de los kernels base; sobrecarga, correcciones regionales y artefactos pueden modificar el valor final medido.

## 4. ST, reciprocidad y ajustes locales

La lesión inferior con predominio en III usa el vector `[-0,10; +0,18; −0,02]`. Antes de filtros produce I −0,10668 mV, II +0,17102 mV, III +0,27770 mV y aVL −0,19219 mV. Los descensos recíprocos resultan de la proyección. No hay reglas por derivación para imponerlos.

El control de intensidad escala ese vector, por lo que no promete el mismo número de milímetros en cada derivación. La conversión visual depende de mm/mV. La meseta ST y la T son componentes separadas. La envolvente de lesión comienza 12 ms antes del final de QRS y alcanza su nivel en J; evita comenzar desde cero después de J. La corrección local de de Winter aplica el mismo principio. Las formas de ST son aproximaciones geométricas; la rampa de 12 ms es un parámetro de implementación, no un umbral clínico.

Wellens y de Winter, la R anterior del patrón posterior y el PR de pericarditis usan ajustes adicionales documentados. Un dipolo de tres dimensiones no reproduce toda morfología regional arbitraria en ocho señales independientes. No se extrapolaron filas sin validar para derivaciones posteriores o derechas.

### Intensidad, fases y contexto del caso

En los ajustes locales, `st / 2` escala la modificación T de Wellens y el ST/T de de Winter; 2 conserva el ejemplo de referencia. Con intensidad cero se recupera su repolarización basal. Las transformaciones globales de T de las fases hiperaguda/evolutiva también dependen de la intensidad, con mezcla acotada. La fase interna `chronic`, presentada como «ST resuelto», desactiva los aportes ST/T de lesión. No simula cicatriz, ondas Q ni una historia clínica de infarto; las fases son estados paramétricos, no una secuencia temporal validada. El ST secundario a BRI/activación ventricular, U y QRS son independientes de este control. La nota junto al control declara si su efecto actual recae en ST, T o ambos.

Al seleccionar «BRI con lesión concordante», la transición de controles aplica el ejemplo del catálogo: conducción BRI, QRS 160 ms, eje −15°, Q septal desactivada e intensidad de referencia del preset. Una importación con esta opción y conducción distinta de BRI o QRS <120 ms conserva sus parámetros y presenta advertencia. Esta configuración docente no implementa una evaluación de Sgarbossa original ni modificada.

`presets/case-context.ts` contrasta únicamente el preset declarado con sus parámetros fisiológicos. No usa nombre libre, semilla, vista, artefactos o ajustes de adquisición para exigir correspondencia. Si la fisiología difiere, `normalizeImportedCase` retira el identificador de preset y, cuando coincide con el nombre automático del catálogo, lo sustituye por «Caso personalizado». Conserva los parámetros de señal y vista ya normalizados por el esquema. No corrige silenciosamente la fisiología ni reclasifica un caso personalizado por semejanza. Así los hallazgos educativos del preset no se presentan como descripción de un caso modificado.

Se corrigieron etiquetas clínicas de la guía:

- «Bifascicular + BAV de primer grado» describe el ECG sin afirmar localización del PR en el tercer fascículo.
- BRD incompleto adulto se configura con QRS de 115 ms, dentro del criterio AHA de 110–119 ms.
- El patrón de ST descendido no se etiqueta automáticamente NSTEMI.
- ST descendido difuso y elevación de aVR se describen como patrón, sin adjudicar una arteria de forma específica.

[AHA/ACCF/HRS, conducción, 2009](https://www.ahajournals.org/doi/10.1161/circulationaha.108.191095), [Knotts et al., 2013](https://pubmed.ncbi.nlm.nih.gov/23312698/).

La Quinta Definición Universal de Infarto de 2026 mantiene los umbrales clásicos de elevación ST y recalca límites de especificidad. Los presets son representaciones docentes; no ejecutan un algoritmo diagnóstico de infarto ni sustituyen la interpretación de contexto, síntomas y troponinas. [Quinta Definición Universal, sección 13 y tabla 5](https://academic.oup.com/eurheartj/advance-article/doi/10.1093/eurheartj/ehag101/8766309).

## 5. Filtros y muestreo

Se sintetiza a 1000 Hz con 4 s previos y 100 ms reales posteriores de guarda. El paso alto causal es 0,05 Hz en diagnóstico, 0,5 Hz en monitor y 2 Hz en demostración agresiva. Monitor/agresivo incorporan un biquad de paso bajo a 40 Hz. La salida siempre pasa por un FIR Blackman simétrico de 81 coeficientes (corte de diseño 170 Hz) antes de decimar a 500 Hz. La convolución centrada compensa sus 40 ms de retardo y utiliza muestras de guarda, conservando el prefijo de la señal al cambiar la duración.

El FIR mantiene la banda hasta 150 Hz y suprime componentes por encima del Nyquist de salida; las pruebas verifican ganancia >0,90 a 150 Hz y <0,001 a 260 Hz, además de ausencia de desplazamiento del impulso. Son comprobaciones seleccionadas, no certificación de toda la respuesta.

La interferencia se genera a `mainsFrequency` (50/60 Hz), independientemente del notch seleccionado. Así, elegir un notch de 60 Hz ya no transforma artificialmente una fuente de ruido de 50 Hz.

Se preserva el paso alto diagnóstico de 0,05 Hz. Su recuperación causal puede desplazar la base y no se afirma ausencia de transitorios. Se mide ST contra una referencia local; aumentar el corte puede distorsionarlo. [AHA/ACCF/HRS, tecnología](https://www.ahajournals.org/doi/10.1161/circulationaha.106.180200).

## 6. Delineación y auditoría

### Análisis independiente

`measure({fs, leads})` solo recibe muestras y frecuencia de muestreo. No tiene acceso a `ECGCase`, eventos ni verdad sintética. Analiza los primeros 10 s y devuelve los límites por latido en segundos, junto con los resúmenes.

La detección usa energía derivativa multiderivación I/II/V1/V5, integración de 18 ms y refractario de 180 ms. `ventricular-candidates.ts` separa la selección de candidatos de la búsqueda de límites. Compara actividad derivativa en ventanas de 4 y 16 ms para reconocer impulsos breves; los neutraliza en esta rama antes de seleccionar máximos. El umbral relativo a la distribución de energías evita que una P repetida domine un escape ventricular lento.

El rechazo de una posible T exige simultáneamente intervalo de 200–400 ms tras el candidato previo, menor energía, trayectoria espacial casi unidimensional y menor complejidad de pendiente respecto al QRS anterior. Una pendiente pequeña por sí sola no descarta una extrasístole. Estos valores son heurísticos del proyecto, no reglas clínicas universales; el barrido incluye acoplamientos cortos precisamente para vigilar omisiones de ectopia.

Los límites QRS usan derivada centrada, umbrales relativos al complejo y al fondo, y un puente de quietud de hasta 40 ms para mesetas/muescas. Una salida alternativa requiere 6 ms consecutivos con magnitud y pendiente bajas y cercanas a la base. Solo acorta la búsqueda ya recorrida; no traslada el límite fuera del soporte encontrado. Esto reduce la unión falsa de P y QRS en algunos patrones, pero sigue existiendo sesgo de inicio en registros externos de baja pendiente.

`impulses.ts` prepara otra copia solo para delineación. Sustituye alrededor del impulso detectado, desde 34 ms antes hasta 8 ms después de su centro, por una referencia local previa. Devuelve también las regiones intervenidas. P/QRS/T próximos a esas regiones rebajan la variable a revisión: se ha perdido información y no se reconstruye el comienzo oculto de una activación. El trazado y la exportación usan las muestras originales. El flujo nativo es 500 Hz; se reprodujo un fallo de protección a 250 Hz, por lo que no se afirma invariancia de este procedimiento entre frecuencias de muestreo.

El eje integra el área dentro de los mismos límites y utiliza mediana circular robusta al primer dato extremo. La dispersión se calcula tras desenvolver los ángulos alrededor de ese centro; no resta directamente +179° y −179°.

P requiere amplitud distinguible del ruido y asociación estable entre varios latidos. Si no puede separarse la T, el supuesto PR se marca para revisión: una onda repetida antes de QRS podría ser la T previa. Se conserva FC cuando los picos son reconocibles aunque las ondas no sean separables; no se inventan intervalos.

T se analiza como un grupo continuo de actividad, tolerando el cruce de cero breve de una T bifásica y terminando antes de una U separada por una base suficiente. Se requiere retorno sostenido. Un segundo criterio comprueba que la pendiente terminal permanezca baja durante 24 ms, por debajo del 8% de la pendiente terminal máxima y con magnitud menor al 15% del pico. Esto evita atribuir a T la recuperación lenta del filtro causal. Los umbrales son decisiones heurísticas evaluadas con fixtures independientes, no criterios diagnósticos.

La ventana de QT admite T largas hasta 950 ms cuando el siguiente complejo lo permite. La separación breve T–P puede impedir el resultado, incluso si el generador conoce sus tiempos. La tangente de la envolvente multiderivación se muestra por separado. No equivale necesariamente a una tangente manual sobre una derivación clínica ni debe igualar el soporte matemático del generador. [Hunt, 2005, comparación experimental de métodos QT](https://link.springer.com/article/10.1186/1471-2261-5-29).

Cada variable comunica disponibilidad, cobertura, dispersión P90–P10 y motivo. FC cuenta intervalos RR. Los intervalos usan como denominador los candidatos interiores elegibles, incluidos los que no alcanzaron una delineación válida; no solo los éxitos. «Reproducible» no es una probabilidad de acierto. El muestreo a 500 Hz tiene paso de 2 ms; eso no significa exactitud de 2 ms.

### Auditoría específica del simulador

`auditMeasurement(signal, measurement)` es una etapa posterior y separada. Asocia cada pico detectado a un único QRS del generador en los primeros 10 s; una asociación ambigua, un candidato sobrante o un evento omitido entre los extremos observados no se acepta. La referencia de cada intervalo usa los latidos que realmente contribuyen a esa medida. FC se contrasta entre los mismos extremos observados. Esto evita mezclar proporciones de latidos normales y ectópicos o introducir un evento de borde ausente del análisis. Puede rebajar el estado o retirar una medida; nunca inserta el valor esperado en su lugar. Los candidatos retirados se conservan en `rejected` y el motivo muestra la discordancia.

| Variable | Revisión por diferencia | Retirada por diferencia |
|---|---:|---:|
| FC | >2 lpm | >máximo de 3 lpm o 5% de referencia |
| PR | >15 ms | >30 ms |
| QRS | >15 ms | >25 ms |
| QT | >25 ms | >40 ms |

También se contrasta cada inicio/final QRS individual (15/25 ms), inicio P (15/30 ms) y final T (25/40 ms), aunque la mediana de duración coincida. Un candidato P/PR sobre un evento fuente sin asociación AV retira el PR global y su eje; no se omite silenciosamente de la comparación. Son tolerancias internas de ingeniería. Un fallo en FC invalida intervalos y eje porque puede haber detecciones de P/T/espigas. Un QRS rechazado invalida PR, QT y eje. Un PR variable o ausente en la referencia impide presentar una asociación global. Las cifras no aceptadas y sus marcas se omiten de la lectura ampliada.

Los ejemplos por defecto de hiperpotasemia, WPW y estimulación mejoran en v1.2; persisten dificultades en superposiciones, frecuencias altas y ectopia muy prematura. El escape ventricular puede tener FC correcta y QRS retirado por un único límite discordante. La auditoría es deliberadamente conservadora; no corrige la posición de una marca. No se debe reutilizar esta etapa como analizador de ECG de pacientes: depende de una referencia sintética conocida que allí no existiría.

## 7. Render y escalas

La geometría se define en mm y se transforma una sola vez a píxeles. Canvas usa `devicePixelRatio`. La reducción por columnas conserva mínimo y máximo incluso cuando se agrupan dos muestras. Las filas aumentan su altura cuando el voltaje lo requiere para evitar recortar QRS en papel.

El pulso representa 1 mV y 200 ms: 10 mm de alto y 5 mm de ancho a 10 mm/mV y 25 mm/s. PNG utiliza 300/25,4 píxeles/mm y se inserta un bloque pHYs de 11.811 píxeles/metro. Ajustar al ancho cambia la escala física de pantalla, lo que se indica expresamente. [MDN, optimización de Canvas](https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API/Tutorial/Optimizing_canvas).


### Estado de pausa y calibres

`syncTraceTools` en `main.ts` proyecta disponibilidad, modo de vista y banderas compartidas en el texto, icono, atributos accesibles y estado del trazado. La llegada de una nueva señal reinicia la pausa; el indicador vuelve a reproducción y el botón a «Congelar». Los calibres solo están disponibles con señal en papel/tira. Al pasar por monitor, la disponibilidad y el estilo activo se recalculan; al volver al papel reflejan el estado vigente. Este cambio sincroniza las herramientas existentes y no añade medición al monitor.

### Detalle y selección de un latido

«Ondas» y la ampliación usan `DelineatedBeat`, exactamente el mismo resultado que genera las medidas. No consultan eventos del generador para colocar etiquetas. El punto J visible es una estimación a partir del final QRS medido, no una anotación infalible. El panel conserva muestras de la derivación elegida, ejes mV y ms relativos a QRS, navegación por latido y comparación separada de retorno/tangente.

El papel ofrece segmentos secuenciales o simultáneos. En el segundo modo cada segmento de las 12 derivaciones parte de t=0; la tira adicional conserva los 10 s completos. El modo no inventa más tiempo por derivación ni altera la señal.

## 8. Mantenimiento y pruebas

El motor no depende del DOM. El protocolo del worker está en `engine/protocol.ts`. Síntesis y delineación se ejecutan en el worker, que transfiere los buffers; el controlador mantiene como máximo un cálculo activo y una petición pendiente, reemplazada por la más reciente. `ui/case-state.ts` concentra transiciones puras y normalización de controles. Los componentes de detalle y diálogo reciben datos ya calculados.

La suite de v1.3 reúne 293 pruebas en 11 archivos. Se separan propiedades eléctricas y temporales, contratos de controles/importación, representabilidad de eventos, respuesta de señal, análisis de fixtures independientes, auditoría, geometría, concurrencia y regresión externa conocida. `npm run check` ejecuta pruebas, comprobación de tipos y compilación. El estado final de ejecución se registra en [verificacion.md](verificacion.md).

La base de aceptación de fenotipos añade 85 pruebas: 61 comprobaciones comunes sobre I/II/V1–V6 y 24 específicas sobre 12 presets en dos modos de filtro. Las específicas leen muestras y usan eventos únicamente para delimitar ventanas; no son un delineador independiente. Los umbrales son contratos de ingeniería basados en la morfología actual. La revisión humana clínica está pendiente. [Método y límites de aceptación](aceptacion-fenotipos.md).

Las identidades eléctricas se verifican con error absoluto, incluido `abs(III − (II − I)) < 1e−9`, para evitar que una discrepancia negativa apruebe por el signo. Las pruebas comunes comparan todas las muestras de las ocho derivaciones independientes al modificar solo la vista. De los 61 hashes históricos de señal, 60 permanecen intactos y el de bajo voltaje cambia por la corrección de T documentada; un hash sirve como alarma de regresión, no como evidencia clínica.

El barrido [detection-regression-v1.3.json](detection-regression-v1.3.json) conserva 313 configuraciones: 283 admitidas para comparar analizadores y 30 fuera del alcance del motor, registradas por separado. Ambos analizadores reciben las mismas muestras actuales admitidas. No hay regresiones de conteo frente al analizador v1.1 en ese subconjunto; persisten errores conocidos, incluidas 12 omisiones en variantes de duplas. El cambio de denominador impide presentar este barrido como 313 detecciones satisfactorias o como una nueva mejoría del analizador.

El banco LUDB contiene ocho registros originales de 12 derivaciones, 500 Hz, con calibración y anotaciones derivadas verificadas. El medidor solo recibe muestras. El benchmark agrega inicio mínimo y final máximo de I/II/V1/V5 por un protocolo propio y no usa la auditoría del modelo. Desarrollo (1–4) se usó para ajustar en v1.2; control (101–104) se ejecutó tras congelar aquel algoritmo y ya está expuesto. La descripción completa, licencia y límites están en [el README de LUDB](../tests/reference/ludb/README.md).

En v1.3 no se repitió el benchmark completo de los ocho registros. Las pruebas automatizadas existentes sobre desarrollo permanecen en la suite. `analysis-validation-all.json`, `analysis-paired-comparison.json`, `fidelity-report.json` y `detection-regression.json` conservan resultados históricos de v1.2. Aquel control mostró más cobertura y mejor final QRS, pero duración con MAE ligeramente peor; no se afirma mejora universal ni nueva validación externa en esta entrega. [Informe íntegro de v1.2](verificacion-v1.2.md).
