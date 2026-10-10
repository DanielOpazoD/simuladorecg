"""Modelo de las ondas F del flutter auricular, aprendido de la base de Georgia
(PhysioNet Challenge 2021, CC BY 4.0) y de PTB-XL (CC BY 4.0, pliegues 1–8);
12 derivaciones, 500 Hz, 10 s. Reserva del banco: en Georgia, registros cuyo
número termina en 0; en PTB-XL, los pliegues 9–10. (La etiqueta de flutter de
Chapman-Ningbo, ecg-arrhythmia 1.0.0, se descartó: sus 8.060 «flutter» son en su
mayoría fibrilación auricular a la vista.)

Uso: python scripts/fidelity/build_flutter_model.py --data ~/datos/ecg-referencia \
        --out src/engine/realistic/flutter-model.json [--report informe.json] [--sample-scale 0.7]

En PTB-XL casi todos los flutter son 2:1 a ~145 lpm: las ondas F caen enganchadas
al QRS y la T, y una cancelación del QRST las borraría con él. Aquí se usan solo
registros con flutter (sin FA) y FC ≤ 100 lpm (conducción 3:1, 4:1 o variable),
donde el ciclo completo queda a la vista entre latidos. Por registro:
  1. QRS-T enmascarado (−80 ms … +min(450 ms, 0,55·RR) alrededor de cada QRS); se
     pliega la señal original filtrada (0,5–40 Hz), sin cancelar latidos.
  2. Longitud del ciclo auricular: máximo de la autocorrelación de la señal libre
     entre 150 y 350 ms (170–400 lpm), refinado en pasos de 0,2 ms maximizando la
     varianza explicada por el plegado.
  3. Onda F del paciente: mediana del residuo plegado por la fase del ciclo
     (64 puntos × 8 derivaciones), desplazada para que el nadir de II quede en la
     fase 0 (el sentido de la onda en II distingue el flutter típico).
  4. Fase del ciclo en la que cae el pico del QRS (media circular) y razón de
     conducción (RR / ciclo).
La población: ACP de las ondas F (modos del 95 %, tope n/3) y una gaussiana
contraída (Ledoit-Wolf) con el ciclo y la fase del QRS. Con pocos pacientes el
muestreo puede acotarse (--sample-scale). Sin trazados ni registros individuales.
"""
import argparse, ast, base64, csv, json, os, sys
import numpy as np
from scipy.signal import butter, filtfilt
sys.path.insert(0, os.path.dirname(__file__))
from scipy.io import loadmat
from wfdb import read
from features import detect_beats, INDEP, ms, FS

BINS = 64


