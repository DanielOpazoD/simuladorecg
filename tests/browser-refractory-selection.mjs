/** Actual imported native case -> worker -> visible measurements -> exact rollback.
 * Samples, events and the case come from the worker's own replies; what the page presents as the
 * measurement (after the simulator's audit) comes from the measurements dialog. */
import {chromium,firefox,webkit} from 'playwright';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {chooseCatalogPreset} from './support/catalog-navigation.mjs';
import {installWorkerTap,settledTrace} from './support/worker-tap.mjs';
import {readMeasurements} from './support/measurement-dialog.mjs';
const url=process.env.ECG_TEST_URL||'http://127.0.0.1:5173/';
const out=resolve(process.env.ECG_EVIDENCE_DIR||'.sites-runtime/browser');await mkdir(out,{recursive:true});
const results=[];
const engines=process.env.ECG_REFRACTORY_ENGINES==='chromium'?[chromium]:[chromium,firefox,webkit];
for(const engine of engines){
 const browser=await engine.launch({headless:true});
 try{for(const width of [1440,390]){
  const page=await browser.newPage({viewport:{width,height:width<600?844:1000}}),errors=[];
  const tag=`refractory-${engine.name()}-${width}`;
  page.setDefaultTimeout(30000);page.on('pageerror',e=>errors.push(e.message));
  page.on('console',m=>{if(['error','warning'].includes(m.type()))errors.push(m.text());});
  await installWorkerTap(page);
  const ready=()=>page.locator('#signal-loading').waitFor({state:'hidden'});
  // Import through the real file input; return the worker's reply plus the audited measurements shown.
  const imported=async(c,name,{shot=null}={})=>{
   const trace=await settledTrace(page,()=>page.locator('#file-input').setInputFiles({name:name+'.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(c))}));
   return {...trace,shown:await readMeasurements(page,{screenshot:shot?resolve(out,`${tag}-${shot}-measurements.png`):null})};
  };
  try{
   await page.goto(url);await ready();
   const identity=await(await page.request.get(new URL('build-info.json',url).href)).json();
   assert.equal(identity.dirty,false);if(process.env.ECG_EXPECT_COMMIT)assert.equal(identity.commit,process.env.ECG_EXPECT_COMMIT);
   const original=await settledTrace(page,()=>chooseCatalogPreset(page,'vt'));
   for(const[hr,qrs,acceptedHr]of [[240,240,240],[250,200,250],[260,200,250]]){
    // Noise-free: since F2 the default acquisition adds resting noise, which jitters 250/min peaks by >1/min.
    const c={...original.case,hr,qrs,qtc:350,filter:'diagnostic',variability:0,seed:53,acquisition:'ideal',
     artifacts:{...original.case.artifacts,baseline:0,muscle:0,mains:0}};
    const result=await imported(c,String(hr),{shot:String(hr)}),m=result.measurement,shown=result.shown;
    assert.equal(result.case.hr,acceptedHr,'Preserve the existing 250/min import/control domain');
    assert.ok(m.hr!==null&&Math.abs(m.hr-acceptedHr)<=1,'Actual worker must measure the accepted rapid ventricular train');
    assert.equal(shown.hr.value,Math.round(m.hr),'The rate shown is the worker measurement, accepted by the audit');
    assert.notEqual(shown.qrs.status,'usable','Recovered identity does not certify interval boundaries');
    assert.ok(m.detectedPeaks.length>35);
    const used=new Set();
    for(const b of result.events.beats.filter(b=>b.time+b.qrs/2>=.3&&b.time+b.qrs/2<9.7)){
     const i=m.detectedPeaks.findIndex((p,i)=>!used.has(i)&&p>=b.time-.01&&p<=b.time+b.qrs+.03);
     assert.ok(i>=0,'Do not report the right mean by missing a different actual complex');used.add(i);
    }
    await page.locator('#ecg').screenshot({path:resolve(out,`${tag}-${hr}-trace.png`)});
    const again=await imported(result.case,`${hr}-roundtrip`);
    assert.deepEqual(again.leads,result.leads);assert.deepEqual(again.measurement.detectedPeaks,m.detectedPeaks);
    results.push({engine:engine.name(),width,requestedHr:hr,acceptedHr,qrs,measuredHR:m.hr,candidates:m.detectedPeaks.length,identity,actualWorker:true,exactRoundtrip:true});
   }
   // Exercise the new identity repair through the real importer and worker.
   const assertIdentity=(result)=>{
    const m=result.measurement,used=new Set();
    for(const b of result.events.beats.filter(b=>b.time>.3&&b.time+b.qrs<9.7)){
     const i=m.detectedPeaks.findIndex((p,i)=>!used.has(i)&&p>=b.time-.01&&p<=b.time+b.qrs+.03);
     assert.ok(i>=0,'A correct mean must not conceal a different omitted QRS');used.add(i);
    }
    for(const p of m.detectedPeaks.filter(p=>p>.3&&p<9.7))assert.ok(result.events.beats.some(b=>p>=b.time-.01&&p<=b.time+b.qrs+.03),'An observed T must not count as ventricular activation');
   };
   const verifyIdentity=async(c,name)=>{
    const result=await imported(c,name,{shot:name}),m=result.measurement,shown=result.shown;
    assert.equal(result.case.hr,c.hr);
    assert.ok(m.hr!==null&&Math.abs(m.hr-c.hr)<=1);
    assert.equal(shown.hr.value,Math.round(m.hr));
    assertIdentity(result);
    await page.locator('#ecg').screenshot({path:resolve(out,`${tag}-${name}-trace.png`)});
    const again=await imported(result.case,name+'-roundtrip');
    assert.deepEqual(again.leads,result.leads);assert.deepEqual(again.measurement,m);assert.deepEqual(again.shown,shown);
    results.push({engine:engine.name(),width,scenario:name,measuredHR:m.hr,qrs:shown.qrs.value,qt:shown.qt.value,rejected:m.rejected,evidence:shown,candidates:m.detectedPeaks.length,identity,actualWorker:true,exactRoundtrip:true});
    return result;
   };
   for(const [hr,qrs,seed]of [[190,210,19],[250,230,71]])await verifyIdentity({...original.case,hr,qrs,qtc:350,filter:'diagnostic',variability:0,seed,artifacts:{...original.case.artifacts,baseline:.03,muscle:.03,mains:.03}},`identity-vt-${hr}`);
   const paced=await settledTrace(page,()=>chooseCatalogPreset(page,'vvi'));
   for(const [hr,seed,noise,filter]of [[55,41,.075,'diagnostic'],[60,83,.08,'off']]){
    const result=await verifyIdentity({...paced.case,hr,seed,filter,electrolyte:'lowvoltage',variability:0,artifacts:{...paced.case.artifacts,baseline:noise,muscle:noise,mains:noise}},`identity-vvi-${hr}`),m=result.measurement,shown=result.shown;
    // A QRS the audit withdrew survives as a raw candidate: report it or declare it, never only its terminal limb.
    const width=m.qrs??m.rejected?.qrs;
    assert.ok(width!==undefined&&width!==null&&Math.abs(width-165)<=20,'Report or explicitly withhold the complete QRS, not only its terminal limb');
    assert.notEqual(shown.qrs.status,'usable','Stimulus-adjacent onset uncertainty remains visible');
    assert.notEqual(shown.qt.status,'usable');
    if(shown.qt.value!==null){const qts=result.events.beats.map(b=>b.qt*1000).sort((a,b)=>a-b);assert.ok(Math.abs(shown.qt.value-qts[Math.floor(qts.length/2)])<=30);}
   }
   // Recurrent P/T dominance must be corrected through the actual importer,
   // worker, model audit, measurements dialog and exact roundtrip.
   for(const [id,qrsAmp,tAmp,hr] of [
    ['sinus',.1,0,120],['sinus',.5,.8,120],['lbbb',.1,0,60],['lbbb',.1,0,120],['pvc',.1,0,120],
    ['lbbb',.1,.28,60],['wpw',.1,.28,60],['wpw',.12,.22,50],
   ]){
    const base=await settledTrace(page,()=>chooseCatalogPreset(page,id));
    const result=await verifyIdentity({...base.case,hr,qrsAmp,tAmp,filter:'diagnostic',variability:0,seed:53,acquisition:'ideal',
     artifacts:{...base.case.artifacts,baseline:0,muscle:0,mains:0}},`recurrent-${id}-${qrsAmp}-${tAmp}-${hr}`);
    assert.equal(result.case.qrsAmp,qrsAmp);assert.equal(result.case.tAmp,tAmp);
    assert.equal(result.case.filter,'diagnostic');
    if(tAmp===0)assert.equal(result.shown.qt.value,null,'Absent T cannot acquire a fabricated QT');
    if(id==='lbbb'&&tAmp===.28){
     const m=result.measurement,shown=result.shown,width=m.qrs??m.rejected?.qrs;
     assert.ok(width!==undefined&&width!==null&&Math.abs(width-160)<=20,'Recovered weak QRS must include its observed late support');
     assert.notEqual(shown.qrs.status,'usable','Recovered support does not certify clinical boundaries');
     if(shown.qt.value!==null)assert.ok(Math.abs(shown.qt.value-410)<=30);
    }
   }
   const restored=await imported(original.case,'restored');assert.deepEqual(restored.leads,original.leads);
   assert.deepEqual(restored.measurement,original.measurement);assert.deepEqual(errors,[]);
  }catch(error){await page.screenshot({path:resolve(out,tag+'-failure.png'),fullPage:true}).catch(()=>{});await writeFile(resolve(out,tag+'-failure.json'),JSON.stringify({error:String(error.stack),errors},null,2));throw error;}
  finally{await page.close();}
 }}finally{await browser.close();}
}
await writeFile(resolve(out,'refractory-browser-results.json'),JSON.stringify({results,clinicalValidation:false,physicalDeviceTest:false},null,2));
console.log(JSON.stringify({refractoryFlows:results.length,errors:[]}));
