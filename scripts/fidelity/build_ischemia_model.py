"""Cambio del latido durante la oclusión coronaria aguda, aprendido de STAFF III
(PhysioNet, ODC-By 1.0): angioplastia con balón, 12 derivaciones a 1000 Hz (I, II,
III y V1–V6 registradas), arteria ocluida y tiempos de inflado anotados.

Uso: python scripts/fidelity/build_ischemia_model.py --data ~/datos/ecg-referencia \
        --out src/engine/realistic/ischemia-model.json [--report informe.json]

Por inflado (registro BI con su anotación de inflado y desinflado):
  1. Remuestreo a 500 Hz; las 8 derivaciones independientes del motor (I, II,
     V1–V6) en mV, filtro 0,05–40 Hz (el ST no se toca con un pasa-altos mayor).
  2. Latido basal: mediana de los latidos de los 20 s previos al inflado (o, si el
     inflado empieza antes, de los primeros 20 s del registro basal de la sala de
     cateterismo BC). Sus fiduciales (inicio y fin del QRS, ápice y fin de T)
     definen las fases.
  3. Latidos isquémicos: mediana de cada ventana de 10 s desde el inflado hasta el
     desinflado, alineada al pico de energía del QRS de la basal.
  4. Delta = isquémico − basal, cada uno referido a su propio segmento PR, y
     segmentado en las fases del modelo de latido (qrs, st, t, post) con los
     fiduciales de la basal: el motor lo suma a la plantilla del paciente.
Sin trazados ni registros individuales en el producto.
"""
import argparse, json, os, re, sys, zipfile
import xml.etree.ElementTree as ET
import numpy as np
from scipy.signal import butter, filtfilt, resample_poly
sys.path.insert(0, os.path.dirname(__file__))
from wfdb import read, read_ann
from features import detect_beats, ms, FS
from build_shape_model import PHASES
from build_pvc_model import fiducials, segment_pvc, PRE

WINDOW_S = 10
POST = 900 - PRE  # ventana del latido (ms tras el pico), como las EV


def annotations(path):
    """Filas de la hoja: paciente, archivo BI, arteria, D0, D1, D2, IM previo."""
    T = '{urn:oasis:names:tc:opendocument:xmlns:table:1.0}'
    P = '{urn:oasis:names:tc:opendocument:xmlns:text:1.0}p'
    root = ET.fromstring(zipfile.ZipFile(path).read('content.xml'))
    rows = []
    for r in next(root.iter(T + 'table')).iter(T + 'table-row'):
        cells = []
        for c in r.iter(T + 'table-cell'):
            cells += [''.join(p.text or '' for p in c.iter(P))] * min(int(c.get(T + 'number-columns-repeated', '1')), 64)
        rows.append(cells)
    hdr = next(r for r in rows if r and r[0] == '#')
    col = {h: i for i, h in enumerate(hdr) if h}
    out = []
    for r in rows:
        if not r or not r[0].strip().isdigit():
            continue
        get = lambda k: r[col[k]].strip() if k in col and col[k] < len(r) else ''
        for k in [h for h in col if re.fullmatch(r'BI\d', h)]:
            f = get(k)
            if not f:
                continue
            d = [float(v) for v in get(k + ':D0;D1;D2').split(';')] if get(k + ':D0;D1;D2') else None
            out.append({'patient': int(r[0]), 'file': f, 'artery': get(k + ':Occluded artery'), 'd': d,
                        'baseline': get('BC1') or get('BC2'), 'priorMI': r[-1].strip() if len(r) > len(hdr) - 1 else ''})
    return out


def artery_class(s):
    s = s.lower()
    if 'lad' in s or 'diag' in s:
        return 'LAD'
    if 'rca' in s:
        return 'RCA'
    if 'circ' in s or 'lcx' in s or 'cx' in s or 'om' in s:
        return 'LCX'
    return None


def record_name(f):
    m = re.fullmatch(r'(\d+)([a-z])', f)
    return f'{int(m.group(1)):03d}{m.group(2)}' if m else None


def load8(path):
    fs, names, x = read(path)
    idx = [names.index(n) for n in ['I', 'II', 'V1', 'V2', 'V3', 'V4', 'V5', 'V6']]
    x = resample_poly(x[:, idx], 1, int(round(fs / FS)), axis=0)
    b, a = butter(2, [0.05 / (FS / 2), 40 / (FS / 2)], 'band')
    return filtfilt(b, a, x, axis=0)


def to12(x8):
    """Las 8 independientes al orden de 12 de features (III y aumentadas derivadas)."""
    I, II = x8[:, 0], x8[:, 1]
    return np.column_stack([I, II, II - I, -(I + II) / 2, I - II / 2, II - I / 2, x8[:, 2:]])


