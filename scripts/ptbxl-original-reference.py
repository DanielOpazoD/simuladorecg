#!/usr/bin/env python3
"""Audit calibrated original PTB-XL recordings without reinterpreting 12SL medians.

Reuses the frozen patient selection and acquisition reader. Whole-record range is
not a median-beat QRS amplitude or a clinical normality threshold.
"""
import argparse
import importlib.util
import json
import math
from pathlib import Path, PurePosixPath
import re
from concurrent.futures import ThreadPoolExecutor

spec=importlib.util.spec_from_file_location('ptbxl_frozen_reader',Path(__file__).with_name('ptbxl-benchmark.py'))
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)

def validate_original_header(header, stem):
    lines=[x.split() for x in header.decode().splitlines() if x.strip() and not x.lstrip().startswith('#')]
    if len(lines)!=13 or lines[0] != [PurePosixPath(stem).name,'12','500','5000']:
        raise ValueError('Original recording identity/dimensions mismatch')
    for row in lines[1:]:
        if len(row)!=9 or row[0]!=PurePosixPath(stem).name+'.dat' or row[1]!='16':
            raise ValueError('Original channel format/path mismatch')
        gain=re.fullmatch(r'([+\-\d.eE]+)\(0\)/mV',row[2])
        if not gain or float(gain[1])!=1000 or row[3:5]!=['16','0']:
            raise ValueError('Original calibration is outside the declared 1000counts/mV domain')

def original_path(row, ecg):
    path=row['filename_hr']
    if not re.fullmatch(r'records500/\d{5}/\d{5}_hr',path) or int(PurePosixPath(path).name[:-3])!=ecg:
        raise ValueError('Unsafe/mismatched original metadata path')
    return path

def finite_range(values):
    if not values or any(x is None or not math.isfinite(x) for x in values):
        raise ValueError('Original amplitude unavailable: missing/nonfinite samples')
    return max(values)-min(values)

def acquire(reference, output):
    pbytes=m.PROTOCOL.read_bytes();protocol=json.loads(pbytes)
    provenance=json.loads((reference/'provenance.json').read_text())
    release=m.Release('ptb-xl',protocol['ptbxlVersion'],reference/'raw')
    if release.manifest_hash!=provenance['sources']['PTB-XL']['manifestSha256']:
        raise ValueError('Original release manifest changed')
    metadata_bytes=release.get('ptbxl_database.csv');metadata=list(m.read_rows(metadata_bytes))
    selection=json.loads((reference/'selection.json').read_text())
    if selection['metadataSha256']!=m.digest(metadata_bytes):
        raise ValueError('Original metadata identity changed')
    expected=m.select(metadata,protocol)
    if selection['records']!=expected['records'] or selection['medianIds']!=expected['medianIds'] or selection['protocolSha256']!=m.digest(pbytes):
        raise ValueError('Frozen selection identity changed')
    rows={m.integer(r['ecg_id']):r for r in metadata}
    ids=selection['medianIds'];paths={i:original_path(rows[i],i) for i in ids}
    files=[p+suffix for p in paths.values() for suffix in ['.hea','.dat']]
    # Bounded I/O only; decoding and comparisons keep preregistered selection order.
    if any(name not in release.sums for name in files):
        raise ValueError('Original pair missing from release manifest')
    with ThreadPoolExecutor(max_workers=4) as pool:
        list(pool.map(release.download,files))
    median_bytes=(reference/'median-beats.json').read_bytes()
    median_rows=json.loads(median_bytes)['records']
    medians={r['ecg_id']:r for r in median_rows}
    if len(medians)!=len(median_rows) or not set(medians).issubset(ids):
        raise ValueError('Duplicate/unselected median reference identity')
    output.mkdir(parents=True,exist_ok=True);reports=[];ratios=[]
    for ecg in ids:
        stem=paths[ecg];header=release.get(stem+'.hea');raw=release.get(stem+'.dat')
        validate_original_header(header,stem)
        signal,audit=m.crosscheck(header,raw)
        ranges={lead:finite_range(signal['leads'][lead]) for lead in m.LEADS}
        median=medians.get(ecg);comparison={}
        if median:
            for lead in m.LEADS:
                values=[x for x in median['leads'][lead] if x is not None and math.isfinite(x)]
                med_range=max(values)-min(values) if values else None
                ratio=med_range/ranges[lead] if med_range is not None and ranges[lead]>0 else None
                comparison[lead]={'literalMedianRangeMv':med_range,'wholeOriginalRangeMv':ranges[lead],'ratio':ratio}
                ratios.append(ratio)
        else:
            ratios.extend([None]*len(m.LEADS))
        # Public deidentified signals only. Do not export metadata demographics/reports.
        m.write(output/f'original-{ecg}.json',{'ecg_id':ecg,'source':release.base+stem,'fs':signal['fs'],
            'units':'mV','leads':signal['leads'],'calibration':signal['calibration'],'readerCrosscheck':audit,
            'role':'exposed-development-original-recording','clinicalValidation':False})
        reports.append({'ecg_id':ecg,'medianStatus':'available' if median else 'absent_from_frozen_acquisition','wholeRecordPeakToPeakMv':ranges,'medianComparison':comparison,'readerCrosscheck':audit})
    m.write(output/'original-unit-audit.json',{'schemaVersion':1,'records':reports,'selectedRecords':len(ids),
        'medianRecordsAvailable':len(medians),'medianReferenceSha256':m.digest(median_bytes),
        'readerScriptSha256':m.digest(Path(__file__).read_bytes()),'ratioSummary':m.summary(ratios),'manifestSha256':release.manifest_hash,'protocolSha256':m.digest(pbytes),
        'metadataSha256':m.digest(metadata_bytes),'verifiedFiles':release.files,
        'medianPolicy':'Keep original header interpretation and quarantine; no inferred /1000 conversion',
        'measurementScope':'Whole original10s range versus whole vendor median1.2s range. Different measures; ratio is a unit-conflict diagnostic, not a calibration factor or normal range.',
        'clinicalValidation':False,'generatorTuned':False,'analyzerEvaluated':False})
    print(json.dumps({'originalRecords':len(reports),'readerAgreement':'exact','medianQuarantineRetained':True,'clinicalValidation':False}))

if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--reference',type=Path,required=True);parser.add_argument('--output',type=Path,required=True)
    args=parser.parse_args();acquire(args.reference,args.output)
