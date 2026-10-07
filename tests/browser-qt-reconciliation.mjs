/** Actual CSV -> worker -> validated reply -> JSON export, with synthetic input. */
import {chromium} from 'playwright';
import {build} from 'esbuild';
import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
const url=process.env.ECG_TEST_URL||'http://127.0.0.1:5173/';
const out=resolve(process.env.ECG_EVIDENCE_DIR||'.sites-runtime/browser');await mkdir(out,{recursive:true});
const bundle=resolve(out,'qt-input-source.mjs');
await build({stdin:{contents:"export {synthesize} from './src/engine/signal';export {fromPreset,presetById} from './src/presets/catalog';",resolveDir:process.cwd()},bundle:true,platform:'node',format:'esm',outfile:bundle});
const model=await import(pathToFileURL(bundle)),signal=model.synthesize(model.fromPreset(model.presetById('tachy')),10);
const names=Object.keys(signal.leads),csv=['# ECG-LAB CSV 1; fs=500; units=mV','time_s,'+names.join(','),
 ...Array.from({length:signal.leads.I.length},(_,i)=>[i/signal.fs,...names.map(l=>signal.leads[l][i])].join(','))].join('\n');
const browser=await chromium.launch({headless:true}),checks=[];
try{for(const width of[1440,390]){
 const page=await browser.newPage({viewport:{width,height:width===390?844:1000}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
 await page.goto(url);await page.locator('#signal-loading').waitFor({state:'hidden'});
 await page.locator('[data-action=external]').click();const dialog=page.locator('#external-lab');await dialog.waitFor({state:'visible'});
 await page.locator('#external-files').setInputFiles({name:'synthetic-qt-reconciliation.csv',mimeType:'text/csv',buffer:Buffer.from(csv)});
 await page.locator('[data-external=load]').click();await page.locator('#external-metrics').waitFor({state:'visible'});
 const pending=page.waitForEvent('download');await page.locator('[data-external=json]').click();
 const path=resolve(out,`qt-reconciliation-${width}.json`);await(await pending).saveAs(path);
 const report=JSON.parse(await readFile(path)),m=report.measurement;
 assert.equal(report.kind,'ecg-external-analysis');assert.equal(report.clinicalValidation,false);assert.equal(report.modelAuditUsed,false);
 assert.ok(Math.abs(m.qt-322)<1e-7);assert.equal(m.evidence.qt.status,'review');
 const changed=m.beats.filter(b=>b.terminalRevision);assert.ok(changed.length>=3);
 for(const b of changed){assert.equal(b.terminalRevision.previousEnd,null);assert.equal(b.terminalRevision.previousQt,null);assert.equal(b.tEnd,b.terminalRevision.areaEnd);assert.ok(Math.abs(b.qt-(b.tEnd-b.onset)*1000)<1e-7);}
 assert.ok(m.beats.some(b=>b.tPeak!==null&&b.tEnd===null));
 for(const lead of names)assert.deepEqual(report.leads[lead],Array.from(signal.leads[lead]));
 assert.match(report.window.timeBase,/relative to this window/);
 await dialog.screenshot({path:resolve(out,`qt-reconciliation-${width}.png`)});
 await page.locator('[data-external=close]').click();await dialog.waitFor({state:'hidden'});assert.deepEqual(errors,[]);
 checks.push({width,qt:m.qt,status:m.evidence.qt.status,revisedBeats:changed.length,physicalSamplesPreserved:true});await page.close();
}}finally{await browser.close();}
await writeFile(resolve(out,'qt-reconciliation-browser-results.json'),JSON.stringify({checks,clinicalValidation:false,physicalDeviceTest:false},null,2)+'\n');
console.log(JSON.stringify({qtReconciliationFlows:checks.length,checks}));
