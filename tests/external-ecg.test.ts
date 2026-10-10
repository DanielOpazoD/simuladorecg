import { describe, it } from 'vitest';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseWfdb16, parseECGCsv, externalWindow, exportECGCsv } from '../src/io/external-ecg';
import { LEADS } from '../src/engine/types';
import { analyzeSamples } from '../src/engine/sample-analysis';

function fixture(fs = 100, seconds = 10, order = [...LEADS], unit = 'mV', baseline = 13) {
  const n = fs * seconds, data = new ArrayBuffer(n * 12 * 2), v = new DataView(data);
  for (let i = 0; i < n; i++) for (let j = 0; j < 12; j++) v.setInt16((i * 12 + j) * 2, (i * (j + 1)) % 700 - 340, true);
  const header = [`test 12 ${fs} ${n}`, ...order.map((l,j) => {
    let sum = 0; for (let i = 0; i < n; i++) sum = (sum + v.getInt16((i * 12 + j) * 2, true)) & 65535;
    return `test.dat 16 100(${baseline})/${unit} 16 0 ${v.getInt16(j * 2, true)} ${sum} 0 ${l}`;
  }), '# Comment with private fields deliberately ignored'].join('\n');
  return {header,data};
}
function parsed() { const f = fixture(); return parseWfdb16(f.header, f.data, 'test.dat'); }
function rejectHeader(change: (s:string)=>string, pattern:RegExp) {
  const f = fixture(); assert.throws(()=>parseWfdb16(change(f.header), f.data, 'test.dat'), pattern);
}
function csv() { return exportECGCsv(parsed()); }

