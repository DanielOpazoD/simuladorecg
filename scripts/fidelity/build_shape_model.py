"""Construye el modelo de forma del latido sinusal normal desde PTB-XL+ (CC BY 4.0).

Uso: python scripts/fidelity/build_shape_model.py --data ~/datos/ecg-referencia \
        --out src/engine/realistic/normal-shape-model.json [--components 28]

Entrena SOLO con los pliegues 1–8 de PTB-XL (los 9–10 son la reserva del banco).
Por paciente se usa un único ECG NORM = 100 en ritmo sinusal, sin marcas de ruido,
de electrodos ni de marcapasos, con puntos fiduciales 12SL completos y ordenados.

Cada latido mediano 12SL (µV → mV) se referencia a la línea TP previa a la P y se divide en
fases por sus puntos fiduciales: P, segmento PQ, QRS, ST-T y cola post-T. Cada fase
se remuestrea a un número fijo de puntos en las 8 derivaciones independientes
(I, II, V1–V6). Sobre ese vector se calcula un ACP: media + modos de variación.

Además se ajusta una gaussiana conjunta entre los coeficientes y variables
controlables (duraciones, eje frontal, amplitudes) para muestrear pacientes
condicionados a lo que pide el caso. El JSON resultante contiene solo esos
coeficientes; ningún trazado individual.
"""
import argparse, ast, base64, csv, json, os, sys
import numpy as np
sys.path.insert(0, os.path.dirname(__file__))
from wfdb import read

INDEP = ['I', 'II', 'V1', 'V2', 'V3', 'V4', 'V5', 'V6']
# Fases y puntos por fase (a 500 Hz las duraciones típicas son 50/30/45/170/80 muestras).
# El ST-T se divide en el ápice espacial de T (registro por puntos de referencia):
# sin esa alineación, el promedio de ondas T con picos desfasados queda asimétrico.
PHASES = [('p', 40), ('pq', 20), ('qrs', 56), ('st', 80), ('t', 48), ('post', 32)]
POST_MS = 160


def resample(seg, n):
    """Remuestreo lineal de (m, ch) a (n, ch) incluyendo ambos extremos."""
    m = len(seg)
    src = np.linspace(0, m - 1, n)
    i0 = np.floor(src).astype(int)
    i1 = np.minimum(i0 + 1, m - 1)
    f = (src - i0)[:, None]
    return seg[i0] * (1 - f) + seg[i1] * f


def frac_index(x_ms):
    return x_ms / 2.0  # 500 Hz


def segment(med, fid):
    """med: (600, 12) mV. fid: dict ms. Devuelve vector de fases y duraciones."""
    cols = [i for i, n in enumerate(['I', 'II', 'III', 'aVR', 'aVL', 'aVF', 'V1', 'V2', 'V3', 'V4', 'V5', 'V6']) if n in INDEP]
    x = med[:, cols]
    t = np.arange(len(x)) * 2.0
    interp = lambda ms: np.array([np.interp(ms, t, x[:, j]) for j in range(x.shape[1])]).T
    pon, poff, qon, qoff, toff = (fid[k] for k in ['P_On', 'P_Off', 'QRS_On', 'QRS_Off', 'T_Off'])
    # Línea isoeléctrica = TP justo antes de la P. El segmento PR queda por debajo
    # por la repolarización auricular (Ta), que el motor prolonga dentro del QRS.
    base = interp(np.linspace(pon - 20, pon - 4, 9)).mean(0)
    # Ápice de T: máximo de la magnitud espacial entre el 30 % y el 92 % del ST-T.
    tt = np.linspace(qoff + 0.3 * (toff - qoff), qoff + 0.92 * (toff - qoff), 200)
    apex = tt[int(np.argmax(np.linalg.norm(interp(tt) - base, axis=1)))]
    bounds = [(pon, poff), (poff, qon), (qon, qoff), (qoff, apex), (apex, toff), (toff, toff + POST_MS)]
    parts = []
    for (name, n), (a, b) in zip(PHASES, bounds):
        parts.append(interp(np.linspace(a, b, n)) - base)
    v = np.concatenate(parts)  # (sum n, 8)
    durs = np.array([poff - pon, qon - poff, qoff - qon, toff - qoff, (apex - qoff) / (toff - qoff)])
    return v, durs


