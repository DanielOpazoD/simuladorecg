import {it,expect} from 'vitest';
import {fromPreset,presetById} from '../src/presets/catalog';
import {SECONDARY_ST_RATIO_LIMIT} from '../src/presets/teaching-limits';
import {secondaryRepolarization} from '../src/engine/secondary-repolarization';
import {qrsKernels} from '../src/engine/morphology';
import {synthesize} from '../src/engine/signal';
import {renderPaper} from '../src/render/ecg';
import {cloneCase,DEFAULT_CASE,type ECGCase,type Signal} from '../src/engine/types';
import {makeArrays} from '../src/engine/leads';
/** Characterize the current omission; replace this disclosure when independently validated ST exists. */
it.each(['lbbb','sgarbossa','vvi','ddd'])('%s disclosure distinguishes absent ST from approximate T',id=>{
 const c=fromPreset(presetById(id)!),s=synthesize(c,10),b=s.events.beats.find(b=>b.time>3)!;
 const secondary=secondaryRepolarization(c,b,qrsKernels(c,b));
 expect(secondary.t).not.toBeNull();expect(secondary.st).toBeNull();
 expect(SECONDARY_ST_RATIO_LIMIT).toContain('el ST secundario no está representado');
 expect(SECONDARY_ST_RATIO_LIMIT).toContain('Un ST plano no demuestra repolarización normal');
});
it.each(['3x4','3x4+1','3x4+3','6x2','12x1'] as ECGCase['view']['format'][])('paper %s carries the clinical limit without moving trace geometry or revealing quiz name',format=>{
 const c=cloneCase(DEFAULT_CASE);c.view.format=format;c.name='SECRET DIAGNOSIS';
 const s={fs:500,duration:10,leads:makeArrays(5000)} as Signal;
 const texts:{text:string,x:number,y:number}[]=[];
 const ctx=new Proxy({}, {get:(_,key)=>key==='fillText'?(text:string,x:number,y:number)=>texts.push({text,x,y}):()=>{},set:()=>true});
 const canvas={style:{},getContext:()=>ctx} as unknown as HTMLCanvasElement;
 const layout=renderPaper(canvas,s,c,1000,{ratio:1,hideName:true});
 const footer=texts.find(t=>t.text.startsWith('Registro de 10 s'))!;
 expect(footer.text).toContain('sin validación clínica');expect(footer.y).toBe(layout.heightMm-3);
 expect(texts.some(t=>t.text.includes('SECRET DIAGNOSIS'))).toBe(false);
 expect(layout.segments.every(segment=>segment.y+segment.height< footer.y)).toBe(true);
});
