#!/usr/bin/env python3
"""Independent, descriptive PTB-XL+ reference. Never imports/tunes the product.

Select from metadata first. Validate every downloaded source against its release
manifest; keep vendors separate. Cross-check original median bytes with WFDB.
Only stdlib is required except for the explicit WFDB cross-check in acquisition.
"""
from __future__ import annotations

import argparse
import ast
import csv
from collections import Counter
from concurrent.futures import ThreadPoolExecutor
import hashlib
import gzip
import io
import json
import math
from pathlib import Path, PurePosixPath
import platform
import re
import statistics
import struct
import subprocess
import tempfile
import time
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
PROTOCOL = ROOT / 'benchmarks/ptbxl-plus/protocol.json'
LEADS = ['I', 'II', 'III', 'aVR', 'aVL', 'aVF', 'V1', 'V2', 'V3', 'V4', 'V5', 'V6']


def digest(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def write(path: Path, obj) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(obj, indent=2, ensure_ascii=False, allow_nan=False) + '\n')


def product_fingerprint(root: Path = ROOT) -> str:
    names = sorted([str(p.relative_to(root)) for d in ('src', 'public')
                    for p in (root/d).rglob('*') if p.is_file()] + ['package.json', 'package-lock.json'])
    return digest(''.join(f'{n}\0{digest((root/n).read_bytes())}\n' for n in names).encode())


def integer(value: str) -> int:
    n = float(value)
    if not math.isfinite(n) or n != int(n) or n < 1:
        raise ValueError(f'Invalid positive identifier: {value}')
    return int(n)


def read_rows(data: bytes):
    reader = csv.DictReader(io.StringIO(data.decode('utf-8-sig')))
    if not reader.fieldnames or len(set(reader.fieldnames)) != len(reader.fieldnames):
        raise ValueError('Missing or duplicate CSV columns')
    return reader


def select(rows, p: dict) -> dict:
    by_patient, seen, excluded = {}, set(), set()
    for r in rows:
        ecg, patient, fold = integer(r['ecg_id']), integer(r['patient_id']), integer(r['strat_fold'])
        if ecg in seen or fold not in range(1, 11):
            raise ValueError('Duplicate ECG or invalid fold')
        seen.add(ecg)
        if fold >= 9:
            excluded.add(patient)
        if patient not in by_patient or ecg < by_patient[patient]['ecg_id']:
            by_patient[patient] = {'ecg_id': ecg, 'patient_id': patient, 'fold': fold}
    eligible = [r for patient, r in by_patient.items() if patient not in excluded]
    eligible.sort(key=lambda r: digest(f"{p['seed']}:{r['patient_id']}".encode()))
    selected = eligible[:p['patientCount']]
    if len(selected) != p['patientCount']:
        raise ValueError('Insufficient eligible patients; do not change requested N silently')
    return {'metadataRecords': len(seen), 'eligiblePatients': len(eligible),
            'excludedPatients': len(excluded), 'records': selected,
            'medianIds': [r['ecg_id'] for r in selected[:p['medianCount']]]}


def number(value: str | None):
    if value is None or value.strip().lower() in ('', 'nan', 'na', 'n/a', 'null'):
        return None
    x = float(value)  # malformed strings are an error, not silent missingness
    return x if math.isfinite(x) else None


def quantile(x: list[float], p: float):
    if not x:
        return None
    a = sorted(x); index = (len(a)-1)*p; lo = int(index); hi = min(lo+1, len(a)-1)
    return a[lo] + (a[hi]-a[lo])*(index-lo)


def summary(values, circular: bool = False):
    values = list(values)
    x = [float(v) for v in values if v is not None and math.isfinite(v)]
    out = {'total': len(values), 'n': len(x), 'missing': len(values)-len(x),
           'coverage': len(x)/len(values) if values else None}
    if circular:
        a = statistics.fmean(math.cos(math.radians(v)) for v in x) if x else 0
        b = statistics.fmean(math.sin(math.radians(v)) for v in x) if x else 0
        length = math.hypot(a, b)
        return {**out, 'meanDirectionDeg': math.degrees(math.atan2(b,a)) if length>1e-12 else None,
                'resultantLength': length if x else None}
    return {**out, 'mean': statistics.fmean(x) if x else None,
            'sd': statistics.stdev(x) if len(x)>1 else None,
            'p05': quantile(x,.05), 'p25': quantile(x,.25), 'median': quantile(x,.5),
            'p75': quantile(x,.75), 'p95': quantile(x,.95),
            'min': min(x) if x else None, 'max': max(x) if x else None}


