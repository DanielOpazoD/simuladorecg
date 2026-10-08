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
   const restored=await imported(original.B.case,'restored');assert.deepEqual(restored.B.leads,original.B.leads);
   assert.deepEqual(restored.B.measurement,original.B.measurement);assert.deepEqual(errors,[]);
  }catch(error){await page.screenshot({path:resolve(out,tag+'-failure.png'),fullPage:true}).catch(()=>{});await writeFile(resolve(out,tag+'-failure.json'),JSON.stringify({error:String(error.stack),errors},null,2));throw error;}
  finally{await page.close();}
 }}finally{await browser.close();}
}
await writeFile(resolve(out,'refractory-browser-results.json'),JSON.stringify({results,clinicalValidation:false,physicalDeviceTest:false},null,2));
console.log(JSON.stringify({refractoryFlows:results.length,errors:[]}));
