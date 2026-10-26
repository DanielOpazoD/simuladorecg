import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFile, writeFile, mkdtemp, rm, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { generateReviewPacket, verifyReviewPacket } from '../scripts/prepare-clinical-review.mjs';
import { sha256, json, validateProtocol, blindRoster, reviewTemplate, assessReviews, paperSVG } from '../scripts/lib/blind-clinical-review.mjs';

const protocol={kind:'ecg-blind-phenotype-protocol',schemaVersion:1,scope:'development-phenotype-review-not-clinical-validation',
  synthetic:[{preset:'sinus',variants:['preset',17]}],
  external:{dataset:'LUDB-1.0.1',role:'exposed-regression-controls-not-holdout',records:['1']},
  review:{independentReaders:2,adjudication:'all-records-after-blind-readings',maxUnresolvedMajorErrors:0}};
const manifest={packageId:'a'.repeat(64),protocolSha256:'b'.repeat(64),cases:[{id:'ECG-0123456789abcdef'},{id:'ECG-fedcba9876543210'}]};
const wrap=value=>({value,bytes:Buffer.from(json(value))});

// These objects are adversarial TEST FIXTURES, never collected human readings.
function testReading(id='fixture-a'){
  const value=reviewTemplate(manifest);
  Object.assign(value.reviewer,{id,name:id,credential:'TEST FIXTURE, NOT A HUMAN RESULT',independentOfAuthors:true,
    readWithoutKeys:true,completedAt:'2026-01-01T00:00:00.000Z'});
  for(const row of value.rows)Object.assign(row,{assessment:'plausible',majorTeachingError:false,readable:true,observations:'Fixture qualitative description only.'});
  return wrap(value);
}
function testAdjudication(readings){
  const value=reviewTemplate(manifest,'adjudication');
  Object.assign(value.reviewer,{id:'fixture-c',name:'fixture-c',credential:'TEST FIXTURE, NOT A HUMAN RESULT',
    independentOfAuthors:true,completedAt:'2026-01-02T00:00:00.000Z'});
  value.readingSha256=readings.map(r=>sha256(r.bytes));
  for(const row of value.rows)Object.assign(row,{decision:'accepted',expectedPhenotypeChecked:true,reason:'Fixture adjudication explanation only, no clinical evidence.'});
  return wrap(value);
}