def progression(row: dict):
    pairs = [(row.get(f'R_Amp_V{i}'), row.get(f'S_Amp_V{i}')) for i in range(1,7)]
    if any(r is None or s is None or r<0 or s>0 or (r==0 and s==0) for r,s in pairs):
        return None
    return next((f'V{i+1}' for i,(r,s) in enumerate(pairs) if r>=-s), 'no_R_ge_absS')


def expected_features(p: dict, provider: str):
    return {**p['globalFeatures'], p['providerAxes'][provider]: 'degrees',
            **{name.replace('_X', '_'+lead): unit for name,unit in p['leadFeatures'].items() for lead in LEADS}}


def validate_schema(header: list, description: dict, p: dict, provider: str):
    features = expected_features(p, provider)
    missing = set(features) - set(header)
    if 'ecg_id' not in header or missing:
        raise ValueError(f'{provider} missing declared columns: {sorted(missing)}')
    for name, unit in features.items():
        generic = re.sub(r'_(I|II|III|aVR|aVL|aVF|V[1-6])$', '_X', name)
        if generic not in description or description[generic]['unit'] != unit:
            raise ValueError(f'Unreviewed unit/feature: {provider}/{generic}/{unit}')
    return features


class Release:
    def __init__(self, name: str, version: str, raw: Path):
        self.base = f'https://physionet.org/files/{name}/{version}/'
        self.mirror = f'https://physionet-open.s3.amazonaws.com/{name}/{version}/'
        self.transports = {}
        self.raw = raw / name
        self.files = {}
        manifest = self.download('SHA256SUMS.txt')
        self.manifest_hash = digest(manifest)
        self.sums = {}
        for line in manifest.decode().splitlines():
            h, n = line.split(maxsplit=1)
            n = n.lstrip('*'); n = n[2:] if n.startswith('./') else n
            if not re.fullmatch('[0-9a-fA-F]{64}', h) or n in self.sums:
                raise ValueError('Invalid/duplicate manifest entry')
            self.sums[n] = h.lower()

    def download(self, name: str) -> bytes:
        if name.startswith('/') or '..' in PurePosixPath(name).parts:
            raise ValueError('Unsafe relative source path')
        path = self.raw / name
        if path.is_file():
            self.transports.setdefault(name, {'transportUrl':'local-cache'})
            return path.read_bytes()
        last_error = None
        # PhysioNet documents its public S3 mirror. Bytes still require the
        # release checksum; transport choice never changes the selected cohort.
        for base in (self.mirror, self.base):
            url = base + name
            print(json.dumps({'stage':'download','url':url}), flush=True)
            for attempt in range(3):
                try:
                    request = Request(url, headers={'Accept-Encoding':'gzip', 'User-Agent':'ECG-Lab-reference/1.0'})
                    with urlopen(request, timeout=120) as response:
                        wire = response.read()
                        encoding = response.headers.get('Content-Encoding','identity').lower()
                    if encoding not in ('identity', '', 'gzip'):
                        raise ValueError('Unsupported HTTP content encoding')
                    body = gzip.decompress(wire) if encoding == 'gzip' else wire
                    path.parent.mkdir(parents=True, exist_ok=True)
                    path.write_bytes(body)
                    self.transports[name] = {'transportUrl':url, 'httpContentEncoding':encoding,
                                             'wireBytes':len(wire), 'decodedBytes':len(body)}
                    return body
                except (URLError, TimeoutError) as error:
                    last_error = error
                    if isinstance(error, HTTPError) and error.code in (403,404):
                        break
                    if attempt < 2:
                        time.sleep(2**attempt)
        raise RuntimeError(f'Both documented transports failed: {name}: {last_error}')

    def get(self, name: str) -> bytes:
        if name not in self.sums:
            raise ValueError(f'Source absent from release manifest: {name}')
        body = self.download(name)
        if digest(body) != self.sums[name]:
            raise ValueError(f'Source checksum mismatch: {name}')
        self.files[name] = {'url': self.base+name, 'sha256': digest(body), 'bytes': len(body), **self.transports[name]}
        write(self.raw.parent.parent/'acquisition-progress.json', {'lastVerified':self.files[name], 'release':self.base, 'verifiedFilesInRelease':len(self.files)})
        return body


