"""Reproduce descriptive AF timing from corrected annotations, never fit the generator.
Run with wfdb==4.3.1. Downloads only annotations/headers, never full ECGs.
"""
import argparse
import hashlib
import json
from pathlib import Path
from urllib.request import urlopen
import numpy as np
import wfdb

BASE = 'https://physionet.org/files/afdb/1.0.0/'


def af_windows(beats, transitions, end_sample, fs, window_seconds=60, minimum_intervals=20):
    if not np.isfinite(fs) or fs <= 0 or end_sample <= 0:
        raise ValueError('Invalid acquisition duration/rate')
    if any(b < 0 or b >= end_sample for b in beats) or any(b <= a for a, b in zip(beats, beats[1:])):
        raise ValueError('Invalid beat chronology')
    if any(t < 0 or t >= end_sample for t, _ in transitions) or any(b[0] <= a[0] for a,b in zip(transitions,transitions[1:])):
        raise ValueError('Invalid rhythm chronology')
    windows, episodes = [], []
    for i, (start, rhythm) in enumerate(transitions):
        if rhythm != '(AFIB':
            continue
        stop = transitions[i+1][0] if i+1 < len(transitions) else end_sample
        episodes.append({'startSample': int(start), 'stopSample': int(stop)})
        span = int(round(window_seconds * fs))
        for lo in range(int(start), int(stop) - span + 1, span):
            hi = lo + span
            selected = np.asarray(beats)[(np.asarray(beats) >= lo) & (np.asarray(beats) < hi)]
            rr = np.diff(selected) / fs
            if len(rr) >= minimum_intervals:
                windows.append({'startSample': lo, 'stopSample': hi, **rr_stats(rr)})
    return episodes, windows


def rr_stats(rr):
    rr = np.asarray(rr, dtype=float)
    if len(rr) < 2 or not np.isfinite(rr).all() or (rr <= 0).any():
        raise ValueError('Invalid RR intervals')
    mean, sd = float(np.mean(rr)), float(np.std(rr))
    q = np.quantile(rr, [.05, .25, .5, .75, .95], method='linear')
    lag = None if np.std(rr[:-1]) == 0 or np.std(rr[1:]) == 0 else float(np.corrcoef(rr[:-1],rr[1:])[0,1])
    return {'intervals':len(rr), 'meanSeconds':mean, 'sdSeconds':sd, 'cv':sd/mean,
            'rateFromMeanRR':60/mean, 'quantilesSeconds':q.tolist(), 'lagOne':lag,
            'rmssdSeconds':float(np.sqrt(np.mean(np.diff(rr)**2)))}


def run(output):
    output.mkdir(parents=True, exist_ok=True)
    raw = output/'annotations'; raw.mkdir(exist_ok=True)
    protocol = json.loads((Path(__file__).resolve().parent.parent/'benchmarks/af-rhythm/protocol.json').read_text())
    manifest = urlopen(BASE+'SHA256SUMS.txt', timeout=60).read()
    sums = {line.split()[1]: line.split()[0] for line in manifest.decode().splitlines()}
    corrected = sorted(n[:-5] for n in sums if n.endswith('.qrsc') and '/' not in n)
    if corrected != protocol['records']:
        raise ValueError('Release corrected-record selection changed; review protocol')
    hashes, records = {}, []
    for record in corrected:
        for ext in ['hea','atr','qrsc']:
            name = record+'.'+ext
            local = raw/name
            data = local.read_bytes() if local.exists() else urlopen(BASE+name,timeout=60).read()
            digest = hashlib.sha256(data).hexdigest()
            if digest != sums[name]:
                raise ValueError('Source checksum mismatch: '+name)
            hashes[name] = digest; local.write_bytes(data)
        header = wfdb.rdheader(str(raw/record))
        beats = wfdb.rdann(str(raw/record),'qrsc')
        rhythm = wfdb.rdann(str(raw/record),'atr')
        episodes, windows = af_windows(beats.sample, list(zip(rhythm.sample,rhythm.aux_note)), header.sig_len, header.fs,
                                      protocol['windowSeconds'],protocol['minimumIntervals'])
        records.append({'record':record,'fs':header.fs,'durationSamples':header.sig_len,'afEpisodes':episodes,'windows':windows})
    result = {'protocol':protocol,'manifestSha256':hashlib.sha256(manifest).hexdigest(),'sourceHashes':hashes,
              'decoder':'wfdb '+wfdb.__version__,'records':records,'fittedParameters':False,'clinicalValidation':False}
    (output/'af-rhythm-reference.json').write_text(json.dumps(result,indent=2)+'\n')
    print(json.dumps({r['record']:len(r['windows']) for r in records}))

if __name__ == '__main__':
    parser=argparse.ArgumentParser();parser.add_argument('output',type=Path)
    run(parser.parse_args().output)
