import { describe, expect, it } from 'vitest';
import { pngWithDpi } from '../src/ui/persistence';
const original = Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aWQ0AAAAASUVORK5CYII=', 'base64'));
const blob = (x:Uint8Array = original) => new Blob([x as Uint8Array<ArrayBuffer>], {type:'image/png'});
function chunks(data:Uint8Array) {
  const out: {type:string;data:Uint8Array;crc:number}[]=[];
  for(let i=8;i<data.length;) { const view=new DataView(data.buffer,data.byteOffset+i), n=view.getUint32(0);
    out.push({type:Buffer.from(data.slice(i+4,i+8)).toString(),data:data.slice(i+8,i+8+n),crc:view.getUint32(n+8)});i+=n+12; }
  return out;
}
describe('physical PNG density is explicit, bounded and non-destructive',()=>{
  it.each([NaN,Infinity,-1,0,1e20,0.001])('rejects unrepresentable density %s',async dpi=>{
    await expect(pngWithDpi(blob(),dpi)).rejects.toThrow(/densidad/i);
  });
  it.each([4,8,20,original.length-1])('rejects truncated PNG at %s bytes',async n=>{
    await expect(pngWithDpi(blob(original.slice(0,n)))).rejects.toThrow(/PNG/);
  });
  it('requires all eight signature bytes',async()=>{
    const bad=original.slice();bad[7]=0;
    await expect(pngWithDpi(blob(bad))).rejects.toThrow(/PNG/);
  });
  it('inserts one 300 dpi metre-based pHYs before IDAT without touching pixels',async()=>{
    const result=await pngWithDpi(blob()),bytes=new Uint8Array(await result.arrayBuffer()),c=chunks(bytes);
    expect(result.type).toBe('image/png');expect(c.map(x=>x.type)).toEqual(['IHDR','pHYs','IDAT','IEND']);
    const p=c[1],v=new DataView(p.data.buffer,p.data.byteOffset);
    expect([v.getUint32(0),v.getUint32(4),p.data[8]]).toEqual([11811,11811,1]);
    expect(p.crc).toBe(0x78a53f76); // independently computed with Python zlib.crc32
    expect(c.filter(x=>x.type!=='pHYs')).toEqual(chunks(original));
    const again=new Uint8Array(await (await pngWithDpi(result)).arrayBuffer());expect(again).toEqual(bytes);
  });
  it('does not silently discard trailing bytes or accept a missing IHDR',async()=>{
    const trailing=new Uint8Array(original.length+1);trailing.set(original);
    await expect(pngWithDpi(blob(trailing))).rejects.toThrow(/PNG/);
    const noHeader=new Uint8Array(original.length-25);noHeader.set(original.slice(0,8));noHeader.set(original.slice(33),8);
    await expect(pngWithDpi(blob(noHeader))).rejects.toThrow(/PNG/);
  });
});