describe('External WFDB: strict conversion, no synthetic references', () => {
  it('decodes every signed little-endian value with each declared baseline and gain', () => {
    const f = fixture(), record = parseWfdb16(f.header,f.data,'test.dat'), v = new DataView(f.data);
    assert.equal(record.fs,100); assert.equal(record.samples,1000); assert.equal(record.duration,10);
    LEADS.forEach((l,j)=>{for(let i=0;i<1000;i++) assert.equal(record.leads[l][i],(v.getInt16((i*12+j)*2,true)-13)/100);});
    assert.equal(record.provenance.checksumVerified,true);
    assert.equal(record.provenance.origin,'unverified');
    for (const key of ['truth','events','case','diagnosis','name']) assert.ok(!(key in record));
    assert.ok(!JSON.stringify(record.provenance).includes('private'));
  });
  it('maps actual channel labels, not fixed positional assumptions', () => {
    const f=fixture(100,10,[...LEADS].reverse());
    const r=parseWfdb16(f.header.toLowerCase().replaceAll('/mv','/mV'),f.data,'test.dat');
    for(let i=0;i<r.samples;i++) assert.equal(r.leads.V6[i],(((i%700)-340)-13)/100);
  });
  it('converts microvolts once and uses ADC zero when baseline is not declared', () => {
    const f=fixture(100,10,[...LEADS],'uV');
    const r=parseWfdb16(f.header.replaceAll('100(13)/uV','100/uV').replaceAll(' 16 0 -340',' 16 7 -340'),f.data,'test.dat');
    assert.equal(r.leads.II[0],(-340-7)/100/1000);
  });
  for (const unit of ['uV','µV','μV']) it(`supports declared ${unit}`,()=>{
    const f=fixture(100,10,[...LEADS],unit),r=parseWfdb16(f.header,f.data,'test.dat');assert.equal(r.leads.I[0],-3.53/1000);
  });
  it('preserves flat signals; never manufactures peaks',()=>{
    const f=fixture();new Uint8Array(f.data).fill(0);
    const header=['flat 12 100 1000',...LEADS.map(l=>`flat.dat 16 100(0)/mV 16 0 0 0 0 ${l}`)].join('\n');
    const r=parseWfdb16(header,f.data,'flat.dat');const m=analyzeSamples(externalWindow(r,0));
    assert.equal(m.hr,null);assert.equal(m.qt,null);assert.equal(m.evidence.hr.status,'unavailable');assert.deepEqual(m.detectedPeaks,[]);
  });
  for(const format of ['212','24','32','16x2','16:1','16+2']) it(`rejects unsupported ${format} before decoding`,()=>rejectHeader(s=>s.replace(' 16 100',' '+format+' 100'),/Sólo WFDB/));
  it('rejects uncalibrated gain instead of assuming a scale',()=>rejectHeader(s=>s.replace('100(13)','0(13)'),/ganancia ADC/));
  it('rejects missing units',()=>rejectHeader(s=>s.replace('100(13)/mV','100(13)'),/unidades/));
  it('rejects multisegment records',()=>rejectHeader(s=>s.replace('test 12','test/2 12'),/multisegmentos/));
  it('rejects duplicate leads even when twelve lines remain',()=>rejectHeader(s=>s.replace(' 0 II\n',' 0 I\n'),/duplicadas/));
  it('rejects unfamiliar lead labels instead of fabricating the missing ones',()=>rejectHeader(s=>s.replace(' 0 I\n',' 0 MLII\n'),/Derivación/));
  it('rejects incomplete channel sets',()=>rejectHeader(s=>s.replace('test 12','test 8'),/doce/));
  it('rejects mismatched pairs and remote paths',()=>{
    const f=fixture();assert.throws(()=>parseWfdb16(f.header,f.data,'other.dat'),/no coincide/);
    assert.throws(()=>parseWfdb16(f.header.replaceAll('test.dat','../test.dat'),f.data,'../test.dat'),/no coincide/);
  });
  it('rejects truncated and extra DAT bytes',()=>{
    const f=fixture();for(const buffer of [f.data.slice(0,-2),new ArrayBuffer(f.data.byteLength+2)]) assert.throws(()=>parseWfdb16(f.header,buffer,'test.dat'),/Longitud/);
  });
  it('rejects changed initial sample and checksum corruption',()=>{
    const f=fixture();new DataView(f.data).setInt16(0,4,true);assert.throws(()=>parseWfdb16(f.header,f.data,'test.dat'),/Primera muestra/);
    const g=fixture();new DataView(g.data).setInt16(100,4,true);assert.throws(()=>parseWfdb16(g.header,g.data,'test.dat'),/Checksum/);
  });
  it('rejects missing data sentinel rather than zero filling',()=>{
    const f=fixture();new DataView(f.data).setInt16(100,-32768,true);assert.throws(()=>parseWfdb16(f.header,f.data,'test.dat'),/ausentes/);
  });
  for(const fs of ['0','99','1001','500.5','NaN','500/1000']) it(`rejects unsupported sample rate ${fs}`,()=>rejectHeader(s=>s.replace('12 100 1000',`12 ${fs} 1000`),/Muestreo|número|segundos/));
});

