/** A15/A16: same built bytes, three engines; not a physical-device or WCAG certification. */
import {chromium,firefox,webkit} from 'playwright';
import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {isLocalGet} from './support/browser-request-policy.mjs';
import {openAdjust,openControlPanel,openPaper} from './support/adjust-panel.mjs';
import {readMeasurements} from './support/measurement-dialog.mjs';
const url=process.env.ECG_TEST_URL||'http://127.0.0.1:5173/';
const origin=new URL(url).origin;
const out=resolve(process.env.ECG_EVIDENCE_DIR||'.sites-runtime/accessibility');
await mkdir(out,{recursive:true});
const info=JSON.parse(await readFile('dist/build-info.json','utf8'));
assert.equal(info.dirty,false);
if(process.env.ECG_EXPECT_COMMIT)assert.equal(info.commit,process.env.ECG_EXPECT_COMMIT);
const results=[],failures=[];
const engines=process.env.ECG_ACCESSIBILITY_ENGINES==='chromium'?[chromium]:[chromium,webkit,firefox];
for(const engine of engines) {
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
      const file=async(selector,name)=>{
        const waiting=page.waitForEvent('download');await key(selector);const p=resolve(out,`${stem}-${name}`);await(await waiting).saveAs(p);return readFile(p);
      };
      const fits=async scope=>{
        const proof=await page.locator(scope).evaluate(root=>({width:root.clientWidth,scroll:root.scrollWidth,
          controls:[...root.querySelectorAll('button,input:not([type=checkbox]):not([type=range]),select')].filter(e=>e.checkVisibility()&&!e.closest('[hidden],.measurement-table-wrap')).map(e=>{
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
        // «Ajustar el caso» is a native disclosure folded at the end of the page: Enter opens it and focus stays on its summary.
        assert.equal(await page.locator('#adjust').evaluate(e=>e.open),false);
        await key('#adjust > summary');assert.equal(await page.locator('#adjust').evaluate(e=>e.open),true);await active('#adjust > summary');
        // Ritmo is the first and default tab; the order is Ritmo, Intervalos, ST y ondas, Señal.
        assert.equal(await page.locator('[data-panel=conduction]').getAttribute('aria-selected'),'true');
        await page.locator('[data-panel=conduction]').focus();await page.keyboard.press('ArrowRight');await active('[data-panel=base]');
        assert.equal(await page.locator('#control-panel-base').isVisible(),true);assert.equal(await page.locator('#control-panel-conduction').isHidden(),true);
        await page.keyboard.press('End');await active('[data-panel=signal]');await page.keyboard.press('Home');await active('[data-panel=conduction]');
        assert.equal(await page.locator('.control-tabs [tabindex="0"]').count(),1);
        assert.equal(await page.locator('#control-panel-conduction').isVisible(),true);
        await openPaper(page);await page.locator('#scale-toolbar [data-key="view.gain"]').focus();await openPaper(page);await page.locator('#scale-toolbar [data-key="view.gain"]').selectOption('5');
        await active('#scale-toolbar [data-key="view.gain"]');
        await openPaper(page);await page.locator('#scale-toolbar [data-key="view.gain"]').selectOption('10');
        // Pick the normal rhythm through the library by keyboard (searching opens every family, so the entry is reachable).
        const chooseSinus=async()=>{
          if(width===390)await key('[data-action=catalog]');
          await page.locator('#case-search').fill('sinusal');
          await key('[data-preset=sinus]');await ready();
        };
        // Mobile off-canvas navigation is truly absent from keyboard/AT until opened.
        if(width===390) {
          assert.equal(await page.locator('#catalog').evaluate(e=>e.inert),true);
          await key('[data-action=catalog]');await page.getByRole('dialog',{name:'Biblioteca de patrones'}).waitFor();await active('#case-search');
          assert.equal(await page.locator('.workspace').evaluate(e=>e.inert),true);
          // Focus is contained in the dialog and wraps in both directions over what a keyboard can really reach:
          // the examples of a folded family are not reachable, its summary is.
          const onLastReachable=()=>page.locator('#catalog').evaluate(root=>{
            const reachable=[...root.querySelectorAll('button,input,select,textarea,a[href],summary,[tabindex]')].filter(e=>!e.disabled&&e.tabIndex>=0&&e.checkVisibility());
            return reachable.at(-1)===document.activeElement;
          });
          await page.locator('[data-action=close-catalog]').focus();await page.keyboard.press('Shift+Tab');
          assert.equal(await onLastReachable(),true,'Shift+Tab from the first control must wrap to the last reachable control of the library');
          await page.keyboard.press('Tab');await active('[data-action=close-catalog]');
          await page.keyboard.press('Escape');await active('[data-action=catalog]');
          await chooseSinus();await active('#case-title');
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
        // Inactive controls remain inspectable through a native disclosure.
        const inactive=page.locator('[data-control-details="conduction"]');
        assert.equal(await inactive.evaluate(e=>e.open),false);
        await key('[data-control-details="conduction"] > summary');
        assert.equal(await inactive.evaluate(e=>e.open),true);
        assert.equal(await page.locator('[data-key="flutterRatio"]').isVisible(),true);
        await flutterPattern.focus();await flutterPattern.selectOption('3-4');await ready();
        await active('[data-key="flutterPattern"]');
        assert.equal(await inactive.evaluate(e=>e.open),true,'retain disclosure after field rerender');
        await key('[data-control-details="conduction"] > summary');
        assert.equal(await inactive.evaluate(e=>e.open),false);
        await flutterPattern.selectOption('2-3');await ready();
        const conductionFit=await fits('#control-panel-conduction');
        // The model's limits are a native disclosure of their own, keyboard operable and closed by default.
        const limits=page.locator('#control-panel-conduction .control-limits');
        assert.equal(await limits.evaluate(e=>e.open),false);
        await key('#control-panel-conduction .control-limits > summary');assert.equal(await limits.evaluate(e=>e.open),true);
        assert.match(await limits.innerText(),/secuencias variables del flutter/);
        await key('#control-panel-conduction .control-limits > summary');assert.equal(await limits.evaluate(e=>e.open),false);
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
        await chooseSinus();

        // The cards show the model; what the sample analyzer can say lives in the measurements dialog and
        // must follow the known acquisition filtering (and the monitor keeps the model rate, labelled as such).
        await key('[data-panel=signal]');
        await page.locator('[data-key="filter"]').selectOption('aggressive');await ready();
        let measured=await readMeasurements(page);
        assert.ok(Object.values(measured).every(m=>m.status==='unavailable'),'A 2 Hz high-pass leaves no certified measurement: '+JSON.stringify(measured));
        await key('[data-mode=monitor]');
        assert.notEqual(await page.locator('#monitor-rate').innerText(),'—');
        assert.equal(await page.locator('#monitor-rate-note').innerText(),'lpm · modelo');
        await page.locator('#monitor-rate').scrollIntoViewIfNeeded();
        await page.screenshot({path:resolve(out,stem+'-filter-scope.png')});
        await page.locator('[data-key="filter"]').selectOption('monitor');await ready();
        measured=await readMeasurements(page);
        assert.ok(Object.values(measured).every(m=>m.status!=='usable'),'The 0.5-40 Hz monitor filter may distort limits: nothing is certified: '+JSON.stringify(measured));
        assert.equal(measured.hr.status,'review');
        await page.locator('[data-key="filter"]').selectOption('diagnostic');await ready();
        measured=await readMeasurements(page);
        assert.equal(measured.hr.status,'usable');assert.ok(measured.hr.value>0);
        await key('[data-mode=paper]');await key('[data-panel=conduction]');
        // Demand VVI: an intrinsic source faster than the lower rate inhibits pacing.
        await page.locator('[data-key="rhythm"]').selectOption('paced');await ready();
        await page.locator('[data-key="pacing"]').selectOption('VVI');await ready();
        await page.locator('[data-key="pacingBehavior"]').selectOption('demand');await ready();
        const intrinsic=page.locator('[data-key="intrinsicRate"]');
        assert.equal(await page.locator('[data-key="conduction"]').isDisabled(),true);
        assert.equal(await page.locator('[data-key="escape"]').isDisabled(),true);
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
        await chooseSinus();
        await key('.topbar [data-action=about]');await page.getByRole('dialog',{name:'Modelo, alcance y referencias'}).waitFor();
        await page.keyboard.press('Escape');await page.locator('#dialog').waitFor({state:'hidden'});await active('.topbar [data-action=about]');
        // From here on every request must be a local read: no data upload, no third-party request.
        page.on('request',r=>requests.push({method:r.method(),url:r.url()}));
        // Measurements dialog: opened from a card by keyboard, its table keeps rows/columns and is keyboard-scrollable.
        await key('.main-metric');const measurementsDialog=page.getByRole('dialog',{name:'Medidas, límites y consistencia'});await measurementsDialog.waitFor();
        const measurementTable=measurementsDialog.getByRole('table');
        assert.equal(await measurementTable.getByRole('columnheader').count(),4);assert.equal(await measurementTable.getByRole('cell').count(),20);
        assert.deepEqual(await measurementsDialog.locator('.measurement-table-wrap').first().evaluate(w=>({tab:w.tabIndex,role:w.getAttribute('role'),scopes:[...w.querySelectorAll('thead th')].every(th=>th.getAttribute('scope')==='col')})),{tab:0,role:'region',scopes:true});
        await page.keyboard.press('Escape');await measurementsDialog.waitFor({state:'hidden'});await active('.main-metric');
        // Export by keyboard: real downloads (case JSON and a PNG), the dialog stays operable and focus returns to its opener.
        await key('.topbar [data-action=export]');await page.getByRole('dialog',{name:'Exportar y guardar'}).waitFor();
        const savedCase=JSON.parse((await file('[data-action=json]','case.json')).toString());
        assert.equal(savedCase.presetId,'sinus');assert.equal(savedCase.filter,'diagnostic');
        assert.equal((await file('[data-action=png]','trace.png')).subarray(1,4).toString(),'PNG');
        await page.keyboard.press('Escape');await page.locator('#dialog').waitFor({state:'hidden'});await active('.topbar [data-action=export]');
        // Reflow: the folded panel, its tabs and the page itself must not scroll sideways at narrow widths.
        const layouts=[];
        for(const w of [320,720]) {
          await page.setViewportSize({width:w,height:900});
          await openAdjust(page);await page.locator('#adjust').scrollIntoViewIfNeeded();
          assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'page reflow '+w);
          layouts.push({viewport:w,adjust:await fits('#adjust')});
        }
        await page.setViewportSize({width,height:width===390?844:1000});
        await page.locator('#adjust').scrollIntoViewIfNeeded();await page.screenshot({path:resolve(out,stem+'-adjust.png')});
        assert.equal(await page.locator('.workspace').evaluate(e=>e.inert),false);
        assert.deepEqual(requests.filter(r=>!isLocalGet(r,origin)),[],'No data upload or third-party request; local blob downloads are reads');
        assert.deepEqual(errors,[]);assert.deepEqual(warnings,[]);
        results.push({engine:engine.name(),version:browser.version(),width,build:info,firstViewport,conductionFit,layouts,keyboard:true,pointer:'not exercised (the signal reader was retired)',downloads:3,errors,warnings});
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
await writeFile(resolve(out,'accessibility-summary.json'),JSON.stringify({results,failures,expectedFlows:engines.length*2,physicalDevice:false,screenReaderTested:false,wcagCertification:false},null,2));
assert.equal(failures.length,0,JSON.stringify(failures));
assert.equal(results.length,engines.length*2,'Every engine/viewport flow must complete');
console.log(JSON.stringify({accessibilityFlows:results.length,engines:[...new Set(results.map(r=>r.engine))],physicalDevice:false}));
