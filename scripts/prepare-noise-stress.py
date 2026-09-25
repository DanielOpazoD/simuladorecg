#!/usr/bin/env python3
"""Fixed NSTDB snippets; no model evaluation or cohort selection by outcomes."""
from __future__ import annotations
import argparse
import importlib.util
import json
from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('reference_transport', ROOT/'scripts/ptbxl-benchmark.py')
transport = importlib.util.module_from_spec(spec)
spec.loader.exec_module(transport)
PROTOCOL = ROOT/'benchmarks/noise-stress/protocol.json'


def decode212(header: bytes, raw: bytes):
    """NSTDB's explicit two-channel packed signed 12-bit format. Digital units."""
    rows = [l.split() for l in header.decode().splitlines() if l.strip() and not l.lstrip().startswith('#')]
    if len(rows) != 3 or len(rows[0]) < 4 or any(len(r) != 9 for r in rows[1:]):
        raise ValueError('Unsupported noise header')
    name, channels, fs, n = rows[0][:4]
    if int(channels) != 2 or float(fs) != 360 or int(n) < 1:
        raise ValueError('Unexpected noise dimensions')
    if any(r[0] != name+'.dat' or r[1] != '212' or r[2] != '0' for r in rows[1:]):
        raise ValueError('Require same-file WFDB212 and explicit unknown gain=0; never guess mV')
    if len(raw) != int(n)*3:
        raise ValueError('Noise byte count mismatch')
    signals = [[], []]
    for i in range(0, len(raw), 3):
        a = raw[i] | ((raw[i+1] & 15) << 8)
        b = raw[i+2] | ((raw[i+1] >> 4) << 8)
        signals[0].append(a-4096 if a>=2048 else a)
        signals[1].append(b-4096 if b>=2048 else b)
    for x, row in zip(signals, rows[1:]):
        if x[0] != int(row[5]) or (sum(x)&65535) != (int(row[6])&65535):
            raise ValueError('Noise checksum or initial value mismatch')
    return signals, {'record':name, 'fs':360, 'samples':int(n), 'format':'212',
                     'sourceGain':0, 'sourceUnits':'uncalibrated digital counts',
                     'missingDigitalValue':-2048}


def resample_segment(signals, start, p):
    import numpy as np
    from scipy.signal import resample_poly
    fs = p['sourceFs']; guard = p['resamplingGuardSeconds']; duration = p['segmentDurationSeconds']
    lo, hi = int((start-guard)*fs), int((start+duration+guard)*fs)
    if lo<0 or hi>len(signals[0]) or len(signals[0]) != len(signals[1]):
        raise ValueError('Requested fixed noise window outside record')
    clip = np.asarray([s[lo:hi] for s in signals], dtype=float)
    if not np.isfinite(clip).all() or np.any(clip == -2048):
        raise ValueError('Missing noise sample in preselected window; do not replace or impute')
    r=p['resample']; filtered=resample_poly(clip, r['up'], r['down'], axis=1,
                                            window=tuple(r['window']), padtype=r['padtype'])
    left=int(guard*p['outputFs']); n=int(duration*p['outputFs'])
    result=filtered[:,left:left+n]
    if result.shape != (2,n) or not np.isfinite(result).all():
        raise ValueError('Invalid resampling output')
    return result.tolist()


def prepare(output: Path):
    import numpy as np
    import scipy
    import wfdb
    p=json.loads(PROTOCOL.read_text())
    if transport.product_fingerprint() != p['productFingerprintSha256']:
        raise ValueError('Product changed: review benchmark explicitly before updating freeze')
    output.mkdir(parents=True,exist_ok=True)
    transport.write(output/'protocol.json',p)  # fixed BEFORE downloads/evaluation
    release=transport.Release('nstdb','1.0.0',output/'raw')
    segments=[]; records=[]
    for name in p['records']:
        header=release.get(name+'.hea'); raw=release.get(name+'.dat')
        signals,meta=decode212(header,raw)
        # Gain zero in the original header means unknown: check DIGITAL samples.
        independent=wfdb.rdrecord(str(release.raw/name),physical=False)
        if independent.fs != 360 or independent.n_sig != 2 or not np.array_equal(np.asarray(signals).T, independent.d_signal):
            raise ValueError('Independent WFDB digital sample disagreement')
        records.append({**meta,'crosscheckSamples':len(signals[0])*2,'digitalDifference':0,
                        'reader':'wfdb '+wfdb.__version__})
        for start in p['segmentStartsSeconds']:
            segments.append({'record':name,'startSeconds':start,'fs':p['outputFs'],
                             'units':'digital counts resampled; not physical mV',
                             'channels':resample_segment(signals,start,p)})
    source_notice = ('Contains information from MIT-BIH Noise Stress Test Database 1.0.0, '
                     'Moody and Mark, DOI 10.13026/C2HS3T. Available under ODC Attribution License v1.0.\n'
                     'https://physionet.org/content/nstdb/1.0.0/\n'
                     'https://physionet.org/content/nstdb/view-license/1.0.0/\n'
                     'Derived snippets: fixed crops, resampling; original gain is unknown. No ECG patients or labels redistributed.\n')
    (output/'NOTICE-NSTDB.txt').write_text(source_notice)
    if 'LICENSE.txt' in release.sums:
        (output/'LICENSE-NSTDB.txt').write_bytes(release.get('LICENSE.txt'))
    transport.write(output/'noise-segments.json',{'records':records,'segments':segments})
    transport.write(output/'noise-provenance.json',{
        'commit':subprocess.check_output(['git','rev-parse','HEAD'],cwd=ROOT,text=True).strip(),
        'productFingerprintSha256':transport.product_fingerprint(),
        'protocolSha256':transport.digest(PROTOCOL.read_bytes()),
        'sourceManifestSha256':release.manifest_hash,'sourceFiles':release.files,
        'wfdb':wfdb.__version__,'numpy':np.__version__,'scipy':scipy.__version__,
        'licenseURI':'https://physionet.org/content/nstdb/view-license/1.0.0/',
        'clinicalValidation':False,'resampling':p['resample']})
    print(json.dumps({'noiseRecords':len(records),'fixedSegments':len(segments),
                      'digitalSamplesCrosschecked':sum(r['crosscheckSamples'] for r in records)}))

if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__); parser.add_argument('--output',type=Path,required=True)
    args=parser.parse_args()
    try: prepare(args.output)
    except Exception as error:
        transport.write(args.output/'failure.json',{'stage':'prepare-noise','error':str(error)})
        raise
