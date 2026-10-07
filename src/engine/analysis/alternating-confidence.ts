import type {Measurement,Signal} from '../types';
export const ALTERNATING_CANDIDATE_POLICY=Object.freeze({version:'opposed-cycle-v2',minimumCandidates:6,windowSeconds:.08,alignmentSeconds:.03,
  adjacentCorrelation:-.5,repeatedCorrelation:.9,agreement:.8});
const leads=['I','II','V1','V5'] as const;
/** Repetitive opposing candidates can be ambiguous even at regular spacing (e.g. QRS/T or
 * distinct ventricular complexes). Never infer which are real or halve HR. */
export function alternatingCandidateAmbiguity(s:Pick<Signal,'fs'|'leads'>,peaks:readonly number[]):boolean{
 if(peaks.length<ALTERNATING_CANDIDATE_POLICY.minimumCandidates)return false;
 const radius=Math.round(s.fs*ALTERNATING_CANDIDATE_POLICY.windowSeconds),n=s.leads.I.length;
 const shapes=peaks.map(time=>{
  const candidate=Math.round(time*s.fs);
  if(candidate-radius<0||candidate+radius>=n)return null;
  const means=leads.map(lead=>{
    let sum=0;for(let i=candidate-radius;i<=candidate+radius;i++)sum+=s.leads[lead][i];
    return sum/(2*radius+1);
  });
  // Candidate timestamps can land on either slope of the same deflection.
  // Align only the comparison window; never move exported detection times.
  let center=candidate,maximum=-Infinity;
  const alignment=Math.round(s.fs*ALTERNATING_CANDIDATE_POLICY.alignmentSeconds);
  for(let i=Math.max(radius,candidate-alignment);i<=Math.min(n-radius-1,candidate+alignment);i++){
    const energy=leads.reduce((sum,lead,j)=>sum+(s.leads[lead][i]-means[j])**2,0);
    if(energy>maximum){maximum=energy;center=i;}
  }
  const start=center-radius,end=center+radius,values:number[]=[];
  for(const lead of leads){
   let mean=0;for(let i=start;i<=end;i++)mean+=s.leads[lead][i];mean/=end-start+1;
   for(let i=start;i<=end;i++)values.push(s.leads[lead][i]-mean);
  }
  const norm=Math.hypot(...values);return norm>0?values.map(x=>x/norm):null;
 });
 const dot=(a:number[],b:number[])=>a.reduce((sum,x,i)=>sum+x*b[i],0);
 let agreeing=0,eligible=0;
 for(let i=2;i<peaks.length;i++){
  const a=shapes[i-2],b=shapes[i-1],c=shapes[i];if(!a||!b||!c)continue;
  const first=peaks[i-1]-peaks[i-2],second=peaks[i]-peaks[i-1];if(first<=0||second<=0)continue;
  eligible++;
  if(dot(a,b)<ALTERNATING_CANDIDATE_POLICY.adjacentCorrelation&&dot(b,c)<ALTERNATING_CANDIDATE_POLICY.adjacentCorrelation&&
    dot(a,c)>ALTERNATING_CANDIDATE_POLICY.repeatedCorrelation)agreeing++;
 }
 return eligible>=ALTERNATING_CANDIDATE_POLICY.minimumCandidates-2&&agreeing/eligible>=ALTERNATING_CANDIDATE_POLICY.agreement;
}
export function reviewAlternatingCandidates(s:Pick<Signal,'fs'|'leads'>,m:Measurement):Measurement{
 if(m.evidence.hr.status==='unavailable'||!alternatingCandidateAmbiguity(s,m.detectedPeaks))return m;
 const reason='Candidatos alternantes repetidos de dirección opuesta: puede haber doble conteo QRS/T o complejos distintos. Verifica con calibres; no se corrige automáticamente la frecuencia.';
 const evidence={...m.evidence};
 for(const key of Object.keys(evidence) as (keyof typeof evidence)[])
  if(evidence[key].status==='usable')evidence[key]={...evidence[key],status:'review',reason};
 return {...m,evidence,quality:reason+' '+m.quality};
}
