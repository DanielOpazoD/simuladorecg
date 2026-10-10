"""Modelo de forma de la extrasístole ventricular (EV), aprendido de PTB-XL
(CC BY 4.0). Solo pliegues 1–8 (9–10: reserva del banco).

Uso: python scripts/fidelity/build_pvc_model.py --data ~/datos/ecg-referencia \
        --out src/engine/realistic/models/PVC.json [--report informe.json]

Por registro con PVC/BIGU/TRIGU (500 Hz, sin marcapasos):
  1. Latidos detectados; latido dominante = mediana de todos.
  2. Candidatos a EV: QRS distinto del dominante (correlación < 0,7 en ±80 ms) y
     prematuros (RR previo < 0,92 × RR mediano de los latidos dominantes).
     Se toma el grupo más numeroso de morfología común (correlación ≥ 0,85): la EV
     unifocal del registro.
  3. Mediana de esas EV alineadas; inicio y fin del QRS por la velocidad espacial
     (12 % del máximo), ápice de T por la magnitud espacial y fin de T al caer al
     15 % del ápice.
  4. Mismas fases que el modelo sinusal; las fases auriculares quedan en cero (una
     EV no tiene P propia). La línea de base es el nivel al inicio del QRS.
La población se ajusta con la misma función que las clases (ACP, gaussiana
contraída). Sin trazados ni registros individuales.
"""
import argparse, ast, csv, os, sys
import numpy as np
from scipy.signal import butter, filtfilt
sys.path.insert(0, os.path.dirname(__file__))
from wfdb import read
from features import detect_beats, INDEP, ms, FS
from build_shape_model import PHASES, CLASS_POST_MS, fit_and_write

PRE, POST = 320, 560  # ventana del latido alrededor del pico detectado (ms)


def windows(x, pk):
    a, b = ms(PRE), ms(POST)
    ok = [p for p in pk if p - a >= 0 and p + b <= len(x)]
    return np.array(ok), (np.stack([x[p - a:p + b] for p in ok]) if ok else None)


def qrs_corr(w, ref):
    a = ms(PRE)
    s = slice(a - ms(80), a + ms(80))
    u, v = w[s] - w[s].mean(0), ref[s] - ref[s].mean(0)
    return float((u * v).sum() / np.sqrt((u * u).sum() * (v * v).sum() + 1e-12))


def align(beats):
    """Alinea cada latido a la mediana por correlación cruzada de ±12 ms."""
    a, ref = ms(PRE), np.median(beats, 0)
    out = []
    for bt in beats:
        best, lag = -np.inf, 0
        for d in range(-ms(12), ms(12) + 1):
            c = float((np.roll(bt, -d, 0)[a - ms(60):a + ms(80)] * ref[a - ms(60):a + ms(80)]).sum())
            if c > best:
                best, lag = c, d
        out.append(np.roll(bt, -lag, 0))
    return np.median(np.stack(out), 0)


def fiducials(t8):
    """Inicio/fin del QRS, ápice y fin de T (índices) en una plantilla de 8 derivaciones."""
    a = ms(PRE)
    v = np.sqrt((np.diff(t8, axis=0) ** 2).sum(1))
    v = np.convolve(v, np.ones(ms(8)) / ms(8), 'same')
    lo, hi = a - ms(150), a + ms(220)
    vmax = v[lo:hi].max()
    thr = 0.12 * vmax
    top = lo + int(np.argmax(v[lo:hi]))
    on = top
    while on > lo and v[on] > thr:
        on -= 1
    above = np.where(v[top:hi] > thr)[0]
    off = top + int(above.max()) + 1 if len(above) else top
    base = t8[max(0, on - ms(6)):on + 1].mean(0)
    mag = np.linalg.norm(t8 - base, axis=1)
    s0, s1 = off + ms(60), min(len(t8) - ms(CLASS_POST_MS) - 1, off + ms(420))
    if s1 <= s0:
        return None
    apex = s0 + int(np.argmax(mag[s0:s1]))
    end = apex
    while end < len(t8) - ms(CLASS_POST_MS) - 1 and mag[end] > 0.15 * mag[apex]:
        end += 1
    return on, off, apex, end, base


def segment_pvc(t8, fid):
    on, off, apex, end, base = fid
    t = np.arange(len(t8))
    interp = lambda idx: np.array([np.interp(idx, t, t8[:, j]) for j in range(8)]).T
    bounds = {'qrs': (on, off), 'st': (off, apex), 't': (apex, end), 'post': (end, end + ms(CLASS_POST_MS))}
    parts = []
    for name, n in PHASES:
        parts.append(interp(np.linspace(*bounds[name], n)) - base if name in bounds else np.zeros((n, 8)))
    return np.concatenate(parts).reshape(-1)