describe('Frozen scope and blinding',()=>{
  it('does not serialize non-finite evidence as null or missing data',()=>{
    expect(()=>json({metric:NaN})).toThrow(/Non-finite/);
    expect(()=>json({metric:Infinity})).toThrow(/Non-finite/);
  });
  it('does not allow exposed references to be relabelled as a holdout',()=>{
    expect(validateProtocol(structuredClone(protocol))).toEqual(protocol);
    const changed=structuredClone(protocol);changed.external.role='untouched-holdout';
    expect(()=>validateProtocol(changed)).toThrow(/exposed/);
  });
  it.each([0,-1,NaN,Infinity,1.5,2147483648])('rejects invalid review seed %s',variant=>{
    const changed=structuredClone(protocol);changed.synthetic[0].variants=[variant];
    expect(()=>validateProtocol(changed)).toThrow(/seed/);
  });
  it('rejects duplicate selections instead of inflating independent evidence',()=>{
    const changed=structuredClone(protocol);changed.synthetic[0].variants=['preset','preset'];
    expect(()=>validateProtocol(changed)).toThrow(/duplicate/);
    expect(()=>blindRoster([{preset:'sinus'},{preset:'sinus'}],Buffer.alloc(32,1))).toThrow(/Duplicate/);
  });
  it('uses reproducible secret-key IDs and an order independent of the labelled roster',()=>{
    const items=Array.from({length:20},(_,seed)=>({preset:'sinus',seed}));
    const a=blindRoster(items,Buffer.alloc(32,1)),b=blindRoster(items,Buffer.alloc(32,1)),c=blindRoster(items,Buffer.alloc(32,2));
    expect(a).toEqual(b);expect(a.map(x=>x.id)).not.toEqual(c.map(x=>x.id));
    expect(a.map(x=>x.source.seed)).not.toEqual(items.map(x=>x.seed));
    expect(a.every(x=>/^ECG-[a-f0-9]{16}$/.test(x.id))).toBe(true);
  });
  it('adapts the real paper renderer without source labels and restores clipping as a method',()=>{
    const renderer=(canvas,s,c,width,options)=>{
      expect(options.hideName).toBe(true);expect(options.annotations).toBe(false);
      const ctx=canvas.getContext('2d');ctx.font='600 3px monospace';ctx.fillStyle='#123';
      ctx.fillText('ECG LAB  /  SECRET PRESET',5,6);ctx.fillText('25 mm/s · señal sintética',5,11);
      for(let i=0;i<2;i++){ctx.save();ctx.beginPath();ctx.rect(0,0,10,10);ctx.clip();ctx.beginPath();ctx.moveTo(0,1);ctx.lineTo(1,0);ctx.stroke();ctx.restore();}
      return {widthMm:100,heightMm:50};
    };
    const svg=paperSVG(renderer,{}, {view:{speed:25,gain:10}},manifest.cases[0].id);
    expect(svg).not.toMatch(/SECRET|señal sintética|<script|onload=/);
    expect(svg).toContain(manifest.cases[0].id);expect(svg).toContain('clip-1');
    expect(()=>paperSVG(renderer,{}, {view:{speed:25,gain:10}},'sinus-seed-17')).toThrow(/blinded/);
  });
});

