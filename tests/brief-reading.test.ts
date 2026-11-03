import { describe, it, expect } from 'vitest';
import { synthesize } from '../src/engine/signal';
import { fromPreset, presetById } from '../src/presets/catalog';
import { structuredDescription, type StructuredDescription } from '../src/ui/structured-description';
import { structuredDescriptionHtml } from '../src/ui/omi-sheet';
import { briefReadingHtml } from '../src/ui/brief-reading';

const load = (id: string) => ({ ...fromPreset(presetById(id)!), acquisition: 'ideal' as const, filter: 'off' as const });
const key = (k: string) => k.replace(/\s+/g, '');
const synthetic = (lines: StructuredDescription['lines']): StructuredDescription => ({ lines, summary: 'resumen', measures: [], axis: null });
const BUTTON = '<button type="button" class="st-reference" data-action="st-reference" aria-label="Referencia del ST"><sup>1</sup></button>';
const NORMALS = ['ST sin desniveles destacados.', 'Onda T sin alteraciones destacadas.', 'Sin ondas Q patológicas.'];
const REF = { key: 'Ref. ST', text: 'Referencia del ST.' };

describe('lectura breve en prosa', () => {
  it.each(['sinus','af','flutter','vf','lbbb','wpw','wenckebach','anterior'])('%s: un párrafo sin cifras de cabecera, sin mutar d ni alterar la salida completa', id => {
    const c = load(id), s = synthesize(c, 10), d = structuredDescription(c, s);
    const before = structuredClone(d), full = structuredDescriptionHtml(d), flat = structuredDescriptionHtml(d, true, true, 'docente');
    const html = briefReadingHtml(d);
    expect(d).toEqual(before); expect(d.summary).toBe(before.summary);
    expect(structuredDescriptionHtml(d)).toBe(full); expect(structuredDescriptionHtml(d, true, true, 'docente')).toBe(flat);
    expect(html.startsWith('<p class="reading-prose">')).toBe(true); expect(html.endsWith('</p>')).toBe(true);
    expect(html).not.toMatch(/<dl|<h3|<details/);
    expect(html).not.toMatch(/frecuencia (ventricular )?\d+ lpm/); expect(html).not.toMatch(/\b(QRS|QTc) \d+ ms/); expect(html).not.toContain('12 derivaciones');
    for (const l of d.lines) {
      if (['A','Ref.ST','B·C','D','E'].includes(key(l.key)) || NORMALS.includes(l.text)) continue;
      expect(html).toContain(l.text);
    }
    const bc = d.lines.find(l => key(l.key) === 'B·C')!.text;
    expect(html).toContain(bc.replace(/, frecuencia (ventricular )?\d+ lpm/, ''));
    if (bc.includes('ondas P a')) expect(html).toMatch(/ondas P a \d+\/min/);
    expect(html.includes(BUTTON)).toBe(d.lines.some(l => key(l.key) === 'Ref.ST'));
  });
  it('intervalos: retira solo PR/QRS/QTc numéricos y resume el PR en rango', () => {
    const D = (text: string) => briefReadingHtml(synthetic([{ key: 'D', text }]));
    expect(D('PR 160 ms · QRS 90 ms · QTc 410 ms.')).toBe('');
    expect(D('PR 180–320 ms (progresivo) · QRS 90 ms · QTc no aplicable.')).toBe('<p class="reading-prose">PR progresivo · QTc no aplicable.</p>');
    expect(D('PR 200–260 ms (variable) · QRS 150 ms · Segmento raro 3 ms.')).toBe('<p class="reading-prose">PR variable · Segmento raro 3 ms.</p>');
    expect(D('PR no medible · QRS 160 ms.')).toBe('<p class="reading-prose">PR no medible.</p>');
  });
  it('eje: normal calla, desviación conserva la frase sin cifra, resto íntegro', () => {
    const E = (text: string) => briefReadingHtml(synthetic([{ key: 'E', text, info: 'axis' }]));
    expect(E('Eje QRS 45° (normal).')).toBe('');
    expect(E('Eje QRS −45° (desviado a la izquierda).')).toBe('<p class="reading-prose">Eje QRS desviado a la izquierda.</p>');
    expect(E('Eje QRS 120° (desviado a la derecha).')).toContain('Eje QRS desviado a la derecha.');
    expect(E('Eje QRS 200° (extremo).')).toContain('Eje QRS extremo.');
    expect(E('Eje no determinable.')).toContain('Eje no determinable.');
    expect(E('Eje del registro 120° (brazos invertidos).')).toBe('<p class="reading-prose">Eje del registro (brazos invertidos).</p>');
    expect(E('Eje del registro no determinable (brazos invertidos).')).toContain('Eje del registro no determinable (brazos invertidos).');
    expect(E('Eje raro 10° sin formato.')).toContain('Eje raro 10° sin formato.');
  });
  it('ritmo: retira solo la cláusula de frecuencia y conserva ectopia, AV y P auriculares', () => {
    expect(briefReadingHtml(synthetic([{ key: 'B·C', text: 'Ritmo sinusal con bloqueo AV sin ectopia, frecuencia ventricular 40 lpm, ondas P a 80/min.' }])))
      .toBe('<p class="reading-prose">Ritmo sinusal con bloqueo AV sin ectopia, ondas P a 80/min.</p>');
    expect(briefReadingHtml(synthetic([{ key: 'B·C', text: 'Fibrilación auricular, frecuencia ventricular 130 lpm.' }]))).toContain('Fibrilación auricular.');
  });
  it('ST/T/Q normales exactos se agrupan con el botón de referencia; cualquier variación no', () => {
    const d = synthetic([{ key: 'A', text: '12 derivaciones.' }, { key: 'ST', text: NORMALS[0], info: 'st' }, { key: 'T', text: NORMALS[1], info: 't' }, { key: 'Q', text: NORMALS[2], info: 'q' }, REF]);
    expect(briefReadingHtml(d)).toBe(`<p class="reading-prose">ST–T sin alteraciones destacadas ni ondas Q patológicas.${BUTTON}</p>`);
    const lines = structuredClone(d.lines); lines[2].text = 'Onda T invertida en V1–V3.';
    const html = briefReadingHtml(synthetic(lines));
    expect(html).toContain(NORMALS[0] + BUTTON); expect(html).toContain('Onda T invertida en V1–V3.'); expect(html).toContain(NORMALS[2]); expect(html).not.toContain('ST–T sin');
    expect(briefReadingHtml(synthetic(d.lines.slice(1, 4)))).not.toContain(BUTTON);
  });
  it('agrupa solo con claves ST/T/Q exactas y nunca con una fila omitida', () => {
    const html = briefReadingHtml(synthetic([{ key: 'ST', text: NORMALS[0], info: 'st' }, { key: 'X', text: NORMALS[1] }, { key: 'Q', text: NORMALS[2] }]));
    expect(html).not.toContain('ST–T sin'); expect(html).toContain(NORMALS[0]); expect(html).toContain(NORMALS[1]); expect(html).toContain(NORMALS[2]);
    const full = synthetic([{ key: 'ST', text: NORMALS[0], info: 'st' }, { key: 'T', text: NORMALS[1] }, { key: 'Q', text: NORMALS[2] }]);
    const omitted = briefReadingHtml(full, ['T']);
    expect(omitted).not.toContain(NORMALS[1]); expect(omitted).not.toContain('ST–T sin'); expect(omitted).toContain(NORMALS[0]); expect(omitted).toContain(NORMALS[2]);
    expect(briefReadingHtml(full)).toContain('ST–T sin');
  });
  it('conserva cautelas, cifras del ST, recíprocos y textos desconocidos en su orden', () => {
    const texts = ['Elevación del ST de 2.5 mm en V2–V4 (lectura aproximada por las ondas f).', 'Onda T invertida en aVL.', 'Ondas Q no valorables con este QRS (bloqueo de rama izquierda, preexcitación o QRS ventricular).', 'QRS ancho: valora la relación ST–T/QRS.', 'Cambios recíprocos del ST.', 'Nota desconocida sin eliminar.'];
    const html = briefReadingHtml(synthetic([{ key: 'ST', text: texts[0], info: 'st' }, { key: 'T', text: texts[1] }, { key: 'Q', text: texts[2] }, { key: 'ST/QRS', text: texts[3] }, { key: 'Rec.', text: texts[4] }, { key: 'X', text: texts[5] }]));
    let pos = -1; for (const t of texts) { const i = html.indexOf(t); expect(i).toBeGreaterThan(pos); pos = i; }
  });
  it('omitRows retira solo la fila indicada y escapa el HTML', () => {
    const d = synthetic([{ key: 'ST', text: 'ST <b>&</b> raro.', info: 'st' }, { key: 'T', text: 'Onda T plana.' }]);
    const html = briefReadingHtml(d, ['T']);
    expect(html).toContain('&lt;b&gt;'); expect(html).not.toContain('<b>'); expect(html).not.toContain('Onda T plana.');
    expect(briefReadingHtml(d)).toContain('Onda T plana.');
  });
  it('devuelve cadena vacía cuando no queda nada', () => {
    expect(briefReadingHtml(synthetic([{ key: 'A', text: '12 derivaciones, 25 mm/s, 10 mm/mV.' }, REF]))).toBe('');
  });
});