def record_pvc(x):
    b, a = butter(2, [0.5 / (FS / 2), 40 / (FS / 2)], 'band')
    x = filtfilt(b, a, x, axis=0)
    pk = detect_beats(x)
    if len(pk) < 5:
        return None
    ok, W = windows(x[:, INDEP], pk)
    if W is None or len(ok) < 5:
        return None
    rr_prev = np.diff(pk) / FS
    prev = {p: r for p, r in zip(pk[1:], rr_prev)}
    ref = np.median(W, 0)
    corr = np.array([qrs_corr(w, ref) for w in W])
    dominant = corr >= 0.85
    if dominant.sum() < 3:
        return None
    rr_norm = np.median([prev[p] for p, d in zip(ok, dominant) if d and p in prev] or [np.median(rr_prev)])
    cand = [i for i, (p, c) in enumerate(zip(ok, corr)) if c < 0.7 and p in prev and prev[p] < 0.92 * rr_norm]
    if not cand:
        return None
    # Grupo de morfología común más numeroso (EV unifocal).
    groups = []
    for i in cand:
        for g in groups:
            if qrs_corr(W[i], W[g[0]]) >= 0.85:
                g.append(i)
                break
        else:
            groups.append([i])
    g = max(groups, key=len)
    tpl = align(W[g]) if len(g) > 1 else W[g[0]]
    fid = fiducials(tpl)
    if fid is None:
        return None
    on, off, apex, end, _ = fid
    qrs_ms, stt_ms = (off - on) * 1000 / FS, (end - off) * 1000 / FS
    if not (100 <= qrs_ms <= 220 and 160 <= stt_ms <= 520):
        return None
    coupling = float(np.median([prev[ok[i]] for i in g]) / rr_norm)
    return {'v': segment_pvc(tpl, fid), 'qrs': qrs_ms, 'stt': stt_ms, 'frac': (apex - off) / max(1, end - off),
            'rr': float(rr_norm), 'coupling': coupling, 'count': len(g)}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--data', required=True)
    ap.add_argument('--out', required=True)
    ap.add_argument('--report')
    ap.add_argument('--components', type=int, default=64)
    ap.add_argument('--sample-scale', type=float, default=1.0)
    a = ap.parse_args()
    root = os.path.expanduser(a.data)
    rows = list(csv.DictReader(open(os.path.join(root, 'ptb-xl', 'ptbxl_database.csv'))))
    vecs, durs, rrs, extra, seen = [], [], [], [], set()
    rej = {'archivo': 0, 'sin_ev': 0}
    for row in rows:
        scp = ast.literal_eval(row['scp_codes'])
        if not any(k in scp for k in ('PVC', 'BIGU', 'TRIGU')) or 'PACE' in scp:
            continue
        if row['strat_fold'] not in [str(i) for i in range(1, 9)] or row['pacemaker'] or row['electrodes_problems']:
            continue
        if row['patient_id'] in seen or not row['age'] or float(row['age']) < 18:
            continue
        path = os.path.join(root, 'ptb-xl', row['filename_hr'])
        try:
            _, _, x = read(path)
        except (ValueError, OSError):
            rej['archivo'] += 1
            continue
        f = record_pvc(x)
        if f is None:
            rej['sin_ev'] += 1
            continue
        seen.add(row['patient_id'])
        vecs.append(f['v'])
        # Sin P propia: P y PQ nominales (constantes; la población no las usa).
        durs.append([100.0, 50.0, f['qrs'], f['stt'], min(0.9, max(0.1, f['frac']))])
        rrs.append(f['rr'])
        extra.append((f['coupling'], f['count']))
    V, D, RR = np.array(vecs), np.array(durs), np.array(rrs)
    print(f'EV usadas: {len(V)}; rechazos: {rej}', file=sys.stderr)
    model, rep = fit_and_write(V, D, RR, rej, 'PVC', a.components, a.sample_scale, CLASS_POST_MS,
                               'PTB-XL 1.0.3 (CC BY 4.0), extrasístoles ventriculares (mediana por registro), pliegues 1-8, PVC',
                               a.out, None)
    E = np.array(extra)
    rep['coupling_p10_50_90'] = np.percentile(E[:, 0], [10, 50, 90]).round(3).tolist()
    rep['ev_por_registro_p50'] = float(np.median(E[:, 1]))
    print('acoplamiento', rep['coupling_p10_50_90'], file=sys.stderr)
    if a.report:
        import json
        json.dump(rep, open(a.report, 'w'), indent=1)


if __name__ == '__main__':
    main()
