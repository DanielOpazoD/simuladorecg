import { describe, it, expect } from 'vitest';
import { synthesize } from '../src/engine/signal';
import { fromPreset, presetById } from '../src/presets/catalog';
import { educationalReading } from '../src/ui/educational-reading';
import { structuredDescription } from '../src/ui/structured-description';
import { structuredDescriptionHtml } from '../src/ui/omi-sheet';

const load = (id: string) => ({ ...fromPreset(presetById(id)!), acquisition: 'ideal' as const, filter: 'off' as const });
describe('lectura educativa condicionada al registro', () => {
  it.each(['sinus','af','flutter','vf','asystole','wenckebach','mobitz2','av21','complete_v','lbbb','wpw','pvc','vvi','anterior'])('%s conserva las muestras, eventos y descripción y mantiene la copia breve', id => {
    const c = load(id), s = synthesize(c, 10), d = structuredDescription(c, s);
    const before = structuredClone({ c, s, d }), text = educationalReading(c, s, d);
    expect(text.length).toBeGreaterThan(50); expect(text.length).toBeLessThan(450);
    expect({ c, s, d }).toEqual(before);
    const html = structuredDescriptionHtml(d, true, true, text);
    expect(html).toContain('class="reading-education"');
    for (const line of d.lines.filter(l => !['A','Ref.ST'].includes(l.key.replace(/\s+/g,'')))) expect(html).toContain(line.text);
    expect(structuredDescriptionHtml(d)).not.toContain(text);
  });
  it('no enseña Wenckebach solo por el nombre si los eventos no tienen progresión o bloqueo', () => {
    const c = load('wenckebach'), s = synthesize(c, 10);
    expect(educationalReading(c, s, structuredDescription(c, s))).toContain('el PR se alarga');
    for (const a of s.events.atria) if (a.conducted) a.pr = .16;
    for (const b of s.events.beats) if (b.pr !== undefined) b.pr = .16;
    expect(educationalReading(c, s, structuredDescription(c, s))).toContain('no se verifica');
    for (const a of s.events.atria) { a.conducted = true; a.pr = .16; }
    expect(educationalReading(c, s, structuredDescription(c, s))).toContain('no se verifica');
  });
  it('2:1 conserva la incertidumbre sin clasificarlo como Mobitz', () => {
    const c = load('av21'), s = synthesize(c, 10);
    expect(educationalReading(c, s, structuredDescription(c, s))).toContain('no basta para clasificar');
    for (const a of s.events.atria) a.conducted = true;
    expect(educationalReading(c, s, structuredDescription(c, s))).not.toContain('relación de conducción 2:1');
  });
  it('prioriza inversión de brazos sin dar la explicación anatómica del preset', () => {
    const c = load('lbbb'); c.artifacts = { ...c.artifacts, reversed: true };
    const s = synthesize(c, 10), text = educationalReading(c, s, structuredDescription(c, s));
    expect(text).toContain('inversión de los brazos'); expect(text).not.toContain('rama izquierda');
  });
  it('no llama rápida a una activación ensanchada al ajustar el caso sinusal', () => {
    const c = { ...load('sinus'), qrs: 200, naturalQrs: false }, s = synthesize(c, 10);
    const text = educationalReading(c, s, structuredDescription(c, s));
    expect(text).not.toContain('activación ventricular rápida'); expect(text).toMatch(/QRS|activación/);
  });
  it('una espícula no garantiza captura, incluso en la variante sin captura', () => {
    const c = { ...load('vvi'), pacingBehavior: 'demand-no-capture' as const }, s = synthesize(c, 10);
    expect(educationalReading(c, s, structuredDescription(c, s))).toContain('no garantiza su captura');
  });
  it('en isquemia orienta la lectura ST–T sin afirmar cambios que no se han medido', () => {
    const c = load('anterior'), s = synthesize(c, 10);
    const text = educationalReading(c, s, structuredDescription(c, s));
    expect(text).toContain('Relaciona el ST y la T');expect(text).not.toContain('Las P de este tramo');
    // Even when the scenario is flattened, this is an instruction to compare,
    // never a claim that a particular lead is elevated or reciprocal.
    c.st = 0;
    const flat = synthesize(c, 10), copy = educationalReading(c, flat, structuredDescription(c, flat));
    expect(copy).not.toMatch(/hay elevación|se observa descenso|confirma|diagnostica/);
  });
  it('escapa el texto docente sin alterar la salida previa', () => {
    const c = load('sinus'), s = synthesize(c, 10), d = structuredDescription(c, s);
    expect(structuredDescriptionHtml(d, true, true, '<script>')).toContain('&lt;script&gt;');
    expect(structuredDescriptionHtml(d, true, false, '<script>')).not.toContain('reading-education');
  });
});
