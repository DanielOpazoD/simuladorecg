/** Raster-only judge. Grid scale is recovered optically; source events come from
 * the worker. Diagram crop starts at the atrial tick top, 2.5 mm above A.
 * No production helpers or SVG path geometry are imported. */
export async function rasterJudge({wave,band,events,start,speed,offset,mutation}){
 const decode=async b=>{const im=new Image();im.src='data:image/png;base64,'+b;await im.decode();const c=document.createElement('canvas');c.width=im.width;c.height=im.height;const ctx=c.getContext('2d');ctx.drawImage(im,0,0);return {w:c.width,h:c.height,a:ctx.getImageData(0,0,c.width,c.height).data};};
 const w=await decode(wave),b=await decode(band),projection=[];
 for(let x=0;x<w.w;x++){let n=0;for(let y=0;y<w.h;y++){const k=(y*w.w+x)*4;if(w.a[k]>150&&w.a[k]>w.a[k+1]&&w.a[k]>w.a[k+2])n+=w.a[k]-w.a[k+1];}projection.push(n);}
 const smooth=projection.map((n,x)=>n+(projection[x-1]??0)+(projection[x+1]??0)),peak=Math.max(...smooth),groups=[];
 for(let x=0;x<w.w;x++)if(smooth[x]>peak*.55){const g=groups.at(-1);if(g&&x===g.at(-1)+1)g.push(x);else groups.push([x]);}
 const lines=groups.map(g=>g.reduce((n,x)=>n+x*projection[x],0)/g.reduce((n,x)=>n+projection[x],0));
 const distances=lines.slice(1).map((x,i)=>x-lines[i]).sort((a,b)=>a-b),px=distances[Math.floor(distances.length/2)]/5;
 if(lines.length<4||!Number.isFinite(px))throw Error('Grid not recovered from raster');
 const origin=lines[0]+offset,ink=(x,y)=>{if(x<0||y<0||x>=b.w||y>=b.h)return false;const k=(y*b.w+x)*4;return b.a[k]<140&&b.a[k+1]<150&&b.a[k+2]<160;};
 let checked=0,matched=0;
 for(const [items,ym] of [[events.atria,.4],[events.beats,20.6]])for(const e of items){
  const x=origin+(e.time-start+(mutation==='time'?.04:0))*speed*(mutation==='scale'?1.1:1)*px,y=ym*px;
  if(e.time<start||x<3||x>=b.w-3)continue;checked++;let hit=false;
  for(let xx=Math.floor(x)-2;xx<=Math.ceil(x)+2;xx++)for(let yy=Math.floor(y)-2;yy<=Math.ceil(y)+2;yy++)if(ink(xx,yy))hit=true;
  if(hit)matched++;
 }
 return {gridLines:lines.length,pxPerMm:px,origin,checked,matched,ratio:matched/checked,mutation};
}
