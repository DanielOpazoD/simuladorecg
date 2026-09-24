# Electrocardiografía del Síndrome Coronario Agudo: revisión de la evidencia para la construcción de un simulador de ECG de 12 derivaciones de alta fidelidad

**Versión:** 1.0 (septiembre 2026) · **Alcance:** revisión narrativa estructurada + tablas por patrón + especificaciones de simulador + bibliografía con DOI/URL.

> **Cómo leer este documento.** Las secciones 1–7 son la revisión narrativa. La sección 8 contiene las tablas resumen por patrón. La sección 9 traduce la evidencia en especificaciones para el simulador (parámetros de señal, reglas, secuencias temporales y biblioteca mínima de casos). La sección 10 es la bibliografía numerada; las referencias se citan en el texto como [n]. Los valores marcados con **(*)** provienen de series pequeñas, consenso de expertos o fuentes no revisadas por pares (blogs académicos) y deben tratarse como parámetros ajustables, no como constantes. Cuando existe controversia se señala explícitamente con el rótulo **⚠ Controversia**.

---

## Resumen ejecutivo

1. El ECG de 12 derivaciones sigue siendo la herramienta de decisión inicial en el SCA, pero los **criterios STEMI** (umbrales de elevación del ST de la Cuarta Definición Universal de Infarto [1]) tienen **sensibilidad ~30–45 %** para el sustrato que realmente importa —la **oclusión coronaria aguda (OMI)**— con especificidad ~90–98 % [5,6,9,10]. Alrededor de **25–30 % de los "NSTEMI" tienen una arteria ocluida** en la angiografía diferida y **doble mortalidad** respecto a NSTEMI sin oclusión [11,12].
2. El **paradigma OMI/NOMI** (Meyers, Smith, McLaren, Aslanger, Bracey y otros) propone sustituir el marcador sustituto (STE) por el sustrato fisiopatológico (oclusión o casi-oclusión con colateralidad insuficiente). Ha sido validado retrospectivamente (DIFOCCULT [9], DOMI-ARIGATO [5,6]), incorporado parcialmente en documentos de consenso (ACC 2022 [4], ACC/AHA 2025 [3], ESC 2023 [2]) bajo la etiqueta "equivalentes de STEMI", y tiene una implementación con IA (Queen of Hearts / PMcardio) con AUC ≈ 0,94 en validación internacional [13].
3. Los patrones "equivalentes de oclusión" (T hiperagudas, De Winter, Wellens, Aslanger, depresión ST máxima en V1–V4, Sgarbossa modificado/Barcelona en BRI, "South African flag", distorsión terminal del QRS, reciprocidad, etc.) están **definidos cuantitativamente** en grados variables; este documento recoge los umbrales publicados y su rendimiento diagnóstico para que el simulador genere señales que cumplan —o deliberadamente no cumplan— cada criterio.
4. Para el simulador se recomienda una arquitectura **vectorial-dipolar + morfología paramétrica gaussiana (McSharry/ECGSYN ampliado)** con un módulo de "vector de lesión" que proyecte el ST/T sobre las 12 derivaciones en función de la región isquémica (mapa arteria→territorio→derivaciones), un módulo temporal de evolución (T hiperaguda → STE → Q → inversión T → reperfusión/reoclusión) y un módulo de artefactos/ruido/mala colocación. La validación debe hacerse frente a bases anotadas (PTB-XL, PhysioNet, STAFF III) y a los criterios cuantitativos de la sección 8.

---

## 1. Bases electrofisiológicas de la isquemia

### 1.1 Fisiopatología celular: isquemia, lesión y necrosis

La oclusión coronaria aguda interrumpe el aporte de O₂ y sustratos; en segundos cae el ATP intracelular y la fosfocreatina, y el metabolismo se vuelve anaerobio. Las consecuencias electrofisiológicas relevantes para el ECG son [14,15,16]:

- **Acumulación extracelular de K⁺** ([K⁺]ₒ pasa de ≈4 a 10–15 mmol/L en 5–10 min) por salida neta de K⁺ (apertura de canales **K‑ATP** sensibles a ATP, inhibición de la bomba Na⁺/K⁺-ATPasa y cotransporte con lactato/aniones). El resultado es una **despolarización del potencial de reposo** (de ≈ −85 mV a ≈ −60 mV) en la zona isquémica.
- **Inactivación parcial de canales de Na⁺** por la despolarización del reposo → menor dV/dt de la fase 0, **conducción lenta** y menor amplitud del potencial de acción.
- **Acortamiento del potencial de acción (APD)** por activación de la corriente I_K‑ATP y acidosis; en isquemia severa el APD puede acortarse 30–50 % en 10–15 min. Esto acelera la repolarización de la zona isquémica y genera un gradiente de voltaje durante la fase de meseta/repolarización respecto al miocardio sano.
- **Dispersión de la repolarización** (heterogeneidad espacial de APD y de la duración del potencial de acción) entre el borde isquémico y el tejido sano: base de la arritmogénesis (reentrada de fase 1A/1B, fibrilación ventricular precoz) y de las ondas T de "isquemia" (inversión) y de reperfusión.
- La **necrosis** (pérdida de excitabilidad eléctrica) comienza en el subendocardio a partir de ~20–40 min de oclusión completa y progresa como frente de onda hacia el epicardio ("wavefront phenomenon" de Reimer y Jennings [105]) a lo largo de 3–6 h, con marcada dependencia de la circulación colateral, el precondicionamiento y la demanda metabólica [14].

### 1.2 Corrientes de lesión y el vector de lesión (ST-vector)

Hay dos mecanismos complementarios que explican el desplazamiento del segmento ST [15,16,17]:

1. **Corriente de lesión diastólica.** En diástole eléctrica (segmento TQ) la zona isquémica está parcialmente despolarizada (menos negativa) que el tejido sano; la corriente extracelular fluye desde el tejido sano al isquémico y el electrodo que "mira" la zona isquémica registra una **depresión del segmento TQ**. Como los electrocardiógrafos son acoplados en AC (filtros paso-alto ~0,05 Hz) y restauran la línea de base al segmento TP/TQ, esa depresión diastólica se ve como **elevación aparente del ST**.
2. **Corriente de lesión sistólica.** Durante la meseta, la zona isquémica tiene un potencial de acción de menor amplitud y más corto; su membrana es relativamente más negativa que la del tejido sano → la corriente extracelular fluye del tejido isquémico al sano → el electrodo que mira la zona isquémica registra **elevación verdadera del ST**.

Ambas corrientes suman en la misma dirección en las derivaciones que miran la región isquémica. El **vector de lesión** (ST‑vector) se define como el dipolo neto que apunta *desde el tejido sano hacia el tejido lesionado* durante el ST [17,18]:

- **Isquemia transmural / lesión epicárdica** (oclusión completa): el vector ST apunta hacia el epicardio de la pared afectada → **elevación del ST** en las derivaciones cuyo eje positivo mira esa pared y **depresión recíproca** en las derivaciones opuestas (p. ej., aVL en el IAM inferior; V1–V3 en el IAM posterolateral).
- **Isquemia subendocárdica** (desequilibrio oferta/demanda, estenosis severa no oclusiva, isquemia difusa): el vector ST apunta desde el epicardio hacia el endocardio/cavidad → **depresión del ST** en la mayoría de las derivaciones precordiales y de miembros (I, II, V4–V6) y **elevación recíproca en aVR** (y a veces V1), que mira la cavidad/basal septal. Importante: la STD subendocárdica **no localiza** la arteria [1,19,20].

Para un simulador, el modelo dipolar único (vector ST de amplitud A y dirección (θ, φ) en el espacio de Frank) proyectado sobre los ejes de las 12 derivaciones reproduce con buena fidelidad la distribución de elevación/depresión en el 80–90 % de los casos clínicos; el modelo falla cuando hay dos regiones isquémicas simultáneas (multivaso, oclusión de DA envolvente con lesión anterior + inferior que se cancelan; signo de Aslanger) y ahí es preferible un modelo de **superposición de dipolos regionales** (uno por territorio) [18,21].

### 1.3 Evolución temporal del infarto

La secuencia clásica (Dressler y Roesler 1947 [22]; Sclarovsky 1999 [18]; Zimetbaum & Josephson 2003 [19]) y sus ventanas temporales aproximadas en oclusión completa **no reperfundida**:

| Fase | Inicio típico | Hallazgo ECG | Datos cuantitativos disponibles |
|---|---|---|---|
| 0. Pre-isquemia | — | ECG basal | — |
| 1. **Onda T hiperaguda** | segundos–minutos (2–30 min) | T ancha, de base ancha, simétrica o asimétrica, alta *respecto al QRS*; "hinchada" (bulky); mínimo o nulo STE; puede haber STD recíproca sutil | Área T/QRS ↑; T > 50 % del QRS en la derivación; puntuación HATW (Meyers 2025) [23]; véase §1.4 |
| 2. **Elevación del ST** | minutos–horas (la STE alcanza su máximo típicamente en 1–3 h) | STE convexa/recta/"plateau", pérdida de S, distorsión terminal del QRS (grado 3 de Sclarovsky‑Birnbaum) [24,25] | STE 0,1–>1,0 mV; en IAM anterior extenso 0,3–0,8 mV en V2–V4; "tombstoning" cuando ST > R [26] |
| 3. **Onda Q / pérdida de R** | 1–12 h (pueden verse Q "precoces" en la primera hora en ~50 % de anteriores; **no** indican irreversibilidad) | Q ≥ 30–40 ms o QS; caída de R (también "Q equivalentes": R en V1–V2 en posterior) | Q ≥ 0,03 s y ≥ 1 mm de profundidad en 2 derivaciones contiguas (definición UDMI de IAM previo) [1] |
| 4. **Inversión terminal de la T** | 12–48 h (o **en minutos** si hay reperfusión) | T bifásica → invertida profunda simétrica; ST vuelve a la línea de base en días | Inversión ≥ 0,1 mV en 2 derivaciones con R > 0,3 mV [1] |
| 5. **Crónica** | semanas | Q persistente; T se normaliza o queda invertida; STE persistente = aneurisma/discinesia | T/QRS < 0,36 en V1–V4 sugiere aneurisma vs. IAM agudo [27] |

**Cinética de reperfusión.** Tras reperfusión exitosa (PCI o fibrinólisis), la STE cae >50 % en 60–90 min (criterio de Schröder; resolución ≥ 70 % se asocia con mejor pronóstico) [28]; la onda T se invierte en las derivaciones con STE ("T de reperfusión"), a menudo en **minutos a pocas horas**, y puede aparecer **ritmo idioventricular acelerado (RIVA)** [29]. La **reoclusión** produce "pseudonormalización" (la T invertida vuelve a positivarse) seguida de nueva STE [19,30]. Estos ciclos son la base fisiopatológica del patrón de Wellens (§4.3).

### 1.4 Ondas T hiperagudas (HATW): definiciones cuantitativas

Históricamente descritas como "altas, anchas, de base ancha, asimétricas" sin umbral numérico. Avances recientes:

