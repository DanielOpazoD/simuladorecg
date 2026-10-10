/**
 * Teaching content of the OMI families (A3): a case sheet per pattern, expert notes
 * and the support behind them. Own wording: the concepts and structure follow
 * ECGsmith (Daniel Opazo's adaptation of Dr. Smith's ECG Blog, CC BY-NC 4.0), whose
 * chapters are linked, not copied. Every reference was checked in PubMed (authors,
 * journal, volume, pages and DOI) on 2026-10-10.
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
  aslanger2020: { level: "estudio", cite: "Aslanger E, Yıldırımtürk Ö, Şimşek B, et al. A new electrocardiographic pattern indicating inferior myocardial infarction. J Electrocardiol 2020;61:41–46.", url: doi("10.1016/j.jelectrocard.2020.04.008") },
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
    ecg: "Elevación del ST de V2 a V4, que se extiende a I y aVL cuando la oclusión es proximal, con descenso recíproco en II, III y aVF.",
    interpretation: "OMI anterior por oclusión de la DA. La reciprocidad inferior separa la oclusión de la repolarización precoz y de la pericarditis.",
    lesson: "En V2–V4 mira la proporción entre la T y el QRS y busca el espejo inferior, no solo los milímetros.",
    notes: [
      { kind: "Perla", text: "Si además del ST de V2–V4 se elevan I y aVL, la oclusión suele estar antes de la primera diagonal." },
      { kind: "Trampa", text: "Confundirla con repolarización precoz. La reciprocidad y la fórmula de 4 variables ayudan a separarlas." },
      { kind: "Consejo", text: "Activa «ECG previo» y «Solo el cambio»: lo que cambia respecto del basal del mismo paciente es la lesión." },
    ],
    refs: ["omi2021", "mclaren2024", "formula2017", "acc2025", "esc2023", "staff3"],
    chapter: { slug: "03-oclusion-da", title: "Oclusión de la descendente anterior" },
  },
  inferior: {
    context: "La coronaria derecha irriga la pared inferior en la mayoría de las personas y, en su tramo proximal, el ventrículo derecho.",
    ecg: "ST elevado en II, III y aVF, mayor en III que en II, con descenso recíproco en aVL e I.",
    interpretation: "OMI inferior por oclusión de la CD: la lesión apunta hacia abajo y a la derecha, hacia III.",
    lesson: "III > II con descenso en aVL orienta a la coronaria derecha; II ≥ III con I positiva, a la circunfleja.",
    notes: [
      { kind: "Perla", text: "El descenso del ST o la T negativa en aVL pueden aparecer antes que la elevación inferior." },
      { kind: "Trampa", text: "Una elevación inferior sin espejo en aVL obliga a considerar pericarditis o repolarización precoz." },
      { kind: "Consejo", text: "Ante un OMI inferior, busca el ventrículo derecho (ST elevado en V1) y la pared posterior (descenso en V1–V3)." },
    ],
    refs: ["omi2021", "tenSteps2021", "ricci2025", "acc2025", "staff3"],
    chapter: { slug: "09-omi-inferior-posterior", title: "OMI inferior, posterior y de VD" },
  },
  inferior_lcx: {
    context: "La circunfleja irriga la pared lateral y, en personas con dominancia izquierda, también la inferior y la posterior. Sus oclusiones son las que más a menudo no cumplen criterios STEMI.",
    ecg: "ST elevado en II, III y aVF con II ≥ III, I positiva, elevación en V5–V6 y descenso en V1–V3.",
    interpretation: "OMI inferolateral por oclusión de la Cx. El descenso en V1–V3 es el espejo de la pared posterior.",
    lesson: "Un descenso del ST máximo en V1–V3 con T positiva no es isquemia subendocárdica anterior: es el espejo de un OMI posterior.",
    notes: [
      { kind: "Perla", text: "Las derivaciones V7–V9 muestran de frente la elevación posterior que V1–V3 ven en espejo." },
      { kind: "Trampa", text: "Etiquetar el caso como SCASEST por el descenso en V1–V3 y retrasar la reperfusión." },
      { kind: "Consejo", text: "Con «Punto J y ST», el azul de V1–V3 y el rojo de V5–V6 son un mismo vector de lesión." },
    ],
    refs: ["omi2021", "omiFindings2021", "ricci2025", "acc2025", "staff3"],
    chapter: { slug: "09-omi-inferior-posterior", title: "OMI inferior, posterior y de VD" },
  },
  rv_infarct: {
    context: "La coronaria derecha proximal irriga el ventrículo derecho. Su compromiso acompaña a un OMI inferior.",
    ecg: "OMI inferior con ST elevado en V1 (y en V4R, si se registra).",
    interpretation: "Infarto del ventrículo derecho por oclusión proximal de la CD.",
    lesson: "Un ST elevado en V1 junto a un OMI inferior sugiere ventrículo derecho; V4R lo confirma.",
    notes: [
      { kind: "Perla", text: "En el infarto del VD el gasto depende de la precarga: los vasodilatadores pueden provocar hipotensión." },
      { kind: "Trampa", text: "Leer la elevación de V1–V2 como un OMI anterior asociado." },
      { kind: "Consejo", text: "Registra V4R en todo OMI inferior." },
    ],
    refs: ["acc2025", "esc2023", "ricci2025"],
    chapter: { slug: "09-omi-inferior-posterior", title: "OMI inferior, posterior y de VD" },
  },
  lateral: {
    context: "La pared lateral alta depende de la primera diagonal o de ramas de la circunfleja.",
    ecg: "ST elevado en I y aVL, a veces en V2 o V5–V6, con descenso recíproco en III.",
    interpretation: "OMI lateral alto por oclusión de la diagonal o de la circunfleja.",
    lesson: "I y aVL tienen poco voltaje: una elevación pequeña con espejo en III ya es significativa.",
    notes: [
      { kind: "Perla", text: "El descenso del ST en III puede preceder a la elevación lateral." },
      { kind: "Trampa", text: "Descartarlo porque la elevación en aVL no llega a 1 mm." },
      { kind: "Consejo", text: "Compara aVL con III: si van en espejo, mira la pared lateral." },
    ],
    refs: ["ricci2025", "tenSteps2021"],
    chapter: { slug: "03-oclusion-da", title: "Oclusión de la descendente anterior" },
  },
  de_winter: {
    context: "Forma poco frecuente de oclusión proximal de la DA que no eleva el ST.",
    ecg: "Descenso del ST ascendente desde el punto J en las precordiales, con T altas y simétricas; a veces leve elevación en aVR.",
    interpretation: "Equivalente de STEMI: oclusión proximal de la DA sin elevación del ST.",
    lesson: "Un ST descendido con T grandes y simétricas en precordiales no es isquemia subendocárdica benigna.",
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
    ecg: "Descenso del ST máximo en V1–V3 (o V4) con T positivas y R alta en V2; elevación en V7–V9.",
    interpretation: "OMI posterior: el espejo anterior de una elevación posterior.",
    lesson: "Invierte mentalmente V1–V3: el descenso se vuelve elevación.",
    notes: [
      { kind: "Perla", text: "Un descenso máximo en V1–V4 sugiere oclusión; el de la isquemia subendocárdica suele ser máximo en V4–V6." },
      { kind: "Trampa", text: "Etiquetarlo como SCASEST y retrasar la reperfusión." },
      { kind: "Consejo", text: "Registra V7–V9 cuando el descenso predomina en V1–V3." },
    ],
    refs: ["omiFindings2021", "ricci2025", "tenSteps2021"],
    chapter: { slug: "09-omi-inferior-posterior", title: "OMI inferior, posterior y de VD" },
  },
  diffuse: {
    context: "Isquemia subendocárdica extensa por lesión del tronco, enfermedad de tres vasos o un desequilibrio entre aporte y demanda (shock, anemia, taquicardia).",
    ecg: "Descenso difuso del ST, máximo en V4–V6 e II, con elevación en aVR (y a veces en V1).",
    interpretation: "Isquemia subendocárdica difusa. La elevación en aVR es el espejo de ese descenso, no una lesión propia de aVR.",
    lesson: "No es un equivalente seguro de STEMI: la clínica decide si es tronco, tres vasos o demanda.",
    notes: [
      { kind: "Perla", text: "El vector del ST apunta hacia aVR: por eso aVR se eleva y casi todas las demás bajan." },
      { kind: "Trampa", text: "Activar cateterismo urgente solo por aVR, sin contexto clínico." },
      { kind: "Consejo", text: "Busca la causa de demanda (taquicardia, hipotensión, anemia) antes de atribuirlo al tronco." },
    ],
    refs: ["ricci2025", "esc2023", "tenSteps2021"],
    chapter: { slug: "10-avr-lmca", title: "Patrón aVR, tronco y tres vasos" },
  },
  sgarbossa: {
    context: "Con bloqueo de rama izquierda la repolarización es secundaria y discordante: el ST elevado es la regla, no la excepción.",
    ecg: "ST concordante con el QRS de al menos 1 mm, descenso concordante en V1–V3, o ST discordante desproporcionado (razón ST/S ≤ −0,25 en la versión de Smith).",
    interpretation: "OMI con BRI: criterios de Sgarbossa modificados positivos.",
    lesson: "Con BRI la pregunta no es si el ST está elevado, sino si es proporcional al QRS.",
    notes: [
      { kind: "Perla", text: "La regla modificada cambia el umbral fijo de 5 mm por la proporción ST/S, y gana sensibilidad." },
      { kind: "Trampa", text: "Un BRI por sí solo no diagnostica oclusión: hay que aplicar los criterios." },
      { kind: "Consejo", text: "Mide la razón ST/S en las derivaciones con S profunda (V1–V3)." },
    ],
    refs: ["sgarbossa1996", "smithSgarbossa2015", "ricci2025"],
    chapter: { slug: "05-bri-sgarbossa", title: "OMI con bloqueo de rama izquierda" },
  },
  subendo: {
    context: "Isquemia sin oclusión: desequilibrio entre aporte y demanda o estenosis que no cierra la arteria.",
    ecg: "Descenso del ST horizontal o descendente, máximo en V4–V6, sin elevación localizada; puede haber T negativas.",
    interpretation: "NOMI: SCASEST sin oclusión.",
    lesson: "Mira dónde es máximo el descenso: en V4–V6 sugiere subendocárdica; en V1–V3, un posible OMI posterior.",
    notes: [
      { kind: "Perla", text: "La isquemia subendocárdica no localiza la arteria: el descenso no tiene territorio." },
      { kind: "Trampa", text: "Un descenso localizado puede ser el espejo de una elevación que no se ve; busca la pared opuesta." },
      { kind: "Consejo", text: "Repite el ECG con el dolor: un cambio dinámico pesa más que un umbral." },
    ],
    refs: ["omi2021", "esc2023", "ricci2025"],
    chapter: { slug: "10-avr-lmca", title: "Patrón aVR, tronco y tres vasos" },
  },
  wellens_a: {
    context: "Fase de reperfusión tras una oclusión transitoria de la DA proximal. El ECG suele registrarse cuando ya no hay dolor.",
    ecg: "T bifásicas, primero positivas y luego negativas, en V2–V3; sin ondas Q y con la R conservada.",
    interpretation: "Wellens tipo A: DA críticamente estenosada que se reperfundió. Alto riesgo de reoclusión.",
    lesson: "La T anormal sin dolor no es benigna: es la huella de una oclusión reciente.",
    notes: [
      { kind: "Perla", text: "Si vuelve el dolor, la T puede volverse positiva otra vez (pseudonormalización): es reoclusión." },
      { kind: "Trampa", text: "Indicar una prueba de esfuerzo: está desaconsejada en este patrón." },
      { kind: "Consejo", text: "Compara con el ECG del episodio de dolor, si existe." },
    ],
    refs: ["wellens1982", "ricci2025"],
    chapter: { slug: "04-wellens", title: "Síndrome de Wellens" },
  },
  wellens_b: {
    context: "Fase de reperfusión tras una oclusión transitoria de la DA proximal, más avanzada que el tipo A.",
    ecg: "T negativas profundas y simétricas en V2–V3, a veces de V1 a V6; sin ondas Q y con la R conservada.",
    interpretation: "Wellens tipo B: DA críticamente estenosada que se reperfundió. Alto riesgo de reoclusión.",
    lesson: "Las T profundas y simétricas sin Q en un paciente que tuvo dolor son reperfusión, no un hallazgo crónico.",
    notes: [
      { kind: "Perla", text: "Los tipos A y B pueden ser etapas sucesivas de la misma reperfusión." },
      { kind: "Trampa", text: "Atribuir las T a una miocardiopatía o a un efecto de memoria sin descartar la DA." },
      { kind: "Consejo", text: "Si reaparece el dolor, repite el ECG: la T puede pseudonormalizarse." },
    ],
    refs: ["wellens1982", "ricci2025"],
    chapter: { slug: "04-wellens", title: "Síndrome de Wellens" },
  },
  old_inferior: {
    context: "Infarto inferior establecido: necrosis con ondas Q y repolarización residual.",
    ecg: "Q patológicas en III y aVF, ST sin elevación aguda, T inferior aplanada o negativa.",
    interpretation: "Infarto inferior antiguo (aprendido de pacientes de PTB-XL). El ECG no fecha el infarto.",
    lesson: "Q sin ST elevado ni T hiperaguda orienta a un infarto antiguo; si el ST sigue elevado semanas después, piensa en aneurisma.",
    notes: [
      { kind: "Perla", text: "Una Q aislada en III puede ser normal; cuenta si se repite en aVF y es ancha." },
      { kind: "Trampa", text: "Leer las Q como un infarto agudo y activar cateterismo." },
      { kind: "Consejo", text: "Compara con un ECG previo: si las Q ya estaban, el cambio agudo no es ese." },
    ],
    refs: ["esc2023", "mclaren2024"],
    chapter: { slug: "11-stemi-mimics", title: "STEMI mimics" },
  },
  old_anterior: {
    context: "Infarto anteroseptal establecido: necrosis con ondas Q y repolarización residual.",
    ecg: "Q o QS en V1–V3, pérdida de R anterior, ST sin elevación aguda.",
    interpretation: "Infarto anteroseptal antiguo (aprendido de pacientes de PTB-XL). El ECG no fecha el infarto.",
    lesson: "Q anteriores sin T hiperaguda orientan a infarto antiguo; el ST elevado persistente sugiere aneurisma.",
    notes: [
      { kind: "Perla", text: "En el aneurisma la elevación persiste, con T relativamente pequeña respecto del QRS." },
      { kind: "Trampa", text: "Confundir un QS antiguo con un OMI anterior en curso." },
      { kind: "Consejo", text: "Mira la T: hiperaguda en el agudo, pequeña o negativa en el antiguo." },
    ],
    refs: ["esc2023", "mclaren2024"],
    chapter: { slug: "11-stemi-mimics", title: "STEMI mimics" },
  },
  pericarditis: {
    context: "Inflamación del pericardio, frecuente en personas jóvenes: uno de los imitadores de OMI más comunes.",
    ecg: "ST elevado cóncavo y difuso, más marcado en II y V5–V6; PR descendido, con PR elevado y ST descendido en aVR.",
    interpretation: "Imitador: elevación difusa sin territorio coronario ni espejo (salvo en aVR y V1).",
    lesson: "La reciprocidad fuera de aVR y V1 aleja la pericarditis y acerca la oclusión.",
    notes: [
      { kind: "Perla", text: "El descenso del PR, más visible en II, es una pista de pericarditis." },
      { kind: "Trampa", text: "Un ST con III > II o con descenso en aVL apunta a un OMI inferior, no a pericarditis." },
      { kind: "Consejo", text: "Activa «Punto J y ST»: en la pericarditis casi todo es rojo y el azul queda en aVR." },
    ],
    refs: ["ricci2025", "tenSteps2021"],
    chapter: { slug: "11-stemi-mimics", title: "STEMI mimics" },
  },
};

export const chapterUrl = (slug: string) => `${ECGSMITH}/${slug}`;
