/** Optical continuity judge. Runs on decoded screenshots/downloads, without
 * renderer geometry, canvas draw commands, or production unit helpers. */
export async function inspectPaperContinuity({base64, columns, rhythmRows = 0, mutation = null}) {
  const image = new Image(); image.src = 'data:image/png;base64,' + base64; await image.decode();
  const canvas = document.createElement('canvas'); canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
  const ctx = canvas.getContext('2d'); ctx.drawImage(image, 0, 0);
  const {width:w, height:h} = canvas, a = ctx.getImageData(0, 0, w, h).data;
  const groups = xs => { const out=[]; for(const x of xs) { const g=out.at(-1); if(g && x===g.at(-1)+1)g.push(x); else out.push([x]); } return out; };
  const median = xs => xs.slice().sort((a,b)=>a-b)[Math.floor(xs.length/2)];
  const ink = (x,y) => { const i=(y*w+x)*4; return Math.max(0,(255-a[i])-.46*(253-a[i+1]))>8; };
  // Recover the 5 mm grid from its colour and periodicity, not paper dimensions.
  const projection=[];
  for(let x=0;x<w;x++) { let sum=0; for(let y=0;y<h;y+=3) { const i=(y*w+x)*4;
    if(a[i]-a[i+1]>8 && a[i+2]-a[i+1]>1 && a[i]>150)sum+=a[i]-a[i+1]-2;
  } projection.push(sum/(h/3)); }
  const smooth=projection.map((_,i)=>projection.slice(Math.max(0,i-1),i+2).reduce((s,x)=>s+x,0));
  const threshold=Math.max(...smooth)*.5;
  const lines=groups(smooth.flatMap((n,i)=>n>threshold?[i]:[])).map(g=>g.reduce((s,x)=>s+x*projection[x],0)/g.reduce((s,x)=>s+projection[x],0));
  const pxPerMm=median(lines.slice(1).map((x,i)=>x-lines[i]))/5;
  if(lines.length<10 || !Number.isFinite(pxPerMm) || pxPerMm<=0)throw Error('Cannot recover grid scale');
  // A constant analytic signal yields long horizontal ink bands in each row.
  const counts=[];
  for(let y=0;y<h;y++) { let count=0; for(let x=0;x<w;x++)if(ink(x,y))count++; counts.push(count); }
  const bands=groups(counts.flatMap((n,y)=>n>w*.6?[y]:[]));
  const bases=bands.map(g=>g.reduce((s,y)=>s+y*counts[y],0)/g.reduce((s,y)=>s+counts[y],0));
  const runsAt = base => groups(Array.from({length:w},(_,x)=>x).filter(x=>ink(x,Math.round(base))))
    .filter(g=>g.length>w/(columns*4)).map(g=>({start:g[0],end:g.at(-1)}));
  // Corrupt only the first signal band. Grid measurements above are unaffected.
  if(mutation && bases.length) {
    const runs=runsAt(bases[0]); if(runs.length<2)throw Error('No observed inter-lead gap for negative control');
    const center=Math.round((runs[0].end+runs[1].start)/2);
    const x0=mutation==='bridge'?runs[0].end:Math.floor(center-2.5*pxPerMm);
    const x1=mutation==='bridge'?runs[1].start:Math.ceil(center+2.5*pxPerMm);
    for(let y=Math.floor(bases[0])-3;y<=Math.ceil(bases[0])+3;y++)for(let x=x0;x<=x1;x++)
      a.set(mutation==='bridge'?[34,53,60,255]:[255,253,253,255],(y*w+x)*4);
  }
  const rows=bases.map((base,i)=>{
    const runs=runsAt(base),expected=i<12/columns?columns:1;
    const gapsMm=runs.slice(1).map((r,k)=>(r.start-runs[k].end-1)/pxPerMm);
    return {base,runs,gapsMm,expected,passed:runs.length===expected && gapsMm.every(g=>g>=.3 && g<=1.5)};
  });
  return {width:w,height:h,pxPerMm,rows,mutation,passed:rows.length===12/columns+rhythmRows && rows.every(r=>r.passed)};
}
