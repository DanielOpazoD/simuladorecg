import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { describe, it, expect } from 'vitest';
import { tabularQrsReference, LEADS, GROUPS, FIELDS, PRESETS } from '../scripts/compare-generator-ptbxl.mjs';
const fixture = () => ({
  features: { groups: { 1: GROUPS, 2: GROUPS, 3: GROUPS, 4: GROUPS }, tables: { '12sl': Object.fromEntries([1,2,3,4].map(id => [id, Object.fromEntries(LEADS.map(l => [`QRS_AmpPP_${l}`, id / 2]))])) } },
  mapping: { '12sl': { columnUnits: Object.fromEntries(LEADS.map(l => [`QRS_AmpPP_${l}`, 'mV'])), conversion: 'identity; published harmonized units', featureDescriptionSha256: 'a'.repeat(64) } }
});
describe('published tabular QRS reference stays separate from disputed waveform scale', () => {
  it('uses all independently selected IDs, including records without decoded medians', () => {
    const {features,mapping}=fixture(), before=structuredClone(features);
    const r=tabularQrsReference(features,mapping);
    expect(r.groups.NORM.I).toMatchObject({total:4,n:4,missing:0,median:1.25,q25:.875,q75:1.625,status:'available',unit:'mV'});
    expect(r.waveformRescalingApplied).toBe(false); expect(features).toEqual(before);
  });
  it('does not infer units from a column name or plausible magnitude', () => {
    const {features,mapping}=fixture(); delete mapping['12sl'].columnUnits.QRS_AmpPP_I;
    expect(tabularQrsReference(features,mapping).groups.NORM.I.status).toBe('unverified-units');
    expect(tabularQrsReference(features).groups.NORM.II.status).toBe('unverified-units');
    mapping['12sl'].columnUnits.QRS_AmpPP_I='uV';
    expect(tabularQrsReference(features,mapping).groups.NORM.I.median).toBeNull();
  });
  it('requires traceable identity mapping instead of silently converting', () => {
    const {features,mapping}=fixture(); mapping['12sl'].conversion='divide by 1000';
    expect(tabularQrsReference(features,mapping).groups.MI.I.status).toBe('unverified-units');
    mapping['12sl'].conversion='identity; published harmonized units'; mapping['12sl'].featureDescriptionSha256='';
    expect(tabularQrsReference(features,mapping).groups.MI.I.status).toBe('unverified-units');
  });
  it('reports missing/invalid values and retains zero as a measured amplitude', () => {
    const {features,mapping}=fixture(); features.tables['12sl'][1].QRS_AmpPP_I=0;
    features.tables['12sl'][2].QRS_AmpPP_I=-1; delete features.tables['12sl'][3];
    features.tables['12sl'][4].QRS_AmpPP_I=Infinity;
    expect(tabularQrsReference(features,mapping).groups.MI.I).toMatchObject({total:4,n:1,missing:3,median:0,status:'available'});
  });
  it('does not borrow rows from another diagnostic group or table-only IDs', () => {
    const {features,mapping}=fixture(); features.groups={1:['NORM']};
    const r=tabularQrsReference(features,mapping);
    expect(r.groups.NORM.I.n).toBe(1); expect(r.groups.MI.I.status).toBe('missing-reference');
    expect(r.groups.MI.I.total).toBe(0);
  });
});

it('CLI hashes the mapping and keeps disputed waveforms quarantined beside the table', () => {
  const {features,mapping}=fixture();
  const dir=mkdtempSync(path.join(tmpdir(),'ecg-tabular-'));
  const external={records:[1,2,3,4].map(ecg_id=>({ecg_id,groups:GROUPS,leads:Object.fromEntries(LEADS.map(l=>[l,Object.fromEntries(FIELDS.map(f=>[f,f==='qrsPeakToPeakMv'?ecg_id*500:ecg_id]))]))}))};
  const generated={records:PRESETS.map(preset=>({preset,leads:Object.fromEntries(LEADS.map(l=>[l,Object.fromEntries(FIELDS.map(f=>[f,1]))]))}))};
  try {
    for(const [name,data] of Object.entries({'median-morphology.json':external,'generator-morphology.json':generated,'selected-features.json':features,'reviewed-feature-mapping.json':mapping})) writeFileSync(path.join(dir,name),JSON.stringify(data));
    execFileSync(process.execPath,['scripts/compare-generator-ptbxl.mjs',dir,dir]);
    const result=JSON.parse(readFileSync(path.join(dir,'generator-ptbxl-gap.json'),'utf8'));
    expect(result.summary.amplitudeAudit.status).toBe('scale-conflict');
    expect(result.tabularQrsReference.groups.NORM.I.median).toBe(1.25);
    expect(result.inputsSha256['reviewed-feature-mapping.json']).toMatch(/^[a-f0-9]{64}$/);
  } finally { rmSync(dir,{recursive:true,force:true}); }
});
