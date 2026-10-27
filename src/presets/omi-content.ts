/**
 * Teaching content of the OMI families (A3): a case sheet per pattern, expert notes
 * and the support behind them. Own wording: the concepts and structure follow
 * ECGsmith (Daniel Opazo's adaptation of Dr. Smith's ECG Blog, CC BY-NC 4.0), whose
 * chapters are linked, not copied. Initial bibliography checked on 2026-10-10;
 * primary sources for inference limits added and checked on 2026-10-26.
 * Sheets describe teaching scenarios, not diagnoses inferred from an edited ECG.
 */
export type RefLevel = "guía" | "estudio" | "revisión" | "docente" | "datos";
export interface Reference { cite: string; url: string; level: RefLevel }

const doi = (d: string) => `https://doi.org/${d}`;
export const REFERENCES = {
  acc2025: { level: "guía", cite: "Rao SV, O'Donoghue ML, Ruel M, et al. 2025 ACC/AHA/ACEP/NAEMSP/SCAI Guideline for the Management of Patients With Acute Coronary Syndromes. Circulation 2025;151:e771–e862.", url: doi("10.1161/CIR.0000000000001309") },
  esc2023: { level: "guía", cite: "Byrne RA, Rossello X, Coughlan JJ, et al. 2023 ESC Guidelines for the management of acute coronary syndromes. Eur Heart J 2023;44:3720–3826.", url: doi("10.1093/eurheartj/ehad191") },
  omi2021: { level: "estudio", cite: "Meyers HP, Bracey A, Lee D, et al. Comparison of the STEMI vs. NSTEMI and OMI vs. NOMI paradigms of acute MI. J Emerg Med 2021;60:273–284.", url: doi("10.1016/j.jemermed.2020.10.026") },
  omiFindings2021: { level: "estudio", cite: "Pendell Meyers H, Bracey A, Lee D, et al. Accuracy of OMI ECG findings versus STEMI criteria for diagnosis of acute coronary occlusion myocardial infarction. IJC Heart Vasc 2021;33:100767.", url: doi("10.1016/j.ijcha.2021.100767") },
  difoccult: { level: "estudio", cite: "Aslanger EK, Yıldırımtürk Ö, Şimşek B, et al. DIagnostic accuracy oF electrocardiogram for acute coronary OCClUsion resuLTing in myocardial infarction (DIFOCCULT Study). IJC Heart Vasc 2020;30:100603.", url: doi("10.1016/j.ijcha.2020.100603") },
  mclaren2024: { level: "revisión", cite: "McLaren J, de Alencar JN, Aslanger EK, et al. From ST-segment elevation MI to occlusion MI: the new paradigm shift in acute myocardial infarction. JACC Adv 2024;3:101314.", url: doi("10.1016/j.jacadv.2024.101314") },
  ricci2025: { level: "revisión", cite: "Ricci F, Martini C, Scordo DM, et al. ECG patterns of occlusion myocardial infarction: a narrative review. Ann Emerg Med 2025;85:330–340.", url: doi("10.1016/j.annemergmed.2024.11.019") },
  tenSteps2021: { level: "revisión", cite: "Aslanger EK, Meyers HP, Smith SW. Recognizing electrocardiographically subtle occlusion myocardial infarction and differentiating it from mimics: ten steps to or away from cath lab. Turk Kardiyol Dern Ars 2021;49:488–500.", url: doi("10.5543/tkda.2021.21026") },
  deWinter2008: { level: "estudio", cite: "de Winter RJ, Verouden NJ, Wellens HJ, et al. A new ECG sign of proximal LAD occlusion. N Engl J Med 2008;359:2071–2073.", url: doi("10.1056/NEJMc0804737") },
  wellens1982: { level: "estudio", cite: "de Zwaan C, Bär FW, Wellens HJ. Characteristic electrocardiographic pattern indicating a critical stenosis high in left anterior descending coronary artery in patients admitted because of impending myocardial infarction. Am Heart J 1982;103:730–736.", url: doi("10.1016/0002-8703(82)90480-x") },
  sgarbossa1996: { level: "estudio", cite: "Sgarbossa EB, Pinski SL, Barbagelata A, et al. Electrocardiographic diagnosis of evolving acute myocardial infarction in the presence of left bundle-branch block. N Engl J Med 1996;334:481–487.", url: doi("10.1056/NEJM199602223340801") },
  smithSgarbossa2015: { level: "estudio", cite: "Meyers HP, Limkakeng AT Jr, Jaffa EJ, et al. Validation of the modified Sgarbossa criteria for acute coronary occlusion in the setting of left bundle branch block. Am Heart J 2015;170:1255–1264.", url: doi("10.1016/j.ahj.2015.09.005") },
  posterior2021: { level: "estudio", cite: "Meyers HP, Bracey A, Lee D, et al. Ischemic ST-Segment Depression Maximal in V1–V4 (Versus V5–V6) of Any Amplitude Is Specific for Occlusion Myocardial Infarction (Versus Nonocclusive Ischemia). J Am Heart Assoc 2021;10:e022866. Estudio retrospectivo en una población de alto riesgo; no establece certeza en cualquier ECG.", url: doi("10.1161/JAHA.121.022866") },
  avr2013: { level: "estudio", cite: "Knotts RJ, Wilson JM, Kim E, et al. Diffuse ST depression with ST elevation in aVR: Is this pattern specific for global ischemia due to left main coronary artery disease? J Electrocardiol 2013;46:240–248. Serie observacional con angiografía en parte de la cohorte.", url: doi("10.1016/j.jelectrocard.2012.12.016") },
  avl2016: { level: "estudio", cite: "Bischof JE, Worrall C, Thompson P, et al. ST depression in lead aVL differentiates inferior ST-elevation myocardial infarction from pericarditis. Am J Emerg Med 2016;34:149–154. Cohortes retrospectivas; una asociación discriminativa no es una regla sin excepciones.", url: doi("10.1016/j.ajem.2015.09.035") },
  udmi2018: { level: "guía", cite: "Thygesen K, Alpert JS, Jaffe AS, et al. Fourth Universal Definition of Myocardial Infarction (2018). Circulation 2018;138:e618–e651. Referencia histórica de los criterios implementados; no se presenta como la definición más reciente.", url: doi("10.1161/CIR.0000000000000617") },
  formula2017: { level: "estudio", cite: "Driver BE, Khalil A, Henry T, et al. A new 4-variable formula to differentiate normal variant ST segment elevation in V2–V4 (early repolarization) from subtle left anterior descending coronary occlusion. J Electrocardiol 2017;50:561–569.", url: doi("10.1016/j.jelectrocard.2017.04.005") },
  staff3: { level: "datos", cite: "STAFF III Database (PhysioNet, ODC-By 1.0): ECG de 12 derivaciones durante angioplastia con balón. Fuente del cambio del ST aprendido en ECG Lab.", url: "https://physionet.org/content/staffiii/1.0.0/" },
} as const satisfies Record<string, Reference>;
export type RefId = keyof typeof REFERENCES;

