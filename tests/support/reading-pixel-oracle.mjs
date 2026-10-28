/** Raster-only judge: recover the physical grid optically, then compare ink with
 * final worker samples. No SVG paths, renderer geometry or production imports. */
export async function inspectEnlargedPixels({base64,samples,fs,start,end,polarity=1,mutation=null}) {
  const image=new Image();image.src='data:image/png;base64,'+base64;await image.decode();
  const canvas=document.createElement('canvas');canvas.width=image.naturalWidth;canvas.height=image.naturalHeight;
  const ctx=canvas.getContext('2d');ctx.drawImage(image,0,0);const {width:w,height:h}=canvas,a=ctx.getImageData(0,0,w,h).data;
  const groups=xs=>{const out=[];for(const x of xs){const g=out.at(-1);if(g&&x===g.at(-1)+1)g.push(x);else out.push([x]);}return out;};
  // Integrate chroma across adjacent columns: subpixel grid lines split their ink
  // between pixels at some zoom levels. A hard per-pixel threshold misses them.
  const projection=Array.from({length:w},(_,x)=>{let n=0;for(let y=0;y<h;y++){const k=(y*w+x)*4;if(a[k]>150&&a[k+2]>a[k+1])n+=Math.max(0,a[k]-a[k+1]);}return n;});
  const smoothed=projection.map((n,x)=>n+(projection[x-1]??0)+(projection[x+1]??0));
  const peak=Math.max(...smoothed);
  const lines=groups(smoothed.flatMap((n,x)=>n>peak*.55?[x]:[])).map(g=>g.reduce((s,x)=>s+x*projection[x],0)/g.reduce((s,x)=>s+projection[x],0));
  const distances=lines.slice(1).map((x,i)=>x-lines[i]).sort((a,b)=>a-b),px=distances[Math.floor(distances.length/2)]/5;
  if(lines.length<4||!Number.isFinite(px))throw Error('Independent grid detection failed');
  const values=samples.slice(Math.round(start*fs),Math.round(end*fs)+1),top=Math.ceil(Math.max(...values.map(x=>x*polarity))*10)/10+.2;
  const ink=(x,y)=>{if(x<0||x>=w||y<0||y>=h)return false;const k=(y*w+x)*4;return a[k]<140&&a[k+1]<150&&a[k+2]<160;};
  let checked=0,matched=0;
  for(let i=0;i<values.length;i+=3){
    const x=(4+(i/fs+(mutation==='time'?.04:0))*50)*px;
    const value=values[i]*polarity*(mutation==='polarity'?-1:1)+(mutation==='voltage'?.35:0);
    const y=(4+(top-value)*10)*px;if(x<3||x>=w-3||y<3||y>=h-3)continue;
    checked++;let found=false;for(let yy=Math.floor(y)-2;yy<=Math.ceil(y)+2;yy++)for(let xx=Math.floor(x)-2;xx<=Math.ceil(x)+2;xx++)if(ink(xx,yy))found=true;
    if(found)matched++;
  }
  return {width:w,height:h,gridLines:lines.length,pxPerMm:px,checked,matched,ratio:matched/checked,mutation,passed:checked>50&&matched/checked>=.97};
}