- **Meyers, Šimančík, Demolder, Herman, Smith et al. 2025 (JACC Advances)** [23]: primera definición objetiva. Se midió (a) **magnitud** = área de la onda T relativa a la amplitud del QRS; (b) **simetría** = tiempo pico‑final / tiempo inicio‑pico. Puntuación HATW derivada por regresión logística en 1 261 pacientes y validada en 1 395. Umbral óptimo para especificidad ≥ 98 %: **≥ 2 derivaciones contiguas con puntuación media HATW ≥ 0,7**. En pacientes **sin criterios STEMI** (n = 1 300): **especificidad 98,4 %, sensibilidad 20,7 %, VPP 47,4 %, LR+ 12,5**; 84 % de los HATW‑positivos sin STEMI tenían lesión culpable causante de IAM. Exclusiones: QRS ≥ 110 ms.
- **Koechlin et al. 2023 (Ann Emerg Med)** [31]: en la cohorte APACE, HATW definidas por criterios visuales/amplitud tuvieron baja sensibilidad (≈ 5–10 %) y especificidad alta (> 95 %) para IAM; **⚠ Controversia**: los autores concluyen utilidad limitada, mientras el grupo OMI atribuye la baja sensibilidad a una definición inadecuada y a que el estándar de referencia fue IAM (troponina) y no oclusión.
- **Criterios prácticos de Smith/Meyers (Dr. Smith's ECG Blog; consenso de expertos, no validados prospectivamente) (*)** [32]: T "demasiado grande para el QRS" (relación amplitud T/QRS ≥ 0,5–0,75 en V2–V4 sugiere isquemia; en repolarización precoz la T es alta pero el QRS también), base ancha (duración desde el inicio de la T al final > 50 % del intervalo del ST‑T), pérdida de la concavidad de la rama ascendente ("recta o convexa"), aparición de STD recíproca/T negativa en derivación opuesta, y **dinámica**: cambio respecto a un ECG previo o al seriado.
- **Fórmula de Smith para DA vs repolarización precoz** utiliza la amplitud de T en V1–V4 indirectamente a través de STE60 y R (§4.11).

**Implicación para el simulador:** parametrizar la T con tres variables (amplitud relativa al QRS, anchura = σ de la gaussiana, asimetría = relación entre σ ascendente y descendente) y calcular automáticamente la puntuación HATW y la relación T/QRS para etiquetar el caso.

---

## 2. Criterios clásicos y sus límites

### 2.1 Cuarta Definición Universal de Infarto (2018) [1]

En ausencia de HVI o BRI, nueva STE en el **punto J** en **≥ 2 derivaciones contiguas**:

| Derivaciones | Umbral | Grupo |
|---|---|---|
| V2–V3 | ≥ 0,25 mV (2,5 mm) | hombres < 40 años |
| V2–V3 | ≥ 0,2 mV (2 mm) | hombres ≥ 40 años |
| V2–V3 | ≥ 0,15 mV (1,5 mm) | mujeres (cualquier edad) |
| Resto de derivaciones (I, II, III, aVL, aVF, V1, V4–V6) | ≥ 0,1 mV (1 mm) | todos |
| V3R–V4R | ≥ 0,05 mV (0,5 mm); ≥ 0,1 mV en hombres < 30 años | IAM de VD |
| V7–V9 | ≥ 0,05 mV (0,5 mm); ≥ 0,1 mV en hombres < 40 años | IAM posterior/inferobasal |
| Depresión ST | nueva STD horizontal o descendente ≥ 0,05 mV en 2 derivaciones contiguas y/o inversión de T ≥ 0,1 mV en 2 derivaciones contiguas con R prominente o R/S > 1 | isquemia sin STE |

La UDMI recomienda medir el ST en el **punto J** respecto a la **línea isoeléctrica TP (o PR/TQ)** [1,33]. La UDMI ya menciona explícitamente como "equivalentes" la STD ≥ 0,1 mV en ≥ 6 derivaciones + STE en aVR/V1 (isquemia multivaso o de tronco), el BRI con criterios de Sgarbossa, la STE en V7–V9 y la depresión ST máxima en V1–V3 con T positivas (posterior).

### 2.2 Guías ESC 2023 de SCA [2] y ACC/AHA/ACEP/NAEMSP/SCAI 2025 [3]

- **ESC 2023** unifica STEMI/NSTEMI bajo "SCA" y recomienda **angiografía inmediata (< 2 h) en NSTE‑ACS de muy alto riesgo** (inestabilidad hemodinámica, dolor refractario, arritmias, **cambios dinámicos recurrentes del ST**, complicaciones mecánicas, IC aguda, **STE en aVR con STD difusa**). Reconoce como "patrones sugestivos de oclusión que requieren estrategia STEMI": BRI o marcapasos con criterios, STD V1–V3 con STE V7–V9 (posterior), STE aVR + STD difusa (≥ 8 derivaciones), **"otros equivalentes"** (De Winter, T hiperagudas), pero mantiene los umbrales de STE de la UDMI para activación estándar. No adopta la terminología OMI.
- **ACC/AHA 2025** (Rao et al.) mantiene la clasificación STEMI/NSTE‑ACS y define **"equivalentes de STEMI"** que justifican reperfusión emergente: T hiperagudas, De Winter, patrón de oclusión posterior, BRI/marcapasos con Sgarbossa modificado, STE aVR con STD difusa en paciente inestable. Cita el paradigma OMI como área de investigación activa (**⚠ Controversia**: no lo adopta formalmente).
- **ACC 2022 Expert Consensus Decision Pathway (Kontos et al.)** [4]: primer documento de sociedad que afirma que "la aplicación de los criterios STEMI en un ECG estándar de 12 derivaciones omitirá una minoría significativa de pacientes con oclusión coronaria aguda" e incluye una tabla de equivalentes de STEMI (posterior, De Winter, T hiperagudas, BRI con Sgarbossa modificado, aVR).

### 2.3 Sensibilidad/especificidad de los criterios STEMI para oclusión

| Estudio | n | S de STEMI para oclusión | E | Comentario |
|---|---|---|---|---|
| Meyers et al. 2021, DOMI‑ARIGATO [5] | 808 (265 OMI) | **41 %** (36 % 2.º lector) | 94 % (91 %) | Lectura OMI experta: S 86 %/E 91 % (lector 1); STEMI(−)OMI = mismo tamaño de infarto y mortalidad, mayor retraso a cateterismo |
| Aslanger et al. 2020, DIFOCCULT [9] | 3 000 | ≈ 60–65 % (criterios STE) | — | 28,2 % de "NSTEMI" reclasificados como oclusión; mayor mortalidad hospitalaria y a largo plazo |
| Herman et al. 2024 (cohorte internacional QoH) [13] | 3 254 ECG / 2 222 pac. | **32,5 %** | 97,7 % | IA: S 80,6 %, E 93,7 %, AUC 0,938; expertos S 73 %/E 95,7 % |
| de Alencar Neto et al. 2024, revisión sistemática [10] | 3 estudios | **43,6 % (agrupada)** | ~ 90–95 % | Solo 3 estudios en 30 años verifican STEMI contra oclusión angiográfica |
| Meyers/Smith 2025 sub‑estudio DA total (TIMI 0) [7] | 53 oclusiones totales DA | 62 % (38 % nunca cumplieron STEMI en ECG seriados) | — | Experto e IA: 100 % de S en el **primer** ECG |
| Khan et al. 2017, metaanálisis NSTEMI [11] | 40 777 (7 estudios) | — | — | **25,5 %** de NSTEMI con arteria culpable ocluida (TIMI 0–1); mortalidad ↑ (OR ≈ 1,7) |

**Falso STEMI(+)**: 15–35 % de las activaciones de hemodinamia por "STEMI" no tienen lesión culpable (Larson 2007: 14 % sin lesión culpable, 9,5 % sin enfermedad coronaria significativa [34]; McCabe 2012: 36 % de activaciones "inapropiadas" [35]). Causas frecuentes: repolarización precoz, HVI con strain, BRI, pericarditis, Brugada, hiperkalemia, aneurisma, Takotsubo.

### 2.4 Limitaciones históricas del paradigma STEMI/NSTEMI

- El umbral de STE deriva del metaanálisis FTT 1994 [36], en el que los ECG se clasificaban como "STE", "BRI", "STD" o "normal" sin definiciones cuantitativas ni angiografía; los beneficios de la fibrinólisis se observaron en STE/BRI y se generalizaron a "solo STE se beneficia" [8].
- Nunca se ha realizado un ensayo aleatorizado que compare reperfusión emergente frente a diferida en pacientes con oclusión sin STE; la evidencia es observacional (mortalidad hospitalaria de NSTEMI‑oclusión ≈ 2× frente a NSTEMI sin oclusión) [11,12,5].
- El **retraso** es el daño medible: en DOMI‑ARIGATO el tiempo mediano a angiografía de STEMI(−)OMI fue ≈ 1,7 h frente a 0,7 h; en el sub‑estudio DA total, "door‑to‑balloon" significativamente mayor sin diferencias en tamaño de infarto ni FE, evidenciando que el sustrato es idéntico [5,7].
- Los criterios STEMI son especialmente insensibles para **circunfleja** (hasta 40–50 % de las oclusiones de CX no muestran STE diagnóstica [37,38]) y para **oclusiones proximales con QRS ancho** [39].

---

## 3. Paradigma OMI/NOMI

### 3.1 Origen y definiciones operativas

- **Concepto**: OMI = oclusión coronaria aguda o casi‑oclusión con circulación colateral insuficiente, tal que el miocardio distal se infartará sin reperfusión oportuna. NOMI = IAM sin este sustrato. Formulado en el **"OMI Manifesto"** (Meyers, Weingart, Smith; Dr. Smith's ECG Blog, 2018) [8] y desarrollado en publicaciones revisadas [5,6,40,41].
- **Definición angiográfica/operativa** (DOMI‑ARIGATO [5]): lesión culpable con **TIMI 0–2**, **o TIMI 3 con troponina muy elevada** (troponina I contemporánea ≥ 10 ng/mL; en hs‑TnI se han usado ≥ 5 000 ng/L o ≥ 1 000 ng/L según ensayo) que indica oclusión que se reperfundió espontáneamente. Herman 2024 [13] usó "arteria culpable ocluida o con flujo limitado que requirió revascularización emergente"; Meyers 2025 HATW [23] usó TIMI 0–1.
- **Autores clave**: H. Pendell Meyers, Stephen W. Smith (Hennepin/Minnesota), Jesse McLaren (Toronto), Emre Aslanger (Estambul; ACOMI/non‑ACOMI), Alexander Bracey, Robert Herman (Powerful Medical), Ken Grauer, Willy Frick.

### 3.2 Evidencia de validación

| Estudio | Diseño | Hallazgo clave |
|---|---|---|
| **DIFOCCULT** (Aslanger 2020) [9] | Retrospectivo, 3 000 pac. (1 000 STEMI, 1 000 NSTEMI, 1 000 controles), dos cardiólogos ciegos | 28,2 % de NSTEMI reclasificados como ACOMI por ECG; este subgrupo tuvo más oclusión, más daño miocárdico, más mortalidad hospitalaria y a largo plazo; enfoque ACOMI/non‑ACOMI superior a STEMI/NSTEMI para predecir oclusión y mortalidad; la intervención precoz en pacientes con ECG "no‑ACO" se asoció con mayor mortalidad (⚠ señal de que la angiografía precoz indiscriminada no es la respuesta) |
| **DOMI‑ARIGATO** (Meyers 2021) [5] | Caso‑control retrospectivo 2 centros, 808 pac. | Lectura OMI: S 86 %/E 91 % vs STEMI 41 %/94 %; STEMI(−)OMI con igual tamaño de infarto y mortalidad que STEMI(+)OMI pero con retraso al cateterismo |
| Meyers 2021, J Emerg Med [6] | Misma cohorte; comparación de paradigmas | Los OMI STEMI(−) representan ~1/4 de los OMI; la reclasificación por ECG identifica pacientes con pronóstico de STEMI |
| Sub‑estudio DA TIMI 0 (2025) [7] | 53 oclusiones totales de DA | 38 % nunca cumplieron STEMI; experto e IA 100 % S en 1.er ECG |
| **Herman 2024, EHJ‑Digital Health** [13] | Desarrollo IA con 18 616 ECG / 10 543 pac.; test internacional 3 254 ECG | AUC 0,938; S 80,6 %, E 93,7 % vs STEMI 32,5 %/97,7 % |
| Validaciones externas de QoH 2024–2025 (Alemania CPU, Saint Louis, otros) [42,43] | Retrospectivas, todo‑comer | S 70–80 %, E ≈ 95–99 %; reducción teórica de retraso a dispositivo |
| Metaanálisis NSTEMI‑oclusión (Khan 2017) [11] | 7 estudios, 40 777 pac. | 25,5 % oclusión; mortalidad ↑ |
| McLaren 2023, Am J Emerg Med [44] | Serie de calidad en urgencias | Las brechas de calidad se concentran en OMI sin STE: falta de ECG seriados, mala interpretación de patrones sutiles, retraso en angiografía |

**⚠ Controversias sobre el paradigma OMI**
1. Evidencia predominantemente **retrospectiva, de centros expertos**, con potencial sesgo de espectro e incorporación (los lectores OMI son los propios autores del paradigma). Falta ensayo prospectivo de estrategia (activación de hemodinamia guiada por OMI vs STEMI) con resultados clínicos.
2. Preocupación de **sobre‑activación** de hemodinamia y de falsos positivos si lectores no expertos aplican patrones sutiles; la IA se propone como mitigador, pero su desempeño "en manos de todos" y en poblaciones de baja prevalencia aún se está evaluando.
3. Terminología: la ESC 2023 y la ACC/AHA 2025 prefieren "equivalentes de STEMI" y "SCA de muy alto riesgo" a "OMI".
4. Definición de referencia heterogénea (TIMI 0–1 vs 0–2 vs "requiere revascularización emergente"), lo que dificulta comparar sensibilidades entre estudios.

### 3.3 Algoritmos de decisión OMI

Los algoritmos publicados (Meyers/Smith [5,8]; McLaren [40]; Aslanger [9]) comparten la estructura:

1. **Criterios STEMI clásicos** → activar.
2. **Equivalentes de oclusión** (cualquiera): T hiperagudas; STE sutil con STD recíproca; De Winter; STD máxima en V1–V4 (posterior); Sgarbossa modificado/Barcelona en BRI o marcapasos; Aslanger; South African flag; distorsión terminal del QRS; STE aVR + STD difusa **con inestabilidad**; Wellens (→ angiografía urgente, no necesariamente emergente); → activar o consulta emergente con hemodinamia.
3. **Dolor persistente/refractario con ECG no diagnóstico** → ECG seriados cada 10–20 min (S de los cambios dinámicos ~ 15–20 % adicional [45]), derivaciones posteriores/derechas, **ecocardiografía a la cabecera** (alteración regional de la contractilidad nueva → S ~ 90 % para oclusión en manos expertas), troponina hs (0/1 h; una troponina inicial normal **no excluye OMI**: hasta 25 % de OMI tienen hs‑Tn inicial < percentil 99 en la primera hora) → angiografía urgente (< 2 h) si persiste la sospecha (recomendación clase I ESC 2023 para dolor refractario) [2].
4. **ECG "normal" de computador**: 1–2 % de los pacientes con dolor torácico y ECG informado como normal por el algoritmo tienen OMI; la lectura humana/IA debe hacerse siempre [46].

Rendimiento de la estrategia combinada: en DOMI‑ARIGATO la lectura OMI experta alcanzó exactitud 89 % vs 77 % de STEMI [5]. La IA QoH replica la exactitud experta (~ 91 %) [13].

---

## 4. Patrones de ECG de alto riesgo / equivalentes de oclusión

Para cada patrón: definición cuantitativa, arteria culpable, fisiopatología, diferenciales y rendimiento. La tabla consolidada está en §8.

### 4.1 Ondas T hiperagudas y STE sutil que no cumple criterios

- **Definición**: §1.4 (puntuación HATW ≥ 0,7 en ≥ 2 derivaciones contiguas; T/QRS elevado; base ancha). STE sutil = 0,05–0,2 mV que no alcanza los umbrales UDMI por sexo/edad, con morfología **recta o convexa**, con **STD recíproca** y/o **distorsión terminal del QRS** y/o pérdida de la onda S precordial.
- **Arteria**: cualquiera; más frecuente en DA (T hiperagudas V2–V4) e inferior (T hiperagudas II/III/aVF con T invertida/aplanada en aVL).
- **Fisiopatología**: gradiente de repolarización precoz por acortamiento del APD y despolarización parcial; corriente de lesión aún de baja magnitud.
- **Diferenciales**: hiperkalemia (T picuda, estrecha, simétrica, "en tienda", QRS ancho, P plana), repolarización precoz (T alta con QRS alto, J notch, ST cóncavo, sin STD recíproca), HVI, BRI, pericarditis, variantes normales (V2–V3 en jóvenes).
- **Rendimiento**: HATW score S 20,7 %/E 98,4 % en no‑STEMI [23]; visualmente, S baja (5–15 %) y E > 95 % [31].

### 4.2 Patrón de De Winter

- **Definición** (de Winter, Verouden, Wellens, Wilde; NEJM 2008 [47]): **depresión del ST ascendente ("upsloping") de 1–3 mm en el punto J en V1–V6** que continúa en **ondas T altas, positivas, simétricas** ("prominent"); **STE de 0,5–1 mm en aVR** en la mayoría; QRS habitualmente no ancho; puede haber pérdida de R precordial. Se describe en ≈ **2 % de las oclusiones de DA proximal**. Hallazgos posteriores: puede ser **estático** (persistente hasta la reperfusión) o **transitorio/evolutivo** hacia STE clásica; también se ha descrito en CD/CX (menos frecuente).
- **Arteria**: **DA proximal** (oclusión aguda, TIMI 0–1) en la mayoría.
- **Fisiopatología**: **⚠ Controversia**: se ha propuesto ausencia de canales K‑ATP/variación anatómica de las fibras de Purkinje que retrasa la propagación de la corriente de lesión al epicardio, o isquemia subendocárdica intensa con T hiperaguda; ninguna hipótesis está probada.
- **Diferenciales**: hiperkalemia, STD por demanda (que no tiene T alta simétrica ni concentra en V2–V5 con ascenso), repolarización precoz con STD de "J‑point" (rara).
- **Rendimiento**: series de casos; especificidad muy alta para OMI de DA (~ 95–100 % en cohortes retrospectivas pequeñas) (*).

### 4.3 Síndrome de Wellens (tipos A y B) y fase reperfundida

- **Descripción** (de Zwaan, Bär, Wellens 1982 [48]; 1989 [49]; Rhinehardt 2002 [50]): en pacientes con angina **reciente pero ahora sin dolor**, **ondas T bifásicas (tipo A, ≈ 25 %)** —positivas iniciales con inversión terminal— o **profundamente invertidas, simétricas (tipo B, ≈ 75 %)** en **V2–V3** (frecuente extensión a V1–V4 o V1–V6); **STE ausente o mínima (< 1 mm)**; **onda R precordial preservada**; **sin Q patológicas**; troponina normal o mínimamente elevada. En la serie original 75 % de los no revascularizados desarrollaron IAM anterior extenso en semanas.
- **Interpretación fisiopatológica contemporánea**: **patrón de reperfusión** de una oclusión de DA (espontánea o farmacológica). La T bifásica (tipo A) es la fase precoz; la T profunda simétrica (tipo B) la fase tardía. Si la arteria se reocluye, la T se **pseudonormaliza** (se vuelve positiva/hiperaguda) y luego aparece STE [19,30,32]. Por eso el Wellens es un "OMI reperfundido": requiere angiografía **urgente** (horas) y evitar pruebas de esfuerzo.
- **Arteria**: DA proximal/media (estenosis severa residual > 50 % en la mayoría).
- **Diferenciales**: inversión de T por embolia pulmonar (V1–V3 + III), HVI/strain, memoria cardíaca tras marcapasos/TV/WPW intermitente, miocardiopatía hipertrófica apical, SNC (hemorragia), T invertidas juveniles/persistentes, Takotsubo (fase subaguda, QT largo).
- **Rendimiento**: Serie original: 18 % de pacientes con angina inestable ingresados; VPP para estenosis significativa de DA ≈ 86–100 % en series pequeñas (*).

### 4.4 Signo de Aslanger

- **Definición** (Aslanger et al. 2020, J Electrocardiol [51]): (1) **STE aislada en III** (no en II ni aVF); (2) **STD en cualquiera de V4–V6** (pero no en V2) con **T positiva o terminalmente positiva**; (3) **ST en V1 > ST en V2**. Representa IAM inferior agudo + isquemia subendocárdica difusa concomitante (enfermedad multivaso o estenosis crítica adicional), de modo que el vector inferior se desplaza a la derecha (III) y el vector subendocárdico difuso (hacia aVR/V1) cancela la STE en II/aVF y produce STD lateral.
- **Prevalencia/rendimiento**: en la cohorte de derivación 6,3 % de los IAM inferiores; los pacientes con el signo tuvieron con mayor frecuencia oclusión de CD/CX + enfermedad multivaso, mayor mortalidad hospitalaria y a un año que NSTEMI y similar a STEMI. Especificidad alta (> 95 %) frente a NSTEMI sin oclusión en la cohorte original; sensibilidad baja para OMI global (*).
- **Diferenciales**: STD difusa por demanda con STE en aVR (en la que III no suele elevarse aisladamente); embolia pulmonar (STE III + T invertida V1–V3).

### 4.5 Oclusión de circunfleja / infarto posterior (inferobasal / lateral)

- **Hallazgos**: **STD máxima en V1–V4** (frecuentemente V2–V3) con **T positiva terminal**, **R alta/ensanchada en V1–V2** (R/S > 1, R ≥ 40 ms, "Q equivalente"), **STE en V7–V9 ≥ 0,5 mm** (≥ 1 mm en hombres < 40 años) [1,52]; frecuente STE lateral sutil (I, aVL, V5–V6) o inferior.
- **Cuantificación clave**: Meyers, Bracey et al. 2021 (JAHA) [53]: **STD isquémica máxima en V1–V4 (frente a V5–V6) de cualquier amplitud** tuvo **especificidad 97 %** y VPP 90 % para OMI (S ≈ 14 % de todos los OMI), sin requerir umbral de 1 mm ni confirmación con V7–V9. Matetzky 1999 [52]: STE en V7–V9 ≥ 0,5 mm identificó IAM posterior en pacientes con STD anterior y mejoró la detección de oclusión de CX; Pride 2010 (TRITON‑TIMI 38) [37]: STD anterior aislada → 26 % tenían oclusión total, la mayoría de CX; Schmitt 2001 [38]: casi la mitad de las oclusiones de CX no cumplían STE.
- **Arteria**: CX/obtusa marginal (más frecuente), descendente posterior de CD dominante, ramo posterolateral.
- **Diferenciales**: STD subendocárdica difusa (máxima en V5–V6/II con STE aVR), HVD/BRD (R alta V1 con T negativa), WPW tipo A, distrofia muscular, dextrocardia, posición electrodos altos.

### 4.6 Infarto de ventrículo derecho

- **Hallazgos**: en IAM inferior, **STE en V4R ≥ 1 mm (0,1 mV)**: S 88 %, E 78 %, exactitud 83 % para IAM de VD; predictor independiente de mortalidad hospitalaria (Zehender 1993 [54]). STE en **V1** (≥ 0,5–1 mm) en IAM inferior con STE III > II; ocasionalmente STE V1–V3 que decrece hacia V3 (patrón "anterior" del VD que puede confundir con DA). **STE III > II**, STD en aVL. Aproximadamente 30–50 % de los IAM inferiores tienen afectación de VD; ocurre con CD proximal (antes de la rama marginal aguda). V4R también localiza: STE en V4R → CD proximal; V4R isoeléctrica con T positiva → CD distal; V4R con STD/T negativa → CX (Wellens 1999 [55]).
- **Cinética**: la STE en V4R es **transitoria** (desaparece en < 10–12 h en la mitad de los casos) → registrar precozmente.
- **Diferenciales**: embolia pulmonar (T negativas V1–V3, S1Q3T3), pericarditis, STE V1 por BRD/Brugada.

### 4.7 Elevación de ST en aVR y aVL

**aVR** (y a menudo V1) con **STD difusa ≥ 0,1 mV en ≥ 6–8 derivaciones** (máxima en II, V4–V6):
- **Significado**: isquemia **subendocárdica difusa** cuyo vector apunta hacia la base/aVR. Causas: **enfermedad de tronco común (no oclusión total), enfermedad de 3 vasos, estenosis proximal severa de DA**, y —muy frecuentemente— **isquemia por demanda** (taquiarritmias, anemia, sepsis, hipotensión, hemorragia, estenosis aórtica). La oclusión **completa** del tronco suele presentarse con STE anterolateral masiva y shock/muerte, no con este patrón [56,57].
- **Rendimiento**: STE aVR ≥ 1 mm en SCA: predictor de enfermedad de tronco/3 vasos y mortalidad (OR 3–6 en series de STEMI y NSTEMI); pero en poblaciones de urgencias no seleccionadas el **VPP para lesión de tronco es bajo (≈ 10–15 %)** y solo ~ 10 % requieren cateterismo emergente (Harhash 2019 [57]; Knotts 2013 [56]). **⚠ Controversia**: la AHA 2013 la incluía como indicación de activación; el ACC 2022 y la ESC 2023 la reservan para pacientes con **inestabilidad hemodinámica/dolor refractario**; el grupo OMI la considera un patrón de "isquemia subendocárdica", **no** de oclusión, salvo excepciones.

**aVL**: la STE en aVL (con STD recíproca en III) indica **oclusión de DA proximal a la primera diagonal (D1)** o de **D1/rama intermedia/OM alta** ("infarto lateral alto"). La STD en aVL sin STE es el **espejo** del IAM inferior (§4.13).

### 4.8 Oclusión de la primera diagonal / "South African flag sign"; DA envolvente

- **South African flag** (Littmann 2016 [58]): STE en **I, aVL y V2** (y a veces V1/V3 mínima) con **STD en III (y aVF)**; disposición en el formato estándar 3×4 recuerda la bandera sudafricana. Arteria: **D1**, rama intermedia u OM alta (lateral alto). Frecuentemente STE < 1 mm en aVL y V2 (no cumple STEMI). Diferencial: pericarditis, variante normal.
- **DA envolvente (wraparound)**: DA larga que irriga el ápex inferior. La oclusión distal a D1 produce **STE anterior + STE inferior simultáneas** (II, III, aVF) —o, si la oclusión es proximal, la STE inferior se cancela con la STD recíproca por afectación lateral alta, dando un ECG "atenuado". Sasaki 2001 [59]: STE inferior en IAM anterior se asocia a DA envolvente con oclusión distal a D1; STD inferior se asocia a oclusión proximal a D1. Diferencial: pericarditis (STE difusa cóncava, PR deprimido, sin reciprocidad), DA + CD (multivaso).

### 4.9 Bloqueo de rama izquierda, ritmo de marcapasos y BRD

**BRI** (el "nuevo BRI" no es equivalente de STEMI por sí solo: solo ~ 30 % de BRI con dolor torácico tienen IAM y una minoría oclusión [60]):

| Regla | Criterios | S | E | Fuente |
|---|---|---|---|---|
| **Sgarbossa (1996)** | STE concordante ≥ 1 mm (5 pts); STD concordante ≥ 1 mm en V1–V3 (3 pts); STE discordante ≥ 5 mm (2 pts). Positivo ≥ 3 pts | 20–36 % | 90–98 % | [61] |
| **Sgarbossa modificado (Smith 2012)** | Sustituye el 3.er criterio por **STE discordante ≥ 25 % de la profundidad de la S precedente** (ST/S ≤ −0,25) en ≥ 1 derivación; los dos primeros se mantienen | 80–91 % | 90–99 % | Derivación [62]; validación Meyers 2015 [63] |
| **Algoritmo BARCELONA (Di Marco 2020)** | **Desviación ST ≥ 1 mm concordante con el QRS en cualquier derivación**, **o** desviación ST ≥ 1 mm **discordante** en derivaciones con **máx (R|S) ≤ 6 mm** | 93–95 % | 89–94 % | [64] |

**Ritmo de marcapasos VD**: Dodd et al. 2021 (Ann Emerg Med) [65] validaron los criterios de Sgarbossa modificados en ritmo estimulado: STE concordante ≥ 1 mm, STD concordante ≥ 1 mm en V1–V3 (⚠ menos fiable en marcapasos), STE discordante ≥ 25 % de S: S 81 %, E 84–96 % para OMI (con ST/S ≤ −0,20 S 86 %). **⚠ Controversia**: el BARCELONA aún no está validado en ritmo estimulado.

**BRD**: no oculta el ST‑T salvo en V1–V3 (STD/T negativa secundaria esperada). En BRD, **STE en V1–V4 (cualquiera ≥ 1 mm, o T positiva concordante donde debería ser negativa)** indica oclusión proximal de DA con mal pronóstico (mortalidad 15–20 %; Widimsky 2012 [39]). Nuevo BRD + bloqueo fascicular anterior en dolor torácico = oclusión proximal de DA hasta que se demuestre lo contrario. La ESC 2017/2023 recomienda estrategia de ICP primaria en dolor persistente con BRD.

**Concordancia/discordancia** (regla general para QRS ancho): el ST‑T normal es **discordante** (opuesto) a la deflexión mayor del QRS; cualquier desviación **concordante** ≥ 1 mm es anormal; la discordancia **excesiva** (proporcional) es anormal.

### 4.10 Criterios de Smith: STE de DA proximal vs repolarización precoz (RP)

Población objetivo: STE en V2–V4 sin criterios evidentes (sin STD recíproca inferior, sin distorsión terminal del QRS, sin Q anterior, sin T invertida, sin STE > 5 mm, con ST cóncavo).

- **Fórmula de 3 variables (Smith 2012, Ann Emerg Med [66])**:
  \[ 1{,}196 \times STE60_{V3}(mm) + 0{,}059 \times QTc_B(ms) - 0{,}326 \times R_{V4}(mm) \]
  ≥ 23,4 → IAM anterior de DA. S 86 %, E 91 % (derivación); STE60 = elevación del ST a 60 ms del punto J.
- **Fórmula de 4 variables (Driver 2017, J Electrocardiol [67])**:
  \[ 1{,}062 \times STE60_{V3} + 0{,}052 \times QTc_B - 0{,}151 \times QRS_{V2}(mm) - 0{,}268 \times R_{V4} \]
  > 18,2 → IAM de DA. S 83–89 %, E 87,7 % (mejor exactitud que la de 3 variables); QRS_V2 = amplitud total (R + S) en V2.
- Reglas adicionales de exclusión de RP (**cualquiera → IAM**): STE ≥ 5 mm en alguna derivación; pérdida de S en V2–V3 sin onda J (distorsión terminal, §4.11); STD recíproca inferior; T invertida en V2–V6; Q en V2–V4; STE convexa/recta; **ausencia de R ≥ 5 mm en V4 y de QRS altos** (RP típicamente con R alta y QRS de voltaje alto).
- **⚠ Limitaciones**: derivadas en cohortes seleccionadas; validaciones externas muestran S/E ~ 80 %; no aplicables con HVI, BRI, aneurisma o T hiperagudas obvias.

### 4.11 Distorsión terminal del QRS, pérdida de S, "tombstoning", Q precoces, T inversa terminal, "shark fin"

- **Grado 3 de Sclarovsky‑Birnbaum (distorsión terminal del QRS)** [24,25]: en derivaciones con configuración qR, el ST **emerge ≥ 50 % de la altura de la R** (relación J/R ≥ 0,5); en derivaciones con RS, **desaparece la onda S** (el ST emerge por encima del nadir de S). Indica isquemia severa con afectación de fibras de Purkinje/subendocardio profundo, mayor tamaño de infarto, menor rescate miocárdico y mayor mortalidad. Lee/Smith 2016 [25]: la **ausencia simultánea de S y de onda J en V2 o V3** se observó en 30 % de los IAM anteriores y en **0 %** de repolarización precoz (E 100 % en esa serie).
- **Tombstoning** (Guo 2000 [26]): R de amplitud baja y **duración < 40 ms**, ST convexo que **se fusiona con la R y con la T formando una onda monofásica cuyo pico supera al de la R**; se asocia a oclusión proximal de DA, mayor extensión, más shock y mortalidad.
- **Ondas Q precoces**: pueden aparecer en la **primera hora** (Q "de aturdimiento", por pérdida transitoria de excitabilidad) y no contraindican la reperfusión; Q en V2–V4 con STE aguda favorecen IAM sobre RP.
- **Inversión terminal de la T** con STE persistente: signo de reperfusión incipiente o de evolución subaguda; junto con Q y STE persistente, sugiere tiempo de oclusión > 6 h (o aneurisma si es crónico).
- **"Shark fin" (aleta de tiburón) / STE gigante "lambda"**: fusión de QRS‑ST‑T en una onda triangular de gran amplitud (≥ 1 mV) que enmascara el QRS; asociada a oclusión proximal de DA o tronco, shock y FV inminente. Diferencial: artefacto, hiperkalemia severa, TV lenta. Evidencia: series de casos/blogs (*) [68].

### 4.12 Reciprocidad (depresión ST recíproca)

- **aVL en IAM inferior**: Bischof, Smith et al. 2016 [69]: **100 %** de 154 IAM inferiores tenían **STD en aVL** (≥ 0,25–0,5 mm) o T invertida en aVL; **0 %** de 49 pericarditis; en STE inferior sutil (< 1 mm) la STD en aVL también estaba presente en la mayoría. Regla: STE inferior sin STD recíproca en aVL → dudar de OMI (pericarditis, RP, DA envolvente con vector neutro).
- **III en IAM lateral alto**: STE en aVL/I con STD en III (espejo). La STD en III sin STE inferior debe hacer buscar STE sutil en aVL/I/V2 (South African flag).
- **Inferior en IAM anterior**: STD II/III/aVF con STE anterior → oclusión de DA proximal a D1 (Engelen 1999 [70]); STE inferior → DA envolvente distal.
- **V1–V3 en IAM posterior**: espejo de STE posterior.
- Valor: la STD recíproca **aumenta la especificidad** de STE sutil para OMI y **es prácticamente ausente en pericarditis/RP** (excepto aVR/V1).

### 4.13 Cambios dinámicos, ECG seriado, reperfusión/reoclusión y pseudonormalización

- **Cambios dinámicos** (cualquier variación ≥ 1 mm del ST o inversión/positivización de T entre ECG con minutos de diferencia) son criterio de **muy alto riesgo** (ESC 2023: angiografía inmediata) [2]. Fesmire 1998 [45]: la monitorización seriada del ST identificó 16 % adicional de IAM respecto al ECG inicial.
- Patrón de **reperfusión**: resolución STE ≥ 50–70 % [28], inversión terminal de T, RIVA [29], **T de Wellens** en la zona reperfundida, a veces bradicardia/hipotensión transitoria (Bezold‑Jarisch, sobre todo CD).
- **Reoclusión**: pseudonormalización de la T (de invertida a positiva "hiperaguda") → nueva STE → recurrencia de síntomas.
- Los patrones de "**T invertidas con Q y STE persistente**" sin dolor pueden ser un IAM subagudo (> 12–24 h) con arteria abierta o cerrada; la decisión de reperfusión depende de síntomas/viabilidad.

### 4.14 Isquemia por demanda vs oclusión

| Rasgo | Oclusión (OMI) | Demanda/subendocárdica difusa |
|---|---|---|
| ST | STE regional + STD recíproca (o STD máx V1–V4) | STD **difusa** máxima en II, V4–V6, ≥ 6–8 derivaciones; STE **solo** en aVR ± V1 |
| Onda T | hiperaguda/positiva terminal en zona, o inversión de reperfusión | T aplanadas/negativas asimétricas, sin hiperagudas |
| Distribución | sigue un territorio arterial | no sigue territorio |
| Contexto | dolor típico, sin desencadenante hemodinámico | taquicardia (FA rápida, TSV), anemia, hipotensión, hipoxemia, sepsis, HVI/estenosis aórtica |
| Evolución | evoluciona a Q/T invertida en horas | se resuelve al corregir el desencadenante (minutos) |
| Manejo | reperfusión emergente | tratar la causa; angiografía urgente si persiste/inestable |

**⚠** La STD por demanda y la de "enfermedad de tronco no oclusiva" son indistinguibles por ECG; solo la clínica y la respuesta al tratamiento las separan.

### 4.15 Arritmias asociadas a isquemia aguda

- **IAM inferior**: bradicardia sinusal, **BAV de 2.º/3.er grado suprahisiano** (QRS estrecho, escape nodal 40–60 lpm) en ~ 10–20 %, generalmente transitorio (isquemia del nodo AV por CD, reflejo vagal) [71]; ritmo de escape. Con **VD**: hipotensión, FA.
- **IAM anterior**: BAV **infrahisiano** (QRS ancho, Mobitz II → completo, escape < 40 lpm) con BRD + HBA nuevo; mal pronóstico.
- **TV/FV primaria**: incidencia 4–6 % en las primeras horas (mayor en las primeras 4 h); reentrada por dispersión de repolarización en la zona borde [14].
- **RIVA (60–120 lpm)**: marcador de **reperfusión** (S ~ 45–70 %, E ~ 60–80 % según series; Gressin 1992 [29]) — benigno, no tratar.
- **Extrasistolia ventricular con morfología de la zona isquémica**, "R sobre T".
- **FA nueva**: 5–10 %; predictor pronóstico.

### 4.16 Casos especiales, imitadores (mimics) y enmascaradores

| Entidad | Cómo imita/enmascara la oclusión | Rasgos que la distinguen | Ref. |
|---|---|---|---|
| **MINOCA** (IAM sin obstrucción ≥ 50 %) | Cualquier patrón (STE en 1/3); 5–6 % de los IAM; mayoría mujeres jóvenes | Diagnóstico por angiografía + RM; ECG no lo distingue | [72] |
| **Disección coronaria espontánea (SCAD)** | Presentación STEMI en 25–50 %; predominio DA media/distal; mujeres jóvenes, periparto | Patrones típicos de OMI; sospecha por perfil clínico | [73] |
| **Vasoespasmo (Prinzmetal)** | STE transitoria (minutos), frecuentemente con arritmias; **resuelve con nitratos**; puede ser "shark fin" transitoria | Reversibilidad completa en minutos; Q ausentes; contexto (cocaína, tabaco, matutino) | [19] |
| **Takotsubo** | STE anterior (V2–V6), T invertidas difusas, **QT largo** (> 500 ms) en fase subaguda | STE **sin STD recíproca**, ausencia de STE en V1 y presencia en −aVR (Kosuge: STE en −aVR y no en V1 favorece Takotsubo, S 91 %/E 96 % en su serie) ; mujer posmenopáusica, estrés; distribución no coronaria | [74,75] |
| **Miocarditis** | STE focal o difusa, Q, TV | STE cóncava difusa, PR deprimido, sin reciprocidad regional; joven, viral, troponina persistente; "focal" puede ser indistinguible → angiografía | [1] |
| **Pericarditis** | STE difusa | Cóncava, **I, II, aVF, V2–V6 sin STD recíproca** (salvo aVR/V1); **PR deprimido** (STE en aVR con PR elevado); relación STE/T en V6 > 0,25 (Spodick); sin STD en aVL en la afectación inferior [69]; sin evolución a Q | [69] |
| **Embolia pulmonar** | STE V1–V3 o inferior (rara), STD difusa, T invertidas V1–V4 + III, S1Q3T3, BRD, taquicardia | **T negativas simultáneas en III y V1** (Kosuge 2007: E 88 % vs SCA); taquicardia sinusal; P pulmonale | [76] |
| **Hiperkalemia** | T picudas ("pseudo‑hiperagudas"), STE en V1–V2 tipo Brugada ("pseudo‑STEMI"), QRS ancho, bradicardia | T **estrecha, simétrica, picuda**, base estrecha; P aplanada/ausente; QRS ancho difuso; PR largo; K⁺ | [77] |
| **HVI con strain** | STE V1–V3 (recíproca del strain lateral), STD/T invertida asimétrica en V5–V6, I, aVL | Voltajes altos (S V1–V2 > 25–30 mm); STE proporcional al S (relación ST/S < 25 % en V1–V3); T invertida asimétrica; Armstrong 2012: STE ≥ 25 % del QRS en V1–V3 → IAM | [78] |
| **Brugada** | STE V1–V2 "coved" ≥ 2 mm con T negativa (tipo 1) | Sin reciprocidad, sin evolución, localizada V1–V2 (a veces solo en posición alta); intervalos "beta angle"; fiebre/ fármacos | [79] |
| **Repolarización precoz** | STE cóncava V2–V5, II, III, aVF, con J‑notch/slur | Cóncava, J‑wave, T altas **con QRS alto**, sin STD recíproca (salvo aVR), estable en el tiempo; fórmula de Smith (§4.10) | [66,67,80] |
| **Atletas** | STE V1–V4 (con T invertida en V1–V4 en afro‑caribeños), voltaje alto | Patrón de convexidad "en domo" con T invertida asimétrica en V1–V4 aceptable en atletas negros; criterios internacionales 2017 | [81] |
| **WPW** | Pseudo‑Q (inferior/lateral), pseudo‑infarto posterior (R alta V1), ST‑T secundarios | PR corto, onda delta, QRS ancho | [19] |
| **Aneurisma ventricular antiguo** | STE persistente V1–V4 (o inferior) con Q/QS | T pequeña o invertida; **relación T/QRS máxima en V1–V4 < 0,36** (Klein 2015: S 91 %/E 81 % para IAM agudo si > 0,36); STE estática en ECG previos | [27] |
| **Hipotermia** | Ondas J de Osborn grandes (pseudo‑STE), bradicardia, QT largo | Temperatura; J positiva en todas las derivaciones con T normal; temblor | [19] |
| **Marcapasos/BRI/BRD** | Enmascaran o imitan (§4.9) | Sgarbossa modificado, Barcelona | [61–65] |
| **Post‑paro cardíaco/desfibrilación** | STE transitoria, STD difusa | Repetir ECG a los 8–10 min; ECG inmediato post‑ROSC tiene mayor tasa de falsos positivos (Baldi 2021) | [82] |
| **Hemorragia subaracnoidea / SNC** | T invertidas gigantes, QT largo, STE | Contexto neurológico | [19] |
| **Colecistitis/pancreatitis, neumotórax, hernia hiatal** | STE inferior/T invertidas | Contexto; ausencia de reciprocidad | [19] |
| **Pre‑excitación, memoria cardíaca** | T invertidas anterior/inferior que imitan Wellens | Historia de marcapasos/TV/WPW intermitente; T invertidas con aVL positiva | [19] |

---

## 5. Correlación anatómica–electrocardiográfica

### 5.1 Mapa derivación ↔ territorio ↔ arteria

Nomenclatura recomendada por el consenso ISHNE/Bayés de Luna 2006 (basada en RM cardíaca): sustituir "posterior" por **inferobasal/lateral** y reconocer que la R alta en V1 corresponde principalmente a **infarto lateral**, no "posterior" estricto [83].

| Territorio (segmentos AHA) | Derivaciones con STE | Depresión recíproca | Arteria culpable habitual | Notas |
|---|---|---|---|---|
| **Anteroseptal** (septo anterior, apical anterior) | V1–V4 | II, III, aVF (si proximal a D1) | **DA proximal/media**, septales | STE V1 > 2,5 mm + BRD nuevo → proximal a S1 [70] |
| **Anterior extenso / anterolateral** | V1–V6, I, aVL | II, III, aVF | **DA proximal** (proximal a D1 y S1) | STE aVL ± aVR; peor pronóstico |
| **Anteroapical** | V3–V6 (± II, III, aVF si envolvente) | ninguna o aVL mínima | **DA media/distal** | Q en V4–V6 |
| **Lateral alto** | I, aVL (± V2) | III, aVF | **D1**, ramo intermedio, **OM1** | South African flag |
| **Lateral bajo** | V5–V6 (± I, aVL) | — | **CX/OM**, DA distal | STE sutil frecuente |
| **Inferior** | II, III, aVF | aVL (siempre), I | **CD (80–85 %)**, CX (15–20 %) | III > II → CD; II ≥ III + STE I/aVL/V5–V6 → CX |
| **Inferobasal ("posterior")** | V7–V9; R alta V1–V2 | **V1–V4** (STD máx V1–V4) | **CX/OM** o **CD‑DP** en dominancia derecha | 3–7 % aislado; ~ 20 % acompaña a inferior/lateral |
| **Ventrículo derecho** | V4R (V3R–V6R), V1 (± V2–V3) | — | **CD proximal** (antes de marginal aguda) | 30–50 % de los IAM inferiores |
| **Tronco común (oclusión total)** | Anterolateral masiva + STE aVR; shock | inferior | **TCI** | Habitualmente muerte prehospitalaria |
| **Tronco/3 vasos (no oclusivo) o demanda** | **aVR** (± V1) | difusa (≥ 6–8 deriv.) | TCI subtotal, 3 vasos | Isquemia subendocárdica |
| **Circunfleja proximal dominante** | II, III, aVF + I, aVL, V5–V6 + V7–V9 | V1–V3 | **CX dominante** | Infarto inferolateral extenso |

**Dominancia**: derecha en ~ 70 % (DP y posterolateral desde CD), izquierda 10–15 % (CX da DP), codominante 15–20 %. Con dominancia izquierda, la oclusión de CX proximal produce IAM inferior + posterior + lateral extenso; con dominancia derecha, la CD proximal produce inferior + VD + posterior. Variantes: DA envolvente (~ 40 % de la población tiene DA que llega a la cara inferior del ápex), rama intermedia (ramus, 20–30 %), CD no dominante corta.

### 5.2 Localización en el IAM inferior (CD vs CX)

| Criterio | Favorece CD | Favorece CX | Rendimiento |
|---|---|---|---|
| STE III vs II | **STE III > II** | STE II ≥ III | S ~ 90 %, E ~ 70 % para CD (Zimetbaum 2003 [19]) |
| Derivación I | **STD ≥ 0,5–1 mm en I** | Isoeléctrica o STE en I | Fiol 2004: STD I → CD (VPP alto); STE I → CX [84] |
| aVL | STD aVL > STD I | STE o isoeléctrica aVL | Parte del algoritmo de Fiol |
| V1 / V4R | **STE V1 y V4R** (CD proximal + VD) | **STD V1–V3** (posterior con CX) | V4R STE ≥ 1 mm: S 88 %/E 78 % para VD [54]; V4R negativa → CX (Wellens 1999 [55]) |
| Relación STD V1–V3 / STE II+III+aVF | ≤ 1 | > 1 | Fiol: > 1 → CX |
| STE V5–V6 | menos frecuente | **STE lateral V5–V6 ≥ 1 mm** | S moderada |
| Algoritmo de Fiol (3 pasos: ST en I; STE III/II; STD V1–V3/STE inferior) | | | Exactitud global ~ 90–96 % en la serie original; validaciones externas 80–90 % [84] |

### 5.3 Localización en la oclusión de DA (Engelen 1999 [70]; Sasaki 2001 [59])

| Hallazgo | Nivel de oclusión | S / E |
|---|---|---|
| **STE aVR** | Proximal a S1 | S 43 %, E 95 % |
| **BRD completo nuevo** | Proximal a S1 | S 14 %, E 100 % |
| **STD V5** | Proximal a S1 | S 17 %, E 100 % |
| **STE V1 > 2,5 mm** | Proximal a S1 | S 12 %, E 100 % |
| **STD II, III, aVF ≥ 1 mm** (sobre todo STD aVF) | Proximal a D1 | S 34–66 %, E 73–88 % |
| **STE aVL ≥ 1 mm** | Proximal a D1 | S ~ 44 %, E ~ 87 % |
| **Q en aVL** | Proximal a D1 | S 44 %, E 85 % |
| **STD en aVL** | Distal a D1 | S 32 %, E 100 % |
| **Q en V4–V6 sin STD inferior** | Distal a S1 y D1 (DA media/distal) | S 24 %, E 93 % |
| **STE inferior + anterior** | DA envolvente, distal a D1 | Sasaki [59] |
| STE V2–V4 con T hiperagudas y STE aVL mínima | DA media | — |

---

## 6. Cuantificación y morfología de la señal (clave para el simulador)

### 6.1 Rangos numéricos normales de referencia (adulto, 25 mm/s, 10 mm/mV)

Fuentes: AHA/ACCF/HRS 2007–2009 [33,85], Macfarlane (Glasgow) [86], PTB‑XL [87].

| Parámetro | Rango normal | Comentario |
|---|---|---|
| P | 80–110 ms; ≤ 0,25 mV (II) | |
| PR | 120–200 ms | |
| QRS | 70–100 ms (< 120) | BRI/BRD ≥ 120 ms; QRS 110–119 "incompleto" |
| R en V4 | 0,8–2,5 mV (típ. 1,2–1,8) | RP: R V4 alta; Smith usa R V4 < 0,5 mV como criterio de IAM |
| S en V2 | 0,5–2,5 mV | Base para Sgarbossa modificado (ST/S) |
| QT / QTc (Bazett) | 350–440 ms (H), 350–460 ms (M) | QTc alarga con IAM (Smith usa QTc) y Takotsubo (> 500) |
| **ST (punto J) en V2–V3** | Hombres < 40: hasta 0,25 mV; ≥ 40: 0,2 mV; mujeres: 0,15 mV | Umbrales UDMI |
| **ST resto de derivaciones** | −0,05 a +0,1 mV | |
| **T amplitud** | ≤ 0,5 mV en miembros; ≤ 1,0 mV en precordiales (V2–V3 hasta 1,2–1,5 mV en jóvenes); T V1 habitualmente negativa o < 0,3 mV | T/QRS "normal" en V2–V4 típicamente 0,15–0,40 |
| Duración de la T | 150–250 ms | Base ancha en HATW: > 250–300 ms |
| Asimetría T (t_pico‑fin / t_inicio‑pico) | ≈ 0,6–0,8 (rama descendente más rápida) | HATW: tiende a **1,0 (simétrica)**; hiperkalemia: > 1 con base estrecha |
| Punto J | fin del QRS; ST medido en J y a 40/60/80 ms | Referencia: **segmento TP** (o PR/TQ si TP no disponible) [1,33] |

### 6.2 Rangos por patrón isquémico (parámetros objetivo del simulador)

Valores de referencia recopilados de las fuentes citadas en §4; donde no hay estudios cuantitativos se indican rangos de consenso **(*)**.

| Patrón | ST en J (mV) | Forma del ST | T (mV, T/QRS) | QRS | Otras derivaciones |
|---|---|---|---|---|---|
| **T hiperaguda (DA)** | 0 a +0,15 en V2–V4 | recta o levemente convexa; J borrado | 0,6–1,5 mV en V2–V4; T/QRS ≥ 0,5–0,75; duración > 250 ms; asimetría → 1; HATW ≥ 0,7 | normal o S disminuida | STD/T aplanada en III/aVF ≤ 0,05–0,1 mV |
| **STE sutil anterior** | +0,1 a +0,2 (bajo umbral UDMI) | recta/convexa | T alta o normal | pérdida de S en V2–V3 | STD II/III/aVF 0,05–0,1 |
| **STEMI anterior típico** | +0,2 a +0,8 en V2–V4; +0,1–0,3 en V1, V5, aVL | convexa/plateau; grado 3 (J/R ≥ 0,5) | T fusionada con ST | R ↓, Q incipientes tras 1–3 h | STD II/III/aVF −0,1 a −0,3 si proximal a D1 |
| **Tombstoning** | +0,4 a +1,0 | monofásica; ST pico > R | fusionada | R < 40 ms, amplitud baja | STD inferior |
| **Shark fin** | > 1,0 (hasta 2 mV) | triangular QRS‑ST‑T fusionados | — | QRS indistinguible | STD extrema espejo |
| **De Winter** | **−0,1 a −0,3 ascendente** en V2–V5 (J deprimido, ST ascendente a 80 ms hasta 0) | ascendente recto | T alta simétrica 0,5–1,5 mV | normal, R conservada o algo baja | **aVR +0,05 a +0,1** |
| **Wellens A** | 0 a +0,1 en V2–V3 | isoeléctrico o mínimo | bifásica: +0,1–0,3 inicial, −0,1–0,3 terminal | R conservada (≥ 0,3 mV V2–V3), sin Q | resto normal |
| **Wellens B** | 0 | isoeléctrico | invertida simétrica −0,2 a −0,8 en V2–V4 (± V1–V6) | R conservada | QTc puede alargarse |
| **Inferior STEMI** | +0,1 a +0,5 en II, III, aVF; III > II (CD) | convexa/recta | T positiva/hiperaguda | Q incipientes | **aVL −0,05 a −0,3 (obligatoria)**, I −0,05 a −0,1; V1 +0,05–0,15 si VD; V4R +0,1–0,3 |
| **Inferior por CX** | II ≥ III | | | | STE I/aVL 0–+0,1, V5–V6 +0,1; STD V1–V3 −0,1 a −0,3 |
| **Aslanger** | III +0,1–0,2; II y aVF ≈ 0 | | T positiva terminal en V4–V6 | | STD V4–V6 −0,1 a −0,2; V1 > V2 (V1 0 a +0,1; V2 ≈ 0 o −0,05) |
| **Posterior (CX)** | **V1–V4: −0,1 a −0,4, máx en V2–V3**, horizontal/descendente | horizontal | T positiva terminal V2–V3 | R V1–V2 alta (R/S > 1; R ≥ 40 ms) tras horas | V7–V9 +0,05 a +0,15; ± V5–V6/I/aVL +0,05–0,1 |
| **VD** | V4R +0,1 a +0,3; V1 +0,05 a +0,2 | | | | asociado a inferior STEMI con III > II |
| **Demanda / subendocárdica difusa** | STD −0,1 a −0,3 en ≥ 6–8 deriv. (máx II, V4–V6); **aVR +0,1 a +0,3**; V1 0 a +0,1 | horizontal/descendente | T aplanadas o negativas asimétricas | normal | taquicardia frecuente |
| **South African flag** | I +0,05–0,15, **aVL +0,1–0,2**, V2 +0,05–0,15 | recta | T positivas | | **III −0,1 a −0,2**, aVF −0,05 a −0,1 |
| **BRI + OMI (Sgarbossa mod.)** | concordante ≥ +0,1 (V5–V6, I, aVL con R dominante); o discordante V1–V4 con ST/S ≤ −0,25 (p. ej., S 2,0 mV → STE ≥ 0,5 mV) | | T concordante | QRS ≥ 120 ms | STD concordante ≥ 0,1 en V1–V3 |
| **BRD + OMI DA** | V1–V4 +0,1 a +0,3 (donde se esperaría ST 0 o STD) | | T positiva concordante V1–V3 | QRS ≥ 120, rSR' | HBA frecuente |
| **Wellens/reperfusión inferior** | II/III/aVF 0 a +0,05 | | T invertidas II/III/aVF; **T positiva alta en aVL** | | |
| **Pericarditis (control negativo)** | +0,05–0,2 difusa (I, II, aVF, V2–V6) | **cóncava** | T normales | | PR −0,05 a −0,1; aVR: STE PR, STD ST; STE/T V6 > 0,25; **sin STD aVL** |
| **RP (control negativo)** | +0,1–0,3 V2–V5, cóncava, J‑notch | cóncava | T altas 0,6–1,0 con **R alta (≥ 1,5 mV V4)** | QRS voltaje alto | sin STD recíproca; fórmula Smith < 18,2 |
| **HVI strain (control negativo)** | V1–V3 +0,1–0,3 (ST/S < 25 %); V5–V6 −0,1 a −0,2 | convexa en V1–V3 | T invertida asimétrica lateral | S V1–V2 ≥ 2,5–3,0 mV; R V5–V6 ≥ 2,5 mV | |
| **Aneurisma (control negativo)** | V1–V4 +0,1–0,3 estática | | T/QRS < 0,36; T pequeña/invertida | QS V1–V4 | sin cambios seriados |
| **Hiperkalemia (control negativo)** | V1–V2 +0,1–0,3 "Brugada‑like" | | T picudas estrechas simétricas 0,6–1,2 mV, base < 200 ms | QRS ancho difuso; P plana | PR largo, bradicardia |

### 6.3 Medición del ST: punto J y línea de base

- **Línea de base**: la UDMI y las recomendaciones AHA/ACCF/HRS [1,33] definen la referencia en el **inicio del QRS** (punto Q, fin del PR) o en el **segmento TP**; en taquicardia el TP desaparece y se usa el **PR (TQ)**. El simulador debe almacenar la línea de base isoeléctrica "verdadera" y calcular ambas medidas para enseñar la discrepancia (p. ej., PR deprimido en pericarditis desplaza la medición).
- **Punto J**: fin del QRS (transición de pendiente); en distorsión terminal y tombstoning el J es indefinible → medir STE60/STE80 (60/80 ms tras J) y documentar la morfología. Los algoritmos automáticos (Marquette 12SL, Glasgow, Philips DXL) miden el ST en J, J+40, J+60 y J+80 ms [86].
- **Forma**: cóncava (RP, pericarditis, ~ 40 % de STEMI precoces), recta/oblicua ("straight"), convexa ("coved", ~ 60 % de STEMI establecidos), "plateau", monofásica. **⚠** La concavidad **no excluye** IAM (Brady 2001: S de la morfología no cóncava para IAM 77 %, E 97 %) [88].

### 6.4 Modelos matemáticos de generación de ECG con isquemia

| Enfoque | Descripción | Fortalezas | Limitaciones | Ref. |
|---|---|---|---|---|
| **ECGSYN / McSharry (2003)** | Trayectoria en el plano (x,y) con oscilador límite + suma de **5 gaussianas (P, Q, R, S, T)** en el ángulo θ, con parámetros (a_i, b_i, θ_i); HRV realista (LF/HF, RSA) | Simple, control directo de amplitud/anchura/posición de cada onda; fácil añadir ST (gaussiana ancha entre S y T) y modificar T (amplitud, σ, asimetría con dos gaussianas); código abierto (PhysioNet) | Monocanal; para 12 derivaciones necesita extensión vectorial | [89,90] |
| **Extensión dipolar/multicanal (Sameni 2007; Clifford 2010)** | Generar el **vector cardíaco 3‑D** (VCG) con gaussianas por componente x,y,z y proyectar con la **matriz de Dower / inversa de Dower** a 12 derivaciones | 12 derivaciones coherentes; el "vector de lesión" se implementa como un dipolo ST adicional con dirección anatómica; rotación/posición del corazón y mala colocación de electrodos = cambios de matriz | Necesita calibración de las direcciones por territorio; no modela conducción | [91,92,93] |
| **Modelos de propagación (bidominio/monodominio, ECGSIM/EDL)** | Modelo de fuente de doble capa equivalente sobre la superficie ventricular; ECGSIM permite editar tiempos de activación/repolarización y amplitud transmembrana por región y ver el ECG resultante | Fisiológicamente fundado: isquemia = reducir amplitud del PA y acortar APD regionalmente → STE/STD y T emergen "solos"; ideal para **generar plantillas de referencia por territorio** | Costoso computacionalmente; no en tiempo real en navegador (aunque se pueden precomputar mapas) | [94,95] |
| **Modelos electrofisiológicos celulares + torso** (ten Tusscher, O'Hara‑Rudy con K‑ATP; openCARP, Chaste) | Simulan isquemia con hiperkalemia, acidosis, hipoxia (I_K‑ATP) | Investigación de mecanismos; validación de plantillas | No para simulador educativo en tiempo real | [16] |
| **Plantillas basadas en datos reales + morphing** | Latidos promediados de bases (PTB‑XL, STAFF III) deformados por parámetros | Máximo realismo | Menor control paramétrico; licencias | [87,96] |
| **Simuladores comerciales** (Laerdal SimMan/ LLEAP, CAE, Gaumard, ECG Simulator apps, Skillqube, iSimulate REALITi) | Bibliotecas de ritmos con "STEMI" genérico; algunos permiten ajustar STE por derivación | Integración con maniquí/monitor | Patrones isquémicos poco fieles (STE simétrica, sin reciprocidad, sin evolución temporal) — **oportunidad para el simulador propuesto** | — |

**Recomendación**: **modelo híbrido**: (1) generador vectorial de 3 componentes con gaussianas para P‑QRS‑T (McSharry extendido); (2) módulo "vector de lesión" con dipolos ST y T por región (dirección anatómica en coordenadas de Frank calibradas contra la tabla §5.1 y contra ECGSIM), amplitud A(t) que sigue las curvas temporales de §9; (3) proyección a 12 derivaciones con matriz de Dower modificable (posición de electrodos, rotación, hábito corporal); (4) capa de ruido/artefactos; (5) validador que calcula automáticamente todos los criterios de §8 sobre la señal generada.

### 6.5 Bases de datos reales anotadas para validación

| Base | Contenido | Utilidad | URL/DOI |
|---|---|---|---|
| **PTB‑XL** (PhysioNet) | 21 799 ECG de 12 derivaciones, 10 s, 500 Hz, 18 869 pacientes; etiquetas SCP (IMI, AMI, LMI, ISC_, STE, STD, etc.), anotaciones ST por derivación en PTB‑XL+ | Plantillas de IAM (anterior/inferior/lateral), controles (HVI, BRI, RP), estadísticas de amplitudes | [87] doi:10.1038/s41597-020-0495-6 |
| **PTB Diagnostic ECG Database** | 549 registros de 290 pacientes (148 IAM) con 15 derivaciones (12 + Frank XYZ) 1 kHz, con localización del infarto | **Derivaciones de Frank** para calibrar vectores de lesión | https://physionet.org/content/ptbdb/ |
| **STAFF III** | 104 pacientes con **oclusión controlada por balón durante angioplastia** (DA, CD, CX), ECG de 9 derivaciones a 1 kHz antes/durante/después de la oclusión (minutos) | **Cinética real de STE/T en los primeros 0–5 min de oclusión por arteria** — referencia única para la evolución temporal | https://physionet.org/content/staffiii/ [96] |
| **PhysioNet ECGSYN** | Código del generador McSharry | Base del modelo | https://physionet.org/content/ecgsyn/ [90] |
| **Glasgow (Macfarlane) normal limits** | Límites normales por edad/sexo/etnia | Rangos de referencia | [86] |
| **CODE‑15 % / CODE (Brasil)** | 345 779 ECG con etiquetas de BRI, BRD, FA, etc. | Controles con QRS ancho | [97] |
| **Chapman‑Shaoxing / Ningbo (PhysioNet)** | 45 152 ECG con etiquetas | Datos adicionales | https://physionet.org/content/ecg-arrhythmia/ |
| **ECGSIM** | Simulador interactivo (van Oosterom & Oostendorp) | Generar plantillas regionales de isquemia | https://www.ecgsim.org [94] |
| **Bases OMI con angiografía** | Ninguna pública; DOMI‑ARIGATO (NCT03863327), DIFOCCULT (NCT04022668) y cohorte PMcardio no están liberadas | **Brecha**: validar patrones sutiles requiere colaboración o creación de base propia | — |

### 6.6 Modelado de la evolución temporal, variabilidad, artefactos, mala colocación y filtros

- **Evolución temporal**: usar funciones logísticas/exponenciales por componente: amplitud de T hiperaguda A_T(t) con pico a 5–30 min y decaimiento conforme crece STE; STE A_ST(t) con subida (τ ≈ 20–60 min) y meseta; amplitud de Q/R con transición en 1–12 h; inversión de T con τ ≈ 6–24 h (o 10–60 min si reperfusión). STAFF III muestra STE de 0,1–0,3 mV en **1–3 min** de oclusión por balón, con T hiperagudas apareciendo antes o simultáneamente [96]. En reperfusión: STE decae ≥ 50 % en ≤ 60–90 min [28].
- **Variabilidad interindividual**: distribuciones (media ± DE) para amplitudes de QRS/T por edad/sexo (Glasgow, PTB‑XL), eje eléctrico (−30° a +90°), rotación (transición precordial), colateralidad (factor 0–1 que escala A_ST), zona en riesgo (escala A_ST y n.º de derivaciones), dominancia coronaria (elige territorio), frecuencia cardíaca (afecta TP, QT), respiración (modulación de amplitud 0,1–0,3 Hz, ± 5–10 %).
- **Artefactos**: deriva de línea de base (0,05–0,5 Hz, hasta 0,5 mV), interferencia de red (50/60 Hz, 0,01–0,05 mV), EMG (temblor; ruido blanco filtrado 20–100 Hz, 0,02–0,1 mV), movimiento (pulsos aleatorios), pérdida de electrodo (derivación plana o saturada), artefacto de RCP.
- **Mala colocación de electrodos** [98]: inversión de brazos (I invertida, aVR ↔ aVL, P negativa en I); brazo‑pierna (III plana); V1–V2 demasiado altos (patrón rSr', T negativa V1–V2, pseudo‑Brugada, pseudo‑anteroseptal); V3–V6 demasiado bajos/laterales (R disminuida, pseudo‑pérdida de R). Implementar como cambio de matriz de proyección.
- **Filtros** [33,99,106]: **paso‑alto 0,05 Hz** (diagnóstico) vs **0,5–1 Hz** (monitor) — el filtro de monitor distorsiona el ST (crea depresión/elevación artificial y cambia la forma de la T); **paso‑bajo 150 Hz** diagnóstico (adultos) vs 40 Hz (reduce amplitud de R/Q, J‑waves y muescas). El simulador debe permitir cambiar el modo y mostrar el efecto sobre los criterios.

### 6.7 Inteligencia artificial para detección de OMI y lecciones sobre features

- **Queen of Hearts (PMcardio, Powerful Medical)**: red neuronal sobre imagen/señal de 12 derivaciones; entrenada con 18 616 ECG de 10 543 pacientes con resultados angiográficos; AUC 0,938, S 80,6 %, E 93,7 % vs STEMI 32,5 %/97,7 % [13]; validaciones externas con S 70–100 %, E ~ 95–99 % [7,42,43]; designación FDA Breakthrough Device (2024, según la compañía). **⚠** La mayoría de los estudios tienen participación del fabricante; faltan ensayos de impacto.
- Otros modelos: Al‑Zaiti 2023 (Nat Med) modelo de ML con 554 features para OMI en 7 313 pacientes prehospitalarios (AUC 0,87–0,91; superó al análisis comercial y a clínicos) [100]; modelos de 12 derivaciones con CNN (ECG‑SMART, análisis de vectores VCG) [101].
- **Lecciones sobre features relevantes** (interpretabilidad en Al‑Zaiti y análisis post‑hoc de QoH): las variables más discriminativas fueron **amplitud y área de T relativas al QRS**, **ST a 60–80 ms**, **ST recíproco** (concordancia espacial entre derivaciones opuestas), **relación ST/S en QRS ancho**, morfología de la T (simetría), **pérdida de R/S**, distribución espacial (vector ST y vector T en el VCG), y **QTc**. Esto apoya modelar el ST‑T como vectores y calcular ratios normalizados por QRS en el simulador — y sugiere que la evaluación de los alumnos debe centrarse en esas mismas features.

---

## 7. Educación y evaluación

- **Exactitud de interpretación** (Cook 2020, metaanálisis de 78 estudios [102]): mediana de exactitud **42 %** estudiantes, **56 %** residentes, **69 %** médicos en ejercicio, **75 %** cardiólogos; la formación produce mejoras modestas y con decaimiento. La interpretación de STE sutil, BRI, posterior y de "equivalentes" está entre los errores más frecuentes en urgencias [44,46].
- **Errores frecuentes**: confiar en la lectura automática ("normal"); no comparar con ECG previo; no repetir el ECG (seriado cada 10–20 min en dolor persistente); medir el ST en la línea PR deprimida; ignorar la STD recíproca; clasificar STD anterior como "isquemia subendocárdica" sin considerar posterior; confundir T de reperfusión con isquemia crónica; no registrar V4R/V7–V9; asumir que BRI impide el diagnóstico; sobre‑diagnosticar RP/pericarditis en jóvenes y HVI en hipertensos [32,40,44].
- **Métodos de enseñanza** (Fent 2015 [103]; revisiones de simulación): el aprendizaje basado en **casos con feedback inmediato y práctica deliberada espaciada** supera a las clases; el **desenlace angiográfico** como feedback ("qué mostró el cateterismo") aumenta la calibración; el entrenamiento con **pares ECG (isquemia vs mimic)** mejora la discriminación; la exposición **secuencial temporal** (ver el mismo paciente en t0, t+15 min, t+2 h) fija el concepto de dinámica.
- **Elementos que debe incluir el simulador para maximizar la transferencia**:
  1. Casos **progresivos** (de STEMI obvio a OMI sutil; de patrón único a combinaciones).
  2. **ECG seriados** generados por el modelo temporal con decisión en cada paso (repetir ECG, derivaciones adicionales, eco, activar).
  3. **Feedback estructurado**: qué criterios cumplía (STEMI, HATW, Sgarbossa, etc.), qué derivaciones eran clave, qué arteria estaba ocluida (angiografía simulada), consecuencias del retraso (tiempo → tamaño de infarto).
  4. **Controles negativos**: mimics con prevalencia realista para entrenar especificidad (evitar sobre‑activación).
  5. **Medición asistida**: calipers, línea de base, STE60, ratios T/QRS y ST/S, fórmula de Smith automática.
  6. **Métricas del alumno**: sensibilidad/especificidad por patrón, tiempo a decisión, calibración de confianza, curvas de aprendizaje.
  7. **Variabilidad**: mismo patrón con distintos ejes, voltajes, FC, ruido, filtros y colocaciones para evitar memorización de plantillas.

---

## 8. Tablas resumen por patrón

Abreviaturas: S = sensibilidad; E = especificidad; VPP = valor predictivo positivo; (*) = consenso/series pequeñas/fuente no revisada por pares. Los valores de S/E se refieren al desenlace indicado en la columna "Referencia" (oclusión angiográfica, IAM o estenosis).

### 8.1 Patrones de oclusión (OMI) y equivalentes

| Patrón | Criterios cuantitativos | Derivaciones clave | Arteria | S / E (desenlace) | Diferenciales principales | Ref. |
|---|---|---|---|---|---|---|
| **STEMI (UDMI 2018)** | STE en J ≥ 1 mm en 2 contiguas; V2–V3: ≥ 2,5 mm (H < 40), ≥ 2 mm (H ≥ 40), ≥ 1,5 mm (M) | según territorio | cualquiera | S 32–44 % / E 91–98 % (oclusión) | RP, pericarditis, HVI, BRI, Brugada, aneurisma, hiperK, Takotsubo | [1,5,10,13] |
| **T hiperagudas (HATW)** | Puntuación HATW (área T/amplitud QRS + simetría) media ≥ 0,7 en ≥ 2 derivaciones contiguas; T/QRS ≥ 0,5–0,75 (*); base > 250 ms (*) | V2–V4 (DA); II/III/aVF (inferior) | DA > CD/CX | S 20,7 % / E 98,4 % (TIMI 0–1, sin STEMI) | HiperK, RP, HVI, BRI, variantes normales | [23,31,32] |
| **STE sutil + reciprocidad** | STE 0,5–2 mm bajo umbral + STD recíproca ≥ 0,25–0,5 mm en derivación opuesta (aVL/III/inferior) y/o pérdida de S/distorsión terminal | territorio + espejo | cualquiera | aVL STD en IAM inferior: S 100 % / E 100 % vs pericarditis | Pericarditis, RP, DA envolvente | [69,25] |
| **De Winter** | STD ascendente 1–3 mm en J en V1–V6 + T alta simétrica; STE aVR 0,5–1 mm; sin QRS ancho | V2–V5, aVR | DA proximal | Prevalencia 2 % de IAM anteriores; E ~ 95–100 % (*) | HiperK, STD por demanda | [47] |
| **Wellens A** | T bifásica (+/−) en V2–V3 (± V1–V4); STE < 1 mm; R conservada; sin Q; sin dolor en el momento del ECG | V2–V3 | DA (estenosis crítica/reperfundida) | ≈ 25 % de Wellens; VPP para estenosis DA ≈ 86–100 % (*) | EP, HVI, memoria cardíaca, SNC, MCH | [48–50] |
| **Wellens B** | T invertida profunda simétrica ≥ 2 mm en V2–V3 (± V1–V6); resto igual | V2–V4 | DA | ≈ 75 % de Wellens | ídem | [48–50] |
| **Aslanger** | STE en III **solo**; STD en cualquier V4–V6 (no V2) con T positiva/terminal positiva; ST V1 > ST V2 | III, V4–V6, V1/V2 | CD o CX + multivaso | 6,3 % de IAM inferiores; mortalidad ≈ STEMI; E > 95 % vs NSTEMI (*) | STD difusa por demanda, EP | [51] |
| **Posterior / STD máx. V1–V4** | STD isquémica máxima en V1–V4 (vs V5–V6), **cualquier amplitud**, T positiva terminal; ± R alta V1–V2; STE V7–V9 ≥ 0,5 mm (≥ 1 mm H < 40) | V1–V4, V7–V9 | CX/OM, CD‑DP | STD máx V1–V4: S 14 % / E 97 %, VPP 90 % (OMI); STE V7–V9 aumenta detección de CX | STD difusa, HVD, BRD, WPW A | [52,53,37,38] |
| **VD** | STE V4R ≥ 1 mm (≥ 0,5 mm UDMI); STE V1 con inferior; III > II | V4R, V1 | CD proximal | S 88 % / E 78 % (IAM VD, autopsia/hemodinámica) | EP, Brugada, BRD | [54,55,1] |
| **aVR + STD difusa** | STE aVR ≥ 1 mm (± V1) + STD ≥ 1 mm en ≥ 6–8 derivaciones (máx II, V4–V6) | aVR, V1, II, V4–V6 | TCI/3 vasos no oclusivo; **demanda** | VPP TCI ≈ 10–15 % en urgencias; predictor de mortalidad | Demanda (taquicardia, anemia, sepsis), HVI, digital | [56,57,19] |
| **South African flag** | STE I, aVL, V2 (0,5–2 mm) + STD III (± aVF) | I, aVL, V2, III | D1 / ramus / OM alta | Series de casos; E alta si reciprocidad III (*) | Pericarditis, variante normal | [58] |
| **DA envolvente** | STE V2–V6 + STE II, III, aVF (sin STD inferior) | anterior + inferior | DA larga, oclusión distal a D1 | STE inferior en IAM anterior → DA envolvente (Sasaki) | Pericarditis, DA + CD | [59,70] |
| **BRI + Sgarbossa** | Concordante STE ≥ 1 mm (5); STD concordante V1–V3 ≥ 1 mm (3); discordante STE ≥ 5 mm (2); ≥ 3 pts | según QRS | cualquiera | S 20–36 % / E 90–98 % (IAM) | BRI aislado, HVI | [61] |
| **BRI + Sgarbossa modificado** | Igual + STE discordante ≥ 25 % de S (ST/S ≤ −0,25) en ≥ 1 derivación | V1–V4 típicamente | DA (≥ 25 % de casos), CD | S 80–91 % / E 90–99 % (oclusión) | ídem | [62,63] |
| **BRI + BARCELONA** | Desv. ST ≥ 1 mm concordante en cualquier derivación **o** discordante ≥ 1 mm en derivación con máx(R,S) ≤ 6 mm | cualquiera | cualquiera | S 93–95 % / E 89–94 % (IAM en ICP primaria) | ídem | [64] |
| **Marcapasos + Sgarbossa mod.** | Concordante STE ≥ 1 mm; STD concordante V1–V3 ≥ 1 mm; ST/S ≤ −0,25 (o −0,20) | según QRS | cualquiera | S 81–86 % / E 84–96 % (OMI) | Ritmo estimulado aislado | [65] |
| **BRD + OMI** | STE ≥ 1 mm en V1–V4 o T positiva concordante en V1–V3; BRD + HBA nuevo | V1–V4 | DA proximal | Mortalidad 15–20 %; ESC: estrategia ICP primaria | BRD aislado, EP | [39] |
| **Distorsión terminal QRS (grado 3)** | qR: J/R ≥ 0,5; RS: pérdida de S en V2–V3 sin onda J | V2–V3 (anterior); II/III/aVF | DA (más grave) | Ausencia S+J en V2/V3: 30 % IAM vs 0 % RP (E 100 %) | RP (siempre S o J), HVI | [24,25] |
| **Tombstoning** | R < 40 ms de baja amplitud; ST monofásico con pico > R fusionado a T | V1–V4 | DA proximal | Mortalidad 2–3× | HiperK, TV lenta | [26] |
| **Shark fin** | QRS‑ST‑T fusionados en onda triangular ≥ 10 mm | territorio (a menudo anterior/inferolateral masivo) | DA proximal / TCI / CD | Series de casos; FV/shock | Artefacto, hiperK | [68] |
| **Fórmula de Smith 4 var.** | 1,062·STE60_V3 + 0,052·QTc − 0,151·QRS_V2 − 0,268·R_V4 > 18,2 → DA | V2–V4 | DA | S 83–89 % / E 88 % (IAM DA vs RP) | RP | [67,66] |
| **Cambios dinámicos** | Δ ST ≥ 1 mm o cambio de polaridad de T entre ECG seriados (10–20 min) | cualquiera | cualquiera | + 16 % de IAM detectados con seriado; criterio ESC de muy alto riesgo | Artefactos, cambios posturales | [45,2] |
| **Reperfusión** | STE ↓ ≥ 50–70 % a 60–90 min; T terminal invertida; RIVA | zona afectada | — | Resolución ≥ 70 %: mejor pronóstico; RIVA S 45–70 % / E 60–80 % | — | [28,29,30] |
| **Pseudonormalización / reoclusión** | T invertida → positiva/hiperaguda + recurrencia STE | zona afectada | — | — | Memoria cardíaca | [30,19] |

### 8.2 Isquemia por demanda y mimics (controles negativos)

| Entidad | Criterios que la distinguen (cuantitativos cuando existen) | Derivaciones | S / E | Ref. |
|---|---|---|---|---|
| **Demanda / subendocárdica difusa** | STD ≥ 1 mm ≥ 6–8 deriv. máx II, V4–V6; STE aVR ≥ 1 mm; sin territorio; resuelve al tratar causa | II, V4–V6, aVR | ECG no distingue TCI de demanda | [19,56,57] |
| **Pericarditis** | STE cóncava difusa; PR ↓ ≥ 0,5 mm (aVR PR ↑); STE/T V6 > 0,25; **sin STD aVL** con STE inferior; sin STD recíproca salvo aVR/V1 | I, II, aVF, V2–V6 | STD aVL: E 100 % para IAM inferior vs pericarditis | [69] |
| **Repolarización precoz** | STE cóncava V2–V5 ≤ 3 mm; onda J/notch; R V4 ≥ 5–10 mm; QTc corto; Smith 4v ≤ 18,2; sin STD recíproca; S conservada V2–V3 | V2–V5, II/III/aVF | Fórmula: S 83–89 % / E 88 % | [66,67,80] |
| **HVI con strain** | S V1/V2 ≥ 25–30 mm; STE V1–V3 < 25 % de S; T invertida asimétrica lateral; STE ≥ 25 % del QRS en V1–V3 → IAM (Armstrong) | V1–V3, V5–V6, I, aVL | Armstrong: regla 25 % con buena E | [78] |
| **Brugada tipo 1** | STE "coved" ≥ 2 mm V1–V2 con T negativa; sin reciprocidad ni evolución | V1–V2 (± alta) | — | [79] |
| **Aneurisma VI** | T/QRS máx V1–V4 < 0,36; QS; STE estática | V1–V4 | T/QRS > 0,36 para IAM agudo: S 91 % / E 81 % | [27] |
| **Hiperkalemia** | T picuda estrecha simétrica; QRS ancho; P plana; STE V1–V2 tipo Brugada | difusas | — | [77] |
| **Takotsubo** | STE V2–V6 sin V1; STE en −aVR; QTc > 500 ms fase subaguda; T invertidas difusas | V2–V6, −aVR | Kosuge: S 91 % / E 96 % (serie) | [74,75] |
| **Embolia pulmonar** | T negativa en III **y** V1; S1Q3T3; taquicardia; BRD | III, V1–V4 | T neg III+V1: E 88 % vs SCA | [76] |
| **Atleta** | STE V1–V4 con T invertida asimétrica (afro‑caribeño); voltajes altos | V1–V4 | Criterios internacionales 2017 | [81] |
| **Post‑ROSC precoz** | STE difusa transitoria < 8 min tras ROSC | difusa | FP ↑ si ECG < 8 min | [82] |

---

## 9. Especificaciones para el simulador derivadas de la evidencia

### 9.1 Arquitectura de señal

**S1. Motor de generación (núcleo).** Modelo vectorial de 3 componentes (X, Y, Z de Frank) con ondas P, Q, R, S, T definidas como gaussianas (McSharry/ECGSYN ampliado) y proyección a 12 derivaciones mediante matriz de Dower parametrizable [89–93]. Frecuencia de muestreo interna ≥ 500 Hz (exportación 250/500/1 000 Hz); resolución ≥ 2,5 µV (equivalente a 16 bits); duración de tira 10 s (12×1) y 3×4 + tira II/V1/V5 (formato estándar).

**S2. Módulo de vector de lesión.** Para cada territorio T ∈ {anteroseptal, anterior extenso, anteroapical, lateral alto, lateral bajo, inferior, inferobasal, VD, subendocárdico difuso} definir:
- dirección unitaria **u_ST(T)** y **u_T(T)** en coordenadas de Frank (calibradas con la tabla §5.1 y con ECGSIM/PTB con derivaciones de Frank [94,87]);
- amplitud **A_ST(t)**, **A_T(t)** (mV) con curvas temporales (§9.3);
- perfil de forma del ST: cóncavo / recto / convexo / plateau / monofásico (parámetro de curvatura κ ∈ [−1, +1]);
- factor de **reciprocidad** automático: la proyección del dipolo en derivaciones opuestas genera STD recíproca sin parametrización adicional (validar que el IAM inferior siempre produce STD en aVL ≥ 0,25 mm) [69].
- Superposición de **hasta 3 dipolos** (multivaso, Aslanger, DA envolvente con cancelación) [51,59].

**S3. Módulo de QRS isquémico.** Parámetros: amplitud de R (pérdida progresiva), amplitud de S (pérdida → distorsión terminal), aparición de Q (duración 30–40 ms, profundidad 0,1–0,5 mV), relación J/R, R en V1–V2 (equivalente Q posterior), R < 40 ms (tombstoning). Modo de fusión QRS‑ST‑T para shark fin.

**S4. Módulo de onda T.** Parámetros independientes: amplitud absoluta y **relativa al QRS**, anchura (σ), **asimetría** (σ_asc/σ_desc; HATW → 1; hiperK < 1 con base estrecha), polaridad, bifasicidad (Wellens A = dos gaussianas de signo opuesto), T "terminal positiva" en STD (posterior/De Winter). Cálculo automático de puntuación HATW (área T / amplitud QRS + simetría) [23].

**S5. Módulo de conducción.** BRI, BRD, HBA, ritmo de marcapasos VD (espiga + QRS ancho), QRS ancho por hiperK, con ST‑T secundarios discordantes **proporcionales** para que los criterios de Sgarbossa/Barcelona sean calculables (S en V1–V3 configurable 1–3 mV) [61–65].

**S6. Módulo de ritmo/arritmia.** Sinusal (40–150 lpm), bradicardia sinusal, BAV 1.º/2.º (Mobitz I/II)/3.º con escape nodal (40–60) o ventricular (< 40), FA, RIVA (60–120), EV con morfología de la zona isquémica, TV/FV, taquicardia sinusal/TSV/FA rápida para casos de demanda [71,29].

**S7. Módulo de contexto/variabilidad.** Edad, sexo (umbrales UDMI), eje (−30° a +90°), rotación, voltaje global (0,6–1,6×), hábito (obesidad reduce voltajes; EPOC baja voltaje y P pulmonale), FC, respiración, colateralidad (0–1), tamaño de zona en riesgo (0–1), dominancia coronaria, variantes (DA envolvente, ramus).

**S8. Módulo de adquisición.** Filtros (paso‑alto 0,05 vs 0,5 Hz; paso‑bajo 40/100/150 Hz; notch 50/60 Hz) con efecto real sobre la señal; ganancia (5/10/20 mm/mV); velocidad (25/50 mm/s); ruido (deriva, red, EMG, movimiento, electrodo suelto, RCP); mala colocación (inversión brazos, brazo‑pierna, V1–V2 altos, V3–V6 bajos, precordiales desordenadas) como cambio de matriz [98,99,33].

**S9. Derivaciones adicionales.** V7–V9, V3R–V6R, derivación de Lewis, generadas del mismo dipolo (posiciones de electrodo posteriores/derechas en la matriz) [1,52,54].

**S10. Validador de criterios (motor de reglas).** A partir de la señal generada, calcular y exponer: STE/STD en J, J+40/60/80 en cada derivación (respecto a TP y a PR); criterios STEMI UDMI por sexo/edad; HATW score; T/QRS por derivación; Sgarbossa/Sgarbossa modificado/Barcelona; fórmula de Smith 3 y 4 variables; STD máx V1–V4 vs V5–V6; Aslanger; De Winter; distorsión terminal; STE aVR + n.º de derivaciones con STD; STE III vs II, ST en I, aVL, V1, V4R; algoritmo de Fiol; T/QRS < 0,36 (aneurisma); QTc. Debe generar la **etiqueta de verdad** (arteria, TIMI, territorio, fase) y la lista de criterios cumplidos/no cumplidos para el feedback.

### 9.2 Reglas de generación por patrón (resumen operativo)

| Patrón | Reglas mínimas que la señal debe cumplir (verificadas por S10) |
|---|---|
| STEMI anterior (DA proximal a D1) | STE V1–V4 ≥ umbral UDMI; STE aVL ≥ 0,5 mm; STD II/III/aVF ≥ 1 mm; T positivas fusionadas; ± STE aVR (proximal a S1), pérdida de S en V2–V3 |
| STEMI anterior (DA media/distal) | STE V2–V5 ≥ umbral; sin STD inferior (o STE inferior si envolvente); STE aVL ≈ 0 |
| OMI anterior sutil | STE V2–V4 0,5–2 mm (bajo umbral); T/QRS ≥ 0,5; STE60 tal que Smith 4v > 18,2; ± pérdida S; STD inferior ≥ 0,5 mm |
| T hiperagudas anteriores | STE < umbral; HATW ≥ 0,7 en ≥ 2 derivaciones contiguas; STD/T aplanada III/aVF sutil; evoluciona a STE en 15–60 min si no reperfusión |
| De Winter | STD J −1 a −3 mm ascendente V2–V5 (ST a 80 ms ≈ 0); T alta simétrica; STE aVR 0,5–1 mm; QRS < 120 ms |
| Wellens A / B | ST 0–1 mm; T bifásica/invertida V2–V3 (± V1–V6); R V2–V3 ≥ 3 mm; sin Q; troponina normal/leve; evoluciona: A → B (horas) o pseudonormalización → STE si reoclusión |
| STEMI inferior CD | STE II/III/aVF con III > II; STD aVL ≥ 0,5 mm (siempre) y I; STE V1/V4R si VD (± STD V1–V3 leve si posterior asociado); BAV/bradicardia opcional |
| STEMI inferior CX | STE II ≥ III; I/aVL isoeléctricas o STE; STE V5–V6; STD V1–V3 con T positiva (posterior) |
| Posterior aislado | STD máx V2–V3 ≥ 0,5 mm horizontal con T positiva terminal; STE V7–V9 ≥ 0,5 mm; R V2 creciente con el tiempo; STE lateral sutil opcional |
| VD | STE V4R ≥ 1 mm, V1 ≥ 0,5 mm; STE III > II; hipotensión en escenario |
| Aslanger | STE III ≥ 1 mm; II y aVF < 0,5 mm; STD V4–V6 ≥ 0,5 mm con T positiva; ST V1 > ST V2 |
| South African flag | STE I, aVL, V2 0,5–2 mm; STD III ≥ 0,5 mm; aVF ≈ 0 o STD leve; V3–V6 normales |
| BRI + OMI | QRS ≥ 120 ms con morfología BRI; en ≥ 1 derivación ST/S ≤ −0,25 o STE concordante ≥ 1 mm o STD concordante V1–V3 ≥ 1 mm; Barcelona positivo; control: BRI con ST/S entre −0,10 y −0,20 en todas las derivaciones |
| Marcapasos + OMI | Espiga + QRS ancho; mismas reglas ST/S ≤ −0,25 |
| BRD + OMI DA | rSR' V1, S ancha I/V6; STE ≥ 1 mm V1–V4 (donde el ST basal sería ≤ 0) o T positiva V1–V3; ± HBA |
| Demanda / aVR | STD ≥ 1 mm en ≥ 8 derivaciones máx II, V4–V6; STE aVR ≥ 1 mm; V1 0–1 mm; taquicardia; resolución tras control de FC/causa |
| Tombstoning / shark fin | Ver §6.2; garantizar QRS estrecho subyacente al recalcular tras "reperfusión" |
| Controles negativos | Pericarditis (STE cóncava difusa, PR ↓, sin STD aVL), RP (Smith 4v ≤ 18,2, J‑notch, R V4 ≥ 15 mm), HVI (S V2 ≥ 30 mm, STE V1–V3 < 25 % de S), Brugada, aneurisma (T/QRS < 0,36), hiperK, Takotsubo (QTc > 500), EP (T neg III + V1), atleta, WPW, hipotermia (J de Osborn), post‑ROSC |

### 9.3 Secuencias temporales (parámetros por defecto, ajustables)

Modelo: cada amplitud sigue A(t) = A_max · f(t), con f logística de subida (t₅₀, pendiente) y decaimiento opcional. Tiempos desde el inicio de la oclusión.

| Componente | Oclusión persistente | Reperfusión a t_R | Reoclusión |
|---|---|---|---|
| T hiperaguda | inicio 1–5 min; pico 10–30 min (T/QRS 0,5–1,0); decae al fusionarse con STE (1–3 h) | a partir de t_R: amplitud ↓ y polaridad → negativa terminal en 10–60 min ("T de reperfusión") | pseudonormalización: T negativa → positiva en 5–15 min |
| STE | inicio 2–10 min (0,05–0,1 mV), 50 % del máximo a ~ 30 min, máximo 1–3 h; meseta hasta 12–24 h; descenso lento a días (persistente si aneurisma) | ↓ ≥ 50 % a t_R + 60–90 min (τ ≈ 45 min); ↓ ≥ 70 % en el 60–70 % de casos | nueva subida con τ 10–20 min |
| Pérdida de R / distorsión terminal | S desaparece 20–60 min; J/R ≥ 0,5 en isquemia severa a 30–90 min | recuperación parcial de R/S en horas | — |
| Onda Q | aparición 1–12 h (posible < 1 h en ~ 50 % de anteriores [104]); estable | puede regresar si reperfusión precoz (< 2–3 h) | — |
| T invertida (evolucionada) | 12–48 h; profundiza días; normaliza semanas–meses | 10 min–6 h tras t_R | — |
| Arritmias | FV 1–4 h (pico primeras horas); BAV en inferior 0–24 h | RIVA 0–60 min tras t_R; bradicardia/hipotensión (CD) | — |
| STE V4R (VD) | precoz; desaparece en < 10–12 h en ~ 50 % | rápida | — |
| Wellens | tras reperfusión espontánea: A a 1–6 h → B a 6–48 h | — | pseudonormalización → STE |

Escenarios de cinética "STAFF III" (oclusión por balón 0–5 min) [96]: STE de 0,1–0,3 mV en V2–V4 (DA) o II/III/aVF (CD) a 1–3 min; T aumenta 20–60 % en el mismo intervalo; recuperación en 1–3 min tras desinflar el balón. Útil para entrenar reconocimiento ultra‑precoz.

### 9.4 Biblioteca mínima de casos (con etiqueta angiográfica de verdad)

Cada caso incluye: ECG basal previo (opcional), ECG t0, ECG seriados (t+15, t+30, t+120 min), derivaciones adicionales bajo demanda, eco a la cabecera (texto), troponina hs 0/1 h, resultado angiográfico (arteria, segmento, TIMI), y "consecuencia del retraso".

**A. Oclusión evidente (STEMI+) — 10 casos**: DA proximal a D1/S1 (con BRD nuevo), DA media, DA envolvente, CD proximal con VD y BAV completo, CD distal, CX dominante inferolateral, OM lateral, tronco subtotal con shock, tombstoning anterior, shark fin.
**B. Oclusión sutil (STEMI− OMI) — 14 casos**: T hiperagudas anteriores (HATW+), STE sutil anterior con Smith > 18,2, De Winter, Wellens A → B (con reoclusión en versión alternativa), Aslanger, posterior aislado (STD V2–V3 con T positiva), inferior sutil con STD aVL, South African flag, BRI + Sgarbossa modificado (+) con Sgarbossa clásico (−), marcapasos + ST/S ≤ −0,25, BRD + STE V1–V3, oclusión de CX "ECG casi normal" con cambios dinámicos, IAM inferior con ECG inicial normal y evolución a los 15 min, ECG "normal por computador" con HATW.
**C. Isquemia sin oclusión — 4 casos**: STD difusa + aVR por FA rápida (resuelve con control de FC), anemia severa, estenosis de tronco no oclusiva con dolor refractario, NSTEMI con STD lateral leve.
**D. Mimics (controles negativos) — 14 casos**: RP (joven, deportista), pericarditis, HVI con strain, BRI aislado, Brugada, aneurisma antiguo, hiperkalemia, Takotsubo, EP, miocarditis, hipotermia, WPW, atleta afro‑caribeño, post‑ROSC precoz.
**E. Reperfusión/dinámica — 4 casos**: STEMI anterior con reperfusión (resolución ≥ 70 %, T invertida, RIVA), reoclusión con pseudonormalización, vasoespasmo transitorio, IAM inferior con reperfusión y bradicardia Bezold‑Jarisch.
**F. Adquisición — 4 casos**: inversión de brazos que simula IAM lateral alto; V1–V2 altos (pseudo‑Brugada/pseudo‑anteroseptal); filtro de monitor 0,5 Hz que distorsiona ST; ruido/artefacto que imita STE.

Total ≈ 50 casos base × variantes automáticas (sexo/edad/eje/voltaje/FC/ruido) → banco > 500 ECG únicos.

### 9.5 Reglas pedagógicas y de evaluación

1. Cada caso pide: (a) ¿oclusión sí/no/incierto? (b) territorio/arteria; (c) acción (activar, ECG seriado, derivaciones adicionales, eco, angiografía urgente < 2 h, observar); (d) confianza 0–100 %.
2. Feedback: lista de criterios (S10) con enlace a la evidencia; ECG "solución" con marcadores; resultado angiográfico; tiempo simulado transcurrido y estimación de miocardio perdido.
3. Métricas: S/E por patrón, tasa de activación falsa, tiempo a decisión, calibración; progresión adaptativa (aumenta proporción de OMI sutil y de mimics cuando el alumno domina STEMI evidente).
4. Prevalencias realistas en modo "turno": OMI ≈ 5–8 % de los ECG con dolor torácico; STEMI+ ≈ 50–60 % de los OMI; mimics ≈ 10–15 %.

### 9.6 Validación de la fidelidad

- **Criterios internos**: 100 % de las señales de cada patrón deben pasar sus reglas de §9.2 y los controles negativos no deben pasarlas (excepto los diseñados como "falso STEMI").
- **Comparación con datos reales**: distribución de STE/STD/T por derivación de PTB‑XL (IMI, AMI, LMI, ISCA/ISCI) [87] y de STAFF III por arteria [96]; distancia (p. ej., DTW o error RMS del latido promedio normalizado) entre plantillas simuladas y latidos reales dentro de ± 1 DE.
- **Prueba de Turing clínica**: panel de cardiólogos/urgenciólogos clasifica ECG reales vs simulados mezclados; objetivo ≥ 40 % de indistinguibilidad (acuerdo al azar).
- **Concordancia diagnóstica**: aplicar un lector externo (algoritmo comercial o IA OMI si hay acceso) a las señales simuladas y verificar que asigna la etiqueta esperada en ≥ 90 % de STEMI+ y ≥ 70 % de OMI sutil.

---

## 10. Bibliografía

1. Thygesen K, Alpert JS, Jaffe AS, et al. Fourth universal definition of myocardial infarction (2018). *Eur Heart J.* 2019;40(3):237‑269. https://doi.org/10.1093/eurheartj/ehy462
2. Byrne RA, Rossello X, Coughlan JJ, et al. 2023 ESC Guidelines for the management of acute coronary syndromes. *Eur Heart J.* 2023;44(38):3720‑3826. https://doi.org/10.1093/eurheartj/ehad191
3. Rao SV, O'Donoghue ML, Ruel M, et al. 2025 ACC/AHA/ACEP/NAEMSP/SCAI Guideline for the Management of Patients With Acute Coronary Syndromes. *Circulation.* 2025;151(13):e771‑e862. https://doi.org/10.1161/CIR.0000000000001309
4. Kontos MC, de Lemos JA, Deitelzweig SB, et al. 2022 ACC Expert Consensus Decision Pathway on the Evaluation and Disposition of Acute Chest Pain in the Emergency Department. *J Am Coll Cardiol.* 2022;80(20):1925‑1960. https://doi.org/10.1016/j.jacc.2022.08.750
5. Meyers HP, Bracey A, Lee D, et al. Accuracy of OMI ECG findings versus STEMI criteria for diagnosis of acute coronary occlusion myocardial infarction. *IJC Heart Vasc.* 2021;33:100767. https://doi.org/10.1016/j.ijcha.2021.100767
6. Meyers HP, Bracey A, Lee D, et al. Comparison of the ST‑Elevation Myocardial Infarction (STEMI) vs. NSTEMI and Occlusion MI (OMI) vs. NOMI paradigms of acute MI. *J Emerg Med.* 2021;60(3):273‑284. https://doi.org/10.1016/j.jemermed.2020.10.026
7. Meyers HP, et al. Failure of standard contemporary ST‑elevation myocardial infarction electrocardiogram criteria to reliably identify acute occlusion of the left anterior descending coronary artery. *Eur Heart J Acute Cardiovasc Care.* 2025;14(7):403‑411. https://doi.org/10.1093/ehjacc/zuaf037
8. Meyers HP, Weingart SD, Smith SW. The OMI Manifesto. Dr. Smith's ECG Blog, 2018. http://hqmeded-ecg.blogspot.com/2018/04/the-omi-manifesto.html
9. Aslanger EK, Yıldırımtürk Ö, Şimşek B, et al. DIagnostic accuracy oF electrocardiogram for acute coronary OCClUsion resuLTing in myocardial infarction (DIFOCCULT Study). *IJC Heart Vasc.* 2020;30:100603. https://doi.org/10.1016/j.ijcha.2020.100603
10. de Alencar Neto JN, et al. Systematic review and meta‑analysis of diagnostic test accuracy of ST‑segment elevation for acute coronary occlusion. *Int J Cardiol.* 2024;402:131889. https://doi.org/10.1016/j.ijcard.2024.131889
11. Khan AR, Golwala H, Tripathi A, et al. Impact of total occlusion of culprit artery in acute non‑ST elevation myocardial infarction: a systematic review and meta‑analysis. *Eur Heart J.* 2017;38(41):3082‑3089. https://doi.org/10.1093/eurheartj/ehx418
12. Wang TY, Zhang M, Fu Y, et al. Incidence, distribution, and prognostic impact of occluded culprit arteries among patients with non‑ST‑elevation acute coronary syndromes undergoing diagnostic angiography. *Am Heart J.* 2009;157(4):716‑723. https://doi.org/10.1016/j.ahj.2009.01.004
13. Herman R, Meyers HP, Smith SW, et al. International evaluation of an artificial intelligence‑powered electrocardiogram model detecting acute coronary occlusion myocardial infarction. *Eur Heart J Digit Health.* 2024;5(2):123‑133. https://doi.org/10.1093/ehjdh/ztad074
14. Janse MJ, Wit AL. Electrophysiological mechanisms of ventricular arrhythmias resulting from myocardial ischemia and infarction. *Physiol Rev.* 1989;69(4):1049‑1169. https://doi.org/10.1152/physrev.1989.69.4.1049
15. Kléber AG. ST‑segment elevation in the electrocardiogram: a sign of myocardial ischemia. *Cardiovasc Res.* 2000;45(1):111‑118. https://doi.org/10.1016/S0008-6363(99)00301-6
16. Di Diego JM, Antzelevitch C. Acute myocardial ischemia: cellular mechanisms underlying ST segment elevation. *J Electrocardiol.* 2014;47(4):486‑490. https://doi.org/10.1016/j.jelectrocard.2014.02.005
17. Hurst JW. Thoughts about the abnormalities in the electrocardiogram of patients with acute myocardial infarction with emphasis on a more accurate method of interpreting ST‑segment displacement: part I. *Clin Cardiol.* 2007;30(8):381‑390. https://doi.org/10.1002/clc.20155
18. Sclarovsky S. *Electrocardiography of Acute Myocardial Ischaemic Syndromes.* London: Martin Dunitz; 1999. ISBN 978‑1853176494.
19. Zimetbaum PJ, Josephson ME. Use of the electrocardiogram in acute myocardial infarction. *N Engl J Med.* 2003;348(10):933‑940. https://doi.org/10.1056/NEJMra022700
20. Nikus K, Pahlm O, Wagner G, et al. Electrocardiographic classification of acute coronary syndromes: a review by a committee of the International Society for Holter and Non‑Invasive Electrocardiology. *J Electrocardiol.* 2010;43(2):91‑103. https://doi.org/10.1016/j.jelectrocard.2009.07.009
21. Malmivuo J, Plonsey R. *Bioelectromagnetism: Principles and Applications of Bioelectric and Biomagnetic Fields.* Oxford University Press; 1995. http://www.bem.fi/book/
22. Dressler W, Roesler H. High T waves in the earliest stage of myocardial infarction. *Am Heart J.* 1947;34(5):627‑645. https://doi.org/10.1016/0002-8703(47)90337-2
23. Meyers HP, Šimančík F, Demolder A, Herman R, et al. Hyperacute T waves are specific for occlusion myocardial infarction, even without diagnostic ST‑segment elevation. *JACC Adv.* 2025;4:102120. https://doi.org/10.1016/j.jacadv.2025.102120 (resumen previo: *J Am Coll Cardiol.* 2025;85(12 Suppl). https://doi.org/10.1016/S0735-1097(25)02430-1)
24. Birnbaum Y, Sclarovsky S, Blum A, Mager A, Gabbay U. Prognostic significance of the initial electrocardiographic pattern in a first acute anterior wall myocardial infarction. *Chest.* 1993;103(6):1681‑1687. https://doi.org/10.1378/chest.103.6.1681
25. Lee DH, Walsh B, Smith SW. Terminal QRS distortion is present in anterior myocardial infarction but absent in early repolarization. *Am J Emerg Med.* 2016;34(11):2182‑2185. https://doi.org/10.1016/j.ajem.2016.08.053
26. Guo XH, Yap YG, Chen LJ, Huang J, Camm AJ. Correlation of coronary angiography with "tombstoning" electrocardiographic pattern in patients after acute myocardial infarction. *Clin Cardiol.* 2000;23(5):347‑352. https://doi.org/10.1002/clc.4960230509
27. Klein LR, Shroff GR, Beeman W, Smith SW. Electrocardiographic criteria to differentiate acute anterior ST‑elevation myocardial infarction from left ventricular aneurysm. *Am J Emerg Med.* 2015;33(6):786‑790. https://doi.org/10.1016/j.ajem.2015.03.044
28. Schröder R, Dissmann R, Brüggemann T, et al. Extent of early ST segment elevation resolution: a simple but strong predictor of outcome in patients with acute myocardial infarction. *J Am Coll Cardiol.* 1994;24(2):384‑391. https://doi.org/10.1016/0735-1097(94)90292-5
29. Gressin V, Louvard Y, Pezzano M, Lardoux H. Holter recording of ventricular arrhythmias during intravenous thrombolysis for acute myocardial infarction. *Am J Cardiol.* 1992;69(3):152‑159. https://doi.org/10.1016/0002-9149(92)91295-F
30. Doevendans PA, Gorgels AP, van der Zee R, et al. Electrocardiographic diagnosis of reperfusion during thrombolytic therapy in acute myocardial infarction. *Am J Cardiol.* 1995;75(17):1206‑1210. https://doi.org/10.1016/S0002-9149(99)80763-9
31. Koechlin L, Strebel I, Zimmermann T, et al. Hyperacute T wave in the early diagnosis of acute myocardial infarction. *Ann Emerg Med.* 2023;82(2):194‑202. https://doi.org/10.1016/j.annemergmed.2022.12.003
32. Smith SW, Meyers HP, et al. Dr. Smith's ECG Blog (recurso educativo; casos con correlación angiográfica). https://hqmeded-ecg.blogspot.com/ . Véase también: Life in the Fast Lane ECG Library https://litfl.com/ecg-library/ ; EMCrit https://emcrit.org/ ; ECG Weekly (Mattu) https://ecgweekly.com/
33. Wagner GS, Macfarlane P, Wellens H, et al. AHA/ACCF/HRS recommendations for the standardization and interpretation of the electrocardiogram: part VI: acute ischemia/infarction. *Circulation.* 2009;119(10):e262‑e270. https://doi.org/10.1161/CIRCULATIONAHA.108.191098
34. Larson DM, Menssen KM, Sharkey SW, et al. "False‑positive" cardiac catheterization laboratory activation among patients with suspected ST‑segment elevation myocardial infarction. *JAMA.* 2007;298(23):2754‑2760. https://doi.org/10.1001/jama.298.23.2754
35. McCabe JM, Armstrong EJ, Kulkarni A, et al. Prevalence and factors associated with false‑positive ST‑segment elevation myocardial infarction diagnoses at primary percutaneous coronary intervention‑capable centers. *Arch Intern Med.* 2012;172(11):864‑871. https://doi.org/10.1001/archinternmed.2012.945
36. Fibrinolytic Therapy Trialists' (FTT) Collaborative Group. Indications for fibrinolytic therapy in suspected acute myocardial infarction: collaborative overview of early mortality and major morbidity results from all randomised trials of more than 1000 patients. *Lancet.* 1994;343(8893):311‑322. https://doi.org/10.1016/S0140-6736(94)91161-4
37. Pride YB, Tung P, Mohanavelu S, et al. Angiographic and clinical outcomes among patients with acute coronary syndromes presenting with isolated anterior ST‑segment depression: a TRITON‑TIMI 38 substudy. *JACC Cardiovasc Interv.* 2010;3(8):806‑811. https://doi.org/10.1016/j.jcin.2010.05.012
38. Schmitt C, Lehmann G, Schmieder S, et al. Diagnosis of acute myocardial infarction in angiographically documented occluded infarct vessel: limitations of ST‑segment elevation in standard and extended ECG leads. *Chest.* 2001;120(5):1540‑1546. https://doi.org/10.1378/chest.120.5.1540
39. Widimsky P, Rohác F, Stásek J, et al. Primary angioplasty in acute myocardial infarction with right bundle branch block: should new onset right bundle branch block be added to future guidelines as an indication for reperfusion therapy? *Eur Heart J.* 2012;33(1):86‑95. https://doi.org/10.1093/eurheartj/ehr291
40. McLaren JTT, Meyers HP, Smith SW, Chartier LB. From ST‑elevation myocardial infarction to occlusion myocardial infarction: paradigm shift and ED quality improvement. *CJEM.* 2022;24(3):250‑255. https://doi.org/10.1007/s43678-021-00255-z
41. McLaren JTT, Meyers HP, Smith SW. From ST‑segment elevation MI to occlusion MI: the new paradigm shift in acute myocardial infarction. *JACC Adv.* 2024;3(11):101314. https://doi.org/10.1016/j.jacadv.2024.101314
42. Powerful Medical. Artificial intelligence‑based detection of occlusion myocardial infarction: first external validation in a German chest pain unit cohort (2024). https://www.powerfulmedical.com/research/
43. Frick W, Atallah I, Saraf R, et al. Single center retrospective validation of an artificial intelligence ECG model detecting acute coronary occlusion (PO‑02‑071). *Heart Rhythm.* 2024;21(5 Suppl). https://doi.org/10.1016/j.hrthm.2024.03.803
44. McLaren JTT, et al. Missing occlusions: quality gaps for ED patients with occlusion MI. *Am J Emerg Med.* 2023;73:47‑54. https://doi.org/10.1016/j.ajem.2023.08.022
45. Fesmire FM, Percy RF, Bardoner JB, Wharton DR, Calhoun FB. Usefulness of automated serial 12‑lead ECG monitoring during the initial emergency department evaluation of patients with chest pain. *Ann Emerg Med.* 1998;31(1):3‑11. https://doi.org/10.1016/S0196-0644(98)70274-4
46. Hughes KE, Lewis SM, Katz L, Jones J. Safety of computer interpretation of normal triage electrocardiograms. *Acad Emerg Med.* 2017;24(1):120‑124. https://doi.org/10.1111/acem.13067
47. de Winter RJ, Verouden NJW, Wellens HJJ, Wilde AAM. A new ECG sign of proximal LAD occlusion. *N Engl J Med.* 2008;359(19):2071‑2073. https://doi.org/10.1056/NEJMc0804737
48. de Zwaan C, Bär FW, Wellens HJJ. Characteristic electrocardiographic pattern indicating a critical stenosis high in left anterior descending coronary artery in patients admitted because of impending myocardial infarction. *Am Heart J.* 1982;103(4 Pt 2):730‑736. https://doi.org/10.1016/0002-8703(82)90480-X
49. de Zwaan C, Bär FW, Janssen JH, et al. Angiographic and clinical characteristics of patients with unstable angina showing an ECG pattern indicating critical narrowing of the proximal LAD coronary artery. *Am Heart J.* 1989;117(3):657‑665. https://doi.org/10.1016/0002-8703(89)90742-4
50. Rhinehardt J, Brady WJ, Perron AD, Mattu A. Electrocardiographic manifestations of Wellens' syndrome. *Am J Emerg Med.* 2002;20(7):638‑643. https://doi.org/10.1053/ajem.2002.34800
51. Aslanger E, Yıldırımtürk Ö, Şimşek B, et al. A new electrocardiographic pattern indicating inferior myocardial infarction. *J Electrocardiol.* 2020;61:41‑46. https://doi.org/10.1016/j.jelectrocard.2020.04.008
52. Matetzky S, Freimark D, Feinberg MS, et al. Acute myocardial infarction with isolated ST‑segment elevation in posterior chest leads V7‑9: "hidden" ST‑segment elevations revealing acute posterior infarction. *J Am Coll Cardiol.* 1999;34(3):748‑753. https://doi.org/10.1016/S0735-1097(99)00249-3
53. Meyers HP, Bracey A, Lee D, et al. Ischemic ST‑segment depression maximal in V1‑V4 (versus V5‑V6) of any amplitude is specific for occlusion myocardial infarction (versus nonocclusive ischemia). *J Am Heart Assoc.* 2021;10(23):e022866. https://doi.org/10.1161/JAHA.121.022866
54. Zehender M, Kasper W, Kauder E, et al. Right ventricular infarction as an independent predictor of prognosis after acute inferior myocardial infarction. *N Engl J Med.* 1993;328(14):981‑988. https://doi.org/10.1056/NEJM199304083281401
55. Wellens HJJ. The value of the right precordial leads of the electrocardiogram. *N Engl J Med.* 1999;340(5):381‑383. https://doi.org/10.1056/NEJM199902043400507
56. Knotts RJ, Wilson JM, Kim E, Huang HD, Birnbaum Y. Diffuse ST depression with ST elevation in aVR: is this pattern specific for global ischemia due to left main coronary artery disease? *J Electrocardiol.* 2013;46(3):240‑248. https://doi.org/10.1016/j.jelectrocard.2012.12.016
57. Harhash AA, Huang JJ, Reddy S, et al. aVR ST segment elevation: acute STEMI or not? Incidence of an acute coronary occlusion. *Am J Med.* 2019;132(5):622‑630. https://doi.org/10.1016/j.amjmed.2018.12.021
58. Littmann L. South African flag sign: a teaching tool for easier ECG recognition of high lateral infarct. *Am J Emerg Med.* 2016;34(1):107‑109. https://doi.org/10.1016/j.ajem.2015.09.007
59. Sasaki K, Yotsukura M, Sakata K, Yoshino H, Ishikawa K. Relation of ST‑segment changes in inferior leads during anterior wall acute myocardial infarction to length and occlusion site of the left anterior descending coronary artery. *Am J Cardiol.* 2001;87(12):1340‑1345. https://doi.org/10.1016/S0002-9149(01)01548-6
60. Neeland IJ, Kontos MC, de Lemos JA. Evolving considerations in the management of patients with left bundle branch block and suspected myocardial infarction. *J Am Coll Cardiol.* 2012;60(2):96‑105. https://doi.org/10.1016/j.jacc.2012.02.054
61. Sgarbossa EB, Pinski SL, Barbagelata A, et al. Electrocardiographic diagnosis of evolving acute myocardial infarction in the presence of left bundle‑branch block (GUSTO‑1). *N Engl J Med.* 1996;334(8):481‑487. https://doi.org/10.1056/NEJM199602223340801
62. Smith SW, Dodd KW, Henry TD, Dvorak DM, Pearce LA. Diagnosis of ST‑elevation myocardial infarction in the presence of left bundle branch block with the ST‑elevation to S‑wave ratio in a modified Sgarbossa rule. *Ann Emerg Med.* 2012;60(6):766‑776. https://doi.org/10.1016/j.annemergmed.2012.07.119
63. Meyers HP, Limkakeng AT Jr, Jaffa EJ, et al. Validation of the modified Sgarbossa criteria for acute coronary occlusion in the setting of left bundle branch block: a retrospective case‑control study. *Am Heart J.* 2015;170(6):1255‑1264. https://doi.org/10.1016/j.ahj.2015.09.005
64. Di Marco A, Rodriguez M, Cinca J, et al. New electrocardiographic algorithm for the diagnosis of acute myocardial infarction in patients with left bundle branch block (BARCELONA algorithm). *J Am Heart Assoc.* 2020;9(14):e015573. https://doi.org/10.1161/JAHA.119.015573
65. Dodd KW, Zvosec DL, Hart MA, et al. Electrocardiographic diagnosis of acute coronary occlusion myocardial infarction in ventricular paced rhythm using the modified Sgarbossa criteria. *Ann Emerg Med.* 2021;78(4):517‑529. https://doi.org/10.1016/j.annemergmed.2021.03.036
66. Smith SW, Khalil A, Henry TD, et al. Electrocardiographic differentiation of early repolarization from subtle anterior ST‑segment elevation myocardial infarction. *Ann Emerg Med.* 2012;60(1):45‑56.e2. https://doi.org/10.1016/j.annemergmed.2012.02.015
67. Driver BE, Khalil A, Henry T, Kazmi F, Berry A, Smith SW. A new 4‑variable formula to differentiate normal variant ST segment elevation in V2‑V4 (early repolarization) from subtle left anterior descending coronary occlusion – adding QRS amplitude of V2 improves the model. *J Electrocardiol.* 2017;50(5):561‑569. https://doi.org/10.1016/j.jelectrocard.2017.04.005
68. Life in the Fast Lane. "Shark fin" / giant R wave / lambda‑wave ST elevation (recurso educativo). https://litfl.com/ ; Dr. Smith's ECG Blog, entradas etiquetadas "shark fin". https://hqmeded-ecg.blogspot.com/search?q=shark+fin
69. Bischof JE, Worrall C, Thompson P, Marti D, Smith SW. ST depression in lead aVL differentiates inferior ST‑elevation myocardial infarction from pericarditis. *Am J Emerg Med.* 2016;34(2):149‑154. https://doi.org/10.1016/j.ajem.2015.09.035
70. Engelen DJ, Gorgels AP, Cheriex EC, et al. Value of the electrocardiogram in localizing the occlusion site in the left anterior descending coronary artery in acute anterior myocardial infarction. *J Am Coll Cardiol.* 1999;34(2):389‑395. https://doi.org/10.1016/S0735-1097(99)00196-3
71. Berger PB, Ruocco NA Jr, Ryan TJ, et al. Incidence and prognostic implications of heart block complicating inferior myocardial infarction treated with thrombolytic therapy: results from TIMI II. *J Am Coll Cardiol.* 1992;20(3):533‑540. https://doi.org/10.1016/0735-1097(92)90004-6
72. Tamis‑Holland JE, Jneid H, Reynolds HR, et al. Contemporary diagnosis and management of patients with myocardial infarction in the absence of obstructive coronary artery disease (MINOCA): AHA Scientific Statement. *Circulation.* 2019;139(18):e891‑e908. https://doi.org/10.1161/CIR.0000000000000670
73. Hayes SN, Kim ESH, Saw J, et al. Spontaneous coronary artery dissection: current state of the science. AHA Scientific Statement. *Circulation.* 2018;137(19):e523‑e557. https://doi.org/10.1161/CIR.0000000000000564
74. Ghadri JR, Wittstein IS, Prasad A, et al. International Expert Consensus Document on Takotsubo Syndrome (Part I). *Eur Heart J.* 2018;39(22):2032‑2046. https://doi.org/10.1093/eurheartj/ehy076
75. Kosuge M, Ebina T, Hibi K, et al. Simple and accurate electrocardiographic criteria to differentiate takotsubo cardiomyopathy from anterior acute myocardial infarction. *J Am Coll Cardiol.* 2010;55(22):2514‑2516. https://doi.org/10.1016/j.jacc.2009.12.059
76. Kosuge M, Kimura K, Ishikawa T, et al. Electrocardiographic differentiation between acute pulmonary embolism and acute coronary syndromes on the basis of negative T waves. *Am J Cardiol.* 2007;99(6):817‑821. https://doi.org/10.1016/j.amjcard.2006.10.043
77. Littmann L, Gibbs MA. Electrocardiographic manifestations of severe hyperkalemia. *J Electrocardiol.* 2018;51(5):814‑817. https://doi.org/10.1016/j.jelectrocard.2018.06.018
78. Armstrong EJ, Kulkarni AR, Bhave PD, et al. Electrocardiographic criteria for ST‑elevation myocardial infarction in patients with left ventricular hypertrophy. *Am J Cardiol.* 2012;110(7):977‑983. https://doi.org/10.1016/j.amjcard.2012.05.032
79. Priori SG, Wilde AA, Horie M, et al. HRS/EHRA/APHRS expert consensus statement on the diagnosis and management of patients with inherited primary arrhythmia syndromes. *Heart Rhythm.* 2013;10(12):1932‑1963. https://doi.org/10.1016/j.hrthm.2013.05.014
80. Macfarlane PW, Antzelevitch C, Haissaguerre M, et al. The early repolarization pattern: a consensus paper. *J Am Coll Cardiol.* 2015;66(4):470‑477. https://doi.org/10.1016/j.jacc.2015.05.033
81. Sharma S, Drezner JA, Baggish A, et al. International recommendations for electrocardiographic interpretation in athletes. *Eur Heart J.* 2018;39(16):1466‑1480. https://doi.org/10.1093/eurheartj/ehw631
82. Baldi E, Schnaubelt S, Caputo ML, et al. Association of timing of electrocardiogram acquisition after return of spontaneous circulation with spontaneous circulation with false‑positive ST‑elevation myocardial infarction diagnoses. *JAMA Netw Open.* 2021;4(1):e2032875. https://doi.org/10.1001/jamanetworkopen.2020.32875
83. Bayés de Luna A, Wagner G, Birnbaum Y, et al. A new terminology for left ventricular walls and location of myocardial infarcts that present Q wave based on the standard of cardiac magnetic resonance imaging. *Circulation.* 2006;114(16):1755‑1760. https://doi.org/10.1161/CIRCULATIONAHA.106.624924
84. Fiol M, Cygankiewicz I, Carrillo A, et al. Value of electrocardiographic algorithm based on "ups and downs" of ST in assessment of a culprit artery in evolving inferior wall acute myocardial infarction. *Am J Cardiol.* 2004;94(6):709‑714. https://doi.org/10.1016/j.amjcard.2004.06.002
85. Rautaharju PM, Surawicz B, Gettes LS. AHA/ACCF/HRS recommendations for the standardization and interpretation of the electrocardiogram: part IV: the ST segment, T and U waves, and the QT interval. *Circulation.* 2009;119(10):e241‑e250. https://doi.org/10.1161/CIRCULATIONAHA.108.191096
86. Macfarlane PW, van Oosterom A, Pahlm O, Kligfield P, Janse M, Camm J (eds). *Comprehensive Electrocardiology.* 2nd ed. Springer; 2010. https://doi.org/10.1007/978-1-84882-046-3
87. Wagner P, Strodthoff N, Bousseljot RD, et al. PTB‑XL, a large publicly available electrocardiography dataset. *Sci Data.* 2020;7:154. https://doi.org/10.1038/s41597-020-0495-6 ; PTB‑XL+ (features): https://physionet.org/content/ptb-xl-plus/
88. Brady WJ, Syverud SA, Beagle C, et al. Electrocardiographic ST‑segment elevation: the diagnosis of acute myocardial infarction by morphologic analysis of the ST segment. *Acad Emerg Med.* 2001;8(10):961‑967. https://doi.org/10.1111/j.1553-2712.2001.tb01092.x
89. McSharry PE, Clifford GD, Tarassenko L, Smith LA. A dynamical model for generating synthetic electrocardiogram signals. *IEEE Trans Biomed Eng.* 2003;50(3):289‑294. https://doi.org/10.1109/TBME.2003.808805
90. ECGSYN – a realistic ECG waveform generator. PhysioNet. https://physionet.org/content/ecgsyn/
91. Sameni R, Clifford GD, Jutten C, Shamsollahi MB. Multichannel ECG and noise modeling: application to maternal and fetal ECG signals. *EURASIP J Adv Signal Process.* 2007;2007:043407. https://doi.org/10.1155/2007/43407
92. Clifford GD, Nemati S, Sameni R. An artificial vector model for generating abnormal electrocardiographic rhythms. *Physiol Meas.* 2010;31(5):595‑609. https://doi.org/10.1088/0967-3334/31/5/001
93. Dower GE, Machado HB, Osborne JA. On deriving the electrocardiogram from vectorcardiographic leads. *Clin Cardiol.* 1980;3(2):87‑95. https://doi.org/10.1002/clc.1980.3.2.87
94. van Oosterom A, Oostendorp TF. ECGSIM: an interactive tool for studying the genesis of QRST waveforms. *Heart.* 2004;90(2):165‑168. https://doi.org/10.1136/hrt.2003.014662 ; https://www.ecgsim.org
95. Loewe A, Schulze WHW, Jiang Y, et al. ECG‑based detection of early myocardial ischemia in a computational model: impact of additional electrodes, optimal placement, and a new feature for ST deviation. *Biomed Res Int.* 2015;2015:530352. https://doi.org/10.1155/2015/530352
96. Martínez JP, Pahlm O, Ringborn M, Warren S, Laguna P, Sörnmo L. The STAFF III database: ECGs recorded during acutely induced myocardial ischemia. *Comput Cardiol.* 2017;44. https://doi.org/10.22489/CinC.2017.266-133 ; https://physionet.org/content/staffiii/
97. Ribeiro AH, Ribeiro MH, Paixão GMM, et al. Automatic diagnosis of the 12‑lead ECG using a deep neural network. *Nat Commun.* 2020;11:1760. https://doi.org/10.1038/s41467-020-15432-4
98. Rudiger A, Hellermann JP, Mukherjee R, Follath F, Turina J. Electrocardiographic artifacts due to electrode misplacement and their frequency in different clinical settings. *Am J Emerg Med.* 2007;25(2):174‑178. https://doi.org/10.1016/j.ajem.2006.06.018
99. Buendía‑Fuentes F, Arnau‑Vives MA, Arnau‑Vives A, et al. High‑bandpass filters in electrocardiography: source of error in the interpretation of the ST segment. *ISRN Cardiol.* 2012;2012:706217. https://doi.org/10.5402/2012/706217
100. Al‑Zaiti SS, Martin‑Gill C, Zègre‑Hemsey JK, et al. Machine learning for ECG diagnosis and risk stratification of occlusion myocardial infarction. *Nat Med.* 2023;29(7):1804‑1813. https://doi.org/10.1038/s41591-023-02396-3
101. Al‑Zaiti S, Besomi L, Bouzid Z, et al. Machine learning‑based prediction of acute coronary syndrome using only the pre‑hospital 12‑lead electrocardiogram. *Nat Commun.* 2020;11:3966. https://doi.org/10.1038/s41467-020-17804-2
102. Cook DA, Oh SY, Pusic MV. Accuracy of physicians' electrocardiogram interpretations: a systematic review and meta‑analysis. *JAMA Intern Med.* 2020;180(11):1461‑1471. https://doi.org/10.1001/jamainternmed.2020.3989
103. Fent G, Gosai J, Purva M. Teaching the interpretation of electrocardiograms: which method is best? *J Electrocardiol.* 2015;48(2):190‑193. https://doi.org/10.1016/j.jelectrocard.2014.12.014
104. Raitt MH, Maynard C, Wagner GS, Cerqueira MD, Selvester RH, Weaver WD. Appearance of abnormal Q waves early in the course of acute myocardial infarction: implications for efficacy of thrombolytic therapy. *J Am Coll Cardiol.* 1995;25(5):1084‑1088. https://doi.org/10.1016/0735-1097(94)00534-4
105. Reimer KA, Jennings RB. The "wavefront phenomenon" of myocardial ischemic cell death. II. Transmural progression of necrosis within the framework of ischemic bed size (myocardium at risk) and collateral flow. *Lab Invest.* 1979;40(6):633‑644. PMID: 449273.
106. Kligfield P, Gettes LS, Bailey JJ, et al. Recommendations for the standardization and interpretation of the electrocardiogram: part I: the electrocardiogram and its technology. *Circulation.* 2007;115(10):1306‑1324. https://doi.org/10.1161/CIRCULATIONAHA.106.180200

**Nota sobre verificación.** Las referencias 3, 5, 7, 9, 13, 23, 41, 43 y 64 fueron verificadas en línea durante la elaboración (DOI y datos de resultados). El resto corresponde a literatura consolidada citada de memoria bibliográfica; se recomienda comprobar paginación exacta antes de su uso formal. Las entradas 8, 32, 42 y 68 son fuentes no revisadas por pares (blogs académicos / material del fabricante) y se incluyen por su influencia en el paradigma OMI, no como evidencia de primer nivel.