describe('Human review cannot self-certify clinical validation',()=>{
  it('remains pending with zero readers and with untouched generated templates',()=>{
    expect(assessReviews(manifest).reviewState).toBe('pending-human-review');
    const templates=[wrap(reviewTemplate(manifest)),wrap(reviewTemplate(manifest))];
    const result=assessReviews(manifest,templates,wrap(reviewTemplate(manifest,'adjudication')));
    expect(result.reviewState).toBe('pending-human-review');expect(result.readersComplete).toBe(0);
    expect(result.clinicalValidation).toBe(false);
  });
  it('requires both readers and the later adjudication, even if all submitted judgements are favourable',()=>{
    const a=testReading(),b=testReading('fixture-b');
    expect(assessReviews(manifest,[a]).reviewState).toBe('pending-human-review');
    expect(assessReviews(manifest,[a,b]).reviewState).toBe('pending-human-review');
    const result=assessReviews(manifest,[a,b],testAdjudication([a,b]));
    expect(result.reviewState).toBe('review-records-complete-not-clinical-validation');
    expect(result.clinicalValidation).toBe(false);expect(result.authenticatedHumanCredentials).toBe(false);
  });
  it.each(['same-id','same-name'])('rejects duplicate human identities: %s',field=>{
    const a=testReading(),b=testReading('fixture-b');
    b.value.reviewer[field==='same-id'?'id':'name']=field==='same-id'?' FIXTURE-A ':'Fixture-A';
    expect(()=>assessReviews(manifest,[a,wrap(b.value)])).toThrow(/different people/);
  });
  it('rejects automated authorship, a clinicalValidation flag and package substitution',()=>{
    const r=testReading();r.value.reviewer.origin='automated';
    expect(()=>assessReviews(manifest,[wrap(r.value)])).toThrow(/human/);
    const c=testReading();c.value.clinicalValidation=true;
    expect(()=>assessReviews(manifest,[wrap(c.value)])).toThrow(/self-certification/);
    const p=testReading();p.value.packageId='c'.repeat(64);
    expect(()=>assessReviews(manifest,[wrap(p.value)])).toThrow(/identity/);
  });
  it('rejects unknown and duplicated cases and preserves missing cases as pending',()=>{
    const unknown=testReading();unknown.value.rows[0].id='ECG-0000000000000000';
    expect(()=>assessReviews(manifest,[wrap(unknown.value)])).toThrow(/Unknown/);
    const duplicate=testReading();duplicate.value.rows[1].id=duplicate.value.rows[0].id;
    expect(()=>assessReviews(manifest,[wrap(duplicate.value)])).toThrow(/duplicate/);
    const missing=testReading();missing.value.rows.pop();
    expect(assessReviews(manifest,[wrap(missing.value)]).readersComplete).toBe(0);
  });
  it('binds adjudication to the exact two input files and an independent third reader',()=>{
    const a=testReading(),b=testReading('fixture-b'),adj=testAdjudication([a,b]);
    adj.value.readingSha256[0]='f'.repeat(64);
    expect(()=>assessReviews(manifest,[a,b],wrap(adj.value))).toThrow(/exact two/);
    const reused=testAdjudication([a,b]);reused.value.reviewer.id='FIXTURE-A';
    expect(()=>assessReviews(manifest,[a,b],wrap(reused.value))).toThrow(/third independent/);
  });
  it('does not accept a revised in-memory judgement with the old file hash or adjudication before the readings',()=>{
    const a=testReading(),b=testReading('fixture-b');
    const changed=structuredClone(a);changed.value.rows[0].majorTeachingError=true;
    expect(()=>assessReviews(manifest,[changed,b])).toThrow(/bound file bytes/);
    const early=testAdjudication([a,b]);early.value.reviewer.completedAt='2025-01-01T00:00:00.000Z';
    expect(()=>assessReviews(manifest,[a,b],wrap(early.value))).toThrow(/follow both/);
  });
  it('retains disagreements and major/unresolved errors rather than averaging them into approval',()=>{
    const a=testReading(),b=testReading('fixture-b');b.value.rows[0].assessment='implausible';b.value.rows[0].majorTeachingError=true;
    const inputs=[a,wrap(b.value)],adj=testAdjudication(inputs);adj.value.rows[0].decision='major-error';adj.value.rows[1].decision='unresolved';
    const result=assessReviews(manifest,inputs,wrap(adj.value));
    expect(result.reviewState).toBe('needs-remediation');expect(result.majorErrors).toEqual([manifest.cases[0].id]);
    expect(result.unresolved).toEqual([manifest.cases[1].id]);expect(result.disagreements).toEqual([manifest.cases[0].id]);
    expect(result.clinicalValidation).toBe(false);
  });
});

