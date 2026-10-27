export function keyboardHelpHtml() {
  const shortcuts = [
    ["M", "Monitor"],
    ["P", "Papel de 12 derivaciones"],
    ["R", "Tira de ritmo"],
    ["V", "Cambiar velocidad: 12,5 / 25 / 50 mm/s"],
    ["G", "Cambiar ganancia: 2,5 / 5 / 10 / 20 mm/mV"],
    ["C", "Activar o desactivar los calibres"],
    ["Espacio", "Congelar o reanudar el monitor"],
    ["Flechas", "Mover el extremo seleccionado del calibre"],
    ["Mayús + flechas", "Mover el calibre diez pasos"],
    ["?", "Abrir esta ayuda"],
  ];
  return `<div class="keyboard-help-content"><p class="dialog-lead">Los atajos solo funcionan con el foco en el ECG. Pulsa Tab hasta llegar al trazado o haz clic en él. No se activan al escribir en campos ni dentro de un diálogo.</p><ul class="about-list">${shortcuts.map(([key, action]) => `<li><kbd>${key}</kbd> — ${action}</li>`).join("")}</ul><p class="control-note">Con los calibres activos, elige el extremo en su panel antes de moverlo. Escape cierra el diálogo y devuelve el foco al control que lo abrió.</p></div>`;
}

/** Technical material lives together, folded until the reader asks for it. */
export function aboutDialogHtml() {
  return `<details class="information-section"><summary>Modelo y límites</summary>
    <p>Activaciones auriculares y ventriculares → kernels vectoriales XYZ → 8 derivaciones independientes → filtros → 12 derivaciones. No utiliza trazados grabados ni imágenes de pacientes.</p>
    <p>Todos los patrones son aproximaciones educativas. Las pruebas técnicas no constituyen validación clínica.</p>
    <p>Las ayudas de «Qué observar» señalan ventanas del modelo sobre las muestras mostradas: QRS, ST entre J y J+80 ms, o repolarización desde J+80 hasta el final del QT. No son delimitaciones clínicas independientes.</p>
    <p>Describe primero el patrón observado. Integra territorio, reciprocidad, proporcionalidad respecto del QRS y contexto; la etiqueta del caso no demuestra una arteria ocluida. Las fases son estados paramétricos y no una cronología de un paciente.</p>
    <p>V7–V9 y V3R–V4R; captura/fusión en TV; comienzo corto–largo–corto de torsades: pendientes. VVI a demanda y secuencias programadas de flutter son modelos idealizados. La pérdida total de captura VVI solo se representa sin escape intrínseco; no simula umbrales ni captura mecánica.</p>
    <ul class="about-list">
      <li>Modelo de dipolo único inspirado en ECGSYN y Clifford. No es un modelo celular, de torso individual ni una implementación literal de ECGSYN.</li>
      <li>QT con memoria exponencial de RR (≈40 s), activación auricular en dos componentes y T asimétrica. Transición de lesión durante el final del QRS para conservar el nivel de ST en J. Son aproximaciones educativas, no un modelo de potenciales celulares.</li>
      <li>Medición automática heurística. En casos complejos utiliza calibres y comparación con eventos; PR/QT pueden no ser estimables. Los límites medidos se muestran por latido; una auditoría contra los mismos latidos sintéticos comprueba cada límite y retira resultados discordantes, sin sustituir las medidas por valores del generador.</li>
      <li>Monitor: barrido de un buffer sintético reproducible. Se vuelve a usar el buffer durante sesiones largas; cambios de parámetros reinician la señal.</li>
      <li>Paso alto diagnóstico causal de 0,05 Hz y antialias FIR centrado antes de reducir a 500 Hz. El paso alto de 2 Hz permite explorar distorsión del ST. La interferencia de red se configura aparte del notch.</li>
    </ul>
  </details>
  <details class="information-section"><summary>Referencias y atribución</summary>
    <p>Morfología normal aprendida de <a href="https://physionet.org/content/ptb-xl/1.0.3/" target="_blank" rel="noopener">PTB-XL</a> y <a href="https://physionet.org/content/ptb-xl-plus/1.0.1/" target="_blank" rel="noopener">PTB-XL+</a> (Wagner et al. 2020; Strodthoff et al. 2023), <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noopener">CC BY 4.0</a>; se distribuyen solo coeficientes derivados.</p>
    <ol class="references">
      <li><a href="https://physionet.org/content/ecgsyn/1.0.0/" target="_blank" rel="noopener">McSharry et al. ECGSYN (2003)</a> · Ritmo, variabilidad y generación sintética.</li>
      <li><a href="https://pmc.ncbi.nlm.nih.gov/articles/PMC2927500/" target="_blank" rel="noopener">Clifford, Nemati y Sameni (2010)</a> · Modelo vectorial de ritmos anormales.</li>
      <li><a href="https://pmc.ncbi.nlm.nih.gov/articles/PMC9106114/" target="_blank" rel="noopener">Vondrak et al. (2022), tabla 2</a> · Matriz inversa de Dower; comprobación algebraica indirecta de los coeficientes.</li>
      <li><a href="https://www.ahajournals.org/doi/10.1161/circulationaha.108.191095" target="_blank" rel="noopener">AHA/ACCF/HRS (2009), parte III</a> · Trastornos de conducción intraventricular.</li>
      <li><a href="https://www.ahajournals.org/doi/10.1161/circulationaha.106.180200" target="_blank" rel="noopener">AHA/ACCF/HRS (2007), parte I</a> · Tecnología y estandarización del ECG.</li>
      <li><a href="https://academic.oup.com/eurheartj/advance-article/doi/10.1093/eurheartj/ehag101/8766309" target="_blank" rel="noopener">Quinta Definición Universal de Infarto (2026)</a> · Tabla 5, criterios electrocardiográficos y limitaciones diagnósticas.</li>
      <li><a href="https://pmc.ncbi.nlm.nih.gov/articles/PMC10691881/" target="_blank" rel="noopener">ACC 2022: patrones isquémicos y contexto.</a></li>
      <li><a href="https://link.springer.com/article/10.1007/s10928-018-9587-8" target="_blank" rel="noopener">Malik et al. (2018): historia de RR y adaptación del QT</a></li>
      <li><a href="https://link.springer.com/article/10.1186/1471-2261-5-29" target="_blank" rel="noopener">Hunt (2005): métodos y sesgo de medición de QT</a></li>
    </ol>
  </details>
  <details class="keyboard-help"><summary>Atajos de teclado</summary>${keyboardHelpHtml()}</details>`;
}
