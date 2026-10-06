import type {Measurement, Signal} from '../types';
const NAMES=['I','II','V1','V5'] as const;
export const IMPULSE_CONFIDENCE_POLICY=Object.freeze({minimumCandidates:3,maximumResidual:.001,maximumEnergySpanSeconds:.024,minimumFraction:.8});
/** Conservative ambiguity screen, not pacing diagnosis or a reconstructed QRS.
 * Engineering limits: near rank-one spatial slope + <=24ms central95% derivative-energy span.
 * It only withdraws confidence when >=80% of at least three candidates agree.
 */
export function briefImpulseFraction(s:Pick<Signal,'fs'|'leads'>,peaks:readonly number[]):number {
 if(peaks.length<IMPULSE_CONFIDENCE_POLICY.minimumCandidates)return 0;
 const fs=s.fs,n=s.leads.I.length,radius=Math.round(.08*fs);
 let suspect=0;
 for(const peak of peaks){
  const center=Math.round(peak*fs),lo=Math.max(1,center-radius),hi=Math.min(n,center+radius);
  const covariance=Array.from({length:4},()=>[0,0,0,0]),slopes:number[]=[];
  for(let i=lo;i<hi;i++){
   const v=NAMES.map(l=>s.leads[l][i]-s.leads[l][i-1]);
   for(let a=0;a<4;a++)for(let b=0;b<4;b++)covariance[a][b]+=v[a]*v[b];
   slopes.push(Math.hypot(...v));
  }
  const trace=covariance.reduce((sum,row,i)=>sum+row[i],0);
  if(!trace||!slopes.length)continue;
  // Start on the strongest diagonal so an anti-parallel field cannot cancel the seed.
  const diagonal=covariance.map((row,i)=>row[i]),seed=diagonal.indexOf(Math.max(...diagonal));
  let q=diagonal.map((_,i)=>i===seed?1:0);
  for(let k=0;k<25;k++){
   const v=covariance.map(row=>row.reduce((sum,x,i)=>sum+x*q[i],0)),norm=Math.hypot(...v);
   q=v.map(x=>x/(norm||1));
  }
  const eigen=q.reduce((sum,x,i)=>sum+x*covariance[i].reduce((t,v,j)=>t+v*q[j],0),0);
  const residual=Math.max(0,1-eigen/trace);
  const total=slopes.reduce((sum,v)=>sum+v*v,0);
  let cumulative=0,first=-1,last=slopes.length-1;
  for(let i=0;i<slopes.length;i++){
   cumulative+=slopes[i]*slopes[i];
   if(first<0&&cumulative>=total*.025)first=i;
   if(cumulative>=total*.975){last=i;break;}
  }
  // The full event energy, not one steep QRS limb, must be temporally concentrated.
  if(residual<IMPULSE_CONFIDENCE_POLICY.maximumResidual&&(last-first)/fs<=IMPULSE_CONFIDENCE_POLICY.maximumEnergySpanSeconds+1e-12)suspect++;
 }
 return suspect/peaks.length;
}
export function withholdImpulseDominatedMeasurements(s:Pick<Signal,'fs'|'leads'>,m:Measurement):Measurement {
 if(m.evidence.hr.status==='unavailable'||briefImpulseFraction(s,m.detectedPeaks)<IMPULSE_CONFIDENCE_POLICY.minimumFraction)return m;
 const reason='Candidatos dominados por impulsos breves de dirección casi constante: pueden ser estímulos filtrados sin QRS. No se confirma una frecuencia ventricular; revisa el trazado.';
 const evidence={...m.evidence};
 for(const key of Object.keys(evidence) as (keyof typeof evidence)[])
  if(evidence[key].status!=='unavailable')evidence[key]={...evidence[key],status:'unavailable',reason};
 return {...m,evidence,quality:reason+' '+m.quality};
}
