"""Construye el modelo de forma del latido sinusal normal desde PTB-XL+ (CC BY 4.0).

Uso: python scripts/fidelity/build_shape_model.py --data ~/datos/ecg-referencia \
        --out src/engine/realistic/normal-shape-model.json [--components 64]
Clases (F3): --class CLBBB|IRBBB|LAFB|LVH|… --out src/engine/realistic/models/CODE.json

Entrena SOLO con los pliegues 1–8 de PTB-XL (los 9–10 son la reserva del banco).
Por paciente se usa un único ECG NORM = 100 en ritmo sinusal, sin marcas de ruido,
de electrodos ni de marcapasos, con puntos fiduciales 12SL completos y ordenados.

Cada latido mediano (por defecto calculado del registro crudo de PTB-XL 500 Hz y
alineado al latido 12SL de PTB-XL+ para heredar sus puntos fiduciales; con
--source 12sl, el mediano 12SL mismo) se referencia a la línea TP previa a la P y se divide en
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
# 'pre': los 80 ms previos a la P (inicio gradual de la activación auricular).
PRE_MS = 80
PHASES = [('pre', 24), ('p', 40), ('pq', 20), ('qrs', 56), ('st', 80), ('t', 48), ('post', 48)]
# Tras el fin de T: incluye la onda U y el retorno lento al TP (la cola que más
# delataba al sintético, sobre todo en V2–V3). Con --source raw el marco dura 1,4 s.
POST_MS = 260
CLASS_POST_MS = 200  # clases: QRS/QT más largos dejan menos TP antes de la P siguiente
FRAME_MS = 1396


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


def segment(med, fid, post_ms=POST_MS):
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
    bounds = [(pon - PRE_MS, pon), (pon, poff), (poff, qon), (qon, qoff), (qoff, apex), (apex, toff), (toff, toff + post_ms)]
    parts = []
    for (name, n), (a, b) in zip(PHASES, bounds):
        parts.append(interp(np.linspace(a, b, n)) - base)
    v = np.concatenate(parts)  # (sum n, 8)
    durs = np.array([poff - pon, qon - poff, qoff - qon, toff - qoff, (apex - qoff) / (toff - qoff)])
    return v, durs


def phase_slice(name, extra=()):
    """Filas del vector (puntos, 8) que ocupan una o más fases, por nombre."""
    offs, o = {}, 0
    for nme, n in PHASES:
        offs[nme] = (o, o + n)
        o += n
    names = [name, *extra]
    return slice(offs[names[0]][0], offs[names[-1]][1])


def qrs_axis(v):
    """Eje frontal por área neta del QRS (I y aVF = II - I/2) en grados."""
    q = v[phase_slice('qrs')]
    ai = q[:, 0].sum()
    af = (q[:, 1] - q[:, 0] / 2).sum()
    return np.degrees(np.arctan2(af, ai))


def magnitudes(v):
    p, q, t = v[phase_slice('p')], v[phase_slice('qrs')], v[phase_slice('st', ('t',))]
    # Amplitud espacial máxima (norma de las 8 derivaciones) de cada onda.
    return [np.linalg.norm(p, axis=1).max(), np.linalg.norm(q, axis=1).max(), np.linalg.norm(t, axis=1).max()]


# Clases diagnósticas (códigos SCP de PTB-XL) con sus rangos fisiológicos de
# duración (ms): P, PQ, QRS, ST-T. "conflicts" excluye registros con otro
# diagnóstico que cambiaría la morfología que el modelo debe aprender.
CONDUCTION = ['CLBBB', 'CRBBB', 'IRBBB', 'LAFB', 'LPFB', 'WPW', 'IVCD']
MI = ['IMI', 'ASMI', 'AMI', 'ALMI', 'ILMI', 'IPLMI', 'IPMI', 'LMI', 'PMI']
HYPER = ['LVH', 'RVH', 'SEHYP']
CLASS_SPEC = {
    'NORM': {'min': 100, 'p': (60, 140), 'pq': (10, 140), 'qrs': (60, 120), 'stt': (180, 420), 'conflicts': []},
    'CLBBB': {'min': 50, 'p': (60, 160), 'pq': (5, 200), 'qrs': (110, 200), 'stt': (180, 460), 'conflicts': ['CRBBB', 'WPW'] + MI},
    'CRBBB': {'min': 50, 'p': (60, 160), 'pq': (5, 200), 'qrs': (110, 200), 'stt': (180, 460), 'conflicts': ['CLBBB', 'WPW', 'LAFB', 'LPFB'] + MI},
    'IRBBB': {'min': 50, 'p': (60, 150), 'pq': (5, 180), 'qrs': (80, 130), 'stt': (180, 440), 'conflicts': ['CLBBB', 'CRBBB', 'WPW'] + MI + HYPER},
    'LAFB': {'min': 50, 'p': (60, 150), 'pq': (5, 180), 'qrs': (70, 130), 'stt': (180, 440), 'conflicts': ['CLBBB', 'CRBBB', 'WPW', 'LPFB'] + MI},
    'LVH': {'min': 50, 'p': (60, 160), 'pq': (5, 200), 'qrs': (70, 130), 'stt': (180, 460), 'conflicts': CONDUCTION + MI},
    'WPW': {'min': 50, 'p': (50, 160), 'pq': (0, 120), 'qrs': (90, 200), 'stt': (160, 460), 'conflicts': ['CLBBB', 'CRBBB'] + MI},
    'IMI': {'min': 50, 'p': (60, 160), 'pq': (5, 200), 'qrs': (70, 130), 'stt': (180, 460), 'conflicts': ['CLBBB', 'CRBBB', 'WPW', 'ASMI', 'AMI', 'ALMI', 'LMI']},
    'ASMI': {'min': 50, 'p': (60, 160), 'pq': (5, 200), 'qrs': (70, 130), 'stt': (180, 460), 'conflicts': ['CLBBB', 'CRBBB', 'WPW', 'IMI', 'ILMI', 'IPLMI', 'IPMI']},
}


def selects(row, scp, code):
    spec = CLASS_SPEC[code]
    if scp.get(code, 0) < spec['min'] or any(scp.get(k, 0) > 0 for k in spec['conflicts']):
        return False
    if code == 'NORM':
        return 'SR' in scp
    # Ritmo sinusal (incluye bradi/taqui sinusal) para que la P sea sinusal.
    return any(k in scp for k in ('SR', 'SBRAD', 'STACH', 'SARRH'))


def raw_aligned(root, rel, med12):
    """Mediana del registro crudo en el marco temporal del latido 12SL (600 muestras)."""
    from features import detect_beats, median_beat, _bp, INDEP as FI
    path = os.path.join(root, 'ptb-xl', rel)
    if not (os.path.exists(path + '.dat') and os.path.exists(path + '.hea')):
        return None
    fs, names, x = read(path)
    pk = detect_beats(x)
    med, used = median_beat(x, pk, pre=640, post=1100)
    if med is None or len(used) < 5:
        return None
    energy = lambda m: np.sqrt((np.gradient(_bp(m[:, FI], 5, 40), axis=0) ** 2).sum(1))
    e12, er = energy(med12), energy(med)
    # Pico de energía del QRS en ambos marcos y ajuste fino por correlación ±20 ms.
    c12 = int(np.argmax(e12[100:500])) + 100
    best, lag = -np.inf, 0
    for d in range(-10, 11):
        lo = 320 - c12 + d  # índice en `med` que corresponde a la muestra 0 del marco 12SL
        if lo < 0 or lo + 600 > len(med):
            continue
        c = float(np.corrcoef(e12, er[lo:lo + 600])[0, 1])
        if c > best:
            best, lag = c, lo
    if best < 0.8:
        return None
    return med[lag:lag + 700] if lag + 700 <= len(med) else None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--data', required=True)
    ap.add_argument('--out', required=True)
    ap.add_argument('--components', type=int, default=64)
    ap.add_argument('--report')
    ap.add_argument('--class', dest='code', default='NORM', choices=sorted(CLASS_SPEC),
                    help='diagnóstico SCP a modelar (NORM por defecto)')
    ap.add_argument('--source', choices=['12sl', 'raw'], default='raw',
                    help='raw: medianas de los registros crudos (por defecto); 12sl: medianas de PTB-XL+')
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
        # La deriva se tolera en las clases (el mediano la atenúa); el modelo normal,
        # con miles de casos, la excluye.
        flags = ['pacemaker', 'electrodes_problems', 'burst_noise', 'static_noise'] + (['baseline_drift'] if a.code == 'NORM' else [])
        clean = all(row[k] == '' for k in flags)
        if not (row['strat_fold'] in [str(i) for i in range(1, 9)] and clean and selects(row, scp, a.code)):
            continue
        if row['patient_id'] in seen or not row['age'] or float(row['age']) < 18:
            continue
        eid = int(row['ecg_id'])
        f = fid.get(eid)
        # La cola post-T no debe alcanzar la P siguiente (P_On + RR) ni salir del marco.
        frame_end = FRAME_MS if a.source == 'raw' else 1196
        post = POST_MS if a.code == 'NORM' else CLASS_POST_MS
        if not f or not (PRE_MS < f['P_On'] < f['P_Off'] < f['QRS_On'] < f['QRS_Off'] < f['T_Off'] and f['T_Off'] + post <= min(frame_end, f['P_On'] + f['RR'] - 10)):
            rejected['fiduciales'] += 1
            continue
        d = (f['P_Off'] - f['P_On'], f['QRS_On'] - f['P_Off'], f['QRS_Off'] - f['QRS_On'], f['T_Off'] - f['QRS_Off'])  # ms
        spec = CLASS_SPEC[a.code]
        if not all(lo <= v <= hi for v, (lo, hi) in zip(d, (spec['p'], spec['pq'], spec['qrs'], spec['stt']))) or not 500 <= f['RR'] <= 1500:
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
        if a.source == 'raw':
            # Mediana calculada del registro crudo (como mide el banco), alineada al
            # latido 12SL para heredar sus puntos fiduciales. El 12SL lleva una huella
            # de procesamiento propia que una red distingue (AUC 0,999).
            raw = raw_aligned(root, row['filename_hr'], med)
            if raw is None:
                rejected['archivo'] += 1
                continue
            med = raw
        v, dd = segment(med, f, post)
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

    # Clases pequeñas: no más modos que una décima parte de los pacientes.
    k = min(a.components, max(8, n // 10))
    # Casos atípicos (mediana mal alineada, latido contaminado): fuera antes del
    # ACP definitivo, para que el modelo no aprenda ni muestree formas imposibles.
    m0 = V.mean(0)
    _, S0, W0 = np.linalg.svd(V - m0, full_matrices=False)
    z0 = (V - m0) @ W0[:k].T / (S0[:k] / np.sqrt(n - 1))
    keep = np.abs(z0).max(1) <= 5
    V, D, RR = V[keep], D[keep], RR[keep]
    rejected['atipicos'] = int((~keep).sum())
    n = len(V)
    print(f'Tras quitar atípicos: {n}')
    mean = V.mean(0)
    U, S, Wt = np.linalg.svd(V - mean, full_matrices=False)
    var = S ** 2 / (n - 1)
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
    # La población real no es gaussiana en el espacio de modos (asimetría y colas):
    # un clasificador separa muestras gaussianas de pacientes reales (AUC 0,85) y no
    # separa las de una mezcla de 8 gaussianas. El motor muestrea de esa mezcla.
    from sklearn.mixture import GaussianMixture
    gm = GaussianMixture(min(8, max(1, n // 200)), covariance_type='full', reg_covar=1e-4, random_state=0).fit(J)
    chol = np.stack([np.linalg.cholesky(c) for c in gm.covariances_])

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
        'schema': 'ecg-lab-shape-model/2',
        'source': f'PTB-XL 1.0.3 + PTB-XL+ 1.0.1 (CC BY 4.0), latidos medianos {"de registros crudos alineados a 12SL" if a.source == "raw" else "12SL"}, pliegues 1-8, {a.code}',
        'diagnosis': a.code,
        'leads': INDEP,
        'phases': [{'name': nme, 'points': pts} for nme, pts in PHASES],
        'postMs': POST_MS if a.code == 'NORM' else CLASS_POST_MS,
        'preMs': PRE_MS,
        'subjects': n,
        'components': k,
        'explainedVariance': round(explained, 4),
        'mean': f32(mean),
        'basis': base64.b64encode(b16.tobytes()).decode(),
        'basisScale': f32(scale),  # float32: un redondeo a 6 decimales anulaba los modos finos
        # Gaussiana conjunta de [z (k), variables del caso]; el motor condiciona
        # sobre el subconjunto que el caso fija.
        'joint': {'names': [f'z{i}' for i in range(k)] + cond_names, 'mean': q(mu), 'cov': q(C)},
        # Solo el triángulo inferior de cada Cholesky (fila a fila): ~120 KB menos.
        'mixture': {'weights': q(gm.weights_), 'means': f32(gm.means_), 'cholesky': f32(np.concatenate([c[np.tril_indices(len(c))] for c in chol]))},
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