describe('External CSV: explicit physical units, sample integrity and round trip',()=>{
  it('round-trips every double value without rounding, and no patient fields',()=>{
    const r=parsed();const result=parseECGCsv(exportECGCsv(r));assert.deepEqual(result.leads,r.leads);assert.equal(result.fs,r.fs);
    assert.ok(!csv().includes('private'));assert.equal(result.provenance.checksumVerified,false);
  });
  it('accepts explicitly declared plain CSV and BOM/CRLF',()=>{
    const s=csv().split('\n').slice(1).join('\r\n');const r=parseECGCsv('\uFEFF'+s,{fs:100,unit:'mV'});assert.deepEqual(r.leads,parsed().leads);
  });
  it('refuses guessing Hz/units or contradicting metadata',()=>{
    assert.throws(()=>parseECGCsv(csv().split('\n').slice(1).join('\n')),/declara frecuencia/);
    assert.throws(()=>parseECGCsv(csv(),{fs:500,unit:'mV'}),/contradicen/);
    assert.throws(()=>parseECGCsv(csv(),{fs:100,unit:'uV'}),/contradicen/);
  });
  it('supports arbitrary channel order and no time column when fs is explicit',()=>{
    const r=parsed(), order=[...LEADS].reverse(); const s=[order.join(','),...Array.from({length:r.samples},(_,i)=>order.map(l=>r.leads[l][i]).join(','))].join('\n');
    assert.deepEqual(parseECGCsv(s,{fs:100,unit:'mV'}).leads,r.leads);
  });
  for(const bad of ['NaN','Infinity','','=1+2','0x100','"1"']) it(`rejects invalid CSV sample ${JSON.stringify(bad)}`,()=>{
    const lines=csv().split('\n'), row=lines[4].split(',');row[1]=bad;lines[4]=row.join(',');assert.throws(()=>parseECGCsv(lines.join('\n')),/número/);
  });
  it('rejects a missing time row rather than shifting all remaining samples',()=>{
    const lines=csv().split('\n');lines.splice(10,1);assert.throws(()=>parseECGCsv(lines.join('\n')),/segundos|tiempo irregular/);
  });
  it('rejects timestamp drift and a nonzero start',()=>{
    assert.throws(()=>parseECGCsv(csv().replace('\n0,','\n10,')),/tiempo irregular/);
    assert.throws(()=>parseECGCsv(csv().replace('\n0.01,','\n0.013,')),/tiempo irregular/);
  });
  it('rejects interior blank rows, semicolon delimiters and absent columns',()=>{
    assert.throws(()=>parseECGCsv(csv().replace('\n0.01,','\n\n0.01,')),/columnas/);
    assert.throws(()=>parseECGCsv(csv().replaceAll(',',';')),/doce/);
    assert.throws(()=>parseECGCsv(csv().replace('I,II,III','I,I,III')),/duplicadas/);
  });
  it('rejects excessive duration and finite but unsafe physical scale',()=>{
    assert.throws(()=>parseECGCsv(csv().replace('fs=100','fs=10')),/Muestreo/);
    assert.throws(()=>parseECGCsv(csv().replace('-3.53','1e308')),/amplitud/);
  });
  it('selects ten seconds sample-exactly without modifying the original',()=>{
    const f=fixture(100,20),r=parseWfdb16(f.header,f.data,'test.dat'),before=r.leads.I.slice();
    const w=externalWindow(r,3.21);assert.equal(w.leads.I.length,1000);assert.deepEqual(w.leads.I,before.slice(321,1321));
    w.leads.I.fill(0);assert.deepEqual(r.leads.I,before);
    for(const start of [-.1,NaN,Infinity,11]) assert.throws(()=>externalWindow(r,start),/fuera/);
  });
});

describe('Already-exposed LUDB development data through the new reader',()=>{
  for(const id of [1,2,3,4]) it(`record ${id}: all 60000 physical samples agree with independent decoding`,()=>{
    const root='tests/reference/ludb/fixtures/development/';const meta=JSON.parse(readFileSync(root+id+'.json','utf8'));
    const bytes=readFileSync(root+id+'.dat');
    // Reconstructed de-identified format-16 header; original DAT remains untouched.
    const header=[`${id} 12 ${meta.fs} ${meta.samples}`,...meta.channels.map((c:any,j:number)=>{
      let sum=0;for(let i=0;i<meta.samples;i++)sum=(sum+bytes.readInt16LE((i*12+j)*2))&65535;
      return `${id}.dat 16 ${c.adcGain}(${c.baseline})/mV 16 0 ${bytes.readInt16LE(j*2)} ${sum} 0 ${c.lead}`;
    })].join('\n');
    const r=parseWfdb16(header,bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength) as ArrayBuffer,`${id}.dat`);
    meta.channels.forEach((c:any,j:number)=>{for(let i=0;i<meta.samples;i++)assert.equal(r.leads[c.lead as keyof typeof r.leads][i],(bytes.readInt16LE((i*12+j)*2)-c.baseline)/c.adcGain);});
    const before=r.leads.II.slice(), m=analyzeSamples(externalWindow(r,0));assert.deepEqual(r.leads.II,before);
    assert.deepEqual(m.window,{start:0,end:10});assert.ok(m.detectedPeaks.length>0);
    assert.deepEqual(parseECGCsv(exportECGCsv(r)).leads,r.leads);
  });
});