def record_features(x):
    b, a = butter(2, [0.5 / (FS / 2), 40 / (FS / 2)], 'band')
    r = filtfilt(b, a, x[:, INDEP], axis=0)
    pk = detect_beats(x)
    if len(pk) < 4:
        return None
    rr_med = float(np.median(np.diff(pk))) / FS
    if rr_med < 0.6:
        return None
    keep = np.ones(len(r), bool)
    for p in pk:
        keep[max(0, p - ms(80)):p + int(min(0.45, 0.55 * rr_med) * FS)] = False
    if keep.mean() < 0.25:
        return None
    # Autocorrelación del residuo (cada derivación normalizada), solo con muestras útiles.
    z = np.where(keep[:, None], r / (r[keep].std(0) + 1e-9), 0.0)
    lags = np.arange(ms(150), ms(350) + 1)
    ac = np.array([(z[:-L] * z[L:]).sum() / max(1, (keep[:-L] & keep[L:]).sum() * z.shape[1]) for L in lags])
    i = int(np.argmax(ac))
    if 0 < i < len(ac) - 1:
        a, b, c = ac[i - 1], ac[i], ac[i + 1]
        i = i + 0.5 * (a - c) / (a - 2 * b + c) if (a - 2 * b + c) != 0 else i
    cl0 = (lags[0] + i) / FS  # s
    t = np.arange(len(r)) / FS

    def fold(cl):
        idx = np.minimum((((t / cl) % 1) * BINS).astype(int), BINS - 1)
        tpl = np.zeros((BINS, r.shape[1]))
        for k in range(BINS):
            sel = keep & (idx == k)
            if sel.sum() < 3:
                return None, None, -np.inf
            tpl[k] = np.median(r[sel], 0)
        tpl -= tpl.mean(0)
        # Varianza de la señal libre explicada por la onda plegada.
        return tpl, idx, 1 - ((r[keep] - tpl[idx[keep]]) ** 2).sum() / (r[keep] ** 2).sum()

    # En 10 s caben ~50 ciclos: un error de 3 ms en el ciclo deriva casi un ciclo
    # entero y emborrona el plegado. Se refina el ciclo maximizando lo explicado.
    best = (None, None, -np.inf, cl0)
    for cl in np.arange(cl0 * 0.94, cl0 * 1.06, 0.0002):
        tpl, idx, ex = fold(cl)
        if ex > best[2]:
            best = (tpl, idx, ex, cl)
    tpl, idx, explained, cl = best
    if tpl is None:
        return None
    shift = int(np.argmin(tpl[:, 1]))  # nadir de II en la fase 0
    tpl = np.roll(tpl, -shift, axis=0)
    qphase = ((pk / FS) / cl - shift / BINS) % 1
    ang = np.angle(np.exp(2j * np.pi * qphase).mean())
    rr = np.diff(pk) / FS
    return {'tpl': tpl, 'cl': cl, 'ac': float(ac.max()), 'explained': float(explained),
            'qrs_phase': float((ang / (2 * np.pi)) % 1), 'ratio': float(np.median(rr) / cl)}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--data', required=True)
    ap.add_argument('--out', required=True)
    ap.add_argument('--report')
    ap.add_argument('--sample-scale', type=float, default=1.0)
    a = ap.parse_args()
    root = os.path.expanduser(a.data)
    feats, rej = [], {'archivo': 0, 'fc_alta_o_latidos': 0, 'periodicidad': 0, 'reserva': 0}

    def add(x):
        if x.shape[1] != 12 or len(x) < 4000 or not np.isfinite(x).all():
            rej['archivo'] += 1
            return
        f = record_features(x[:5000])
        if f is None:
            rej['fc_alta_o_latidos'] += 1
        elif f['ac'] < 0.2 or f['explained'] < 0.2:
            # Un flutter organizado se repite: el plegado debe explicar parte de la señal libre.
            rej['periodicidad'] += 1
        else:
            feats.append(f)

    # Georgia (Challenge 2021): reserva = número de registro terminado en 0.
    gbase = os.path.join(root, 'georgia')
    for rel in [l.strip() for l in open(os.path.join(gbase, 'flutter-mat.list')) if l.strip()]:
        if int(os.path.basename(rel)[1:6]) % 10 == 0:
            rej['reserva'] += 1
            continue
        try:
            add(loadmat(os.path.join(gbase, rel))['val'].T.astype(np.float64) / 1000.0)
        except (ValueError, OSError, KeyError):
            rej['archivo'] += 1
    # PTB-XL: pliegues 1–8, flutter sin FA ni marcapasos, un registro por paciente.
    seen = set()
    for row in csv.DictReader(open(os.path.join(root, 'ptb-xl', 'ptbxl_database.csv'))):
        scp = ast.literal_eval(row['scp_codes'])
        if 'AFLT' not in scp or 'AFIB' in scp or 'PACE' in scp or row['pacemaker']:
            continue
        if row['strat_fold'] not in [str(i) for i in range(1, 9)] or row['patient_id'] in seen:
            continue
        seen.add(row['patient_id'])
        try:
            add(read(os.path.join(root, 'ptb-xl', row['filename_hr']))[2])
        except (ValueError, OSError):
            rej['archivo'] += 1
    n = len(feats)
    print(f'Pacientes: {n}; rechazos: {rej}', file=sys.stderr)
    T = np.stack([f['tpl'].reshape(-1) for f in feats])
    m = T.mean(0)
    U, s, Wt = np.linalg.svd(T - m, full_matrices=False)
    ev = s ** 2 / (n - 1)
    k = int(np.searchsorted(np.cumsum(ev) / ev.sum(), 0.95)) + 1
    k = max(2, min(k, n // 3))
    sd = np.sqrt(ev[:k])
    zt = (T - m) @ Wt[:k].T / sd
    extra = np.array([[np.log(f['cl']), np.cos(2 * np.pi * f['qrs_phase']), np.sin(2 * np.pi * f['qrs_phase'])] for f in feats])
    J = np.column_stack([zt, extra])
    from sklearn.covariance import LedoitWolf
    mu, sdJ = J.mean(0), J.std(0, ddof=1)
    Cj = LedoitWolf().fit((J - mu) / sdJ).covariance_ * np.outer(sdJ, sdJ)
    f32 = lambda x: base64.b64encode(np.asarray(x, dtype='<f4').tobytes()).decode()
    model = {
        'schema': 'ecg-lab-flutter-model/1',
        'source': 'Georgia 12-lead ECG Challenge (PhysioNet Challenge 2021 1.0.3, CC BY 4.0) y PTB-XL 1.0.3 (CC BY 4.0, pliegues 1-8): flutter sin FA con FC <= 100 lpm, 500 Hz; plegado por ciclo auricular con QRS-T enmascarado',
        'subjects': n, 'leads': ['I', 'II', 'V1', 'V2', 'V3', 'V4', 'V5', 'V6'], 'bins': BINS,
        'template': {'mean': f32(m), 'basis': f32(Wt[:k] * sd[:, None]), 'k': k, 'explained': round(float(ev[:k].sum() / ev.sum()), 4)},
        'joint': {'names': [f't{i}' for i in range(k)] + ['log_cycle_s', 'qrs_phase_cos', 'qrs_phase_sin'],
                  'mean': f32(mu), 'cholesky': f32(np.linalg.cholesky(Cj)[np.tril_indices(len(mu))])},
        **({'sampleScale': a.sample_scale} if a.sample_scale != 1 else {}),
    }
    json.dump(model, open(a.out, 'w'), separators=(',', ':'))
    ptp = np.array([np.ptp(f['tpl'], 0) for f in feats]) * 1000
    rep = {'subjects': n, 'rejected': rej, 'k': k,
           'rate_bpm_p10_50_90': np.percentile([60 / f['cl'] for f in feats], [10, 50, 90]).round(0).tolist(),
           'ptp_uv_p50_per_lead': np.median(ptp, 0).round(0).tolist(),
           'ratio_p10_50_90': np.percentile([f['ratio'] for f in feats], [10, 50, 90]).round(2).tolist(),
           'explained_p50': round(float(np.median([f['explained'] for f in feats])), 3),
           'ii_negative_dominant': int(sum(abs(f['tpl'][:, 1].min()) > f['tpl'][:, 1].max() for f in feats))}
    print(json.dumps(rep))
    if a.report:
        json.dump(rep, open(a.report, 'w'), indent=1)


if __name__ == '__main__':
    main()
