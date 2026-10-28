import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright';
import {resolve} from 'node:path';
import {installWorkerTap,workerReplies} from './support/worker-tap.mjs';
const out=resolve(process.argv[2]??'.sites-runtime/lead-lens-manual');await mkdir(out,{recursive:true});
const browser=await chromium.launch(),results=[],errors=[];let failure;
try{
for(const viewport of [{width:1440,height:900},{width:390,height:844},{width:320,height:568},{width:844,height:390}]){
 const page=await browser.newPage({viewport,hasTouch:true,reducedMotion:'reduce'});await installWorkerTap(page);
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.addInitScript(()=>{localStorage.setItem('ecglab-acquisition','ideal');localStorage.setItem('ecglab-theme','light');});
 await page.goto(process.env.ECG_TEST_URL??'http://127.0.0.1:4173/');await page.locator('#signal-loading').waitFor({state:'hidden'});
 const canvas=await page.locator('#ecg').evaluate(e=>e.toDataURL()),replies=await workerReplies(page);
 await page.locator('[data-reading-segment="7"]').click();
 const svg=page.locator('.lead-detail-trace'),root=page.locator('#lead-explorer'),plot=page.locator('.lead-detail-scroll');
 const path=await page.locator('.lead-sample-path').getAttribute('d'),original=await svg.boundingBox();
 const coordinates=()=>svg.evaluate(e=>{const b=e.getBoundingClientRect(),scale=b.width/e.viewBox.baseVal.width;return {left:b.left,top:b.top,scale,baseline:+e.dataset.baseline,height:+e.dataset.traceHeight,start:+document.querySelector('#lead-explorer').dataset.start};});
 const point=(g,t,v=0)=>({x:g.left+(4+t*50)*g.scale,y:g.top+(g.baseline-v*10)*g.scale});
 const value=async()=>Number(await root.getAttribute('data-manual-ms'));
 const mv=async()=>Number(await root.getAttribute('data-manual-mv'));
 const drag=async(a,b)=>{await page.mouse.move(a.x,a.y);await page.mouse.down();await page.mouse.move(b.x,b.y,{steps:8});await page.mouse.up();};
 await page.getByRole('button',{name:'Medir en la lupa',exact:true}).click();
 assert.deepEqual(await svg.boundingBox(),original,'Enabling measurement must not move the trace');
 let g=await coordinates(),a=point(g,.3),b=point(g,.5,.2);await drag(a,b);
 assert(Math.abs(await value()-200)<.001);assert(Math.abs(await mv()-.2)<.001);
 assert.equal(await page.locator('.lens-mark').count(),6);
 const qrs=await page.locator('.lens-qrs').first().evaluate(e=>({start:+e.dataset.start,end:+e.dataset.end}));
 await page.getByRole('button',{name:'Limpiar medición manual'}).click();
 await drag(point(g,qrs.start-g.start),point(g,qrs.end-g.start));
 assert(Math.abs(await value()-(qrs.end-qrs.start)*1000)<2.01,'Manual agrees with the exact displayed automatic endpoints');
 await page.getByRole('button',{name:'Limpiar medición manual'}).click();
 await drag(point(g,.6),point(g,.4));assert(Math.abs(await value()-200)<.001);
 await plot.press('b');await plot.press('ArrowLeft');assert(Math.abs(await value()-202)<.001);
 await plot.press('Shift+ArrowLeft');assert(Math.abs(await value()-222)<.001);
 await plot.press('a');await plot.press('ArrowRight');assert(Math.abs(await value()-224)<.001);
 await page.getByLabel('Marcas de la lupa').selectOption('none');assert(Math.abs(await value()-224)<.001);assert.equal(await page.locator('.lens-manual-mark').count(),1);
 await page.getByLabel('Marcas de la lupa').selectOption('all');assert(Math.abs(await value()-224)<.001);
 // Native touch sequence and cancellation, not synthetic DOM pointer events.
 const cdp=await page.context().newCDPSession(page);
 await page.getByRole('button',{name:'Limpiar medición manual'}).click();g=await coordinates();a=point(g,.3);b=point(g,.5);
 await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...a,id:1}]});
 await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{...b,id:1}]});
 await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});assert(Math.abs(await value()-200)<2.01);
 a=point(g,.8);b=point(g,1.1);
 await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...a,id:2}]});
 await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{...b,id:2}]});
 await cdp.send('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]});assert(Math.abs(await value()-200)<2.01);
 await page.setViewportSize({...viewport,width:viewport.width-10});
 assert(Math.abs(await value()-200)<2.01);
 await page.screenshot({path:resolve(out,`${viewport.width}.png`)});
 assert.equal(await page.locator('.lead-sample-path').getAttribute('d'),path);
 const bounds=await page.locator('#dialog').evaluate(e=>({overflow:e.scrollHeight-e.clientHeight,bottom:e.getBoundingClientRect().bottom}));assert(bounds.overflow<=1);assert(bounds.bottom<=viewport.height+1);
 await page.getByLabel('Derivación ampliada',{exact:true}).selectOption('aVL');assert.equal(await root.getAttribute('data-manual-ms'),null);
 await page.getByRole('button',{name:'Medir en la lupa',exact:true}).click();assert.equal(await page.locator('.lens-manual-mark').count(),0);
 await page.keyboard.press('Escape');assert.equal(await workerReplies(page),replies);assert.equal(await page.locator('#ecg').evaluate(e=>e.toDataURL()),canvas);
 results.push(viewport);await page.close();
}
assert.deepEqual(errors,[]);
}catch(e){failure=String(e.stack??e);}
finally{await browser.close();await writeFile(resolve(out,'results.json'),JSON.stringify({results,errors,failure,passed:!failure},null,2));}
console.log(JSON.stringify({results,errors,failure,passed:!failure}));if(failure)process.exitCode=1;
