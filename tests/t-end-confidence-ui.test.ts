import { describe, expect, it } from 'vitest';
import { synthesize } from '../src/engine/signal';
import { measure } from '../src/engine/measure';
import { fromPreset, presetById } from '../src/presets/catalog';
import { beatDetail } from '../src/ui/beat-detail';
import { suggestTEnds } from '../src/engine/t-end-area';
import { classifyTEndReviewCandidate } from '../src/engine/t-end-confidence';

describe('T-end agreement is visible but never promoted to QT',()=>{
 it('renders the exact engine stratum and its retrospective limitation',()=>{
  const c=fromPreset(presetById('tachy')!),s=synthesize(c,10,{learnedBase:false}),m=measure(s); // fixture where the frozen analyzer abstains from QT
  const suggestions=suggestTEnds(s,m),i=suggestions.findIndex(Boolean);expect(i).toBeGreaterThanOrEqual(0);
  const confidence=classifyTEndReviewCandidate(suggestions[i]!);const html=beatDetail(s,m,c,i);
  expect(html).toContain(`data-t-end-agreement="${confidence.stratum}"`);
  expect(html).toContain('seleccionada retrospectivamente');expect(html).toContain('No modifica QT/QTc');
  expect(html).toMatch(/<details class="detail-evidence"><summary>Fundamento de la propuesta<\/summary>/);
  const closedText = html.replace(/<details[\s\S]*?<\/details>/g, '');
  expect(closedText).toContain('revisión manual');
  expect(closedText).toContain('no un límite validado de');
  expect(closedText).toContain('No modifica QT/QTc');
  expect(closedText).toContain('no es probabilidad clínica');
  expect(m.qt).toBeNull();expect(m.evidence.qt.status).toBe('unavailable');
 });
});
