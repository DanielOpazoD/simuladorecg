import {describe,it,expect} from "vitest";import {fromPreset,presetById} from "../src/presets/catalog";import {changeCase} from "../src/ui/case-state";import {createExplorationOrigin,explorationChanges,restoreExplorationOrigin,sameExplorationModel} from "../src/ui/exploration-origin";
describe("procedencia de exploración",()=>{const preset=presetById("lbbb")!,base=fromPreset(preset);
it("no cuenta presentación como ajuste",()=>{const o=createExplorationOrigin(preset,base),v=changeCase(base,"view.speed",50);expect(explorationChanges(o,v)).toEqual([]);expect(sameExplorationModel(o,v)).toBe(true)});
it("conserva el origen al pasar a custom",()=>{const o=createExplorationOrigin(preset,base),x=changeCase(base,"hr",88);expect(x.presetId).toBe("custom");expect(o.presetId).toBe("lbbb");expect(explorationChanges(o,x).map(d=>d.key)).toEqual(["hr"])});
it("cuenta efectos indirectos reales",()=>{const s=fromPreset(presetById("sinus")!),o=createExplorationOrigin(presetById("sinus")!,s),x=changeCase(s,"conduction","rbbb");expect(explorationChanges(o,x).map(d=>d.key)).toEqual(expect.arrayContaining(["conduction","qrs","axis"]))});
it("restaura modelo y conserva vista",()=>{const o=createExplorationOrigin(preset,base);let x=changeCase(base,"hr",99);x=changeCase(x,"view.mode","rhythm");x=changeCase(x,"view.speed",50);const r=restoreExplorationOrigin(o,x);expect(explorationChanges(o,r)).toEqual([]);expect(r.presetId).toBe("lbbb");expect(r.view.mode).toBe("rhythm");expect(r.view.speed).toBe(50)});
it("copia el origen",()=>{const o=createExplorationOrigin(preset,base),x=changeCase(base,"hr",91);expect(o.case.hr).not.toBe(x.hr);expect(o.case.presetId).toBe("lbbb")})});

describe('rate provenance follows scheduler semantics', () => {
  const preset = presetById('sinus')!;
  it('distinguishes atrial drive from escape when AV mechanism changes', () => {
    const a = { ...fromPreset(preset), av: 'two_one' as const, hr: 80 };
    const b = { ...a, av: 'complete' as const, hr: 40 };
    const change = explorationChanges(createExplorationOrigin(preset, a), b).find(x => x.key === 'hr')!;
    expect(change.beforeLabel).toBe('Frecuencia auricular');
    expect(change.afterLabel).toBe('Frecuencia de escape');
    expect([change.before, change.after]).toEqual([80, 40]);
  });
  it('discloses retained inactive rate instead of calling it ventricular frequency', () => {
    const a = fromPreset(preset);
    const b = { ...a, rhythm: 'flutter' as const, hr: 90 };
    const change = explorationChanges(createExplorationOrigin(preset, a), b).find(x => x.key === 'hr')!;
    expect(change.afterLabel).toMatch(/no utilizado/);
    expect(change.beforeLabel).toBe('Frecuencia base');
  });
  it('distinguishes independent atrial rate applicability on either side', () => {
    const a = fromPreset(preset);
    const b = { ...a, rhythm: 'vt' as const, atrialRate: 90 };
    const change = explorationChanges(createExplorationOrigin(preset, a), b).find(x => x.key === 'atrialRate')!;
    expect(change.beforeLabel).toMatch(/no utilizado/);
    expect(change.afterLabel).toBe('Frecuencia auricular independiente');
  });
});
