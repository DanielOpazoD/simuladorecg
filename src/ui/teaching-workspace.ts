import { cloneCase, LEADS, type ECGCase, type Lead, type Signal } from "../engine/types";
import { esc } from "./helpers";
import { download } from "./persistence";
import { readStDistribution } from "./st-distribution";
import { acquiredAt, teachingBeats, teachingComparison, teachingRegion, teachingWindow, type TeachingFocus } from "./teaching-signal";
import { parseNotes, serializeNotes, validateTeachingNotes, type TeachingNote } from "./teaching-notes";
import { buildTeachingPng } from "./teaching-export";
import { mountTeachingEcho } from "./teaching-echo";
import "./teaching-workspace.css";

export interface TeachingSnapshot { id: string; label: string; signal: Signal; c: ECGCase }
interface Options {
  signal: Signal; c: ECGCase; previous: Signal | null; loadPrevious?: () => Promise<Signal>;
  notes: TeachingNote[]; onNotesChange: (notes: TeachingNote[]) => void;
  snapshots: TeachingSnapshot[]; onSnapshot: (snapshot: TeachingSnapshot) => void;
}
const signed = (n: number, digits = 3) => `${n > 0 ? "+" : n < 0 ? "−" : ""}${Math.abs(n).toFixed(digits).replace(".", ",")}`;
const names = { box: "Recuadro", arrow: "Flecha", interval: "Intervalo", label: "Etiqueta" };
const option = (value: string, label: string) => `<option value="${esc(value)}">${esc(label)}</option>`;

