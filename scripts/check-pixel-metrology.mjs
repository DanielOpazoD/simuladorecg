/** Raster oracle: never imports the renderer's geometry, units or trace helpers. */
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { build } from 'esbuild';
import { chromium } from 'playwright';

const root = fileURLToPath(new URL('../', import.meta.url));
const started=performance.now();
const out = path.resolve(process.argv[2] || path.join(root, '..', 'ECG-QA', `pixel-metrology-${Date.now()}`));
const relativeOut=path.relative(root,out);
assert(path.isAbsolute(relativeOut)||relativeOut==='..'||relativeOut.startsWith('..'+path.sep),
  'Evidence directory must be outside the checkout');
await mkdir(path.dirname(out),{recursive:true});
await mkdir(out); // do not overwrite an earlier evidence round
const entry = `
import { renderPaper } from './src/render/ecg';
import { DEFAULT_CASE, LEADS } from './src/engine/types';
import { handleExportAction } from './src/ui/export-actions';
const canvas = document.querySelector('canvas');
window.prepare = (settings) => {
  const c = structuredClone(DEFAULT_CASE);
  c.name='Instrumento metrológico, no clínico';
  Object.assign(c.view, {format:'12x1', timing:'simultaneous', grid:true, fit:true,
    cabrera:settings.cabrera, speed:settings.speed, gain:settings.gain, chestGain:settings.gain});
  const wave = new Float64Array(5000);
  wave.fill(1,250,350); wave.fill(-0.5,500,600); wave[750]=0.8;
  const s={fs:500,duration:10,leads:Object.fromEntries(LEADS.map(l=>[l,wave.slice()])),
    events:{beats:[],atria:[],spikes:[]},truth:{hr:null,pr:null,qrs:null,qt:null,axis:null},warnings:[]};
  const before=LEADS.map(l=>Array.from(s.leads[l]));
  renderPaper(canvas,s,c,innerWidth-32);
  window.state={c,s,before};
  return {width:canvas.width,height:canvas.height,cssWidth:canvas.getBoundingClientRect().width,
    cssHeight:canvas.getBoundingClientRect().height,dpr:devicePixelRatio};
};
window.exportPng=async()=>{
  let message='';
  await handleExportAction('png',{c:state.c,signal:state.s,canExport:true,hideName:true,
    toast:m=>message=m,refreshDialog:()=>{}});
  return message;
};
window.samplesUnchanged=()=>Object.keys(state.s.leads).every((l,k)=>
  state.s.leads[l].every((v,i)=>Object.is(v,state.before[k][i])));
`;
const bundle = await build({stdin:{contents:entry,resolveDir:root,loader:'ts'},bundle:true,write:false,format:'iife',platform:'browser'});
const server=createServer((req,res)=>{
  res.setHeader('Content-Type',req.url==='/bundle.js'?'text/javascript':'text/html');
  res.end(req.url==='/bundle.js'?bundle.outputFiles[0].text:
    '<!doctype html><html><head><title>ECG raster metrology</title></head><body style="margin:0"><main><canvas aria-label="Analytic ECG calibration signal"></canvas></main><script src="/bundle.js"></script></body></html>');
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const url=`http://127.0.0.1:${server.address().port}/`;
let browser;
const report={protocol:'pixel-metrology-v1',browser:null,browserPlugin:'not available',
  oracle:'RGBA pixels; no production layout or geometry helpers',tolerancePixels:2,
  cases:[],negativeControls:[],failures:[],clinicalValidation:false};
report.bundleSha256=createHash('sha256').update(bundle.outputFiles[0].text).digest('hex');
report.scriptSha256=createHash('sha256').update(await readFile(fileURLToPath(import.meta.url))).digest('hex');
report.protocolSha256=createHash('sha256').update(await readFile(path.join(root,'docs/pixel-metrology-contract.md'))).digest('hex');

/** Runs in browser against either native canvas or decoded downloaded PNG pixels. */
async function inspectRaster({base64=null, settings, mutation=null, nuisance=null}) {
  let canvas=document.querySelector('canvas');
  if(base64){
    const image=new Image(); image.src='data:image/png;base64,'+base64; await image.decode();
    canvas=document.createElement('canvas');canvas.width=image.naturalWidth;canvas.height=image.naturalHeight;
    canvas.getContext('2d').drawImage(image,0,0);
  }
  const {width:w,height:h}=canvas,ctx=canvas.getContext('2d');
  const pixels=ctx.getImageData(0,0,w,h),a=pixels.data;
  // Optical contrast removes the pink grid contribution, including antialiasing.
  // Paper grid has Δred/Δgreen ≈ 0.46, while dark trace has a much larger ratio.
  const ink=i=>Math.max(0,(255-a[i])-.46*(253-a[i+1]));
  const isTrace=i=>ink(i)>8;
  const isGrid=i=>a[i]-a[i+1]>8&&a[i+2]-a[i+1]>1&&a[i]>150;
  const median=x=>{const s=x.slice().sort((a,b)=>a-b);return s[Math.floor(s.length/2)];};
  const groups=values=>{
    const result=[];for(const x of values){const last=result.at(-1);if(last&&x===last.at(-1)+1)last.push(x);else result.push([x]);}return result;
  };
  const centres=values=>groups(values).map(g=>g.reduce((s,x)=>s+x,0)/g.length);
  const rows=[],rowCounts=[];
  for(let y=0;y<h;y++){
    let count=0;for(let x=Math.floor(w*.3);x<Math.floor(w*.85);x++)if(isTrace((y*w+x)*4))count++;
    rowCounts.push(count);
    if(count>w*.2)rows.push(y);
  }
  const bases=groups(rows).map(g=>g.reduce((s,y)=>s+y*rowCounts[y],0)/g.reduce((s,y)=>s+rowCounts[y],0));
  if(bases.length!==12)throw new Error('Expected 12 signal baselines; recovered '+bases.length);
  // Grid scale is recovered independently from the majority of pixels per line.
  const gridX=[],gridY=[];
  for(let x=0;x<w;x++){
    let n=0;for(let y=0;y<h;y+=3){const i=(y*w+x)*4;if(isGrid(i))n+=a[i]-a[i+1]-2;}
    gridX.push(n/(h/3));
  }
  for(let y=0;y<h;y++){
    let n=0;for(let x=0;x<w;x+=3){const i=(y*w+x)*4;if(isGrid(i))n+=a[i]-a[i+1]-2;}
    gridY.push(n/(w/3));
  }
  const majorLines=projection=>{
    const smooth=projection.map((_,i)=>projection.slice(Math.max(0,i-1),i+2).reduce((s,x)=>s+x,0));
    const threshold=Math.max(...smooth)*.5;
    return groups(smooth.flatMap((n,i)=>n>threshold?[i]:[])).map(g=>
      g.reduce((s,i)=>s+i*projection[i],0)/g.reduce((s,i)=>s+projection[i],0));
  };
  const gx=majorLines(gridX),gy=majorLines(gridY);
  if(gx.length<10||gy.length<10)throw new Error('Insufficient independent grid lines');
  const spacing=x=>median(x.slice(1).map((v,i)=>v-x[i]));
  const gridSpacingX=spacing(gx),gridSpacingY=spacing(gy);
  const sx=gridSpacingX/5,sy=gridSpacingY/5;
  // Labels and signal use different ink, but both can be optically dark. Keep
  // only 8-connected ink that reaches the observed baseline. This is a raster
  // topology test, not a feature-size exception or a known label coordinate.
  const connectedInk=(base,half)=>{
    const y0=Math.max(0,Math.floor(base-half)),y1=Math.min(h,Math.ceil(base+half));
    const mask=new Uint8Array(w*(y1-y0)),queue=new Uint32Array(mask.length);
    let head=0,tail=0;
    const visit=(x,y)=>{
      if(x<0||x>=w||y<y0||y>=y1)return;
      const index=(y-y0)*w+x;
      if(mask[index])return;
      mask[index]=2;
      if(isTrace((y*w+x)*4)){mask[index]=1;queue[tail++]=index;}
    };
    for(let x=0;x<w;x++)for(let y=Math.floor(base)-2;y<=Math.ceil(base)+2;y++)visit(x,y);
    while(head<tail){
      const index=queue[head++],x=index%w,y=y0+Math.floor(index/w);
      for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++)if(dx||dy)visit(x+dx,y+dy);
    }
    return (x,y)=>x>=0&&x<w&&y>=y0&&y<y1&&mask[(y-y0)*w+x]===1;
  };
  if(nuisance==='isolated-label'){
    // Raster R glyph in grey annotation ink; no dependence on installed fonts.
    const glyph=['11110','10001','10001','11110','10100','10010','10001'];
    const unit=Math.max(1,Math.round(sx*.6)),x0=Math.round(12*sx),y0=Math.round(bases[3]-8*sy);
    for(let row=0;row<glyph.length;row++)for(let col=0;col<glyph[row].length;col++)if(glyph[row][col]==='1')
      for(let dy=0;dy<unit;dy++)for(let dx=0;dx<unit;dx++)a.set([81,73,80,255],((y0+row*unit+dy)*w+x0+col*unit+dx)*4);
  }
  if(nuisance==='connected-artifact'){
    const x=Math.round(w*.25),base=bases[0];
    for(let y=Math.floor(base-4*sy);y<=Math.ceil(base);y++)for(let dx=0;dx<2;dx++)a.set([34,53,60,255],(y*w+x+dx)*4);
  }
  // Each deliberate corruption changes trace pixels only; grid remains untouched.
  if(mutation){
    const original=a.slice();
    for(let r=0;r<bases.length;r++){
      const base=bases[r],lo=Math.max(0,Math.floor(base-14*sy)),hi=Math.min(h,Math.ceil(base+8*sy));
      const connected=connectedInk(base,Math.max(14,settings.gain+.5)*sy);
      const points=[];
      for(let y=lo;y<hi;y++)for(let x=0;x<w;x++){
        const i=(y*w+x)*4;
        if(connected(x,y)){points.push([x,y,original.slice(i,i+4)]);a.set([255,253,253,255],i);}
      }
      for(const [x,y,color]of points){
        const xx=mutation==='time'?Math.round(x*.8):x;
        const yy=mutation==='amplitude'?Math.round(base+(y-base)*.7):
          mutation==='polarity'&&r===2?Math.round(base-(y-base)):y;
        if(xx>=0&&xx<w&&yy>=0&&yy<h)a.set(color,(yy*w+xx)*4);
      }
    }
  }
  const metrics=[];
  for(let row=0;row<12;row++){
    const base=bases[row],half=(settings.gain+.5)*sy;
    const connected=connectedInk(base,half);
    const activity=[];
    for(let x=0;x<w;x++){
      let present=false;
      for(let y=Math.max(0,Math.floor(base-half));y<Math.min(h,Math.ceil(base+half));y++)
        if(Math.abs(y-base)>3&&connected(x,y)){present=true;break;}
      if(present)activity.push(x);
    }
    // A grid crossing can interrupt the blue chroma of an antialiased trace.
    // Join only holes smaller than the drawn pen, never bridge whole plateaus.
    const features=[];
    for(const x of activity){const last=features.at(-1);
      if(last&&x-last.at(-1)<=Math.ceil(.3*sx)+1)last.push(x);else features.push([x]);}
    if(features.length!==4)throw new Error('Expected calibration and three deflections in row '+row+'; got '+JSON.stringify(features.map(g=>[g[0],g.at(-1)])));
    const data=features.map((xs,k)=>{
      const ys=[];
      // Middle of plateau avoids vertical edges. The one-sample impulse uses all pixels.
      const use=k===3?xs:xs.slice(Math.floor(xs.length*.3),Math.ceil(xs.length*.7));
      for(const x of use)for(let y=Math.max(0,Math.floor(base-half));y<Math.min(h,Math.ceil(base+half));y++)
        if(Math.abs(y-base)>3&&connected(x,y))ys.push(y);
      if(!ys.length)throw new Error('Feature contains no trace pixels');
      const y=k===3?Math.min(...ys):median(ys);
      let x0=xs[0],x1=xs.at(-1);
      if(k!==3){
        // Measure the centre of each vertical edge, not the outside of the pen.
        const midY=Math.round((base+y)/2),left=[],right=[],midX=(x0+x1)/2;
        for(const x of xs)for(let yy=midY-1;yy<=midY+1;yy++){
          const index=(yy*w+x)*4;
          if(connected(x,yy))(x<midX?left:right).push([x,255-a[index]]);
        }
        const centre=points=>points.reduce((s,[x,weight])=>s+x*weight,0)/points.reduce((s,[,weight])=>s+weight,0);
        if(!left.length||!right.length)throw new Error('Cannot recover both vertical pulse edges');
        x0=centre(left);x1=centre(right);
      }
      return {x0,x1,rasterWidth:xs.at(-1)-xs[0],centre:(x0+x1)/2,y,height:base-y};
    });
    const polarity=settings.cabrera&&row===2?-1:1;
    // A negative narrow impulse needs its lowest endpoint rather than its highest.
    if(polarity<0){
      let extreme=-Infinity;for(const x of features[3])for(let y=Math.floor(base-half);y<Math.ceil(base+half);y++)
        if(y>=0&&y<h&&connected(x,y))extreme=Math.max(extreme,y);
      data[3].height=base-extreme;
    }
    const [cal,pos,neg,spike]=data;
    // The cap outside the impulse is ink, not signal amplitude. Infer its radius
    // from the calibration pen's raster extent versus its recovered edge centres.
    // No renderer pen width, layout coordinate or trace function is consulted.
    const penRadius=Math.max(0,(cal.rasterWidth-(cal.x1-cal.x0))/2);
    spike.height-=polarity*penRadius;
    const errors={calibrationHeight:cal.height-settings.gain*sy,
      calibrationWidth:(cal.x1-cal.x0)-.2*settings.speed*sx,
      positiveHeight:pos.height-polarity*settings.gain*sy,
      negativeHeight:neg.height+polarity*.5*settings.gain*sy,
      pulseWidth:(pos.x1-pos.x0)-.2*settings.speed*sx,
      pulseDistance:(neg.centre-pos.centre)-.5*settings.speed*sx,
      spikeHeight:spike.height-polarity*.8*settings.gain*sy};
    metrics.push({row,polarity,errors});
  }
  return {width:w,height:h,gridSpacingX,gridSpacingY,rows:metrics};
}
function failures(result,exported=false){
  const errors=[];
  if(!Number.isFinite(result.gridSpacingX)||!Number.isFinite(result.gridSpacingY)||
    result.gridSpacingX<=0||result.gridSpacingY<=0)errors.push('invalid grid scale');
  if(!Array.isArray(result.rows)||result.rows.length!==12)return [...errors,'invalid row coverage'];
  if(Math.abs(result.gridSpacingX-result.gridSpacingY)>1)errors.push('grid anisotropy');
  if(exported&&Math.abs(result.gridSpacingX-5*300/25.4)>1)errors.push('export grid density');
  const expected=['calibrationHeight','calibrationWidth','positiveHeight','negativeHeight','pulseWidth','pulseDistance','spikeHeight'];
  for(const [index,row]of result.rows.entries()){
    if(row.row!==index||!row.errors||Object.keys(row.errors).length!==expected.length){errors.push('invalid row metrics');continue;}
    for(const name of expected){const error=row.errors[name];
      if(!Number.isFinite(error))errors.push(`row ${row.row} ${name}: invalid value`);
      else if(Math.abs(error)>2)errors.push(`row ${row.row} ${name}: ${error.toFixed(3)} px`);
    }
  }
  return errors;
}
function pngDensity(buffer){
  assert.deepEqual([...buffer.subarray(0,8)],[137,80,78,71,13,10,26,10]);
  const densities=[];for(let p=8;p+12<=buffer.length;){
    const size=buffer.readUInt32BE(p),type=buffer.toString('ascii',p+4,p+8);
    assert(p+size+12<=buffer.length,'truncated PNG');
    if(type==='pHYs')densities.push({x:buffer.readUInt32BE(p+8),y:buffer.readUInt32BE(p+12),unit:buffer[p+16]});
    p+=size+12;
  }
  assert.deepEqual(densities,[{x:11811,y:11811,unit:1}]);
  return densities[0];
}
const matrix=[];
for(const width of [1440,390])for(const dpr of [1,2])for(const cabrera of [false,true])
  matrix.push({width,height:width===390?844:960,dpr,cabrera,speed:cabrera?50:25,gain:cabrera?5:10});
try{
  browser=await chromium.launch({headless:true});
  report.browser=browser.version();
  for(let i=0;i<matrix.length;i++){
    const settings=matrix[i],context=await browser.newContext({viewport:{width:settings.width,height:settings.height},deviceScaleFactor:settings.dpr,acceptDownloads:true});
    const page=await context.newPage(),errors=[];
    page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
    await page.goto(url);await page.waitForFunction(()=>typeof window.prepare==='function');
    assert.equal(await page.title(),'ECG raster metrology');
    const dimensions=await page.evaluate(s=>window.prepare(s),settings);
    assert(dimensions.width>0&&dimensions.height>0);
    const shot=`screen-${i}.png`;
    const screenshot=await page.locator('canvas').screenshot({path:path.join(out,shot)});
    const screen=await page.evaluate(inspectRaster,{base64:screenshot.toString('base64'),settings});
    // Playwright encloses the fractional CSS box before raster capture (≤1 CSS px).
    assert(Math.abs(screen.width-dimensions.cssWidth*settings.dpr)<=settings.dpr,'Screenshot width differs from enclosing CSS box × DPR');
    assert(Math.abs(screen.height-dimensions.cssHeight*settings.dpr)<=settings.dpr,'Screenshot height differs from enclosing CSS box × DPR');
    const screenFailures=failures(screen);
    if(i===0){
      const labelled=await page.evaluate(inspectRaster,{base64:screenshot.toString('base64'),settings,nuisance:'isolated-label'});
      assert.deepEqual(labelled,screen,'An isolated annotation must not alter signal metrology');
      let rejectedConnectedArtifact=false;
      try{
        const contaminated=await page.evaluate(inspectRaster,{base64:screenshot.toString('base64'),settings,nuisance:'connected-artifact'});
        rejectedConnectedArtifact=failures(contaminated).length>0;
      }catch(error){
        if(!String(error).includes('Expected calibration and three deflections'))throw error;
        rejectedConnectedArtifact=true;
      }
      assert(rejectedConnectedArtifact,'Connected extra ink must not be discarded as a label');
      report.annotationIsolation={isolatedGlyphInvariant:true,connectedArtifactRejected:true};
      const poisoned=structuredClone(screen);poisoned.rows[0].errors.positiveHeight=NaN;
      assert(failures(poisoned).length>0,'Decision must reject NaN');
      const missing=structuredClone(screen);delete missing.rows[0].errors.positiveHeight;
      assert(failures(missing).length>0,'Decision must reject missing metrics');
      assert(failures({...screen,rows:[]}).length>0,'Decision must reject missing rows');
      assert(failures({...screen,gridSpacingX:NaN}).length>0,'Decision must reject invalid grid');
      report.decisionNegativeControls={nan:true,missingMetric:true,missingRows:true,invalidGrid:true};
    }
    const downloadPromise=page.waitForEvent('download');
    assert.equal(await page.evaluate(()=>window.exportPng()),'PNG exportado a 300 dpi');
    const download=await downloadPromise,pngName=`export-${i}.png`;
    await download.saveAs(path.join(out,pngName));
    const png=await readFile(path.join(out,pngName)),density=pngDensity(png);
    const exported=await page.evaluate(inspectRaster,{base64:png.toString('base64'),settings});
    const exportFailures=failures(exported,true);
    assert(await page.evaluate(()=>window.samplesUnchanged()),'Renderer/export mutated samples');
    report.cases.push({settings,dimensions,screen,exported,density,screenshot:shot,png:pngName,
      screenshotSha256:createHash('sha256').update(screenshot).digest('hex'),
      pngSha256:createHash('sha256').update(png).digest('hex'),consoleErrors:errors,
      failures:[...screenFailures.map(s=>'screen '+s),...exportFailures.map(s=>'export '+s),...errors]});
    if(i===1)for(const mutation of ['amplitude','time','polarity']){
      const result=await page.evaluate(inspectRaster,{base64:screenshot.toString('base64'),settings,mutation});
      const rejected=failures(result);
      report.negativeControls.push({mutation,rejected:rejected.length>0,failures:rejected});
      assert(rejected.length>0,`Oracle failed to reject ${mutation} corruption`);
    }
    await context.close();
  }
}catch(error){report.failures.push(error.stack||String(error));}
finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
report.passed=report.cases.length===matrix.length&&report.failures.length===0&&report.cases.every(c=>c.failures.length===0)&&report.negativeControls.length===3&&report.negativeControls.every(c=>c.rejected);
report.elapsedMs=Math.round(performance.now()-started);
await writeFile(path.join(out,'results.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({passed:report.passed,cases:report.cases.length,negativeControls:report.negativeControls.length,
  failures:report.failures,caseFailures:report.cases.flatMap((c,i)=>c.failures.map(f=>({case:i,error:f}))),evidence:out},null,2));
if(!report.passed)process.exitCode=1;
