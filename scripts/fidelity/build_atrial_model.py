"""Modelo de la actividad auricular de la fibrilación auricular (ondas f) y de su
RR, aprendido de PTB-XL (CC BY 4.0). Solo pliegues 1–8 (9–10: reserva del banco).

Uso: python scripts/fidelity/build_atrial_model.py --data ~/datos/ecg-referencia \
        --out src/engine/realistic/af-model.json [--report informe.json]

Por registro con AFIB (500 Hz, 8 derivaciones independientes):
  1. Cancelación QRST: a cada latido se le resta el latido medio del registro
     (alineado y con ganancia ajustada), con bordes suavizados. El resto es
     actividad auricular más ruido.
  2. Los ±70 ms del QRS (donde la cancelación deja restos) se enmascaran.
  3. A 100 Hz: forma del espectro en V1 (2–15 Hz) y
     covarianza espacial entre derivaciones en la banda 3–12 Hz.
  4. RR del registro: media, coeficiente de variación y autocorrelación de lag 1.
La población se resume en una gaussiana contraída (Ledoit-Wolf) sobre los
parámetros del espectro (pendiente del fondo, pico, frecuencia dominante, ancho y
armónico), la covarianza espacial (log-Cholesky, ACP) y el CV del RR. No se guarda ningún trazado ni ningún registro individual.
"""
import argparse, ast, base64, csv, json, os, sys
import numpy as np
from scipy.signal import butter, filtfilt, welch
sys.path.insert(0, os.path.dirname(__file__))
from wfdb import read
from features import detect_beats, INDEP, ms, FS

LO, HI = 3.0, 12.0          # banda de las ondas f (Hz)
GRID = np.arange(2.0, 15.01, 0.25)  # rejilla de la forma espectral (Hz)
FS_A = 100                  # frecuencia de trabajo de la actividad auricular
PRE, POST = 100, 450        # ventana de cancelación alrededor del pico QRS (ms)
MASK = 70                   # ±ms enmascarados alrededor del QRS


def cancel_qrst(y, pk):
    """Resta el latido medio (ventana −PRE…+POST ms, recortada antes del siguiente QRS)."""
    a, b = ms(PRE), ms(POST)
    ok = [p for p in pk if p - a >= 0 and p + b < len(y)]
    if len(ok) < 4:
        return None
    tpl = np.median(np.stack([y[p - a:p + b] for p in ok]), 0)
    taper = np.ones(a + b)
    e = ms(20)
    taper[:e] = 0.5 * (1 - np.cos(np.pi * np.arange(e) / e))
    taper[-e:] = taper[:e][::-1]
    r = y.copy()
    for i, p in enumerate(pk):
        lo, hi = p - a, p + b
        nxt = pk[i + 1] - a if i + 1 < len(pk) else len(y)
        hi = min(hi, nxt + e, len(y))
        if lo < 0:
            continue
        seg = tpl[:hi - lo] * taper[:hi - lo, None] if hi - lo < a + b else tpl * taper[:, None]
        if hi - lo < a + b:  # ventana recortada: nuevo borde suave
            seg = seg.copy()
            seg[-e:] *= np.linspace(1, 0, e)[:, None]
        x = y[lo:hi]
        # Ganancia por latido y derivación (variación respiratoria del QRS).
        g = np.clip((x * seg).sum(0) / np.maximum((seg * seg).sum(0), 1e-12), 0.7, 1.3)
        r[lo:hi] -= seg * g
    return r


