/** Independent counterfactual applied only to the frozen historical source.
 * No candidate module is copied or imported. The new vector is the compact
 * Gaussian phase integral plus the analytic 45 ms sine-delta integral, in the
 * existing secondary-source units. This establishes scope, not clinical truth. */
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
export async function predictWpwRepolarization(root){
 const file=path.join(root,'src/engine/secondary-repolarization.ts');
 let source=await readFile(file,'utf8');
 const anchor='  if(!reference)return{mode,t:null,st:null,reference:null};';
 assert.equal(source.split(anchor).length,2,'Frozen secondary-source insertion changed');
 source=source.replace('"terminal-qrs";', '"terminal-qrs" | "preexcited-qrs";');
 source='import {frontal as predictedWpwDirection} from "./leads";\n'+source;
 const addition=`  if(!source&&c.conduction==="wpw"&&b.kind==="normal"){
    mode="preexcited-qrs"; reference=[0,0,0];
    for(const k of ks){
      const steps=2000; let integral=0;
      for(let step=1;step<steps;step++){
        const phase=step/steps;
        const amplitude=Math.exp(-.5*((phase-k.mu)/k.sigma)**2)*Math.min(1,phase/.035,(1-phase)/.035);
        integral+=amplitude*(step%2?4:2);
      }
      const coefficient=integral/(3*steps*Math.sqrt(2*Math.PI));
      for(let axis=0;axis<3;axis++)reference[axis]+=k.v[axis]*coefficient;
    }
    const direction=predictedWpwDirection(c.axis,.25,.03),gain=c.qrsAmp*(c.electrolyte==='lowvoltage'?.38:1);
    const deltaArea=2*.045/(Math.PI*(c.qrs/1000)*Math.sqrt(2*Math.PI));
    for(let axis=0;axis<3;axis++)reference[axis]+=direction[axis]*gain*deltaArea;
  }
`;
 await writeFile(file,source.replace(anchor,addition+anchor));
}