def median_at(x8, pk, ref=None):
    """Latido mediano (ventana PRE/POST ms alrededor del pico), alineado ±10 ms a `ref`."""
    a, b = ms(PRE), ms(POST)
    ok = pk[(pk >= a + ms(10)) & (pk < len(x8) - b - ms(10))]
    if len(ok) < 5:
        return None
    W = np.stack([x8[p - a:p + b] for p in ok])
    r = np.median(W, 0) if ref is None else ref
    q = slice(a - ms(60), a + ms(60))
    out = []
    for p in ok:
        best, lag = -np.inf, 0
        for d in range(-ms(10), ms(10) + 1):
            c = float((x8[p + d - a:p + d + b][q] * r[q]).sum())
            if c > best:
                best, lag = c, d
        out.append(x8[p + lag - a:p + lag + b])
    return np.median(np.stack(out), 0)


def j60(v):
    """ST a J+60 ms por derivación en el vector de fases (≈ 40 % del tramo ST)."""
    o = sum(n for name, n in PHASES[:4])
    n = dict(PHASES)['st']
    return v.reshape(-1, 8)[o + int(0.4 * n)]


def process(root, a):
    rec = record_name(a['file'])
    path = os.path.join(root, 'staffiii', 'data', rec)
    if not all(os.path.exists(path + e) for e in ('.hea', '.dat')):
        return None, 'archivo'
    x = load8(path)
    ev = (None, None)
    if os.path.exists(path + '.event'):
        s, _, aux = read_ann(path, 'event')
        inf = [t for t, txt in zip(s, aux) if 'inflation' in txt]
        dfl = [t for t, txt in zip(s, aux) if 'deflation' in txt]
        if inf and dfl and dfl[0] > inf[0]:
            ev = (inf[0] / 1000, dfl[0] / 1000)
    if ev[0] is None and a['d']:
        ev = (a['d'][0], a['d'][0] + a['d'][1])
    if ev[0] is None:
        return None, 'sin_tiempos'
    t_in, t_out = ev
    pk = detect_beats(to12(x))
    # Basal: 20 s previos al inflado, o el registro basal de la sala.
    pre = pk[(pk < t_in * FS - ms(500)) & (pk > (t_in - 20) * FS)]
    src = x
    if len(pre) < 8:
        bname = record_name(a['baseline'] or '')
        bpath = bname and os.path.join(root, 'staffiii', 'data', bname)
        if not (bpath and os.path.exists(bpath + '.dat') and os.path.exists(bpath + '.hea')):
            return None, 'sin_basal'
        src = load8(bpath)
        bp = detect_beats(to12(src))
        pre = bp[bp < 20 * FS]
    base = median_at(src, pre)
    if base is None:
        return None, 'sin_basal'
    fid = fiducials(base)
    if fid is None:
        return None, 'fiduciales'
    on, off, apex, end, _ = fid
    v0 = segment_pvc(base, fid)
    wins = []
    t = t_in
    while t + WINDOW_S <= t_out:
        w = pk[(pk >= t * FS) & (pk < (t + WINDOW_S) * FS)]
        m = median_at(x, w, ref=base)
        if m is not None:
            # Cada latido referido a su propio PR (fin del intervalo previo al QRS).
            m = m - m[max(0, on - ms(6)):on + 1].mean(0) + base[max(0, on - ms(6)):on + 1].mean(0)
            v = segment_pvc(m, fid)
            wins.append({'t': round(t - t_in + WINDOW_S / 2, 1), 'delta': (v - v0)})
        t += WINDOW_S
    if not wins:
        return None, 'oclusion_corta'
    return {'artery': artery_class(a['artery']), 'arteryText': a['artery'], 'record': rec, 'patient': a['patient'],
            'duration': t_out - t_in, 'qrsMs': (off - on) * 1000 / FS, 'sttMs': (end - off) * 1000 / FS,
            'base': v0, 'windows': wins}, None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--data', required=True)
    ap.add_argument('--out')
    ap.add_argument('--explore', help='JSON con el curso temporal por inflado (exploración)')
    a = ap.parse_args()
    root = os.path.expanduser(a.data)
    ann = annotations(os.path.join(root, 'staffiii', 'STAFF-III-Database-Annotations.ods'))
    rej, res = {}, []
    for row in ann:
        r, why = process(root, row)
        if r is None:
            rej[why] = rej.get(why, 0) + 1
            continue
        res.append(r)
    print(f'Inflados: {len(res)} de {len(ann)}; rechazos: {rej}', file=sys.stderr)
    if a.explore:
        out = []
        for r in res:
            st = [np.round(j60(w['delta']), 3).tolist() for w in r['windows']]
            out.append({k: r[k] for k in ('artery', 'arteryText', 'record', 'patient', 'duration', 'qrsMs', 'sttMs')} |
                       {'t': [w['t'] for w in r['windows']], 'st': st})
        json.dump(out, open(a.explore, 'w'))


if __name__ == '__main__':
    main()
