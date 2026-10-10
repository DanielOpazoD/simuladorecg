"""Modelo de la fibrilación ventricular (espectro y amplitud), aprendido de la
MIT-BIH Malignant Ventricular Ectopy Database (PhysioNet vfdb, ODC-By 1.0; 22
registros de 30 min, 2 derivaciones, 250 Hz) y de la Creighton University
Ventricular Tachyarrhythmia Database (PhysioNet cudb, ODC-By 1.0; 35 registros de
8 min, 1 derivación, 250 Hz; episodios entre los marcadores «[» y «]»).

Uso: python scripts/fidelity/build_vf_model.py --data ~/datos/ecg-referencia \
        --out src/engine/realistic/vf-model.json [--report informe.json]

Ventanas de 4 s enteras dentro de episodios anotados como FV (VF, VFIB) o flutter
ventricular (VFL), a lo sumo 20 por registro (ninguno domina): espectro paramétrico
de la primera derivación (el mismo de la FA: pico en la frecuencia dominante,
ancho, armónico) y amplitud eficaz en 1–30 Hz. Población: gaussiana contraída
(Ledoit-Wolf) sobre [pico, frecuencia dominante, log ancho, armónico, log RMS].
Reserva del banco: vfdb 425, 427 y 430; cudb cu10, cu20, cu30 (no entran al modelo). vfdb solo
tiene 2 derivaciones: la distribución espacial en 12 derivaciones no se aprende.
"""
import argparse, base64, json, os, sys
import numpy as np
from scipy.signal import butter, filtfilt, welch
sys.path.insert(0, os.path.dirname(__file__))
from wfdb import read, read_ann
from build_atrial_model import fit_spectrum, GRID, SPEC_NAMES

WIN = 4.0
RESERVE = {'425', '427', '430', 'cu10', 'cu20', 'cu30'}
VF_LABELS = ('(VF', '(VFIB', '(VFL')


def episodes(path, n):
    s, sym, aux = read_ann(path)
    if '[' in sym:  # cudb: comienzo y fin de FV como marcadores de latido
        on = [t for t, y in zip(s, sym) if y == '[']
        off = [t for t, y in zip(s, sym) if y == ']']
        return [(int(a), int(next((b for b in off if b > a), n)), '(VF') for a in on]
    marks = [(t, a) for t, a in zip(s, aux) if a]
    out = []
    for (t, a), nxt in zip(marks, marks[1:] + [(n, '')]):
        if a.strip() in VF_LABELS:
            out.append((int(t), int(nxt[0]), a.strip()))
    return out


def window_features(seg, fs):
    b, a = butter(3, [1 / (fs / 2), 30 / (fs / 2)], 'band')
    y = filtfilt(b, a, seg[:, 0])
    f, p = welch(y, fs=fs, nperseg=int(fs * 2))
    shape = np.interp(GRID, f, p)
    band = (GRID >= 3) & (GRID <= 12)
    shape = shape / shape[band].sum()
    params = fit_spectrum(shape)[1:]  # pendiente, pico, F, log ancho, armónico
    return list(params) + [float(np.log(y.std()))]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--data', required=True)
    ap.add_argument('--out', required=True)
    ap.add_argument('--report')
    a = ap.parse_args()
    rows, kinds, used = [], [], {}
    for db in ('vfdb', 'cudb'):
      root = os.path.join(os.path.expanduser(a.data), db)
      for r in open(os.path.join(root, 'RECORDS')).read().split():
        if r in RESERVE:
            continue
        fs, _, x = read(os.path.join(root, r))
        k = 0
        for t0, t1, lab in episodes(os.path.join(root, r), len(x)):
            w = int(WIN * fs)
            for st in range(t0, t1 - w, w):
                if k >= 20:
                    break
                seg = x[st:st + w]
                if not np.isfinite(seg).all() or seg[:, 0].std() < 0.02:
                    continue
                rows.append(window_features(seg, fs)); kinds.append(lab); k += 1
        if k:
            used[r] = k
    X = np.array(rows)
    names = SPEC_NAMES + ['log_rms_mv']
    J = X[:, 1:]  # sin la pendiente del fondo (no se genera, como en la FA)
    jn = names[1:]
    from sklearn.covariance import LedoitWolf
    mu, sd = J.mean(0), J.std(0, ddof=1)
    C = LedoitWolf().fit((J - mu) / sd).covariance_ * np.outer(sd, sd)
    f32 = lambda v: base64.b64encode(np.asarray(v, dtype='<f4').tobytes()).decode()
    model = {'schema': 'ecg-lab-vf-model/1',
             'source': 'PhysioNet vfdb 1.0.0 y cudb 1.0.0 (ODC-By 1.0), ventanas de 4 s de FV/flutter ventricular, sin la reserva (vfdb 425, 427, 430; cudb cu10, cu20, cu30)',
             'records': len(used), 'windows': len(X), 'band': [1, 30],
             'joint': {'names': jn, 'mean': f32(mu), 'cholesky': f32(np.linalg.cholesky(C)[np.tril_indices(len(mu))])}}
    json.dump(model, open(a.out, 'w'), separators=(',', ':'))
    rep = {'records': len(used), 'windows': len(X), 'por_registro': used,
           'dominant_hz_p10_50_90': np.percentile(X[:, 2], [10, 50, 90]).round(2).tolist(),
           'rms_mv_p10_50_90': np.exp(np.percentile(X[:, 5], [10, 50, 90])).round(3).tolist(),
           'tipos': {k: kinds.count(k) for k in set(kinds)}}
    print(json.dumps(rep))
    if a.report:
        json.dump(rep, open(a.report, 'w'), indent=1)


if __name__ == '__main__':
    main()