const ECGSMITH = "https://github.com/DanielOpazoD/ECGsmith/tree/main/src/cap";
export interface OmiSheet {
  context: string;
  ecg: string;
  interpretation: string;
  lesson: string;
  notes: { kind: "Perla" | "Trampa" | "Consejo"; text: string }[];
  refs: RefId[];
  /** ECGsmith chapter (repository path) for the full lesson. */
  chapter: { slug: string; title: string };
}

export const OMI_SHEETS: Readonly<Record<string, OmiSheet>> = {
  anterior: {
    context: "Dolor torácico de inicio reciente. La descendente anterior irriga la pared anterior y el septo; su oclusión proximal compromete mucho miocardio.",
    ecg: "En este ejemplo, elevación del ST de V2 a V4 y en I y aVL, con descenso recíproco inferior.",
    interpretation: "Escenario simulado de OMI anterior por oclusión de la DA. En un paciente, la distribución y la reciprocidad apoyan la sospecha de oclusión; el ECG no determina por sí solo su segmento exacto.",
    lesson: "En V2–V4 mira la proporción entre la T y el QRS y busca el espejo inferior, no solo los milímetros.",
    notes: [
      { kind: "Perla", text: "La elevación en I y aVL junto a V2–V4 puede orientar a afectación anterior y lateral alta; la anatomía coronaria varía." },
      { kind: "Trampa", text: "Usar una sola pista para descartar oclusión. La fórmula de 4 variables tiene un contexto de aplicación específico: repolarización precoz frente a oclusión anterior sutil." },
      { kind: "Consejo", text: "Activa «ECG previo» y «Solo el cambio» para observar la diferencia generada por la lesión en este escenario." },
    ],
    refs: ["omi2021", "mclaren2024", "formula2017", "acc2025", "esc2023", "staff3"],
    chapter: { slug: "03-oclusion-da", title: "Oclusión de la descendente anterior" },
  },
  inferior: {
    context: "La coronaria derecha irriga la pared inferior en la mayoría de las personas y, en su tramo proximal, el ventrículo derecho.",
    ecg: "ST elevado en II, III y aVF, mayor en III que en II, con descenso recíproco en aVL e I.",
    interpretation: "Escenario simulado de OMI inferior por oclusión de la CD. En un paciente, III > II con descenso recíproco favorece esa arteria, sin identificarla con certeza.",
    lesson: "III > II con descenso en aVL orienta a la coronaria derecha; II ≥ III con ST positivo en I, a la circunfleja. Son pistas probabilísticas.",
    notes: [
      { kind: "Perla", text: "El descenso del ST o la T negativa en aVL pueden aparecer antes que la elevación inferior." },
      { kind: "Trampa", text: "La ausencia de descenso en aVL no excluye oclusión inferior. Considera imitadores sin convertir la reciprocidad en un requisito universal." },
      { kind: "Consejo", text: "Ante un OMI inferior, busca el ventrículo derecho (ST elevado en V1) y la pared posterior (descenso en V1–V3)." },
    ],
    refs: ["omi2021", "tenSteps2021", "ricci2025", "acc2025", "staff3", "avl2016"],
    chapter: { slug: "09-omi-inferior-posterior", title: "OMI inferior, posterior y de VD" },
  },
  inferior_lcx: {
    context: "La circunfleja irriga la pared lateral y, en personas con dominancia izquierda, también la inferior y la posterior. Sus oclusiones son las que más a menudo no cumplen criterios STEMI.",
    ecg: "En este ejemplo la pared inferior apenas cambia (II ≥ III en el punto J, ambos bajo 0,5 mm): domina el patrón posterolateral, con ST elevado en V5–V6 y descenso marcado en V1–V4 con T negativas.",
    interpretation: "Escenario simulado de OMI posterolateral por oclusión de la Cx, sin criterios STEMI inferiores. En un paciente, la distribución apoya la sospecha posterior, sin identificar por sí sola la arteria.",
    lesson: "Con síntomas isquémicos, el descenso máximo en V1–V4 hace sospechar OMI posterior. Valora también alteraciones secundarias del QRS–ST–T y cambios seriados.",
    notes: [
      { kind: "Perla", text: "V7–V9, no registradas en este simulador, pueden aportar evidencia de lesión posterior. Un resultado negativo no excluye oclusión." },
      { kind: "Trampa", text: "Etiquetar el caso como SCASEST por el descenso en V1–V3 y retrasar la reperfusión." },
      { kind: "Consejo", text: "Con «Punto J y ST», el azul de V1–V3 y el rojo de V5–V6 son un mismo vector de lesión." },
    ],
    refs: ["omi2021", "omiFindings2021", "difoccult", "ricci2025", "acc2025", "staff3", "posterior2021"],
    chapter: { slug: "09-omi-inferior-posterior", title: "OMI inferior, posterior y de VD" },
  },
  rv_infarct: {
    context: "Una oclusión proximal de la coronaria derecha puede comprometer el ventrículo derecho y acompañarse de un OMI inferior.",
    ecg: "En este ejemplo, patrón inferior con ST elevado en V1. V4R no se registra en este simulador.",
    interpretation: "Escenario simulado de lesión del ventrículo derecho asociada a OMI inferior. En un paciente, V1 aporta una pista; no confirma por sí sola la localización.",
    lesson: "Un ST elevado en V1 junto a un OMI inferior sugiere afectación del ventrículo derecho. V4R puede aportar evidencia adicional, integrada con la clínica.",
    notes: [
      { kind: "Perla", text: "En el infarto del VD el gasto depende de la precarga: los vasodilatadores pueden provocar hipotensión." },
      { kind: "Trampa", text: "Leer la elevación de V1–V2 como un OMI anterior asociado." },
      { kind: "Consejo", text: "Ante un OMI inferior, registra V4R, sobre todo si V1 está elevada o hay hipotensión." },
    ],
    refs: ["acc2025", "esc2023", "ricci2025"],
    chapter: { slug: "09-omi-inferior-posterior", title: "OMI inferior, posterior y de VD" },
  },
  lateral: {
    context: "La pared lateral depende de la diagonal o de las ramas marginales de la circunfleja.",
    ecg: "ST elevado en I y aVL y en V3–V6, máximo en V4–V5, con descenso recíproco en III y V1.",
    interpretation: "Escenario simulado de OMI lateral. En un paciente, puede orientar a una diagonal o a una marginal; el patrón no distingue con certeza la arteria.",
    lesson: "Valora una elevación pequeña en I/aVL junto a su QRS, los cambios recíprocos y el contexto; un umbral aislado puede pasar por alto una oclusión.",
    notes: [
      { kind: "Perla", text: "El descenso del ST en III puede preceder a la elevación lateral." },
      { kind: "Trampa", text: "Descartarlo porque la elevación en aVL no llega a 1 mm." },
      { kind: "Consejo", text: "Compara aVL con III: si van en espejo, mira la pared lateral." },
    ],
    refs: ["ricci2025", "tenSteps2021"],
    chapter: { slug: "03-oclusion-da", title: "Oclusión de la descendente anterior" },
  },
  de_winter: {
    context: "Patrón de alto riesgo descrito en oclusiones de la DA que pueden no cumplir los criterios habituales de elevación del ST.",
    ecg: "Descenso del ST ascendente desde el punto J en las precordiales, con T altas y simétricas; a veces leve elevación en aVR.",
    interpretation: "Escenario simulado de patrón de Winter. Con síntomas isquémicos, hace sospechar oclusión y requiere evaluación urgente; no identifica por sí solo un segmento proximal de la DA.",
    lesson: "No restes importancia al descenso ascendente con T grandes y simétricas en un contexto isquémico por no alcanzar criterios STEMI.",
    notes: [
      { kind: "Perla", text: "El patrón puede persistir hasta la reperfusión o evolucionar a elevación del ST." },
      { kind: "Trampa", text: "Clasificarlo como SCASEST por la ausencia de elevación." },
      { kind: "Consejo", text: "Fíjate en la T: amplia y simétrica, desproporcionada al QRS." },
    ],
    refs: ["deWinter2008", "ricci2025", "tenSteps2021"],
    chapter: { slug: "03-oclusion-da", title: "Oclusión de la descendente anterior" },
  },
  posterior: {
    context: "La pared posterior (inferobasal) depende de la circunfleja o de una coronaria derecha dominante. Ninguna de las 12 derivaciones la mira de frente.",
    ecg: "Descenso horizontal del ST máximo en V2–V3, sin elevación en el resto; la T puede invertirse. V7–V9 no se registran en este simulador.",
    interpretation: "Escenario simulado de OMI posterior. En un paciente con síntomas isquémicos, este descenso hace sospechar lesión posterior, considerando también cambios secundarios de repolarización.",
    lesson: "Invierte mentalmente V1–V3: el descenso se vuelve elevación.",
    notes: [
      { kind: "Perla", text: "En contexto isquémico, un descenso máximo en V1–V4 orienta a OMI posterior; uno máximo en V4–V6 puede orientar a isquemia subendocárdica. La distribución no determina por sí sola el mecanismo." },
      { kind: "Trampa", text: "Etiquetarlo como SCASEST y retrasar la reperfusión." },
      { kind: "Consejo", text: "En la evaluación clínica, V7–V9 y ECG seriados pueden aportar evidencia adicional; unas posteriores negativas no excluyen oclusión." },
    ],
    refs: ["omiFindings2021", "difoccult", "ricci2025", "tenSteps2021", "posterior2021", "acc2025"],
    chapter: { slug: "09-omi-inferior-posterior", title: "OMI inferior, posterior y de VD" },
  },
  diffuse: {
    context: "Isquemia subendocárdica extensa por lesión del tronco, enfermedad de tres vasos o un desequilibrio entre aporte y demanda (shock, anemia, taquicardia).",
    ecg: "Descenso difuso del ST, máximo en V4–V6 e II, con elevación en aVR (y a veces en V1).",
    interpretation: "Escenario simulado de isquemia subendocárdica difusa. La elevación en aVR acompaña al descenso global; no diagnostica por sí sola enfermedad del tronco ni excluye oclusión.",
    lesson: "Es un patrón de riesgo que requiere contexto y evaluación urgente si hay isquemia persistente o inestabilidad. El ECG aislado no distingue tronco, enfermedad multivaso y desequilibrio aporte/demanda.",
    notes: [
      { kind: "Perla", text: "El vector del ST apunta hacia aVR: por eso aVR se eleva y casi todas las demás bajan." },
      { kind: "Trampa", text: "Interpretar aVR como diagnóstico de tronco, o como prueba de que no hay oclusión, puede llevar a decisiones erróneas." },
      { kind: "Consejo", text: "Evalúa síntomas, estabilidad, ECG seriados y causas de desequilibrio aporte/demanda sin retrasar la evaluación de un síndrome coronario de alto riesgo." },
    ],
    refs: ["ricci2025", "esc2023", "tenSteps2021", "avr2013", "acc2025"],
    chapter: { slug: "10-avr-lmca", title: "Patrón aVR, tronco y tres vasos" },
  },
  sgarbossa: {
    context: "Con bloqueo de rama izquierda la repolarización es secundaria y discordante: el ST elevado es la regla, no la excepción.",
    ecg: "Elevación del ST concordante con el QRS de al menos 1 mm, descenso concordante de al menos 1 mm en V1–V3, o elevación discordante desproporcionada (al menos 1 mm y razón ST/S ≤ −0,25 en la versión de Smith).",
    interpretation: "Escenario simulado de OMI con BRI. En contexto isquémico, los criterios modificados positivos apoyan la sospecha de oclusión; no son una certeza diagnóstica aislada.",
    lesson: "Con BRI la pregunta no es si el ST está elevado, sino si es proporcional al QRS.",
    notes: [
      { kind: "Perla", text: "La regla modificada cambia el umbral fijo de 5 mm por la proporción ST/S, y gana sensibilidad." },
      { kind: "Trampa", text: "Un BRI por sí solo no diagnostica oclusión y unos criterios negativos no la excluyen." },
      { kind: "Consejo", text: "Mide la razón ST/S en las derivaciones con S profunda (V1–V3)." },
    ],
    refs: ["sgarbossa1996", "smithSgarbossa2015", "ricci2025"],
    chapter: { slug: "05-bri-sgarbossa", title: "OMI con bloqueo de rama izquierda" },
  },
  subendo: {
    context: "Escenario docente de isquemia subendocárdica, compatible con desequilibrio aporte/demanda o enfermedad coronaria. La causa no se determina por la distribución del ST aislada.",
    ecg: "Descenso del ST horizontal o descendente, máximo en V4–V5 e II, con elevación especular en aVR y T negativas; sin elevación localizada.",
    interpretation: "Escenario simulado de isquemia subendocárdica. El ECG no demuestra ausencia de oclusión; una troponina elevada por sí sola tampoco establece infarto ni permite clasificarlo como NOMI.",
    lesson: "Mira dónde es máximo el descenso: en V4–V6 sugiere subendocárdica; en V1–V3, un posible OMI posterior.",
    notes: [
      { kind: "Perla", text: "El descenso subendocárdico no identifica de forma fiable una arteria culpable. Para interpretar troponina hacen falta su evolución y evidencia clínica de isquemia." },
      { kind: "Trampa", text: "Un descenso localizado puede ser el espejo de una elevación que no se ve; busca la pared opuesta." },
      { kind: "Consejo", text: "Repite el ECG con el dolor: un cambio dinámico pesa más que un umbral." },
    ],
    refs: ["omi2021", "esc2023", "ricci2025", "avr2013", "udmi2018"],
    chapter: { slug: "10-avr-lmca", title: "Patrón aVR, tronco y tres vasos" },
  },
  wellens_a: {
    context: "Escenario de reperfusión tras isquemia anterior. El síndrome de Wellens se interpreta con la historia de dolor, a menudo durante un intervalo sin síntomas.",
    ecg: "T bifásicas, primero positivas y luego negativas, en V2–V3; sin ondas Q y con la R conservada.",
    interpretation: "Escenario simulado de Wellens tipo A. En el contexto clínico apropiado, orienta a enfermedad de alto riesgo de la DA y exige evaluación urgente; las T bifásicas aisladas no demuestran su anatomía.",
    lesson: "Que el dolor haya cedido no elimina el riesgo de un patrón compatible con Wellens; interpreta la T junto a los síntomas y los ECG previos.",
    notes: [
      { kind: "Perla", text: "Si vuelve el dolor y la T se vuelve positiva (pseudonormalización), sospecha isquemia recurrente y posible reoclusión." },
      { kind: "Trampa", text: "Indicar una prueba de esfuerzo: está desaconsejada en este patrón." },
      { kind: "Consejo", text: "Compara con el ECG del episodio de dolor, si existe." },
    ],
    refs: ["wellens1982", "ricci2025"],
    chapter: { slug: "04-wellens", title: "Síndrome de Wellens" },
  },
  wellens_b: {
    context: "Escenario de repolarización anterior tras isquemia. La morfología tipo B no establece cuánto tiempo ha pasado ni exige una fase tipo A previa.",
    ecg: "T negativas profundas y simétricas en V2–V3, a veces de V1 a V6; sin ondas Q y con la R conservada.",
    interpretation: "Escenario simulado de Wellens tipo B. Con una historia compatible, las T profundas y simétricas orientan a un síndrome coronario de alto riesgo; no prueban por sí solas reperfusión ni una lesión proximal concreta.",
    lesson: "Valora síntomas previos, ECG seriados y otras causas de T negativas antes de atribuir el patrón a un mecanismo único.",
    notes: [
      { kind: "Perla", text: "Los tipos A y B pueden observarse sucesivamente, pero no constituyen un reloj ni una secuencia obligatoria." },
      { kind: "Trampa", text: "Atribuir las T a una miocardiopatía o a un efecto de memoria sin descartar la DA." },
      { kind: "Consejo", text: "Si reaparece el dolor, repite el ECG: la T puede pseudonormalizarse." },
    ],
    refs: ["wellens1982", "ricci2025"],
    chapter: { slug: "04-wellens", title: "Síndrome de Wellens" },
  },
  old_inferior: {
    context: "Infarto inferior establecido: necrosis con ondas Q y repolarización residual.",
    ecg: "Q patológicas en III y aVF, ST sin elevación aguda, T inferior aplanada o negativa.",
    interpretation: "Escenario simulado de infarto inferior antiguo con morfología aprendida de PTB-XL. El ECG no fecha el infarto ni excluye una lesión aguda superpuesta.",
    lesson: "Q sin ST elevado ni T hiperaguda orienta a un infarto antiguo; si el ST sigue elevado semanas después, piensa en aneurisma.",
    notes: [
      { kind: "Perla", text: "Una Q aislada en III puede ser normal; cuenta si se repite en aVF y es ancha." },
      { kind: "Trampa", text: "Leer las Q como un infarto agudo y activar cateterismo." },
      { kind: "Consejo", text: "Compara con un ECG previo: si las Q ya estaban, el cambio agudo no es ese." },
    ],
    refs: ["udmi2018", "esc2023"],
    chapter: { slug: "11-stemi-mimics", title: "STEMI mimics" },
  },
  old_anterior: {
    context: "Infarto anteroseptal establecido: necrosis con ondas Q y repolarización residual.",
    ecg: "Q profundas en V1–V3 con pérdida de R anterior; elevación leve y residual del ST, bajo el criterio de las guías, con T pequeñas o bifásicas en V3–V4.",
    interpretation: "Escenario simulado de infarto anteroseptal antiguo con elevación residual del ST y morfología aprendida de PTB-XL. El ECG no fecha el infarto ni excluye oclusión aguda superpuesta.",
    lesson: "Q anteriores con ST elevado y T pequeña respecto del QRS pueden orientar a infarto antiguo o aneurisma; compara con el basal y la clínica antes de descartar un cambio agudo.",
    notes: [
      { kind: "Perla", text: "En el aneurisma la elevación persiste, con T relativamente pequeña respecto del QRS." },
      { kind: "Trampa", text: "Confundir un QS antiguo con un OMI anterior en curso." },
      { kind: "Consejo", text: "Compara la T y el ST con ECG previos: su tamaño aislado no fecha la lesión." },
    ],
    refs: ["udmi2018", "mclaren2024"],
    chapter: { slug: "11-stemi-mimics", title: "STEMI mimics" },
  },
  pericarditis: {
    context: "Inflamación del pericardio, frecuente en personas jóvenes: uno de los imitadores de OMI más comunes.",
    ecg: "ST elevado cóncavo y difuso, más marcado en II y V5–V6; PR descendido, con PR elevado y ST descendido en aVR.",
    interpretation: "Escenario simulado de pericarditis con elevación difusa y descenso en aVR. En un paciente, esta distribución apoya la sospecha, sin excluir por sí sola un síndrome coronario.",
    lesson: "La reciprocidad fuera de aVR y V1 aleja la pericarditis y acerca la oclusión.",
    notes: [
      { kind: "Perla", text: "El descenso del PR, más visible en II, es una pista de pericarditis." },
      { kind: "Trampa", text: "El descenso en aVL junto a elevación inferior favorece oclusión frente a pericarditis; su ausencia no descarta oclusión y no es una regla sin excepciones." },
      { kind: "Consejo", text: "Activa «Punto J y ST»: en la pericarditis casi todo es rojo y el azul queda en aVR." },
    ],
    refs: ["ricci2025", "tenSteps2021", "avl2016"],
    chapter: { slug: "11-stemi-mimics", title: "STEMI mimics" },
  },
};

export const chapterUrl = (slug: string) => `${ECGSMITH}/${slug}`;