def decode_median(header: bytes, raw: bytes):
    """Decode explicit, uniform interleaved WFDB 16 or 32 (little-endian).

    Format is read from every channel header, never inferred from file size.
    WFDB checksum remains modulo 2**16 for both formats. The minimum signed
    digital value is the missing-sample sentinel of the declared format.
    No amplitude normalization, type truncation or source header modification.
    """
    lines = [l.strip() for l in header.decode().splitlines() if l.strip() and not l.lstrip().startswith('#')]
    if not lines or len(lines[0].split()) < 4:
        raise ValueError('Missing median record header')
    first = lines[0].split()
    count, fs, n = int(first[1]), float(first[2]), int(first[3])
    if count != 12 or fs != 500 or n < 1 or len(lines) != 13:
        raise ValueError('Unexpected median dimensions')
    h = [l.split() for l in lines[1:]]
    if any(len(row) != 9 for row in h):
        raise ValueError('Incomplete or unsupported median channel header')
    formats = {row[1] for row in h}
    if len(formats) != 1 or not formats.issubset({'16', '32'}):
        raise ValueError('Only uniform interleaved WFDB16/WFDB32 supported')
    fmt = h[0][1]
    width, code, missing = {'16': (2, 'h', -(2**15)), '32': (4, 'i', -(2**31))}[fmt]
    if len(raw) != n*count*width:
        raise ValueError(f'Median byte count differs from WFDB{fmt} header: '
                         f'expected {n*count*width}, received {len(raw)}')
    filenames = {row[0] for row in h}
    if len(filenames) != 1:
        raise ValueError('Only same-file interleaved medians supported')
    filename = PurePosixPath(h[0][0]).name
    values = struct.unpack('<'+code*(count*n), raw)
    signals, factors, gains = {}, [], []
    labels = {l.lower(): l for l in LEADS}
    for channel, row in enumerate(h):
        m = re.fullmatch(r'([+\-\d.eE]+)(?:\(([+\-\d]+)\))?/(\S+)',row[2])
        if not m:
            raise ValueError('Explicit gain and unit required')
        gain = float(m[1]); baseline = int(m[2]) if m[2] else int(row[4])
        unit = m[3]; factor = {'mV':1., 'uV':.001, 'µV':.001, 'V':1000.}.get(unit)
        label = labels.get(row[-1].lower())
        if not math.isfinite(gain) or gain<=0 or factor is None or label is None or label in signals:
            raise ValueError('Invalid median calibration or lead')
        x = values[channel::count]
        if x[0] != int(row[5]) or (sum(x)&65535) != (int(row[6])&65535):
            raise ValueError('WFDB checksum/initial value mismatch')
        signals[label] = [None if v == missing else (v-baseline)/gain*factor for v in x]
        factors.append(factor); gains.append({'lead':label, 'gain':gain, 'baseline':baseline, 'unit':unit, 'format':fmt, 'missingDigitalValue':missing})
    if set(signals) != set(LEADS):
        raise ValueError('Missing median lead')
    # WFDB Python rejects producer directory prefixes. Alter names only in a temp copy.
    original_name = first[0]; first[0] = PurePosixPath(first[0]).name
    for row in h:
        row[0] = PurePosixPath(row[0]).name
    sanitized = (' '.join(first)+'\n'+'\n'.join(' '.join(row) for row in h)+'\n').encode()
    return {'fs':fs, 'leads':signals, 'calibration':gains}, sanitized, filename, factors, original_name