/** Read-only acquired signal; private notes and mechanical illustrations never enter the ECG case. */
export function mountTeachingWorkspace(root: HTMLElement, options: Options): () => void {
  const { signal: s, c } = options, abort = new AbortController();
  const eligible = teachingBeats(s);
  let beat = readStDistribution(s)?.beat ?? eligible[0] ?? -1, lead: Lead = "II", focus: TeachingFocus = "st";
  let notes = options.notes.map(n => ({ ...n })), editing: string | null = null, previous = options.previous;
  let mode = "actual", referenceId = "", personal = true, system = true, predicting = false, revealed = false;
  let speed = 50, gain = 10, cursor = s.events.beats[beat]?.time ?? 0, pointerFirst: { t: number; v: number } | null = null, destroyed = false;
  let fullRecord = false;
  let echo: ReturnType<typeof mountTeachingEcho> | null = null;
  root.className = "teaching-workspace";
  root.innerHTML = `<p class="teaching-intro">Explora las muestras del registro, conserva tus observaciones y relaciona las vistas. Las ayudas no modifican el ECG.</p>
    <div class="teaching-nav" role="group" aria-label="Herramientas del Aula"><button type="button" class="btn" data-teach="predict" aria-pressed="false">Interpretar primero</button><button type="button" class="btn" data-teach="echo" aria-expanded="false">Eco y anatomía</button><button type="button" class="btn" data-teach="capture">Guardar estado para comparar</button></div>
    <p class="teaching-prediction" hidden>Marca lo que observas en este registro. Las ayudas y el eco están ocultos hasta revelar. El caso ya es visible en la biblioteca: este ejercicio practica la descripción, no un diagnóstico a ciegas. <button type="button" class="btn" data-teach="reveal">Revelar explicación</button></p>
    <div class="teaching-selection"><label for="teach-lead">Derivación<select id="teach-lead">${LEADS.map(l => option(l,l)).join("")}</select></label><label for="teach-beat">Latido del registro<select id="teach-beat">${eligible.length ? eligible.map(i=>option(String(i),`${i+1} · ${s.events.beats[i].time.toFixed(3)} s`)).join("") : option("-1","Sin complejos organizados")}</select></label><label for="teach-speed">Velocidad<select id="teach-speed">${[25,50].map(x=>option(String(x),`${x} mm/s`)).join("")}</select></label><label for="teach-gain">Ganancia<select id="teach-gain">${[5,10,20].map(x=>option(String(x),`${x} mm/mV`)).join("")}</select></label></div>
    <div class="teaching-leads" role="group" aria-label="Mismo latido en doce derivaciones"></div>
    <div class="teaching-layers"><label><input id="teach-personal" type="checkbox" checked> Mis anotaciones</label><label><input id="teach-system" type="checkbox" checked> Referencias del simulador</label><label for="teach-focus">Ventana<select id="teach-focus"><option value="st">ST</option><option value="qrs">QRS</option><option value="repolarization">Repolarización</option></select></label><label for="teach-range">Extensión<select id="teach-range"><option value="beat">Latido ampliado</option><option value="record">Primeros 10 segundos</option></select></label></div>
    <div class="teaching-chart-scroll" tabindex="0" aria-label="Trazado ampliado: desplazamiento horizontal"><div class="teaching-chart"></div></div>
    <p class="teaching-measure"></p><p class="teaching-scale">Ámbar discontinuo: ventana del modelo · violeta: mis marcas · gris discontinuo: referencia. Grilla: 1 mm por cuadro pequeño; 5 mm por cuadro grande. Las coordenadas guardadas son tiempo del registro y voltaje absoluto. Dos pulsaciones sobre el trazado sitúan los extremos de una anotación; también puedes escribirlos abajo.</p>
    <label for="teach-cursor" class="teaching-cursor-label">Cursor compartido <output id="teach-cursor-value"></output></label><input id="teach-cursor" type="range" step="${1/s.fs}" aria-label="Tiempo del cursor compartido">
    <section class="teaching-comparison"><h3>Comparar sin cambiar la escala</h3><div class="teaching-selection"><label for="teach-reference">Referencia<select id="teach-reference"></select></label><label for="teach-mode">Presentación<select id="teach-mode"><option value="actual">Actual</option><option value="overlay">Superponer</option><option value="split">Uno sobre otro</option><option value="reference">Solo referencia</option><option value="difference">Actual − referencia</option></select></label><button type="button" class="btn" data-teach="baseline" ${!options.loadPrevious && !previous ? "hidden" : ""}>Cargar basal contrafactual</button></div><p class="teaching-comparison-note"></p></section>
    <section class="teaching-notes"><h3>Mis anotaciones</h3><form class="teaching-note-form"><div class="teaching-selection"><label for="teach-kind">Marca<select id="teach-kind">${Object.entries(names).map(([k,v])=>option(k,v)).join("")}</select></label><label for="teach-t0">Inicio (s)<input id="teach-t0" type="number" step="${1/s.fs}" min="0" max="10" required></label><label for="teach-t1">Final (s)<input id="teach-t1" type="number" step="${1/s.fs}" min="0" max="10" required></label><label for="teach-v0">Voltaje 1 (mV)<input id="teach-v0" type="number" step="any" required></label><label for="teach-v1">Voltaje 2 (mV)<input id="teach-v1" type="number" step="any" required></label></div><label for="teach-text">Observación<textarea id="teach-text" maxlength="160" rows="2" placeholder="Describe lo que observas, o plantea una pregunta."></textarea></label><div class="teaching-note-actions"><button class="btn primary" type="submit">Añadir anotación</button><button class="btn" type="button" data-teach="cancel-edit" hidden>Cancelar edición</button><button class="btn" type="button" data-teach="undo">Deshacer última</button></div></form><ol class="teaching-note-list"></ol></section>
    <div class="teaching-feedback" hidden></div><section class="teaching-echo-host" hidden></section>
    <details class="teaching-export"><summary>Guardar y exportar el trabajo</summary><p>El PNG anotado incluye las doce derivaciones simultáneas durante los primeros 10 s, grilla calibrada a 300 dpi y una leyenda. El PNG limpio sigue disponible en Exportar. Las notas se pueden guardar como JSON y volver a cargar solo en este mismo registro.</p><div class="teaching-note-actions"><button class="btn" type="button" data-teach="png">PNG con anotaciones</button><button class="btn" type="button" data-teach="json">Guardar anotaciones JSON</button><label class="btn teaching-import" for="teach-file">Cargar anotaciones JSON<input id="teach-file" type="file" accept=".json,application/json"></label></div></details>
    <p class="teaching-status" role="status" aria-live="polite"></p>`;
  const el = <T extends HTMLElement = HTMLElement>(selector: string) => root.querySelector<T>(selector)!;
  const input = (id: string) => el<HTMLInputElement>(`#teach-${id}`);
  const select = (id: string) => el<HTMLSelectElement>(`#teach-${id}`);
  const announce = (text: string) => { if (!destroyed) el(".teaching-status").textContent = text; };
  const aids = () => !predicting || revealed;
  const viewWindow = () => fullRecord ? { start:0, end:Math.min(10,(s.leads.I.length-1)/s.fs), beatIndex:beat } : teachingWindow(s,beat);
  const ref = () => !aids() ? null : referenceId === "baseline" ? previous : options.snapshots.find(x=>x.id === referenceId)?.signal ?? null;
  const snapName = () => referenceId === "baseline" ? "Basal contrafactual: mismo caso sin lesión aguda; no es un ECG previo adquirido." : referenceId ? "Estado guardado: tiempos desde el inicio de cada registro. El orden de captura no representa evolución clínica." : "Guarda estados antes y después de ajustar el caso, o carga el basal cuando esté disponible.";
  const persist = () => { options.onNotesChange(notes.map(n=>({...n}))); };
  const finiteMax = (a: Float64Array, lo: number, hi: number) => { let max = 0; for(let i=Math.max(0,lo);i<=Math.min(a.length-1,hi);i++) if(Number.isFinite(a[i]))max=Math.max(max,Math.abs(a[i])); return max; };

  function referenceOptions() {
    select("reference").innerHTML = option("","Sin referencia") + (previous ? option("baseline","Basal contrafactual del mismo caso") : "") + options.snapshots.map(x=>option(x.id,x.label)).join("");
    select("reference").value = referenceId;
  }
  function fieldsFromRegion() {
    const w = viewWindow(), r = aids() ? teachingRegion(s,lead,beat,focus) : null;
    input("t0").value = (Math.round((r?.start ?? w.start)*s.fs)/s.fs).toFixed(3);
    input("t1").value = (Math.round((r?.end ?? Math.min(w.end,w.start+.2))*s.fs)/s.fs).toFixed(3);
    input("v0").value = (r?.low ?? -.2).toFixed(3); input("v1").value = (r?.high ?? .2).toFixed(3);
  }
  function resetEdit() { editing=null; pointerFirst=null; input("text").value=""; el("[data-teach=cancel-edit]").hidden=true; el<HTMLButtonElement>("[type=submit]").textContent="Añadir anotación"; fieldsFromRegion(); }
  function noteList() {
    el(".teaching-note-list").innerHTML = notes.map((n,i)=>`<li><span><strong>${i+1}. ${esc(n.lead)} · ${names[n.kind]}</strong> ${esc(n.text)}<small>${n.t0.toFixed(3)}–${n.t1.toFixed(3)} s · ${signed(n.v0)} / ${signed(n.v1)} mV</small></span><button type="button" class="text-button" data-note-edit="${esc(n.id)}" aria-label="Editar anotación ${i+1}">Editar</button><button type="button" class="text-button" data-note-delete="${esc(n.id)}" aria-label="Borrar anotación ${i+1}">Borrar</button></li>`).join("") || `<li class="teaching-empty">Aún no has añadido marcas. Se conservarán al cerrar el Aula durante esta sesión.</li>`;
  }
  function feedback() {
    const host = el(".teaching-feedback"); host.hidden = !predicting || !revealed;
    if (host.hidden) return;
    const rows = LEADS.map(l=>({lead:l,r:teachingRegion(s,l,beat,"st")}));
    const marked = rows.filter(({lead:l,r})=>r && notes.some(n=>n.lead===l && Math.max(n.t0,n.t1)>=r.start && Math.min(n.t0,n.t1)<=r.end)).map(r=>r.lead);
    host.innerHTML = `<h3>Contrasta tus observaciones</h3><p>${notes.length} marcas personales. ${marked.length ? `Tus marcas se solapan temporalmente con la ventana ST en ${marked.join(", ")}.` : "Ninguna marca se solapa todavía con las ventanas ST disponibles."} El solapamiento no evalúa si tu interpretación es correcta.</p><p>Consulta los valores y las ventanas en las doce derivaciones; compara tus comentarios con lo observado. El programa no puntúa diagnósticos ni certifica competencia clínica.</p>`;
  }
  function drawOverview() {
    const w=teachingWindow(s,beat), lo=Math.ceil(w.start*s.fs), hi=Math.floor(w.end*s.fs);
    el(".teaching-leads").innerHTML = LEADS.map(l=> {
      const a=s.leads[l], points: string[]=[];let open=false;
      for(let i=lo;i<=hi;i++) { if(!Number.isFinite(a[i])){open=false;continue;} points.push(`${open?"L":"M"}${((i/s.fs-w.start)/(w.end-w.start)*120).toFixed(2)} ${(32-a[i]*10).toFixed(2)}`);open=true; }
      const r=aids()&&system ? teachingRegion(s,l,beat,focus):null;
      const x=r?(r.start-w.start)/(w.end-w.start)*120:0,width=r?(r.end-r.start)/(w.end-w.start)*120:0;
      return `<button type="button" class="teaching-lead" data-teach-lead="${l}" aria-pressed="${l===lead}"><span>${l}<small>${r?.value!==null&&r?.value!==undefined?signed(r.value)+" mV":""}</small></span><svg viewBox="0 0 120 64" aria-hidden="true"><path class="teaching-mini-trace" d="${points.join(" ")}"/>${r?`<rect class="teaching-mini-region" x="${x}" y="4" width="${Math.max(1,width)}" height="56"/>`:""}</svg></button>`;
    }).join("");
  }
  function drawChart() {
    const w=viewWindow(), prior=ref(), compatible=teachingComparison(s,prior), lo=Math.ceil(w.start*s.fs),hi=Math.floor(w.end*s.fs);
    if(mode==="difference"&&!compatible.compatible)mode="overlay";
    select("mode").value=mode; select("mode").querySelector<HTMLOptionElement>('[value=difference]')!.disabled=!compatible.compatible;
    const showRef=prior&&mode!=="actual", rows=prior&&mode==="split"?2:1;
    // Fixed common envelope for all comparison modes, plus physical gain. No mode-specific autoscaling.
    let peak=1.25;
    for(const l of LEADS) { peak=Math.max(peak,finiteMax(s.leads[l],lo,hi)); if(prior)peak=Math.max(peak,finiteMax(prior.leads[l],Math.ceil(w.start*prior.fs),Math.floor(w.end*prior.fs))); }
    if(prior) peak*=2; // A difference can reach the sum of two absolute extrema.
    const range=Math.ceil((peak+.25)*gain/5)*5/gain, left=8, top=7, width=(w.end-w.start)*speed, height=2*range*gain, rowHeight=height+11;
    const totalW=width+left+5,totalH=rows*rowHeight+top;
    const X=(t:number)=>left+(t-w.start)*speed,Y=(v:number,row=0)=>top+row*rowHeight+(range-v)*gain;
    const path=(signal:Signal,l:Lead,row:number,delta=false)=>{
      let d="",open=false; const a=signal.leads[l];
      for(let i=Math.ceil(w.start*signal.fs);i<=Math.floor(w.end*signal.fs);i++) {
        const t=i/signal.fs,raw=a[i],v=delta&&prior ? raw-(acquiredAt(prior,l,t)??NaN):raw;
        if(!Number.isFinite(v)){open=false;continue;} d+=`${open?"L":"M"}${X(t).toFixed(4)} ${Y(v,row).toFixed(4)} `;open=true;
      }return d;
    };
    let grid="";for(let mm=0;mm<=width;mm++)grid+=`<path class="${mm%5?"teach-grid-fine":"teach-grid-bold"}" d="M${left+mm} ${top}v${rows*rowHeight-11}"/>`;
    for(let row=0;row<rows;row++)for(let mm=0;mm<=height;mm++)grid+=`<path class="${mm%5?"teach-grid-fine":"teach-grid-bold"}" d="M${left} ${top+row*rowHeight+mm}h${width}"/>`;
    const r=aids()&&system&&mode!=="difference"&&mode!=="reference"?teachingRegion(s,lead,beat,focus):null;
    const region=r?`<rect class="teach-system-box" x="${X(r.start)}" y="${Y(r.high)}" width="${(r.end-r.start)*speed}" height="${(r.high-r.low)*gain}"/>${r.baseline!==null?`<path class="teach-baseline" d="M${left} ${Y(r.baseline)}h${width}"/><path class="teach-model-line" d="M${X(r.start)} ${top}v${height}"/>`:""}`:"";
    const markup=personal&&mode!=="difference"&&mode!=="reference"?notes.map((n,i)=>{
      if(n.lead!==lead||Math.min(n.t0,n.t1)<w.start||Math.max(n.t0,n.t1)>w.end)return "";
      const x0=X(n.t0),x1=X(n.t1),y0=Y(n.v0),y1=Y(n.v1),title=`${i+1}. ${esc(n.text||names[n.kind])}`;
      let shape=n.kind==="box"?`<rect x="${Math.min(x0,x1)}" y="${Math.min(y0,y1)}" width="${Math.max(.1,Math.abs(x1-x0))}" height="${Math.max(.1,Math.abs(y1-y0))}"/>`:n.kind==="arrow"?`<path marker-end="url(#teach-arrow)" d="M${x0} ${y0}L${x1} ${y1}"/>`:n.kind==="interval"?`<path d="M${x0} ${y0}H${x1} M${x0} ${y0-1.5}v3 M${x1} ${y0-1.5}v3"/>`:`<circle cx="${x0}" cy="${y0}" r="1.4"/>`;
      return `<g class="teach-personal-mark"><title>${title}</title>${shape}<text x="${Math.min(x0,x1)}" y="${Math.max(top+3,Math.min(y0,y1)-1)}">${i+1}</text></g>`;
    }).join(""):"";
    const traces=mode==="reference"&&prior?`<path class="teach-reference-trace" d="${path(prior,lead,0)}"/>`:`${showRef&&mode==="overlay"?`<path class="teach-reference-trace" d="${path(prior!,lead,0)}"/>`:""}<path class="teach-current-trace" d="${path(s,lead,0,mode==="difference")}"/>${rows===2?`<path class="teach-reference-trace" d="${path(prior!,lead,1)}"/><text class="teach-chart-label" x="${left}" y="${top+rowHeight-2}">Referencia</text>`:""}`;
    el(".teaching-chart").innerHTML=`<svg class="teach-trace-svg" viewBox="0 0 ${totalW} ${totalH}" style="width:${Math.max(360,totalW*5)}px" role="img" aria-label="${lead}, latido ${beat+1}, ${speed} milímetros por segundo y ${gain} milímetros por milivoltio" data-left="${left}" data-top="${top}" data-range="${range}" data-start="${w.start}" data-end="${w.end}"><defs><marker id="teach-arrow" markerWidth="4" markerHeight="4" refX="3" refY="2" orient="auto"><path d="M0 0L4 2L0 4" fill="none" stroke="#6948a5" stroke-width=".7"/></marker><clipPath id="teach-clip"><rect x="${left}" y="${top}" width="${width}" height="${rows*rowHeight-11}"/></clipPath></defs>${grid}<g clip-path="url(#teach-clip)">${traces}${region}${markup}<path class="teach-cursor-line" d=""/></g><text class="teach-chart-label" x="${left}" y="4">${lead} · ${mode==="difference"?"Diferencia":mode==="reference"?"Referencia":"Actual"}</text><text class="teach-chart-label" x="${left}" y="${totalH-1}">${w.start.toFixed(3)}–${w.end.toFixed(3)} s · ${speed} mm/s · ${gain} mm/mV</text></svg>`;
    // Scroll a high-gain view to its baseline; keep the complete trace reachable without a giant dialog.
    const frame=el(".teaching-chart-scroll");frame.scrollTop=Math.max(0,Y(0)*Math.max(360,totalW*5)/totalW-frame.clientHeight/2);
    input("cursor").min=String(w.start);input("cursor").max=String(w.end);
    el(".teaching-measure").textContent = aids()&&system ? r ? `${r.source}${r.value!==null?` ST en J: ${signed(r.value)} mV (${signed(r.value*10,1)} mm equivalentes a 10 mm/mV).`:""}` : "Ventana no disponible en esta vista o este latido. No se infiere un hallazgo." : "Ayudas ocultas. Puedes anotar y medir manualmente el trazado.";
    el(".teaching-comparison-note").textContent = `${snapName()} ${referenceId?compatible.reason:""}${(mode==="difference"||mode==="reference")?" Las notas del registro actual están ocultas en esta vista.":""}`;
    drawCursor();
  }
  function drawCursor() {
    const svg=root.querySelector<SVGSVGElement>(".teach-trace-svg");if(!svg)return;
    const w=viewWindow(), x=8+(cursor-w.start)*speed, h=svg.viewBox.baseVal.height;
    svg.querySelector(".teach-cursor-line")?.setAttribute("d",cursor>=w.start&&cursor<=w.end?`M${x} 7V${h-11}`:"");
    input("cursor").value=String(cursor);
    const a=acquiredAt(s,lead,cursor),b=ref()?acquiredAt(ref()!,lead,cursor):null;
    el("#teach-cursor-value").textContent=`${cursor.toFixed(3)} s · actual ${a===null?"no disponible":signed(a)+" mV"}${b===null?"":` · referencia ${signed(b)} mV`}`;
  }
  function selectionChanged() { pointerFirst=null;select("lead").value=lead;select("beat").value=String(beat);fieldsFromRegion();cursor=s.events.beats[beat]?.time??0;drawOverview();drawChart();feedback();echo?.setSelection(lead,beat); }
  function syncAids() {
    const available=aids();input("system").disabled=!available;select("focus").disabled=!available;
    el(".teaching-comparison").hidden=!available;el<HTMLButtonElement>("[data-teach=capture]").disabled=!available;
    if(!available)mode="actual";
    el<HTMLButtonElement>('[data-teach="echo"]').disabled=!available;
    if(!available){el(".teaching-echo-host").hidden=true;el('[data-teach="echo"]').setAttribute("aria-expanded","false");echo?.destroy();echo=null;}
    el(".teaching-prediction").hidden=!predicting;el("[data-teach=reveal]").hidden=revealed;
    el("[data-teach=predict]").setAttribute("aria-pressed",String(predicting));if(!editing)fieldsFromRegion();drawOverview();drawChart();feedback();
  }
  root.addEventListener("change",e=>{
    const target=e.target as HTMLInputElement;
    switch(target.id){
      case "teach-lead": lead=target.value as Lead;selectionChanged();break;
      case "teach-beat": beat=Number(target.value);selectionChanged();break;
      case "teach-speed": speed=Number(target.value);drawChart();break;
      case "teach-gain": gain=Number(target.value);drawChart();break;
      case "teach-range": fullRecord=target.value==="record";pointerFirst=null;drawChart();break;
      case "teach-focus":focus=target.value as TeachingFocus;fieldsFromRegion();drawOverview();drawChart();break;
      case "teach-personal":personal=target.checked;drawChart();break;
      case "teach-system":system=target.checked;drawOverview();drawChart();break;
      case "teach-reference":referenceId=target.value;if(referenceId&&mode==="actual")mode="overlay";drawChart();break;
      case "teach-mode":mode=target.value;drawChart();break;
    }
  },{signal:abort.signal});
  input("cursor").addEventListener("input",()=>{cursor=Number(input("cursor").value);drawCursor();echo?.setCursorTime(cursor);},{signal:abort.signal});
  el(".teaching-note-form").addEventListener("submit",e=>{
    e.preventDefault();try{
      const n:TeachingNote={id:editing??crypto.randomUUID(),lead,kind:select("kind").value as TeachingNote["kind"],t0:Number(input("t0").value),t1:Number(input("t1").value),v0:Number(input("v0").value),v1:Number(input("v1").value),text:input("text").value.trim()};
      notes=validateTeachingNotes(editing?notes.map(old=>old.id===editing?n:old):[...notes,n],s);persist();resetEdit();noteList();drawChart();feedback();announce("Anotación guardada en este registro.");
    }catch(e){announce((e as Error).message);}
  },{signal:abort.signal});
  root.addEventListener("click",async e=>{
    const target=(e.target as Element).closest<HTMLElement>("[data-teach],[data-teach-lead],[data-note-edit],[data-note-delete]");
    if(target?.dataset.teachLead){lead=target.dataset.teachLead as Lead;selectionChanged();return;}
    if(target?.dataset.noteDelete){notes=notes.filter(n=>n.id!==target.dataset.noteDelete);persist();resetEdit();noteList();drawChart();feedback();return;}
    if(target?.dataset.noteEdit){const n=notes.find(n=>n.id===target.dataset.noteEdit)!;lead=n.lead;beat=eligible.reduce((best,i)=>Math.abs(s.events.beats[i].time-n.t0)<Math.abs(s.events.beats[best].time-n.t0)?i:best,eligible[0]??-1);const w=teachingWindow(s,beat);if(Math.min(n.t0,n.t1)<w.start||Math.max(n.t0,n.t1)>w.end){fullRecord=true;select("range").value="record";}selectionChanged();editing=n.id;for(const k of ["t0","t1","v0","v1"] as const)input(k).value=String(n[k]);input("text").value=n.text;select("kind").value=n.kind;el("[data-teach=cancel-edit]").hidden=false;el<HTMLButtonElement>("[type=submit]").textContent="Guardar cambios";input("text").focus();return;}
    if(!target){
      const svg=(e.target as Element).closest<SVGSVGElement>(".teach-trace-svg");
      if(svg&&mode!=="difference"&&mode!=="reference"){
        const rect=svg.getBoundingClientRect(),scale=svg.viewBox.baseVal.width/rect.width,x=(e.clientX-rect.left)*scale,y=(e.clientY-rect.top)*scale;
        const w=viewWindow(),t=Math.round((w.start+(x-8)/speed)*s.fs)/s.fs,v=Number(svg.dataset.range)-(y-7)/gain;
        if(t<w.start||t>w.end||y<7||y>7+2*Number(svg.dataset.range)*gain)return;
        cursor=t;drawCursor();echo?.setCursorTime(cursor);
        if(!pointerFirst){pointerFirst={t,v};input("t0").value=t.toFixed(3);input("v0").value=v.toFixed(3);announce("Primer extremo situado. Pulsa el segundo o ajusta los campos.");}
        else {input("t1").value=t.toFixed(3);input("v1").value=v.toFixed(3);pointerFirst=null;announce("Segundo extremo situado. Añade la observación y guarda la anotación.");}
      }return;
    }
    const action=target.dataset.teach;
    if(action==="cancel-edit"){resetEdit();return;}
    if(action==="undo"){notes=notes.slice(0,-1);persist();resetEdit();noteList();drawChart();feedback();return;}
    if(action==="predict"){predicting=!predicting;revealed=false;syncAids();return;}
    if(action==="reveal"){revealed=true;syncAids();announce("Explicación disponible; tus marcas se conservan.");return;}
    if(action==="capture"){
      if(!aids())return;
      const snapshot={id:crypto.randomUUID(),label:`Estado ${options.snapshots.length+1} · ${c.name} · ${c.hr} lpm`,signal:s,c:cloneCase(c)};
      if(options.snapshots.length>=4){announce("Ya hay cuatro estados guardados durante esta sesión. Recarga la página para empezar otra colección; conserva antes tus notas como JSON.");return;}
      options.onSnapshot(snapshot);referenceOptions();announce("Estado guardado. Cierra el Aula, ajusta el caso y vuelve para compararlo.");return;
    }
    if(action==="echo"){
      if(!aids())return;const host=el(".teaching-echo-host");host.hidden=!host.hidden;target.setAttribute("aria-expanded",String(!host.hidden));
      if(host.hidden){echo?.destroy();echo=null;host.replaceChildren();}
      else {echo=mountTeachingEcho(host,{c,signal:s,lead,beatIndex:beat,onLeadChange:l=>{lead=l;selectionChanged();},onCursorTime:t=>{cursor=t;drawCursor();}});host.scrollIntoView({block:"start",behavior:"instant"});}return;
    }
    if(action==="baseline"&&options.loadPrevious){
      if(!aids())return;
      (target as HTMLButtonElement).disabled=true;announce("Calculando el basal del mismo caso…");
      try{previous=await options.loadPrevious();if(destroyed)return;referenceId="baseline";mode=aids()?"overlay":"actual";referenceOptions();drawChart();announce(aids()?"Basal disponible. El ECG actual se conserva sin regenerar la pantalla.":"La referencia quedará disponible al revelar la explicación.");}
      catch(error){announce((error as Error).message);}finally{if(!destroyed)(target as HTMLButtonElement).disabled=false;}return;
    }
    try{
      if(action==="json"){download(new Blob([serializeNotes(s,notes,c)],{type:"application/json"}),"ecg-lab-anotaciones.json");announce("Anotaciones exportadas con la identidad de este registro.");}
      if(action==="png"){
        (target as HTMLButtonElement).disabled=true;const exportCase=cloneCase(c);exportCase.view.speed=speed;exportCase.view.gain=gain;exportCase.view.chestGain=gain;const blob=await buildTeachingPng(s,exportCase,notes);if(!destroyed){download(blob,"ecg-lab-anotado-300dpi.png");announce("PNG anotado exportado a 300 dpi con la velocidad y ganancia del Aula. Las notas personales no son hallazgos validados.");}
      }
    }catch(error){announce((error as Error).message);}finally{if(action==="png"&&!destroyed)(target as HTMLButtonElement).disabled=false;}
  },{signal:abort.signal});
  input("file").addEventListener("change",async()=>{
    const file=input("file").files?.[0];if(!file)return;
    try{if(file.size>100_000)throw new Error("El archivo de notas supera el tamaño admitido.");const incoming=parseNotes(await file.text(),s,c);if(destroyed)return;const ids=new Set(notes.map(n=>n.id));notes=validateTeachingNotes([...notes,...incoming.filter(n=>!ids.has(n.id))],s);persist();noteList();drawChart();feedback();announce("Anotaciones cargadas; las existentes se conservan.");}
    catch(error){announce((error as Error).message);}finally{if(!destroyed)input("file").value="";}
  },{signal:abort.signal});
  select("lead").value=lead;select("beat").value=String(beat);select("speed").value=String(speed);select("gain").value=String(gain);
  referenceOptions();fieldsFromRegion();noteList();drawOverview();drawChart();
  return ()=>{destroyed=true;abort.abort();echo?.destroy();echo=null;};
}