def record_features(x):
    y = x[:, INDEP]
    bh, ah = butter(2, 1.0 / (FS / 2), 'high')
    y = filtfilt(bh, ah, y, axis=0)
    pk = detect_beats(x)
    if len(pk) < 6:
        return None
    r = cancel_qrst(y, pk)
    if r is None:
        return None
    keep = np.ones(len(r), bool)
    for p in pk:
        keep[max(0, p - ms(MASK)):p + ms(MASK)] = False
    if keep.mean() < 0.4:
        return None
    # Huecos del QRS por interpolación lineal (solo afecta < 3 Hz y se excluye).
    idx = np.arange(len(r))
    for j in range(r.shape[1]):
        r[~keep, j] = np.interp(idx[~keep], idx[keep], r[keep, j])
    bl, al = butter(4, 40 / (FS / 2))
    r = filtfilt(bl, al, r, axis=0)[::FS // FS_A]
    k = keep[::FS // FS_A]
    f, p = welch(r, fs=FS_A, nperseg=256, axis=0)
    # Forma espectral en V1, donde dominan las ondas f (en las demás derivaciones
    # los restos de T de baja frecuencia desplazan el pico al borde de la banda).
    shape = np.interp(GRID, f, p[:, 2])
    band = (GRID >= LO) & (GRID <= HI)
    shape = shape / shape[band].sum()
    bb, ab = butter(3, [LO / (FS_A / 2), HI / (FS_A / 2)], 'band')
    rb = filtfilt(bb, ab, r, axis=0)[k]
    C = np.cov(rb.T)
    rr = np.diff(pk) / FS
    return {'shape': shape, 'C': C, 'dominant': float(GRID[band][np.argmax(shape[band])]),
            'rr_mean': float(rr.mean()), 'rr_cv': float(rr.std(ddof=1) / rr.mean()),
            'rr_ac1': float(np.corrcoef(rr[:-1], rr[1:])[0, 1]) if len(rr) > 3 else 0.0}


SPEC_NAMES = ['slope', 'peak', 'dominant_hz', 'log_width', 'harmonic']


def spectral_model(f, p):
    """log10 de la densidad: fondo con pendiente + pico gaussiano en la frecuencia
    dominante + armónico a 2× (más ancho). p = c, pendiente, A, F, log w, h."""
    c, slope, A, F, lw, h = p
    w = np.exp(lw)
    return (c + slope * np.log(f) + A * np.exp(-0.5 * ((f - F) / w) ** 2)
            + A * h * np.exp(-0.5 * ((f - 2 * F) / (1.5 * w)) ** 2))


def fit_spectrum(shape):
    """Ajuste por mínimos cuadrados con varios arranques de la frecuencia dominante."""
    from scipy.optimize import least_squares
    y = np.log10(shape + 1e-9)
    best = None
    for F0 in (3.5, 4.5, 5.5, 6.5, 7.5, 8.5):
        r = least_squares(lambda p: spectral_model(GRID, p) - y, [y.mean(), -1, 0.5, F0, np.log(0.7), 0.3],
                          bounds=([-20, -6, 0, 3, np.log(0.2), 0], [20, 4, 4, 9.5, np.log(2.5), 1]))
        if best is None or r.cost < best.cost:
            best = r
    return best.x


def logchol(C):
    L = np.linalg.cholesky(C + 1e-9 * np.eye(len(C)))
    v = L[np.tril_indices(len(C))].copy()
    d = np.cumsum(np.arange(1, len(C) + 1)) - 1  # posiciones de la diagonal
    v[d] = np.log(v[d])
    return v


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--data', required=True)
    ap.add_argument('--out', required=True)
    ap.add_argument('--report')
    a = ap.parse_args()
    root = os.path.expanduser(a.data)
    rows = list(csv.DictReader(open(os.path.join(root, 'ptb-xl', 'ptbxl_database.csv'))))
    feats, seen, rej = [], set(), {'archivo': 0, 'latidos': 0, 'atipico': 0}
    for row in rows:
        scp = ast.literal_eval(row['scp_codes'])
        # Los códigos de ritmo de PTB-XL llevan probabilidad 0: cuenta la presencia.
        if 'AFIB' not in scp or 'AFLT' in scp or 'PACE' in scp:
            continue
        if row['strat_fold'] not in [str(i) for i in range(1, 9)] or row['pacemaker'] or row['electrodes_problems']:
            continue
        if row['patient_id'] in seen or not row['age'] or float(row['age']) < 18:
            continue
        path = os.path.join(root, 'ptb-xl', row['filename_hr'])
        if not os.path.exists(path + '.dat'):
            rej['archivo'] += 1
            continue
        try:
            _, _, x = read(path)
        except (ValueError, OSError):
            rej['archivo'] += 1
            continue
        f = record_features(x)
        if f is None or not np.isfinite(f['shape']).all() or not 0.25 < f['rr_mean'] < 2.0:
            rej['latidos'] += 1
            continue
        seen.add(row['patient_id'])
        feats.append(f)
    n = len(feats)
    # Espectro paramétrico por paciente: una gaussiana sobre coeficientes de ACP
    # del log-espectro mezclaba picos en frecuencias distintas y los aplanaba
    # (frecuencia dominante sintética 3,9 Hz frente a 5,5 Hz real).
    S = np.stack([fit_spectrum(f['shape'])[1:] for f in feats])
    V = np.stack([logchol(f['C']) for f in feats])
    # Atípicos (restos de QRS, electrodos sueltos): potencia total extrema.
    power = np.array([np.trace(f['C']) for f in feats])
    lp = np.log(power)
    ok = np.abs(lp - np.median(lp)) < 3 * 1.4826 * np.median(np.abs(lp - np.median(lp)))
    rej['atipico'] = int((~ok).sum())
    feats = [f for f, o in zip(feats, ok) if o]
    S, V = S[ok], V[ok]
    n = len(feats)

    def pca(X, var=0.95):
        m = X.mean(0)
        U, s, Wt = np.linalg.svd(X - m, full_matrices=False)
        ev = s ** 2 / (len(X) - 1)
        k = int(np.searchsorted(np.cumsum(ev) / ev.sum(), var)) + 1
        k = min(k, len(X) // 10)
        sd = np.sqrt(ev[:k])
        return m, Wt[:k] * sd[:, None], (X - m) @ Wt[:k].T / sd, float(ev[:k].sum() / ev.sum())

    vm, vb, vz, vev = pca(V)
    rr = np.array([[np.log(f['rr_cv']), f['rr_ac1']] for f in feats])
    J = np.column_stack([S, vz, rr])
    from sklearn.covariance import LedoitWolf
    mu, sdJ = J.mean(0), J.std(0, ddof=1)
    Cj = LedoitWolf().fit((J - mu) / sdJ).covariance_ * np.outer(sdJ, sdJ)
    f32 = lambda x: base64.b64encode(np.asarray(x, dtype='<f4').tobytes()).decode()
    model = {
        'schema': 'ecg-lab-af-model/1',
        'source': 'PTB-XL 1.0.3 (CC BY 4.0), registros AFIB 500 Hz, pliegues 1-8; cancelación QRST por latido medio',
        'subjects': n, 'leads': ['I', 'II', 'V1', 'V2', 'V3', 'V4', 'V5', 'V6'],
        'fs': FS_A, 'band': [LO, HI], 'grid': [float(GRID[0]), 0.25, len(GRID)],
        'spectrum': {'model': 'log10 S(f) = c + slope·ln f + peak·[g(f; F, w) + harmonic·g(f; 2F, 1.5w)]', 'params': SPEC_NAMES},
        'spatial': {'mean': f32(vm), 'basis': f32(vb), 'k': int(len(vb)), 'explained': round(vev, 4)},
        'joint': {'names': SPEC_NAMES + [f'v{i}' for i in range(len(vb))] + ['log_rr_cv', 'rr_ac1'],
                  'mean': f32(mu), 'cholesky': f32(np.linalg.cholesky(Cj)[np.tril_indices(len(mu))])},
    }
    json.dump(model, open(a.out, 'w'), separators=(',', ':'))
    dom = np.array([f['dominant'] for f in feats])
    rms = np.sqrt(np.array([np.diag(f['C']) for f in feats]))
    rep = {'subjects': n, 'rejected': rej, 'spatial_k': len(vb),
           'fit_dominant_hz_p10_50_90': np.percentile(S[:, 2], [10, 50, 90]).round(2).tolist(),
           'dominant_hz_p10_50_90': np.percentile(dom, [10, 50, 90]).round(2).tolist(),
           'rms_uv_p50_per_lead': (np.median(rms, 0) * 1000).round(1).tolist(),
           'rr_cv_p10_50_90': np.percentile([f['rr_cv'] for f in feats], [10, 50, 90]).round(3).tolist(),
           'rr_ac1_p10_50_90': np.percentile([f['rr_ac1'] for f in feats], [10, 50, 90]).round(3).tolist()}
    print(json.dumps(rep, indent=1))
    if a.report:
        json.dump(rep, open(a.report, 'w'), indent=1)


if __name__ == '__main__':
    main()