def crosscheck(header: bytes, raw: bytes):
    import numpy as np
    import wfdb
    sample, sanitized, filename, factors, original_name = decode_median(header, raw)
    stem = sanitized.decode().split()[0]
    with tempfile.TemporaryDirectory() as d:
        path = Path(d)
        (path/(stem+'.hea')).write_bytes(sanitized)
        (path/filename).write_bytes(raw)
        other = wfdb.rdrecord(str(path/stem))
        if other.fs != sample['fs']:
            raise ValueError('Independent reader sampling disagreement')
        for i, label in enumerate(other.sig_name):
            ours = np.asarray(sample['leads'][next(l for l in LEADS if l.lower()==label.lower())], dtype=float)
            if not np.array_equal(ours, other.p_signal[:,i]*factors[i], equal_nan=True):
                raise ValueError('Independent WFDB calibration disagreement')
    return sample, {'reader':f'wfdb {wfdb.__version__}', 'physicalSamples':len(other.p_signal)*12,
                    'sourceFormat':sample['calibration'][0]['format'],
                    'originalHeaderSha256':digest(header), 'temporaryHeaderSha256':digest(sanitized),
                    'originalRecordToken':original_name, 'normalizedRecordToken':stem,
                    'change':'Directory prefixes in record/data filenames only; comments omitted', 'maxDifferenceMv':0}


