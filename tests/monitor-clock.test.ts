import {describe,it,expect,vi,afterEach} from 'vitest';
import {monitorClock} from '../src/render/monitor-clock';
import {Monitor} from '../src/render/ecg';
import {DEFAULT_CASE,cloneCase,type Signal} from '../src/engine/types';
import {makeArrays} from '../src/engine/leads';
afterEach(()=>vi.unstubAllGlobals());
describe('Finite replay clock',()=>{
  it.each([.5,10,30,60])('keeps every source coordinate within %s seconds',available=>{
    for(const span of [.2,3,15,80])for(const seconds of [0,.01,2,30,120,10000]){
      const c=monitorClock(seconds,span,available);
      expect(c.source).toBeGreaterThanOrEqual(0);expect(c.source).toBeLessThan(available);
      expect(c.start+c.duration).toBeLessThanOrEqual(available+1e-9);
      expect(c.previousStart+c.duration).toBeLessThanOrEqual(available+1e-9);
    }
  });
  it('preserves the original ordinary 60-second replay mapping',()=>{
    for(const span of [2,4,10])for(const t of [0,.1,4,27,120])
      expect(monitorClock(t,span,60).source).toBe((Math.floor(t/span)*span)%(60-span)+t%span);
  });
  it('rejects malformed clocks explicitly',()=>{
    expect(()=>monitorClock(-1,3,60)).toThrow();expect(()=>monitorClock(1,0,60)).toThrow();expect(()=>monitorClock(NaN,3,60)).toThrow();
  });
  it('the actual monitor cannot allocate a sweep longer than the acquired record',()=>{
    vi.stubGlobal('window',{devicePixelRatio:1});
    const context=new Proxy({}, {get:()=>()=>{},set:()=>true});
    const makeCanvas=()=>({style:{},getContext:()=>context}) as unknown as HTMLCanvasElement;
    vi.stubGlobal('document',{createElement:makeCanvas});
    const c=cloneCase(DEFAULT_CASE);c.view.speed=12.5;c.view.pxPerMm=2;
    const s={fs:500,duration:10,leads:makeArrays(5000)} as Signal;
    const monitor=new Monitor(makeCanvas(),s,c,4000);
    expect(monitor.layout.segments[0].duration).toBe(10);
    expect(monitor.layout.segments[0].width).toBe(125);
  });
});
it('sound and drawing share the source time after wrap and rewind',()=>{
  vi.stubGlobal('window',{devicePixelRatio:1});
  const widths:number[]=[];
  const context=new Proxy({}, {get:(_,key)=>key==='drawImage'?(...args:unknown[])=>{if(args.length>3)widths.push(args[3] as number);}:()=>{},set:()=>true});
  const canvas=()=>({style:{},getContext:()=>context}) as unknown as HTMLCanvasElement;
  vi.stubGlobal('document',{createElement:canvas});
  const s={fs:500,duration:10,leads:makeArrays(5000)} as Signal,c=cloneCase(DEFAULT_CASE);
  const m=new Monitor(canvas(),s,c,900),span=m.layout.segments[0].duration;
  for(const time of [0,4,23,.1,12]) {
    expect(m.sourceTime(time)).toBe(monitorClock(time,span,10).source);
    expect(()=>m.frame(time)).not.toThrow();
  }
  expect(widths.every(w=>w>=0)).toBe(true);
});