def qrs_axis(v):
    """Eje frontal por área neta del QRS (I y aVF = II - I/2) en grados."""
    o = sum(n for _, n in PHASES[:2])
    q = v[o:o + PHASES[2][1]]
    ai = q[:, 0].sum()
    af = (q[:, 1] - q[:, 0] / 2).sum()
    return np.degrees(np.arctan2(af, ai))


def magnitudes(v):
    o_p = 0
    o_q = PHASES[0][1] + PHASES[1][1]
    o_t = o_q + PHASES[2][1]
    p = v[o_p:o_p + PHASES[0][1]]
    q = v[o_q:o_q + PHASES[2][1]]
    t = v[o_t:o_t + PHASES[3][1] + PHASES[4][1]]
    # Amplitud espacial máxima (norma de las 8 derivaciones) de cada onda.
    return [np.linalg.norm(p, axis=1).max(), np.linalg.norm(q, axis=1).max(), np.linalg.norm(t, axis=1).max()]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--data', required=True)
    ap.add_argument('--out', required=True)
    ap.add_argument('--components', type=int, default=64)
    ap.add_argument('--report')
    a = ap.parse_args()
    root = os.path.expanduser(a.data)

    rows = list(csv.DictReader(open(os.path.join(root, 'ptb-xl', 'ptbxl_database.csv'))))
    fid = {}
    with open(os.path.join(root, 'ptb-xl-plus', 'features', '12sl_features.csv')) as f:
        r = csv.reader(f)
        h = next(r)
        ix = {k: h.index(k + '_Global') for k in ['P_On', 'P_Off', 'QRS_On', 'QRS_Off', 'T_Off']}
        ix['RR'] = h.index('RR_Mean_Global')
        ie = h.index('ecg_id')
        for row in r:
            try:
                fid[int(float(row[ie]))] = {k: float(row[i]) for k, i in ix.items()}
            except ValueError:
                pass

    seen, vecs, durs, rrs, used = set(), [], [], [], 0
    rejected = {'fiduciales': 0, 'archivo': 0, 'rango': 0}
    for row in rows:
        scp = ast.literal_eval(row['scp_codes'])
        clean = all(row[k] == '' for k in ['pacemaker', 'electrodes_problems', 'burst_noise', 'static_noise', 'baseline_drift'])
        if not (row['strat_fold'] in [str(i) for i in range(1, 9)] and scp.get('NORM', 0) >= 100 and 'SR' in scp and clean):
            continue
        if row['patient_id'] in seen or not row['age'] or float(row['age']) < 18:
            continue
        eid = int(row['ecg_id'])
        f = fid.get(eid)
        if not f or not (0 < f['P_On'] < f['P_Off'] < f['QRS_On'] < f['QRS_Off'] < f['T_Off'] and f['T_Off'] + POST_MS <= 1196):
            rejected['fiduciales'] += 1
            continue
        d = (f['P_Off'] - f['P_On'], f['QRS_On'] - f['P_Off'], f['QRS_Off'] - f['QRS_On'], f['T_Off'] - f['QRS_Off'])  # ms
        if not (60 <= d[0] <= 140 and 10 <= d[1] <= 140 and 60 <= d[2] <= 120 and 180 <= d[3] <= 420 and 500 <= f['RR'] <= 1500):
            rejected['rango'] += 1
            continue
        path = os.path.join(root, 'ptb-xl-plus', 'median_beats', '12sl', '%05d' % (eid // 1000 * 1000), '%05d_medians' % eid)
        try:
            fs, names, med = read(path)
        except FileNotFoundError:
            rejected['archivo'] += 1
            continue
        assert fs == 500 and med.shape == (600, 12)
        med = med / 1000.0  # µV → mV (ver docs/fidelidad.md)
        v, dd = segment(med, f)
        if not np.isfinite(v).all() or np.abs(v).max() > 6:
            rejected['rango'] += 1
            continue
        seen.add(row['patient_id'])
        vecs.append(v.reshape(-1))
        durs.append(dd)
        rrs.append(f['RR'])
    V = np.array(vecs)
    D = np.array(durs)
    RR = np.array(rrs)
    n = len(V)
    print(f'Latidos usados: {n}; rechazos: {rejected}')

    mean = V.mean(0)
    U, S, Wt = np.linalg.svd(V - mean, full_matrices=False)
    var = S ** 2 / (n - 1)
    k = a.components
    explained = float(var[:k].sum() / var.sum())
    comps = Wt[:k]                      # (k, dim)
    scores = (V - mean) @ comps.T       # (n, k)
    sd = np.sqrt(var[:k])
    z = scores / sd                     # coeficientes estandarizados

    # Variables controlables del caso.
    ax = np.array([qrs_axis(v.reshape(-1, 8)) for v in V])
    mags = np.array([magnitudes(v.reshape(-1, 8)) for v in V])
    frac = D[:, 4]
    cond = np.column_stack([np.log(D[:, :4]), np.log(frac / (1 - frac)), np.log(RR), np.cos(np.radians(ax)), np.sin(np.radians(ax)), np.log(mags)])
    cond_names = ['log_p', 'log_pq', 'log_qrs', 'log_stt', 'logit_t_apex', 'log_rr', 'axis_cos', 'axis_sin', 'log_p_mag', 'log_qrs_mag', 'log_t_mag']
    J = np.column_stack([z, cond])
    mu = J.mean(0)
    C = np.cov(J.T)

    # Error de reconstrucción con k modos (mV, RMS por muestra).
    rec = mean + scores @ comps
    rms = np.sqrt(((rec - V) ** 2).mean(1))

    # Modos escalados (x = mean + basis^T z) en int16 con escala por modo.
    basis = comps * sd[:, None]
    scale = np.abs(basis).max(1) / 32767
    b16 = np.round(basis / scale[:, None]).astype('<i2')
    f32 = lambda x: base64.b64encode(np.asarray(x, dtype='<f4').tobytes()).decode()
    q = lambda x: [round(float(v), 6) for v in np.ravel(x)]
    model = {
        'schema': 'ecg-lab-shape-model/1',
        'source': 'PTB-XL 1.0.3 + PTB-XL+ 1.0.1 (CC BY 4.0), latidos medianos 12SL, pliegues 1-8, NORM=100',
        'leads': INDEP,
        'phases': [{'name': nme, 'points': pts} for nme, pts in PHASES],
        'postMs': POST_MS,
        'subjects': n,
        'components': k,
        'explainedVariance': round(explained, 4),
        'mean': f32(mean),
        'basis': base64.b64encode(b16.tobytes()).decode(),
        'basisScale': q(scale),
        # Gaussiana conjunta de [z (k), variables del caso]; el motor condiciona
        # sobre el subconjunto que el caso fija.
        'joint': {'names': [f'z{i}' for i in range(k)] + cond_names, 'mean': q(mu), 'cov': q(C)},
        'population': {
            'durationsMsP50': q(np.median(D, 0)),
            'axisP50': round(float(np.median(ax)), 1),
            'magnitudesP50': q(np.median(mags, 0)),
        },
    }
    os.makedirs(os.path.dirname(os.path.abspath(a.out)), exist_ok=True)
    json.dump(model, open(a.out, 'w'), separators=(',', ':'))
    rep = {'subjects': n, 'rejected': rejected, 'explained': explained,
           'explained_curve': [round(float(var[:i].sum() / var.sum()), 4) for i in (4, 8, 12, 16, 20, 24, 28, 32, 40, 48)],
           'recon_rms_mV_p50': float(np.median(rms)), 'recon_rms_mV_p95': float(np.percentile(rms, 95)),
           'durations_p50': np.median(D, 0).tolist(), 'axis_p50': float(np.median(ax)),
           'bytes': os.path.getsize(a.out)}
    print(json.dumps(rep, indent=1))
    if a.report:
        json.dump(rep, open(a.report, 'w'), indent=1)


if __name__ == '__main__':
    main()
