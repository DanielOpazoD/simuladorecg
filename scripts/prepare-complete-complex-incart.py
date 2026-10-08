"""Acquire only prespecified INCART windows. No analyzer or outcome-based selection."""
import concurrent.futures, hashlib, json, pathlib, re, sys, time, urllib.request
import numpy as np
import wfdb
import requests
from wfdb.io.annotation import ann_label_table, is_qrs

protocol_path = pathlib.Path('docs/complete-complex-incart-protocol.json')
protocol_bytes = protocol_path.read_bytes()
p = json.loads(protocol_bytes)
assert wfdb.__version__ == '4.3.1'
assert requests.__version__ == '2.32.5'
assert p['reference']['beatSymbols'] == [r.symbol for r in ann_label_table.itertuples() if is_qrs[r.label_store]]
out = pathlib.Path(sys.argv[1]); out.mkdir(parents=True, exist_ok=True)
source = out / 'source'; source.mkdir(exist_ok=True)
fixtures = out / 'fixtures'; fixtures.mkdir(exist_ok=True)
sha = lambda b: hashlib.sha256(b).hexdigest()
canonical = {name.lower(): name for name in p['input']['leads']}
base = p['dataset']['files']

def get(url, byte_range=None):
    headers = {'User-Agent': 'ECG-research-data-integrity/1.0'}
    if byte_range: headers['Range'] = 'bytes=%d-%d' % byte_range
    error = None
    for attempt in range(4):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=headers), timeout=60) as r:
                data = r.read(); status = r.status; content_range = r.headers.get('Content-Range')
            return data, status, content_range
        except Exception as e:
            error = e
            if attempt < 3: time.sleep(2 ** attempt)
    raise error

def acquire(record):
    hp, ap = source / (record + '.hea'), source / (record + '.atr')
    if hp.exists(): header = hp.read_bytes()
    else:
        header, status, _ = get(base + record + '.hea'); assert status == 200
    if ap.exists(): atr = ap.read_bytes()
    else:
        atr, status, _ = get(base + record + '.atr'); assert status == 200
    (source / (record + '.hea')).write_bytes(header)
    (source / (record + '.atr')).write_bytes(atr)
    lines = header.decode('ascii').splitlines()
    first = lines[0].split(); channels, fs, total = int(first[1]), float(first[2]), int(first[3])
    assert channels == 12 and fs == 257
    gains, baselines, names = [], [], []
    for line in lines[1:channels+1]:
        t = line.split(); assert t[0] == record + '.dat' and t[1] == '16'
        g = re.fullmatch(r'([+\-0-9.eE]+)(?:\(([+\-0-9]+)\))?(?:/(\S+))?', t[2]); assert g
        gain = float(g[1]); baseline = int(g[2]) if g[2] else int(t[4]); units = g[3] or 'mV'
        assert gain > 0 and units == 'mV' and int(t[3]) == 16
        name = canonical[t[8].lower()]
        gains.append(gain); baselines.append(baseline); names.append(name)
    assert set(names) == set(p['input']['leads']) and len(set(names)) == channels
    ann = wfdb.rdann(str(source / record), 'atr')
    assert np.all(np.diff(ann.sample) >= 0)
    patient = next((x.removeprefix('# patient ').strip() for x in lines if x.startswith('# patient ')), None)
    rows = []
    full_data = None
    for start in p['dataset']['segmentStartsSeconds']:
        first_sample = int(start * fs); count = int(p['dataset']['durationSeconds'] * fs)
        assert first_sample + count <= total
        lo = first_sample * channels * 2; hi = (first_sample + count) * channels * 2 - 1
        if full_data is None:
            raw, code, content_range = get(base + record + '.dat', (lo, hi))
            if code == 200:
                assert len(raw) == total * channels * 2
                full_data = raw
                (source / (record + '.dat')).write_bytes(raw)
                raw = raw[lo:hi+1]
            else:
                assert code == 206 and content_range == 'bytes %d-%d/%d' % (lo, hi, total * channels * 2), (code, content_range)
        else:
            raw = full_data[lo:hi+1]; code = 200; content_range = None
        assert len(raw) == count * channels * 2
        digital = np.frombuffer(raw, dtype='<i2').reshape(count, channels)
        # Independent WFDB decoder reads the original source and original header.
        native = wfdb.rdrecord(str(source / record), sampfrom=first_sample, sampto=first_sample+count, physical=False) if full_data is not None else wfdb.rdrecord(record, pn_dir='incartdb/1.0.0', sampfrom=first_sample, sampto=first_sample+count, physical=False)
        assert native.fs == fs and native.sig_name == [x.split()[8] for x in lines[1:channels+1]]
        assert list(native.adc_gain) == gains and list(native.baseline) == baselines
        assert np.array_equal(native.d_signal, digital), record
        physical = (digital.astype(np.float64) - np.array(baselines)) / np.array(gains)
        assert np.array_equal(native.dac(inplace=False), physical), record
        assert np.all(np.isfinite(physical))
        annotations = [{'sample':int(sample-first_sample), 'symbol':symbol} for sample, symbol in zip(ann.sample,ann.symbol) if first_sample <= sample < first_sample+count and symbol in p['reference']['beatSymbols']]
        fixture = dict(record=record, patientGroup=patient, startSeconds=start, fs=fs, leads={name:physical[:,i].tolist() for i,name in enumerate(names)}, annotations=annotations)
        name = '%s-%04d.json' % (record,start)
        data = json.dumps(fixture,allow_nan=False,separators=(',',':')).encode()
        (fixtures / name).write_bytes(data)
        rows.append(dict(record=record,startSeconds=start,patientGroup=patient,file=name,fixtureSha256=sha(data),sampleRange=[first_sample,first_sample+count],byteRange=[lo,hi],rawSha256=sha(raw),headerSha256=sha(header),annotationSha256=sha(atr),headerUnits='WFDB default mV where the original header omits /mV; original gains retained',nativeReader='WFDB 4.3.1',digitalAndPhysicalDecoderParity=True,verifiedSampleValues=int(physical.size),httpStatus=code,contentRange=content_range))
    print(record, 'acquired and independently decoded', flush=True)
    return rows

rows = []
with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
    futures = {pool.submit(acquire,r):r for r in p['dataset']['records']}
    for future in concurrent.futures.as_completed(futures):
        try: rows.extend(future.result())
        except Exception as e:
            print(futures[future], type(e).__name__, str(e), flush=True)
            raise
rows.sort(key=lambda r:(r['record'],r['startSeconds']))
assert len(rows) == p['dataset']['expectedWindows']
assert [(r['record'],r['startSeconds']) for r in rows] == [(r,s) for r in p['dataset']['records'] for s in p['dataset']['segmentStartsSeconds']]
manifest = dict(protocolSha256=sha(protocol_bytes),dataset=p['dataset'],wfdbVersion=wfdb.__version__,httpTransportVersion=requests.__version__,acquisitionPolicy='Transport dependencies checked before extraction; all prespecified windows are required without outcome-based substitution',windowCount=len(rows),patientGroups=len({r['patientGroup'] for r in rows}),verifiedSampleValues=sum(r['verifiedSampleValues'] for r in rows),rows=rows,clinicalValidation=False)
(out/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
print(json.dumps({k:manifest[k] for k in ['windowCount','patientGroups','verifiedSampleValues']}))
