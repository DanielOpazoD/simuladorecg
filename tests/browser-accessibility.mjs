/** A15/A16: same built bytes, three engines; not a physical-device or WCAG certification. */
import {chromium,firefox,webkit} from 'playwright';
import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {isLocalGet} from './support/browser-request-policy.mjs';
const url=process.env.ECG_TEST_URL||'http://127.0.0.1:5173/';
const origin=new URL(url).origin;
const out=resolve(process.env.ECG_EVIDENCE_DIR||'.sites-runtime/accessibility');
await mkdir(out,{recursive:true});
const info=JSON.parse(await readFile('dist/build-info.json','utf8'));
assert.equal(info.dirty,false);
if(process.env.ECG_EXPECT_COMMIT)assert.equal(info.commit,process.env.ECG_EXPECT_COMMIT);
const names=['I','II','III','aVR','aVL','aVF','V1','V2','V3','V4','V5','V6'];
const fixture='tests/reference/ludb/fixtures/development/';
const meta=JSON.parse(await readFile(fixture+'1.json','utf8')),bytes=await readFile(fixture+'1.dat');
const leads=Object.fromEntries(meta.channels.map((c,j)=>[c.lead,Array.from({length:5000},(_,i)=>(bytes.readInt16LE((i*12+j)*2)-c.baseline)/c.adcGain)]));
const csv=Buffer.from(['# ECG-LAB CSV 1; fs=500; units=mV','time_s,'+names.join(','),...Array.from({length:5000},(_,i)=>[i/500,...names.map(l=>leads[l][i])].join(','))].join('\n'));
const results=[],failures=[];
for(const engine of [chromium,webkit,firefox]) {
  const browser=await engine.launch({headless:true});
  try {
    for(const width of [1440,390]) {
      const errors=[],warnings=[],requests=[];
      const context=await browser.newContext({viewport:{width,height:width===390?844:1000},deviceScaleFactor:1,reducedMotion:'reduce',hasTouch:width===390&&engine.name()!=='firefox'});
      const page=await context.newPage();
      page.on('pageerror',e=>errors.push(e.message));
      page.on('console',m=>{if(m.type()==='error')errors.push(m.text());if(m.type()==='warning')warnings.push(m.text());});
      const stem=engine.name()+'-'+width;
      const ready=()=>page.locator('#signal-loading').waitFor({state:'hidden'});
      const key=async selector=>{await page.locator(selector).focus();await page.keyboard.press('Enter');};
      const active=async selector=>assert.equal(await page.locator(selector).evaluate(e=>e===document.activeElement),true,selector+' must keep/receive focus');
      const field=async(id,n)=>{await page.locator('#'+id).fill(String(n));await page.locator('#'+id).press('Tab');};
      const file=async(selector,name)=>{
        const waiting=page.waitForEvent('download');await key(selector);const p=resolve(out,`${stem}-${name}`);await(await waiting).saveAs(p);return readFile(p);
      };
      const fits=async scope=>{
        const proof=await page.locator(scope).evaluate(root=>({width:root.clientWidth,scroll:root.scrollWidth,
          controls:[...root.querySelectorAll('button,input:not([type=checkbox]):not([type=range]),select')].filter(e=>e.getClientRects().length&&!e.closest('[hidden],.external-table,.measurement-table-wrap')).map(e=>{
            const b=e.getBoundingClientRect(),p=e.parentElement.getBoundingClientRect();return {id:e.id||e.textContent.trim(),height:b.height,left:b.left,right:b.right,pl:p.left,pr:p.right};
          })}));
        assert.ok(proof.scroll<=proof.width+1,scope+' must not scroll sideways: '+JSON.stringify(proof));
        assert.ok(proof.controls.every(c=>c.height>=43.5&&c.left>=c.pl-1&&c.right<=c.pr+1),scope+' controls must fit and reach 44px: '+JSON.stringify(proof.controls.filter(c=>c.height<43.5||c.left<c.pl-1||c.right>c.pr+1)));
        return {width:proof.width,scroll:proof.scroll,controls:proof.controls.length};
      };
      try {
        await page.goto(url);await ready();
        assert.match(await page.title(),/ECG/);assert.equal(await page.locator('vite-error-overlay').count(),0);
        assert.deepEqual(await(await page.request.get(new URL('build-info.json',url).href)).json(),info);
        await page.locator('.skip-links a').first().focus();await page.keyboard.press('Enter');await active('#case-title');
        // Arrow keys activate tabs; Tab only visits the selected tab. Forms do not use these shortcuts.
        await page.locator('[data-mode=paper]').focus();await page.keyboard.press('ArrowRight');await active('[data-mode=monitor]');
        assert.equal(await page.locator('[data-mode=monitor]').getAttribute('aria-selected'),'true');
        await page.keyboard.press('End');await active('[data-mode=rhythm]');await page.keyboard.press('Home');await active('[data-mode=paper]');
        assert.equal(await page.locator('.view-tabs [tabindex="0"]').count(),1);
        await page.locator('[data-panel=base]').focus();await page.keyboard.press('ArrowRight');await active('[data-panel=conduction]');
        assert.equal(await page.locator('#control-panel-conduction').isVisible(),true);
        await page.keyboard.press('End');await active('[data-panel=signal]');await page.keyboard.press('Home');await active('[data-panel=base]');
        assert.equal(await page.locator('.control-tabs [tabindex="0"]').count(),1);
        await page.locator('#scale-toolbar [data-key="view.gain"]').focus();await page.locator('#scale-toolbar [data-key="view.gain"]').selectOption('5');
        await active('#scale-toolbar [data-key="view.gain"]');
        await page.locator('#scale-toolbar [data-key="view.gain"]').selectOption('10');
        // Mobile off-canvas navigation is truly absent from keyboard/AT until opened.
        if(width===390) {
          assert.equal(await page.locator('#catalog').evaluate(e=>e.inert),true);
          await key('[data-action=catalog]');await page.getByRole('dialog',{name:'Biblioteca de patrones'}).waitFor();await active('#case-search');
          assert.equal(await page.locator('.workspace').evaluate(e=>e.inert),true);
          await page.locator('[data-action=close-catalog]').focus();await page.keyboard.press('Shift+Tab');
          assert.equal(await page.locator('#catalog .case-button:not(:disabled)').last().evaluate(e=>e===document.activeElement),true);
          await page.keyboard.press('Tab');await active('[data-action=close-catalog]');
          await page.keyboard.press('Escape');await active('[data-action=catalog]');
          await key('[data-action=catalog]');await page.locator('#case-search').fill('sinusal');
          await key('[data-preset=sinus]');await ready();await active('#case-title');
          assert.equal(await page.locator('#catalog').evaluate(e=>e.inert),true);
        }
        await page.locator('#case-title').scrollIntoViewIfNeeded();await page.screenshot({path:resolve(out,stem+'-main.png')});
        // The new sequence is a native selector; preserve focus through rerender.
        await key('[data-panel=conduction]');
        await page.locator('[data-key="rhythm"]').selectOption('flutter');await ready();
        await key('[data-panel=conduction]');
        const flutterPattern=page.locator('[data-key="flutterPattern"]');
        await flutterPattern.focus();await flutterPattern.selectOption('2-3');await ready();
        await active('[data-key="flutterPattern"]');
        assert.equal(await page.locator('[data-key="flutterRatio"]').isDisabled(),true);
        assert.equal(await flutterPattern.inputValue(),'2-3');
        await fits('#control-panel-conduction');
        await page.locator('#case-title').scrollIntoViewIfNeeded();
        // Native disclosure keeps provenance available without burying the mobile trace.
        const summary=page.locator('#exploration-context summary');
        await summary.focus();await page.keyboard.press('Enter');
        assert.equal(await page.locator('.exploration-disclosure').evaluate(e=>e.open),true);
        await page.keyboard.press('Space');
        assert.equal(await page.locator('.exploration-disclosure').evaluate(e=>e.open),false);
        assert.equal(await page.locator('#exploration-context>p').isVisible(),true);
        const summaryBox=await summary.boundingBox();
        assert.ok(summaryBox.height>=44,'Disclosure touch target: '+JSON.stringify(summaryBox));
        await page.evaluate(()=>window.scrollTo(0,0));
        const firstViewport=await page.locator('#ecg').evaluate(e=>{
          const b=e.getBoundingClientRect();return {top:b.top,visible:Math.max(0,Math.min(b.bottom,innerHeight)-Math.max(b.top,0)),height:innerHeight};
        });
        if(width===390)assert.ok(firstViewport.visible>=160,'First viewport must include a meaningful ECG segment: '+JSON.stringify(firstViewport));
        await page.screenshot({path:resolve(out,stem+'-flutter-variable.png')});
        await flutterPattern.selectOption('fixed');await ready();
        assert.equal(await page.locator('[data-key="flutterRatio"]').isDisabled(),false);
        await key('[data-panel=base]');
        if(width===390) await key('[data-action=catalog]');
        await key('[data-preset=sinus]');await ready();

        // Quality must follow known acquisition filtering, including the large monitor number.
        await key('[data-panel=signal]');
        await page.locator('[data-key="filter"]').selectOption('aggressive');await ready();
        assert.equal(await page.locator('#metrics .quality-dot.usable').count(),0);
        assert.ok((await page.locator('#metrics .metric strong').allTextContents()).every(t=>t.trim()==='—'));
        await key('[data-mode=monitor]');
        assert.equal(await page.locator('#monitor-rate').innerText(),'—');
        assert.equal(await page.locator('#monitor-rate-note').innerText(),'No estimable');
        await page.locator('#monitor-rate').scrollIntoViewIfNeeded();
        await page.screenshot({path:resolve(out,stem+'-filter-scope.png')});
        await page.locator('[data-key="filter"]').selectOption('monitor');await ready();
        assert.equal(await page.locator('#monitor-rate-note').innerText(),'lpm · revisar');
        await page.locator('[data-key="filter"]').selectOption('diagnostic');await ready();
        assert.notEqual(await page.locator('#monitor-rate').innerText(),'—');
        await key('[data-mode=paper]');await key('[data-panel=base]');
        // Demand VVI: an intrinsic source faster than the lower rate inhibits pacing.
        await key('[data-panel=conduction]');
        await page.locator('[data-key="rhythm"]').selectOption('paced');await ready();
        await page.locator('[data-key="pacing"]').selectOption('VVI');await ready();
        await page.locator('[data-key="pacingBehavior"]').selectOption('demand');await ready();
        const intrinsic=page.locator('[data-key="intrinsicRate"]');
        assert.equal(await intrinsic.isDisabled(),false);
        await intrinsic.focus();
        await intrinsic.evaluate(el=>{el.value='90';el.dispatchEvent(new Event('input',{bubbles:true}));});await ready();
        await active('[data-key="intrinsicRate"]');
        assert.match(await page.locator('#metrics .metric').first().innerText(),/90/);
        await page.locator('[data-key="pacingBehavior"]').scrollIntoViewIfNeeded();
        await page.screenshot({path:resolve(out,stem+'-vvi-demand-controls.png')});
        await page.locator('#ecg').screenshot({path:resolve(out,stem+'-vvi-demand-trace.png')});
        await page.locator('[data-key="pacingBehavior"]').selectOption('fixed');await ready();
        assert.equal(await page.locator('[data-key="intrinsicRate"]').isDisabled(),true);
        if(width===390) await key('[data-action=catalog]');
        await key('[data-preset=sinus]');await ready();
        await key('.topbar [data-action=about]');await page.getByRole('dialog',{name:'Modelo, alcance y referencias'}).waitFor();
        await page.keyboard.press('Escape');await page.locator('#dialog').waitFor({state:'hidden'});await active('.topbar [data-action=about]');
        page.on('request',r=>requests.push({method:r.method(),url:r.url()}));
        // File choice is a test fixture; OS file-picker accessibility is a physical checklist item.
        await key('[data-action=external]');await page.getByRole('dialog',{name:'Explorar una señal'}).waitFor();
        await page.locator('#external-files').setInputFiles({name:'development.csv',mimeType:'text/csv',buffer:csv});
        await key('[data-external=load]');await page.locator('#external-aptitude').waitFor();
        const before=JSON.parse((await file('[data-external=json]','before.json')).toString());assert.deepEqual(before.leads,leads);
        await key('[data-review=new]');await field('manual-start-sample',640);await field('manual-end-sample',680);
        await page.locator('#manual-range').focus();await page.locator('#manual-range').selectOption('4');await active('#manual-range');
        await key('[data-review=focus]');await active('#manual-canvas');await page.keyboard.press('ArrowRight');
        assert.equal(await page.locator('#manual-end-sample').inputValue(),'681');await page.keyboard.press('ArrowLeft');
        await page.locator('#manual-canvas').scrollIntoViewIfNeeded();
        // Send an integer viewport pixel, then predict its nearest sample BEFORE input.
        // A narrow trace can contain more samples than pixels: keyboard/fields retain
        // one-sample precision; touch must obey its actual pixel grid, not a fictitious
        // fractional pixel chosen by a mouse-only test. No production geometry import.
        const point=await page.locator('#manual-canvas').evaluate(c=>{
          const w=parseFloat(c.style.width),b=c.getBoundingClientRect();
          const x=Math.round(b.left+(38+685/799*(w-54))*b.width/w),y=Math.round(b.top+b.height/2);
          const sample=Math.round(((x-b.left)*w/b.width-38)/(w-54)*799);
          return {x,y,sample};
        });
        if(width===390&&engine.name()!=='firefox')await page.touchscreen.tap(point.x,point.y);else await page.mouse.click(point.x,point.y);
        assert.equal(Number(await page.locator('#manual-end-sample').inputValue()),point.sample);
        assert.equal(Number(await page.locator('#manual-readout').getAttribute('data-ms')),(point.sample-640)*2);
        await key('[data-review=save]');await active('[data-review=new]');
        const sidecar=JSON.parse((await file('[data-review=export]','review.json')).toString());
        assert.equal(sidecar.annotations.length,1);assert.equal(sidecar.annotations[0].endSample,point.sample);
        const after=JSON.parse((await file('[data-external=json]','after.json')).toString());
        assert.deepEqual(after.leads,before.leads);assert.deepEqual(after.measurement,before.measurement);
        await page.locator('#external-review').scrollIntoViewIfNeeded();await page.screenshot({path:resolve(out,stem+'-manual.png')});
        const externalFit=await fits('#external-lab');
        // Full CSV and PNG downloads, not only a button click.
        assert.equal((await file('[data-external=csv]','samples.csv')).length>10000,true);
        assert.equal((await file('[data-external=png]','trace.png')).subarray(1,4).toString(),'PNG');
        await key('[data-external=compare-a]');await page.locator('#external-lab').waitFor({state:'hidden'});
        await key('[data-compare=reader]');assert.equal(await page.locator('#manual-annotations tbody tr').count(),1);
        await key('[data-external=compare-b]');await page.locator('#external-lab').waitFor({state:'hidden'});
        const pair=JSON.parse((await file('#compare-json','comparison.json')).toString());
        assert.deepEqual(pair.A.leads,leads);assert.deepEqual(pair.B.leads,leads);
        assert.ok(pair.sampledDifferences.every(r=>r.maxAbsMv===0));
        const comparisonFit=await fits('#comparison-lab');
        const layouts=[];
        for(const w of [320,720]) {
          await page.setViewportSize({width:w,height:900});
          await page.locator('#comparison-lab').scrollIntoViewIfNeeded();
          layouts.push({viewport:w,comparison:await fits('#comparison-lab')});
          assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'page reflow '+w);
          await key('[data-compare=reader]');await page.locator('#external-lab').waitFor();
          layouts.at(-1).external=await fits('#external-lab');
          await key('[data-external=compare-b]');
        }
        await page.setViewportSize({width,height:width===390?844:1000});
        await page.locator('#comparison-lab').scrollIntoViewIfNeeded();await page.screenshot({path:resolve(out,stem+'-comparison.png')});
        await key('[data-compare=reader]');await key('[data-external=close]');await page.locator('#external-review').waitFor({state:'detached'});
        await active('[data-compare=reader]');
        // Repeated open/close cannot leave modal background inert or retain the cleared editor.
        for(let n=0;n<2;n++){await key('[data-action=external]');await page.keyboard.press('Escape');await page.locator('#external-lab').waitFor({state:'hidden'});await active('[data-action=external]');}
        // Independent smooth impulse train: no case metadata or generator truth enters analysis.
        const weights=[1,1.3,.3,-1.15,.35,.8,-.8,-.4,.2,.6,1.1,.9];
        const impulseCsv=Buffer.from(['# ECG-LAB CSV 1; fs=500; units=mV','time_s,'+names.join(','),
          ...Array.from({length:5000},(_,i)=>{const t=i/500,v=Math.exp(-.5*(((t+.5)%1-.5)/.006)**2)+1e-6*Math.sin(2*Math.PI*.7*t);return[t,...weights.map(w=>w*v)].join(',');})].join('\n'));
        await key('[data-action=external]');
        await page.locator('#external-files').setInputFiles({name:'isolated-impulses.csv',mimeType:'text/csv',buffer:impulseCsv});
        await key('[data-external=load]');await page.locator('#external-aptitude').waitFor();
        assert.equal(await page.locator('#external-aptitude').getAttribute('data-status'),'exploratory');
        await page.locator('#external-metrics').waitFor();
        const pulseReport=JSON.parse((await file('[data-external=json]','impulse-analysis.json')).toString());
        assert.equal(pulseReport.measurement.evidence.hr.status,'unavailable');
        assert.ok(pulseReport.measurement.hr>0,'Raw candidate is retained, not replaced with a fictitious zero');
        assert.equal((await page.locator('#external-metrics tbody tr').first().locator('td').nth(1).innerText()).trim(),'— lpm');
        assert.equal(await page.locator('#external-metrics tbody tr').first().locator('td').nth(2).innerText(),'No estimable');
        await page.locator('#external-metrics').scrollIntoViewIfNeeded();
        await page.screenshot({path:resolve(out,stem+'-impulse-confidence.png')});
        await page.keyboard.press('Escape');await page.locator('#external-lab').waitFor({state:'hidden'});
        assert.equal(await page.locator('.workspace').evaluate(e=>e.inert),false);
        assert.deepEqual(requests.filter(r=>!isLocalGet(r,origin)),[],'No data upload or third-party request; local blob downloads are reads');
        assert.deepEqual(errors,[]);assert.deepEqual(warnings,[]);
        results.push({engine:engine.name(),version:browser.version(),width,build:info,firstViewport,externalFit,comparisonFit,layouts,samplesVerified:120000,keyboard:true,pointer:width===390&&engine.name()!=='firefox'?'emulated-touch':'mouse',stepMs:2,pointerSample:point.sample,manualMs:(point.sample-640)*2,downloads:7,errors,warnings});
        await writeFile(resolve(out,'accessibility-results.json'),JSON.stringify({results,physicalDevice:false,screenReaderTested:false,zoomNote:'320/720 CSS-pixel reflow; not native browser zoom',wcagCertification:false},null,2));
      } catch(e) {
        await page.screenshot({path:resolve(out,stem+'-failure.png')}).catch(()=>{});
        const failure={engine:engine.name(),width,error:String(e.stack),errors,warnings};
        failures.push(failure);
        await writeFile(resolve(out,stem+'-failure.json'),JSON.stringify(failure,null,2));
        // Inspect every independent engine/viewport, then fail the entire job below.
        // Never turn a failure into a skip or a passing job.
      } finally {await context.close();}
    }
  } finally {await browser.close();}
}
await writeFile(resolve(out,'accessibility-summary.json'),JSON.stringify({results,failures,expectedFlows:6,physicalDevice:false,screenReaderTested:false,wcagCertification:false},null,2));
assert.equal(failures.length,0,JSON.stringify(failures));
assert.equal(results.length,6,'Every engine/viewport flow must complete');
console.log(JSON.stringify({accessibilityFlows:results.length,engines:[...new Set(results.map(r=>r.engine))],physicalDevice:false}));
