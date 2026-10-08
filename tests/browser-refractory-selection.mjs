/** Actual imported native case -> worker -> visible measurements -> exact rollback. */
import {chromium,firefox,webkit} from 'playwright';
import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {chooseCatalogPreset} from './support/catalog-navigation.mjs';
const url=process.env.ECG_TEST_URL||'http://127.0.0.1:5173/';
const out=resolve(process.env.ECG_EVIDENCE_DIR||'.sites-runtime/browser');await mkdir(out,{recursive:true});
const results=[];
for(const engine of [chromium,firefox,webkit]){
 const browser=await engine.launch({headless:true});
 try{for(const width of [1440,390]){
  const page=await browser.newPage({viewport:{width,height:width<600?844:1000}}),errors=[];
  const tag=`refractory-${engine.name()}-${width}`;
  page.setDefaultTimeout(30000);page.on('pageerror',e=>errors.push(e.message));
  page.on('console',m=>{if(['error','warning'].includes(m.type()))errors.push(m.text());});
  const ready=()=>page.locator('#signal-loading').waitFor({state:'hidden'});
  const exported=async name=>{
   await page.locator('#compare-json').waitFor({state:'visible'});
   const pending=page.waitForEvent('download');await page.locator('#compare-json').click();
   const file=resolve(out,`${tag}-${name}.json`);await(await pending).saveAs(file);
   return JSON.parse(await readFile(file,'utf8'));
  };
  const imported=async(c,name)=>{
   await page.locator('#file-input').setInputFiles({name:name+'.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(c))});
   await ready();return exported(name);
  };
  try{
   await page.goto(url);await ready();
   const identity=await(await page.request.get(new URL('build-info.json',url).href)).json();
   assert.equal(identity.dirty,false);if(process.env.ECG_EXPECT_COMMIT)assert.equal(identity.commit,process.env.ECG_EXPECT_COMMIT);
   await chooseCatalogPreset(page,'vt');await ready();
   await page.locator('[data-action="compare"]').click();await page.locator('#compare-pin').click();
   const original=await exported('original');
   for(const[hr,qrs,acceptedHr]of [[240,240,240],[250,200,250],[260,200,250]]){
    const c={...original.B.case,hr,qrs,qtc:350,filter:'diagnostic',variability:0,seed:53,
     artifacts:{...original.B.case.artifacts,baseline:0,muscle:0,mains:0}};
    const result=await imported(c,String(hr)),m=result.B.measurement;
    assert.equal(result.B.case.hr,acceptedHr,'Preserve the existing 250/min import/control domain');
    assert.ok(m.hr!==null&&Math.abs(m.hr-acceptedHr)<=1,'Actual worker must measure the accepted rapid ventricular train');
    const row=result.metrics.find(r=>r.key==='hr');assert.equal(row.b,m.hr);
    assert.notEqual(m.evidence.qrs.status,'usable','Recovered identity does not certify interval boundaries');
    assert.deepEqual(result.A.leads,original.A.leads,'Reference A must not change');
    assert.ok(m.detectedPeaks.length>35);
    const used=new Set();
    for(const b of result.B.events.beats.filter(b=>b.time+b.qrs/2>=.3&&b.time+b.qrs/2<9.7)){
     const i=m.detectedPeaks.findIndex((p,i)=>!used.has(i)&&p>=b.time-.01&&p<=b.time+b.qrs+.03);
     assert.ok(i>=0,'Do not report the right mean by missing a different actual complex');used.add(i);
    }
    await page.locator('#comparison-lab').screenshot({path:resolve(out,`${tag}-${hr}-measurements.png`)});
    await page.locator('#ecg').screenshot({path:resolve(out,`${tag}-${hr}-trace.png`)});
    const again=await imported(result.B.case,`${hr}-roundtrip`);
    assert.deepEqual(again.B.leads,result.B.leads);assert.deepEqual(again.B.measurement.detectedPeaks,m.detectedPeaks);
    results.push({engine:engine.name(),width,requestedHr:hr,acceptedHr,qrs,measuredHR:m.hr,candidates:m.detectedPeaks.length,identity,actualWorker:true,exactRoundtrip:true});
   }
   // Exercise the new identity repair through the real importer and worker.
   const assertIdentity=(result)=>{
    const m=result.B.measurement,used=new Set();
    for(const b of result.B.events.beats.filter(b=>b.time>.3&&b.time+b.qrs<9.7)){
     const i=m.detectedPeaks.findIndex((p,i)=>!used.has(i)&&p>=b.time-.01&&p<=b.time+b.qrs+.03);
     assert.ok(i>=0,'A correct mean must not conceal a different omitted QRS');used.add(i);
    }
    for(const p of m.detectedPeaks.filter(p=>p>.3&&p<9.7))assert.ok(result.B.events.beats.some(b=>p>=b.time-.01&&p<=b.time+b.qrs+.03),'An observed T must not count as ventricular activation');
   };
   const verifyIdentity=async(c,name)=>{
    const result=await imported(c,name),m=result.B.measurement;
    assert.equal(result.B.case.hr,c.hr);
    assert.ok(m.hr!==null&&Math.abs(m.hr-c.hr)<=1);
    assert.equal(result.metrics.find(row=>row.key==='hr').b,m.hr);
    assertIdentity(result);
    await page.locator('#comparison-lab').screenshot({path:resolve(out,`${tag}-${name}-measurements.png`)});
    await page.locator('#ecg').screenshot({path:resolve(out,`${tag}-${name}-trace.png`)});
    const again=await imported(result.B.case,name+'-roundtrip');
    assert.deepEqual(again.B.leads,result.B.leads);assert.deepEqual(again.B.measurement,m);
    results.push({engine:engine.name(),width,scenario:name,measuredHR:m.hr,qrs:m.qrs,qt:m.qt,rejected:m.rejected,evidence:m.evidence,candidates:m.detectedPeaks.length,identity,actualWorker:true,exactRoundtrip:true});
    return result;
   };
   for(const [hr,qrs,seed]of [[190,210,19],[250,230,71]])await verifyIdentity({...original.B.case,hr,qrs,qtc:350,filter:'diagnostic',variability:0,seed,artifacts:{...original.B.case.artifacts,baseline:.03,muscle:.03,mains:.03}},`identity-vt-${hr}`);
   await chooseCatalogPreset(page,'vvi');await ready();
   const paced=await exported('paced-original');
   for(const [hr,seed,noise,filter]of [[55,41,.075,'diagnostic'],[60,83,.08,'off']]){
    const result=await verifyIdentity({...paced.B.case,hr,seed,filter,electrolyte:'lowvoltage',variability:0,artifacts:{...paced.B.case.artifacts,baseline:noise,muscle:noise,mains:noise}},`identity-vvi-${hr}`),m=result.B.measurement;
    const width=m.qrs??m.rejected?.qrs;
    assert.ok(width!==undefined&&width!==null&&Math.abs(width-165)<=20,'Report or explicitly withhold the complete QRS, not only its terminal limb');
    assert.notEqual(m.evidence.qrs.status,'usable','Stimulus-adjacent onset uncertainty remains visible');
    assert.notEqual(m.evidence.qt.status,'usable');
    if(m.qt!==null){const qts=result.B.events.beats.map(b=>b.qt*1000).sort((a,b)=>a-b);assert.ok(Math.abs(m.qt-qts[Math.floor(qts.length/2)])<=30);}
   }
   // Recurrent P/T dominance must be corrected through the actual importer,
   // worker, model audit, comparison, export and exact roundtrip.
   for(const [id,qrsAmp,tAmp,hr] of [
    ['sinus',.1,0,120],['sinus',.5,.8,120],['lbbb',.1,0,60],['lbbb',.1,0,120],['pvc',.1,0,120],
    ['lbbb',.1,.28,60],['wpw',.1,.28,60],['wpw',.12,.22,50],
   ]){
    await chooseCatalogPreset(page,id);await ready();
    const base=await exported(`recurrent-base-${id}-${qrsAmp}-${tAmp}-${hr}`);
    const result=await verifyIdentity({...base.B.case,hr,qrsAmp,tAmp,filter:'diagnostic',variability:0,seed:53,
     artifacts:{...base.B.case.artifacts,baseline:0,muscle:0,mains:0}},`recurrent-${id}-${qrsAmp}-${tAmp}-${hr}`);
    assert.equal(result.B.case.qrsAmp,qrsAmp);assert.equal(result.B.case.tAmp,tAmp);
    assert.equal(result.B.case.filter,'diagnostic');
    assert.deepEqual(result.A.leads,original.A.leads,'Reference A remains immutable during identity repair');
    if(tAmp===0)assert.equal(result.B.measurement.qt,null,'Absent T cannot acquire a fabricated QT');
    if(id==='lbbb'&&tAmp===.28){
     const m=result.B.measurement,width=m.qrs??m.rejected?.qrs;
     assert.ok(width!==undefined&&width!==null&&Math.abs(width-160)<=20,'Recovered weak QRS must include its observed late support');
     assert.notEqual(m.evidence.qrs.status,'usable','Recovered support does not certify clinical boundaries');
     if(m.qt!==null)assert.ok(Math.abs(m.qt-410)<=30);
    }
   }
   for(const [id,changes,name,unresolvedQt] of [
    ['wpw',{hr:55,electrolyte:'lowvoltage',filter:'off'},'boundaries-wpw-lowvoltage-off',false],
    ['wpw',{hr:55,electrolyte:'lowvoltage',filter:'diagnostic'},'boundaries-wpw-lowvoltage-diagnostic',false],
    ['wpw',{hr:60,qrsAmp:.5,tAmp:.28,filter:'off'},'boundaries-wpw-amplitude-off',false],
    ['wpw',{hr:60,qrsAmp:.5,tAmp:.28,filter:'diagnostic'},'boundaries-wpw-amplitude-diagnostic',false],
    ['rbbb',{hr:60,qrs:240,qtc:350,activationModel:'regional-rbbb-v1',filter:'diagnostic'},'boundaries-rbbb-terminal',false],
    ['rbbb',{hr:120,qrs:240,qtc:520,activationModel:'regional-rbbb-v1',filter:'diagnostic'},'boundaries-rbbb-overlap',true],
   ]){
    await chooseCatalogPreset(page,id);await ready();
    const base=await exported(name+'-base');
    const result=await verifyIdentity({...base.B.case,...changes,variability:0,seed:53,
     artifacts:{...base.B.case.artifacts,baseline:0,muscle:0,mains:0}},name),m=result.B.measurement;
    for(const [key,value]of Object.entries(changes))assert.equal(result.B.case[key],value);
    const references=result.B.events.beats.filter(b=>b.time>.3&&b.time+b.qrs<9.7);
    const qrs=references.map(b=>b.qrs*1000).sort((a,b)=>a-b);
    assert.ok(m.qrs!==null&&Math.abs(m.qrs-qrs[Math.floor(qrs.length/2)])<=20);
    if(unresolvedQt)assert.equal(m.qt,null,'A terminal ventricular deflection cannot become a fabricated T boundary');
    else {const qt=references.map(b=>b.qt*1000).sort((a,b)=>a-b);assert.ok(m.qt!==null&&Math.abs(m.qt-qt[Math.floor(qt.length/2)])<=30);}
    for(const key of ['qrs','qt'])assert.equal(result.metrics.find(row=>row.key===key).b,m[key]);
    assert.deepEqual(result.A.leads,original.A.leads);
   }
   const restored=await imported(original.B.case,'restored');assert.deepEqual(restored.B.leads,original.B.leads);
   assert.deepEqual(restored.B.measurement,original.B.measurement);assert.deepEqual(errors,[]);
  }catch(error){await page.screenshot({path:resolve(out,tag+'-failure.png'),fullPage:true}).catch(()=>{});await writeFile(resolve(out,tag+'-failure.json'),JSON.stringify({error:String(error.stack),errors},null,2));throw error;}
  finally{await page.close();}
 }}finally{await browser.close();}
}
await writeFile(resolve(out,'refractory-browser-results.json'),JSON.stringify({results,clinicalValidation:false,physicalDeviceTest:false},null,2));
console.log(JSON.stringify({refractoryFlows:results.length,errors:[]}));
