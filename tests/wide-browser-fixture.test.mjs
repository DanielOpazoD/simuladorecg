import {it,expect} from 'vitest';
import {wideDeflectionFixture,wideDeflectionCsv} from './support/wide-qrs-browser-fixture.mjs';
import {assessExternalWindow} from '../src/io/external-assessment';
import {analyzeSamples} from '../src/engine/sample-analysis';
it('admits the analytical browser fixture without weakening reader safeguards',()=>{
 const s=wideDeflectionFixture(),assessment=assessExternalWindow(s);
 expect(assessment.analysisAllowed).toBe(true);expect(assessment.issues).toEqual([]);
 expect(Object.keys(s)).toEqual(['fs','leads']);
 const m=analyzeSamples(s);expect(m.hr).toBeCloseTo(100,8);expect(m.detectedPeaks.length).toBe(16);
 expect(m.evidence.hr.status).toBe('review');expect(m.beats).toEqual([]);expect(m.qrs).toBeNull();expect(m.qt).toBeNull();expect(wideDeflectionCsv().split('\n').length).toBe(5002);
 for(let i=0;i<5000;i++)expect(s.leads.III[i]).toBe(s.leads.II[i]-s.leads.I[i]);
});
