import {makeArrays} from '../../src/engine/leads';
/** Analytic adversarial signal, not a patient or a physiological waveform model.
 * Limb identities hold; T is rank one with signed channels summing to zero.
 * No generator, diagnosis, QRS detector or covariance routine builds the fixture.
 */
export function covarianceFixture(fs=500,polarity=1,offset=0){
 const leads=makeArrays(10*fs),qrs=[1,.8,-.6,.7],terminal=[-.3,.25,.55,-.4],t=[1,-1,1,-1];
 const names=['I','II','V1','V5'] as const;
 for(let i=0;i<10*fs;i++){
  const time=i/fs;
  for(let k=0;k<4;k++){
   let v=offset;
   for(let beat=0;beat<10;beat++){
    const x=time-(beat+.4);
    v+=qrs[k]*Math.exp(-.5*(x/.013)**2)+terminal[k]*Math.exp(-.5*((x-.025)/.008)**2);
    v+=polarity*2*t[k]*Math.exp(-.5*((x-.3)/.05)**2);
   }
   leads[names[k]][i]=v;
  }
  leads.III[i]=leads.II[i]-leads.I[i];leads.aVR[i]=-(leads.I[i]+leads.II[i])/2;
  leads.aVL[i]=leads.I[i]-leads.II[i]/2;leads.aVF[i]=leads.II[i]-leads.I[i]/2;
 }
 return{fs,leads};
}
