/** Independent oracle: expected note coordinates inferred from rendered grid + analytic pulses.
 * No production projection, layout, transform or SVG helpers are imported by the oracle.
 * Run: node tests/browser-teaching-pixels.mjs <new-output-directory>
 * A pre-existing output directory is rejected so adverse evidence cannot be overwritten. */
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {createRequire} from 'node:module';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
const root=fileURLToPath(new URL('../',import.meta.url));
const require=createRequire(new URL('../package.json',import.meta.url));
const {build}=require('esbuild'),{chromium}=require('playwright');
if(!process.argv[2])throw new Error('Usage: node tests/browser-teaching-pixels.mjs <new-output-directory>');
const out=path.resolve(process.argv[2]);
await mkdir(path.dirname(out),{recursive:true});
await mkdir(out); // preserve every adverse round
const entry=`
import {buildTeachingPng} from './src/ui/teaching-export';
import {DEFAULT_CASE,LEADS} from './src/engine/types';
window.exportFixture=async(settings)=>{
 const c=structuredClone(DEFAULT_CASE);c.name='Independent raster fixture';
 Object.assign(c.view,settings);
 const a=new Float64Array(5000);a.fill(1,250,350);a.fill(-.5,500,600);a[750]=.8;
 const s={fs:500,duration:10,leads:Object.fromEntries(LEADS.map(l=>[l,a.slice()])),events:{beats:[],atria:[],spikes:[]},truth:{hr:0,pr:null,qrs:null,qt:null,axis:null},warnings:[]};
 const notes=[{id:'box',lead:settings.cabrera?'aVR':'I',kind:'box',t0:.5,t1:.7,v0:.3,v1:.8,text:'Box'},
 {id:'arrow',lead:'V2',kind:'arrow',t0:.5,t1:.7,v0:.8,v1:.2,text:'Arrow'},
 {id:'interval',lead:'V6',kind:'interval',t0:.5,t1:.7,v0:.4,v1:.4,text:'Interval'}];
 const clean=await buildTeachingPng(s,c,[]),marked=await buildTeachingPng(s,c,notes);
 const encode=blob=>new Promise(resolve=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.readAsDataURL(blob)});
 return {clean:await encode(clean),marked:await encode(marked),notes,unchanged:LEADS.every(l=>s.leads[l].every((v,i)=>Object.is(v,a[i])))};
};`;
const bundle=await build({stdin:{contents:entry,resolveDir:root,loader:'ts'},bundle:true,write:false,format:'iife',platform:'browser'});
const server=createServer((req,res)=>{res.setHeader('Content-Type',req.url==='/bundle.js'?'text/javascript':'text/html');res.end(req.url==='/bundle.js'?bundle.outputFiles[0].text:'<!doctype html><title>Independent teaching PNG oracle</title><script src="/bundle.js"></script>');});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const report={protocol:'independent-teaching-png-v1',oracle:'Decoded PNG pixels, acquired analytic pulse and observed grid. No production geometry.',tolerancePixels:1.5,cases:[],negativeControls:[],errors:[],clinicalValidation:false};
report.bundleSha256=createHash('sha256').update(bundle.outputFiles[0].text).digest('hex');
let browser;
function density(url){const b=Buffer.from(url.split(',')[1],'base64'),found=[];for(let i=8;i<b.length;){const n=b.readUInt32BE(i),type=b.toString('ascii',i+4,i+8);if(type==='pHYs')found.push([b.readUInt32BE(i+8),b.readUInt32BE(i+12),b[i+16]]);i+=n+12;}return found;}
async function inspect({fixture,settings,mutation=null}){
 const decode=async url=>{const image=new Image();image.src=url;await image.decode();const c=document.createElement('canvas');c.width=image.width;c.height=image.height;c.getContext('2d').drawImage(image,0,0);return {w:c.width,h:c.height,a:c.getContext('2d').getImageData(0,0,c.width,c.height).data};};
 const clean=await decode(fixture.clean),marked=await decode(fixture.marked),{w,h,a}=clean;
 const group=xs=>{const groups=[];for(const x of xs){const last=groups.at(-1);if(last&&x===last.at(-1)+1)last.push(x);else groups.push([x]);}return groups;};
 const median=xs=>{const ys=xs.slice().sort((x,y)=>x-y);return ys[Math.floor(ys.length/2)];};
 const ink=i=>Math.max(0,(255-a[i])-.46*(253-a[i+1]));
 const rows=[];for(let y=0;y<h;y++){let count=0;for(let x=Math.floor(w*.3);x<Math.floor(w*.85);x++)if(ink((y*w+x)*4)>8)count++;if(count>w*.2)rows.push(y);}
 const bases=group(rows).map(g=>g.reduce((sum,y)=>sum+y,0)/g.length);
 if(bases.length!==12)throw Error('Expected12 independent baselines, got'+bases.length);
 const scores=[];for(let x=0;x<w;x++){let n=0;for(let y=0;y<h;y+=3){const i=(y*w+x)*4;if(a[i]-a[i+1]>8&&a[i+2]-a[i+1]>1&&a[i]>150)n+=a[i]-a[i+1]-2;}scores.push(n/(h/3));}
 const smooth=scores.map((_,i)=>scores.slice(Math.max(0,i-1),i+2).reduce((s,x)=>s+x,0));
 const maximum=Math.max(...smooth),major=group(smooth.flatMap((v,i)=>v>maximum*.5?[i]:[])).map(g=>g.reduce((s,x)=>s+x*scores[x],0)/g.reduce((s,x)=>s+scores[x],0));
 const px=median(major.slice(1).map((x,i)=>x-major[i]))/5;
 if(Math.abs(px-300/25.4)>.05)throw Error('Unexpected recovered paper scale '+px);
 const midY=Math.round(bases[0]-.5*settings.gain*px),cross=[];
 for(let x=0;x<w;x++)if([-1,0,1].some(dy=>ink(((midY+dy)*w+x)*4)>8))cross.push(x);
 const xs=group(cross).map(g=>g.reduce((s,x)=>s+x,0)/g.length);
 if(xs.length!==5)throw Error('Cannot independently recover pulse clock: '+xs.join(','));
 const origin=xs[2]-.5*settings.speed*px;
 const leadOrder=settings.cabrera?['aVL','I','aVR','II','aVF','III','V1','V2','V3','V4','V5','V6']:['I','II','III','aVR','aVL','aVF','V1','V2','V3','V4','V5','V6'];
 const ma=marked.a,purple=i=>ma[i+2]-ma[i]>25&&ma[i+2]-ma[i+1]>45&&ma[i]-ma[i+1]>15;
 if(mutation){const points=[];for(let y=0;y<h;y++)for(let x=0;x<w;x++){const i=(y*w+x)*4;if(purple(i)){points.push([x,y,Array.from(ma.slice(i,i+4))]);ma.set([255,253,253,255],i);}}
   for(const [x,y,color]of points){let xx=x,yy=y;if(mutation==='shift')xx+=Math.round(3*px);if(mutation==='polarity'){const row=bases.findIndex(b=>Math.abs(b-y)<settings.chestGain*px*1.1);if(row===2)yy=Math.round(2*bases[row]-y);}if(xx>=0&&xx<w&&yy>=0&&yy<h)ma.set(color,(yy*w+xx)*4);}}
 const coord=(n,t,v)=>({x:origin+t*settings.speed*px,y:bases[leadOrder.indexOf(n.lead)]-v*(n.lead.startsWith('V')?settings.chestGain:settings.gain)*(settings.cabrera&&n.lead==='aVR'?-1:1)*px});
 const edge=(p,axis)=>{const indices=[];for(let d=-8;d<=8;d++){const x=Math.round(p.x+(axis==='x'?d:0)),y=Math.round(p.y+(axis==='y'?d:0));if(x>=0&&y>=0&&x<w&&y<h&&purple((y*w+x)*4))indices.push(axis==='x'?x:y);}if(!indices.length)return Infinity;return Math.abs(indices.reduce((s,v)=>s+v,0)/indices.length-p[axis]);};
 const evidence=[];for(const n of fixture.notes){const p0=coord(n,n.t0,n.v0),p1=coord(n,n.t1,n.v1);let errors;
 if(n.kind==='box')errors=[edge({x:(p0.x+p1.x)/2,y:p0.y},'y'),edge({x:(p0.x+p1.x)/2,y:p1.y},'y'),edge({x:p0.x,y:(p0.y+p1.y)/2},'x'),edge({x:p1.x,y:(p0.y+p1.y)/2},'x')];
 else if(n.kind==='interval')errors=[edge({x:(p0.x+p1.x)/2,y:p0.y},'y'),edge({x:p0.x,y:p0.y+.5*px},'x'),edge({x:p1.x,y:p0.y+.5*px},'x')];
 else errors=[edge({x:(p0.x+p1.x)/2,y:(p0.y+p1.y)/2},'y')];
 evidence.push({kind:n.kind,lead:n.lead,expected:[p0,p1],errors,maxError:Math.max(...errors)});
 }
 return {width:w,height:marked.h,scalePxPerMm:px,origin,baselines:bases,evidence,pass:evidence.every(e=>e.maxError<=1.5)};
}
try{
 browser=await chromium.launch({headless:true});const page=await browser.newPage();await page.goto(`http://127.0.0.1:${server.address().port}/`);
 for(const settings of [{speed:25,gain:10,chestGain:5,cabrera:false},{speed:50,gain:5,chestGain:20,cabrera:true}]){
  const fixture=await page.evaluate(s=>window.exportFixture(s),settings);
  assert(fixture.unchanged,'Export mutated acquired samples');assert.deepEqual(density(fixture.marked),[[11811,11811,1]]);
  await writeFile(path.join(out,`${settings.speed}-marked.png`),Buffer.from(fixture.marked.split(',')[1],'base64'));
  const result=await page.evaluate(inspect,{fixture,settings});report.cases.push({settings,...result});assert(result.pass,'Annotation registration failed '+JSON.stringify(result));
  const shifted=await page.evaluate(inspect,{fixture,settings,mutation:'shift'});report.negativeControls.push({kind:'shift3mm',settings,pass:!shifted.pass});assert(!shifted.pass,'Oracle missed shifted annotation');
  if(settings.cabrera){const flipped=await page.evaluate(inspect,{fixture,settings,mutation:'polarity'});report.negativeControls.push({kind:'invert-aVR-annotation',settings,pass:!flipped.pass});assert(!flipped.pass,'Oracle missed inverted Cabrera annotation');}
 }
}catch(e){report.errors.push(String(e.stack||e));process.exitCode=1;}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));await writeFile(path.join(out,'results.json'),JSON.stringify(report,null,2));}
console.log(JSON.stringify(report,null,2));
