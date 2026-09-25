import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { DEFAULT_CASE, cloneCase } from "../src/engine/types";
import { paperLayout } from "../src/render/ecg";
import { caliperMeasurement, caliperPosition, initialCaliper, moveCaliper, placeCaliper } from "../src/render/caliper-geometry";

describe("Manual caliper input in calibrated units",()=>{
  for(const lead of ['II','V5'] as const) for(const speed of [12.5,25,50]) for(const gain of [2.5,5,10,20])
    it(`${lead}, ${speed} mm/s, ${gain} mm/mV: keyboard and pointer agree on analytic endpoints`,()=>{
      const c=cloneCase(DEFAULT_CASE);c.view.format='12x1';c.view.speed=speed;c.view.gain=lead==='II'?gain:5;c.view.chestGain=lead==='V5'?gain:20;
      const l=paperLayout(c,900),i=l.segments.findIndex(s=>s.lead===lead),seg=l.segments[i],fs=500;
      // Independent analytic reference: step 0.5 mV at 200 ms, baseline at 400 ms.
      const wave=new Float64Array(1000);for(let k=100;k<200;k++)wave[k]=.5;
      const before=wave.slice();
      let pointer=initialCaliper(l,c.view,fs,i);
      pointer=placeCaliper(pointer,1,{x:seg.x+.2*speed,y:seg.baseline-wave[100]*gain},l,c.view,fs);
      pointer=placeCaliper(pointer,2,{x:seg.x+.4*speed,y:seg.baseline-wave[200]*gain},l,c.view,fs);
      let keyboard=initialCaliper(l,c.view,fs,i);
      for(let n=0;n<50;n++)keyboard=moveCaliper(keyboard,1,'ArrowUp',l,c.view,fs);
      const p=caliperMeasurement(pointer,l,c.view),k=caliperMeasurement(keyboard,l,c.view);
      expect(p.ms).toBeCloseTo(200,9);expect(p.mv).toBeCloseTo(.5,9);
      expect(Math.abs(k.ms-p.ms)).toBeLessThanOrEqual(1000/fs);expect(Math.abs(k.mv-p.mv)).toBeLessThan(.01);
      expect(caliperPosition(keyboard,1,l,c.view).timeMs).toBeCloseTo(200,9);
      expect(caliperPosition(keyboard,1,l,c.view).voltageMv).toBeCloseTo(.5,9);
      expect(wave).toEqual(before);
      const one=moveCaliper(keyboard,2,'ArrowRight',l,c.view,fs);
      expect(caliperMeasurement(one,l,c.view).ms-k.ms).toBeCloseTo(2,9);
    });
  it("clamps both axes, preserves the original selection and rejects nonfinite inputs",()=>{
    const c=cloneCase(DEFAULT_CASE),l=paperLayout(c,900),base=initialCaliper(l,c.view,500),copy={...base},seg=l.segments[0];
    const limited=placeCaliper(base,2,{x:1e9,y:-1e9},l,c.view,500);
    expect(limited.x2).toBe(seg.x+seg.width);expect(limited.y2).toBe(seg.y);expect(base).toEqual(copy);
    expect(()=>placeCaliper(base,1,{x:NaN,y:0},l,c.view,500)).toThrow();
    expect(()=>placeCaliper(base,1,{x:0,y:0},l,c.view,0)).toThrow();
  });
  it("Cabrera coordinates refer to the displayed -aVR, not a mutation of acquisition",()=>{
    const c=cloneCase(DEFAULT_CASE);c.view.cabrera=true;
    const l=paperLayout(c,900),i=l.segments.findIndex(s=>s.lead==='aVR'),seg=l.segments[i];
    expect(seg.polarity).toBe(-1);
    const cal=placeCaliper(initialCaliper(l,c.view,500,i),2,{x:seg.x+5,y:seg.baseline-1},l,c.view,500);
    expect(caliperPosition(cal,2,l,c.view).voltageMv).toBeCloseTo(.1,9);
  });
});
function luminance(hex:string) {const c=hex.replace('#','').match(/../g)!.map(x=>parseInt(x,16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);return c[0]*.2126+c[1]*.7152+c[2]*.0722;}
function contrast(a:string,b:string){const x=luminance(a),y=luminance(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);}
describe("P9 muted text palette contracts",()=>{
  const css=readFileSync('src/style.css','utf8');
  for(const mode of ['light','dark'])it(`${mode}: muted text meets 4.5 on its documented surfaces`,()=>{
    const block=css.match(mode==='light'?/:root \{([^}]+)\}/:/:root\.dark \{([^}]+)\}/)![1];
    const token=(name:string)=>block.match(new RegExp('--'+name+':\\s*(#[a-fA-F0-9]{6})'))![1];
    for(const surface of ['background','soft'])expect(contrast(token('muted'),token(surface))).toBeGreaterThanOrEqual(4.5);
    expect(css).toContain('color: var(--ink);\n  background: var(--background);');
    expect(css).toContain('#ecg:focus-visible');
    expect(css.match(/\.caliper-readout \{([^}]+)\}/)![1]).toContain('color: var(--ink)');
    expect(contrast(token('ink'),token('soft'))).toBeGreaterThanOrEqual(4.5);
  });
});
