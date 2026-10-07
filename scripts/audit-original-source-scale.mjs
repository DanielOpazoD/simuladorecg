/** Recheck original PTB-XL physical calibration against raw, checksum-verified bytes. */
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {sourceScaleEvidence} from './lib/source-scale.mjs';
const arg=k=>{const i=process.argv.indexOf(k);assert.ok(i>=0&&process.argv[i+1],k);return resolve(process.argv[i+1])};
const root=arg('--original'),rawRoot=arg('--raw'),output=arg('--output'),hash=b=>createHash('sha256').update(b).digest('hex');
const auditBytes=readFileSync(resolve(root,'original-unit-audit.json')),audit=JSON.parse(auditBytes);
const manifestBytes=readFileSync(resolve(rawRoot,'SHA256SUMS.txt'));assert.equal(hash(manifestBytes),audit.manifestSha256);
const sourceSums=new Map(manifestBytes.toString().trim().split('\n').map(line=>{const [sha,...p]=line.trim().split(/\s+/);return [p.join(' ').replace(/^\*/,''),sha]}));
const records=[];
for(const expected of audit.records){
 const r=JSON.parse(readFileSync(resolve(root,`original-${expected.ecg_id}.json`)));
 assert.equal(r.ecg_id,expected.ecg_id);assert.equal(r.fs,500);assert.equal(r.units,'mV');
 const match=/^https:\/\/physionet.org\/files\/ptb-xl\/1\.0\.3\/(records500\/\d{5}\/\d{5}_hr)$/.exec(r.source);assert.ok(match,'Unexpected original source identity');
 const stem=match[1],header=readFileSync(resolve(rawRoot,stem+'.hea')),raw=readFileSync(resolve(rawRoot,stem+'.dat'));
 for(const [suffix,bytes] of [['.hea',header],['.dat',raw]]){
  assert.equal(hash(bytes),sourceSums.get(stem+suffix));assert.equal(hash(bytes),audit.verifiedFiles[stem+suffix].sha256);
 }
 const lines=header.toString().split('\n').filter(x=>x.trim()&&!x.startsWith('#')).map(x=>x.trim().split(/\s+/));
 assert.equal(lines.length,13);assert.deepEqual(lines[0],[stem.split('/').at(-1),'12','500','5000']);assert.equal(raw.length,120000);
 const digital={},calibration={};
 r.calibration.forEach((c,k)=>{
  assert.equal(c.gain,1000);assert.equal(c.baseline,0);assert.equal(c.unit,'mV');assert.equal(c.format,'16');
  assert.equal(lines[k+1][1],'16');assert.match(lines[k+1][2],/^1000(?:\.0+)?\(0\)\/mV$/);assert.equal(lines[k+1][8].toLowerCase(),c.lead.toLowerCase());
  const values=Array.from({length:5000},(_,i)=>raw.readInt16LE((i*12+k)*2));assert.ok(!values.includes(-32768));
  assert.deepEqual(values.map(x=>x/1000),r.leads[c.lead],'Exported physical samples differ from original bytes');
  digital[c.lead]=values;calibration[c.lead]={gain:1000,baseline:0};
 });
 const evidence=sourceScaleEvidence(digital,calibration);
 records.push({id:r.ecg_id,sourceSha256:hash(raw),...evidence,
  documentedResolution:'1 microvolt per digital count, PTB-XL 1.0.3 original records500',
  wholeRecordVoltageReferenceSupported:true,clinicalValidation:false});
}
assert.equal(records.length,audit.selectedRecords);assert.equal(records.length,64);
const report={schemaVersion:1,scriptSha256:hash(readFileSync(new URL(import.meta.url))),source:'https://physionet.org/content/ptb-xl/1.0.3/',sourceAuditSha256:hash(auditBytes),sourceManifestSha256:hash(manifestBytes),
 summary:{records:records.length,physicalSamplesCrosschecked:records.length*12*5000,
  gainEqualsRangeChannels:records.reduce((n,r)=>n+r.gainEqualsRangeChannels,0),
  maxDeclaredMvEinthovenRms:Math.max(...records.map(r=>r.declaredMvEinthovenRms))},records,
 limitations:['Whole-record voltage is not annotated QRS or T amplitude.','No normal-range or diagnostic-threshold inference.','12SL median beats remain quarantined; no inferred conversion.','Source calibration support is not clinical validation.']};
writeFileSync(output,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report.summary));