describe('Actual portable packet and adversarial integrity',()=>{
  let temp,reader,coordinator,generated;
  beforeAll(async()=>{
    temp=await mkdtemp(path.join(tmpdir(),'ecg review # '));reader=path.join(temp,'reader #');coordinator=path.join(temp,'coordinator #');
    const p=path.join(temp,'protocol.json');await writeFile(p,json(protocol));
    generated=await generateReviewPacket(reader,coordinator,p);
  },60_000);
  afterAll(async()=>{
    if(temp){expect(path.dirname(path.resolve(temp))).toBe(path.resolve(tmpdir()));await rm(temp,{recursive:true,force:true});}
  });
  it('generates from actual synthetic and checksum-verified external samples without a download or decoder truth',async()=>{
    expect(generated.cases).toBe(3);expect(generated.exposedExternalControls).toBe(1);
    expect(generated.untouchedExternalHoldout).toBe(false);expect(generated.reviewState).toBe('pending-human-review');
    const report=await verifyReviewPacket(reader,coordinator,generated.sealSha256);
    expect(report.packetIntegrity).toBe('verified-against-pinned-seal');expect(report.reviewState).toBe('pending-human-review');
    const m=JSON.parse(await readFile(path.join(reader,'manifest.json'),'utf8'));
    for(const c of m.cases){
      expect(Object.keys(c).sort()).toEqual(['file','fs','id','samples','svgSha256']);
      const svg=await readFile(path.join(reader,c.file),'utf8');
      expect(svg).not.toMatch(/sinus|LUDB|presetId|seed|señal sintética|ECG LAB  \/  /i);
      expect(svg).toContain('width="');expect(svg).toContain('mm"');expect(svg).toContain(c.id);
    }
    const publicNames=await readdir(reader);
    expect(publicNames).not.toContain('case-key.json');expect(publicNames).not.toContain('protocol.json');
  });
  it('does not overwrite an existing frozen output',async()=>{
    await expect(generateReviewPacket(reader,coordinator)).rejects.toThrow(/already exists/);
  });
  it('replays identical IDs, order and SVG bytes from the saved private key and frozen protocol',async()=>{
    const r=path.join(temp,'reader-replay'),c=path.join(temp,'coordinator-replay');
    const replay=await generateReviewPacket(r,c,path.join(coordinator,'protocol.json'),path.join(coordinator,'blinding-key.bin'));
    const first=JSON.parse(await readFile(path.join(reader,'manifest.json'),'utf8'));
    const second=JSON.parse(await readFile(path.join(r,'manifest.json'),'utf8'));
    expect(replay.packageId).toBe(generated.packageId);expect(second.cases).toEqual(first.cases);
    for(const record of first.cases)expect(await readFile(path.join(r,record.file))).toEqual(await readFile(path.join(reader,record.file)));
  },60_000);
  it('rejects trace tampering and a leaked key inside the reader folder',async()=>{
    const m=JSON.parse(await readFile(path.join(reader,'manifest.json'),'utf8')),file=path.join(reader,m.cases[0].file),original=await readFile(file);
    try{await writeFile(file,Buffer.concat([original,Buffer.from('<!-- changed -->')]));
      await expect(verifyReviewPacket(reader,coordinator,generated.sealSha256)).rejects.toThrow(/integrity/);
    }finally{await writeFile(file,original);}
    const leaked=path.join(reader,'case-key.json');
    try{await writeFile(leaked,await readFile(path.join(coordinator,'case-key.json')));
      await expect(verifyReviewPacket(reader,coordinator,generated.sealSha256)).rejects.toThrow(/Unexpected/);
    }finally{await rm(leaked);}
  });
  it('rejects coupled manifest/seal edits against the separately pinned hash',async()=>{
    const p=path.join(coordinator,'seal.json'),original=await readFile(p),seal=JSON.parse(original);
    const m=path.join(reader,'manifest.json'),originalManifest=await readFile(m),changedManifest=JSON.parse(originalManifest);
    try{changedManifest.role='Changed after freezing';await writeFile(m,json(changedManifest));
      seal.manifestSha256=sha256(json(changedManifest));await writeFile(p,json(seal));
      await expect(verifyReviewPacket(reader,coordinator,generated.sealSha256)).rejects.toThrow(/seal SHA/);
    }finally{await writeFile(p,original);await writeFile(m,originalManifest);}
  });
  it('rejects physical-sample corruption, not just altered SVGs',async()=>{
    const key=JSON.parse(await readFile(path.join(coordinator,'case-key.json'),'utf8'));
    const p=path.join(coordinator,key.keys[0].sampleFile),original=await readFile(p),changed=Buffer.from(original);changed[80]^=1;
    try{await writeFile(p,changed);await expect(verifyReviewPacket(reader,coordinator,generated.sealSha256)).rejects.toThrow(/integrity/);}
    finally{await writeFile(p,original);}
  });
  it('CLI verification works from another cwd with spaces/# and exits pending, never success',()=>{
    const result=spawnSync(process.execPath,[path.join(process.cwd(),'scripts/prepare-clinical-review.mjs'),'verify',reader,coordinator,generated.sealSha256],
      {cwd:temp,encoding:'utf8',timeout:20_000});
    expect(result.error).toBeUndefined();expect(result.status).toBe(2);
    expect(JSON.parse(result.stdout).reviewState).toBe('pending-human-review');
  });
});