def acquire(output: Path):
    pbytes = PROTOCOL.read_bytes(); p = json.loads(pbytes)
    if product_fingerprint() != p['productFingerprintSha256']:
        raise ValueError('Product freeze violated; this benchmark must not change src/public/package')
    output.mkdir(parents=True, exist_ok=True)
    write(output/'protocol.json', p)
    # Phase 1: only metadata. Selection is persisted before features or medians are downloaded.
    parent = Release('ptb-xl', p['ptbxlVersion'], output/'raw')
    metadata = list(read_rows(parent.get('ptbxl_database.csv')))
    selection = select(metadata,p)
    selection['protocolSha256'] = digest(pbytes)
    selection['metadataSha256'] = parent.files['ptbxl_database.csv']['sha256']
    selection['stage'] = 'metadata-only, before feature/median acquisition'
    write(output/'selection.json', selection)
    wanted = {r['ecg_id'] for r in selection['records']}
    scp = {r['']:r for r in read_rows(parent.get('scp_statements.csv'))}
    groups = {}
    for r in metadata:
        ecg = integer(r['ecg_id'])
        if ecg not in wanted:
            continue
        codes = ast.literal_eval(r['scp_codes'])
        if not isinstance(codes,dict):
            raise ValueError('Invalid SCP dictionary')
        groups[ecg] = ['ALL'] + sorted({scp[code]['diagnostic_class'] for code,likelihood in codes.items()
                                      if code in scp and float(likelihood)>0 and
                                      scp[code].get('diagnostic_class') in p['groups'][1:]})
    plus = Release('ptb-xl-plus',p['plusVersion'],output/'raw')
    for label, release in [('PTB-XL',parent),('PTB-XL-plus',plus)]:
        (output/f'LICENSE-{label}.txt').write_bytes(release.get('LICENSE.txt'))
    desc_bytes = plus.get('features/feature_description.csv')
    (output/'feature_description.csv').write_bytes(desc_bytes)
    description = {r['id']:r for r in read_rows(desc_bytes)}
    tables, mappings = {}, {}
    for provider in p['providers']:
        reader = read_rows(plus.get(f'features/{provider}_features.csv'))
        fields = validate_schema(reader.fieldnames,description,p,provider)
        if provider == '12sl' and not set(p['medianFiducials']).issubset(reader.fieldnames):
            raise ValueError('Missing declared median fiducials')
        mappings[provider] = {'columnUnits':fields, 'conversion':'identity; published harmonized units',
                              'featureDescriptionSha256':digest(desc_bytes), 'csvColumns':reader.fieldnames}
        seen, selected = set(), {}
        for row in reader:
            ecg = integer(row['ecg_id'])
            if ecg in seen:
                raise ValueError('Duplicate source feature ECG key')
            seen.add(ecg)
            if ecg in wanted:
                selected[ecg] = {key:number(row[key]) for key in fields}
                if provider == '12sl':
                    selected[ecg].update({k:number(row[k]) for k in p['medianFiducials']})
        tables[provider] = selected
    write(output/'reviewed-feature-mapping.json',mappings)
    distributions = {}
    for provider, table in tables.items():
        distributions[provider] = {}
        for group in p['groups']:
            ids = [i for i in wanted if group in groups[i]]
            distributions[provider][group] = {
                'patients':len(ids), 'missingFeatureRows':sum(i not in table for i in ids),
                'features':{k:{'unit':unit, **summary([table.get(i,{}).get(k) for i in ids],unit=='degrees')}
                            for k,unit in expected_features(p,provider).items()},
                'firstPrecordialRgeAbsS':dict(Counter(progression(table.get(i,{})) or 'unavailable' for i in ids))}
    write(output/'feature-distributions.json',{'schemaVersion':1,'descriptiveOnly':True,
          'independentProviders':True,'groupPolicy':p['groupPolicy'], 'distributions':distributions})
    # Keep only selected pseudonymous ECG IDs and features, no demographics/free-text reports.
    write(output/'selected-features.json',{'groups':groups,'tables':tables})
    index = {}
    for name in plus.sums:
        match = re.fullmatch(r'median_beats/12sl/[^/]+/(\d+)_medians\.hea', name)
        if match:
            ecg = int(match[1])
            if ecg in index:
                raise ValueError('Ambiguous median path')
            index[ecg] = name
    # Bounded I/O concurrency only. Verification/decoding retain the fixed order.
    paths = [name for ecg in selection['medianIds'] if ecg in index
             for name in (index[ecg], index[ecg][:-4]+'.dat')]
    if any(name not in plus.sums for name in paths):
        raise ValueError('Incomplete median pair in release manifest')
    with ThreadPoolExecutor(max_workers=4) as pool:
        for _ in pool.map(plus.download, paths):
            pass
    medians, statuses = [], []
    for ecg in selection['medianIds']:
        if ecg not in index:
            statuses.append({'ecg_id':ecg,'status':'absent_from_release_manifest'}); continue
        name = index[ecg]; header=plus.get(name); raw=plus.get(name[:-4]+'.dat')
        sample, audit = crosscheck(header,raw)
        row = tables['12sl'].get(ecg,{})
        sample.update({'ecg_id':ecg,'groups':groups[ecg], 'windowSource':'12SL automatic, milliseconds',
                       'fiducialsMs':{k:row.get(k) for k in p['medianFiducials']}, 'readerCrosscheck':audit})
        medians.append(sample); statuses.append({'ecg_id':ecg,'status':'decoded_crosschecked'})
    write(output/'median-beats.json',{'requested':p['medianCount'],'records':medians,'statuses':statuses})
    commit = subprocess.check_output(['git','rev-parse','HEAD'],cwd=ROOT,text=True).strip()
    scripts = sorted(list((ROOT/'scripts').glob('*ptbxl*'))+list((ROOT/'benchmarks/ptbxl-plus').glob('*')))
    write(output/'provenance.json',{'commit':commit,'productFingerprintSha256':product_fingerprint(),
          'protocolSha256':digest(pbytes),'python':platform.python_version(),
          'benchmarkFiles':{str(f.relative_to(ROOT)):digest(f.read_bytes()) for f in scripts if f.is_file()},
          'sources':{label:{'base':r.base,'manifestSha256':r.manifest_hash,'manifestTransport':r.transports.get('SHA256SUMS.txt'),'verifiedFiles':r.files}
                     for label,r in [('PTB-XL',parent),('PTB-XL+',plus)]},
          'clinicalValidation':False,'generatorTuned':False,'analyzerEvaluated':False})
    print(json.dumps({'patients':len(wanted),'mediansRequested':p['medianCount'],'mediansDecoded':len(medians),
                      'providers':p['providers'],'productUnchanged':True}))


if __name__ == '__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output',type=Path,required=True)
    args=parser.parse_args()
    try:
        acquire(args.output)
    except Exception as error:
        write(args.output/'failure.json', {'status':'failed','type':type(error).__name__,
                                          'message':str(error),'clinicalValidation':False})
        raise
