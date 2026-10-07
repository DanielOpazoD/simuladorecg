import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
/** Apply the declared secondary-ST intervention to an immutable pre-ST source.
 * No current product module is imported. This proves the numerical delta, not
 * physiological accuracy; directional/time-domain acceptance is separate. */
export async function predictSecondaryST(root){
 const moduleFile=path.join(root,'src/engine/secondary-repolarization.ts');
 const source=await readFile(moduleFile,'utf8');
 const old='return{mode,t:opposite(reference,T_REFERENCE_AMPLITUDE*.9),st:null,reference};';
 assert.equal(source.split(old).length,2,'Historical secondary-ST return changed');
 await writeFile(moduleFile,source.replace(old,'return{mode,t:opposite(reference,T_REFERENCE_AMPLITUDE*.9),st:c.rhythm === "torsades" ? null : reference.map(v=>-.20*v) as Vec,reference};'));
 const signalFile=path.join(root,'src/engine/signal.ts');let signal=await readFile(signalFile,'utf8');
 const anchor='    add(tStart, tLen,';assert.equal(signal.split(anchor).length,2,'Historical T insertion changed');
 signal='import {secondaryRepolarization as predictedSecondarySTSource} from "./secondary-repolarization";\n'+signal;
 const addition=`    const predictedST=predictedSecondarySTSource(c,b,ks).st;
    if(predictedST){
      const j=b.time+dur,start=j-.040,end=tStart+tLen*.5;
      const smooth=(x:number)=>{const v=Math.max(0,Math.min(1,x));return v*v*(3-2*v);};
      add(start,end-start,(_u,t)=>scale(predictedST,
        smooth((t-start)/.040)*(1-smooth((t-tStart)/(end-tStart)))));
    }
`;
 await writeFile(signalFile,signal.replace(anchor,addition+anchor));
}
