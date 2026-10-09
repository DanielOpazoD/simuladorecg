"""Rasgos de realismo calculados de forma idéntica sobre ECG reales y sintéticos.

Entrada: matriz (n, 12) en mV a 500 Hz, orden I, II, III, aVR, aVL, aVF, V1–V6.
No usa anotaciones ni la "verdad" del generador: detecta latidos, construye el
latido mediano y mide en ventanas fijas respecto del pico de energía del QRS.
Los grupos (morfología, dinámica, ruido) permiten saber qué delata al sintético.
"""
import numpy as np
from scipy.signal import butter, filtfilt, find_peaks, welch

LEADS = ['I', 'II', 'III', 'aVR', 'aVL', 'aVF', 'V1', 'V2', 'V3', 'V4', 'V5', 'V6']
INDEP = [0, 1, 6, 7, 8, 9, 10, 11]
FS = 500


def ms(x):
    return int(round(x * FS / 1000))


def _bp(x, lo, hi, order=2):
    nyq = FS / 2
    if lo <= 0:
        b, a = butter(order, hi / nyq, 'low')
    elif hi >= nyq:
        b, a = butter(order, lo / nyq, 'high')
    else:
        b, a = butter(order, [lo / nyq, hi / nyq], 'band')
    return filtfilt(b, a, x, axis=0)


def detect_beats(x):
    """Picos de energía del QRS (derivada multicanal en 5–25 Hz)."""
    f = _bp(x[:, INDEP], 5, 25)
    e = np.sqrt((np.gradient(f, axis=0) ** 2).sum(1))
    e = np.convolve(e, np.ones(ms(40)) / ms(40), 'same')
    pk, _ = find_peaks(e, distance=ms(280), height=np.percentile(e, 99) * 0.35)
    return pk


def median_beat(x, pk, pre=320, post=560):
    a, b = ms(pre), ms(post)
    ok = pk[(pk >= a) & (pk < len(x) - b)]
    if len(ok) < 3:
        return None, ok
    beats = np.stack([x[p - a:p + b] for p in ok])
    # Alinear cada latido al mediano por correlación cruzada de ±10 ms.
    ref = np.median(beats, 0)
    aligned = []
    for bt, p in zip(beats, ok):
        best, lag = -np.inf, 0
        for d in range(-ms(10), ms(10) + 1):
            sl = slice(a - ms(60) + d, a + ms(60) + d)
            if sl.start < 0 or sl.stop > len(bt):
                continue
            c = float((bt[sl] * ref[a - ms(60):a + ms(60)]).sum())
            if c > best:
                best, lag = c, d
        aligned.append(x[p + lag - a:p + lag + b] if p + lag - a >= 0 and p + lag + b <= len(x) else bt)
    beats = np.stack(aligned)
    return np.median(beats, 0), ok


def features(x):
    """Devuelve un dict de rasgos escalares. x: (n, 12) mV."""
    out = {}
    x = np.asarray(x, dtype=np.float64)
    pk = detect_beats(x)
    if len(pk) < 4:
        return None
    rr = np.diff(pk) / FS * 1000
    out['dyn_hr'] = 60000 / np.median(rr)
    out['dyn_rr_cv'] = np.std(rr) / np.mean(rr)
    out['dyn_rmssd_rel'] = np.sqrt(np.mean(np.diff(rr) ** 2)) / np.mean(rr) if len(rr) > 2 else 0

    # Ruido: alta frecuencia en segmentos TP y deriva de línea basal.
    hp = _bp(x, 25, 249)
    tp = []
    for p, q in zip(pk[:-1], pk[1:]):
        lo, hi = p + ms(480), q - ms(300)
        if hi - lo > ms(60):
            tp.append(hp[lo:hi])
    for j, L in enumerate(LEADS):
        out[f'noise_hf_{L}'] = float(np.median([np.sqrt(np.mean(s[:, j] ** 2)) for s in tp])) * 1000 if tp else np.nan
    lowpass = _bp(x, 0, 0.7)
    for L in ['I', 'II', 'V2', 'V5']:
        j = LEADS.index(L)
        out[f'noise_wander_{L}'] = float(np.std(lowpass[:, j])) * 1000
    if tp:
        seg = np.concatenate(tp)
        c = np.corrcoef(seg[:, INDEP].T)
        iu = np.triu_indices(len(INDEP), 1)
        out['noise_xcorr_mean'] = float(np.nanmean(np.abs(c[iu])))
        # I y II comparten el electrodo RA: su ruido debe correlacionar.
        out['noise_corr_I_II'] = float(c[0, 1])
        out['noise_corr_V1_V2'] = float(c[2, 3])

    med, used = median_beat(x, pk)
    if med is None:
        return None
    a = ms(320)
    base = np.median(med[a - ms(120):a - ms(85)], 0)
    m = med - base
    w = lambda lo, hi: slice(a + ms(lo), a + ms(hi))

    # Morfología por derivación (ventanas relativas al pico de energía del QRS).
    for j, L in enumerate(LEADS):
        q = m[w(-70, 70), j]
        out[f'qrs_max_{L}'] = float(q.max())
        out[f'qrs_min_{L}'] = float(q.min())
        out[f'qrs_tmax_{L}'] = float(np.argmax(q)) * 2 - 70
        out[f'st80_{L}'] = float(m[a + ms(80), j])
        t = m[w(130, 460), j]
        k = int(np.argmax(np.abs(t)))
        out[f't_amp_{L}'] = float(t[k])
        out[f't_time_{L}'] = 130 + k * 2
        # Asimetría de T: pendiente ascendente/descendente alrededor del ápice.
        rise = np.abs(np.diff(t[:k + 1])).max() if k > 1 else 0
        fall = np.abs(np.diff(t[k:])).max() if k < len(t) - 2 else 0
        out[f't_asym_{L}'] = float(np.log((fall + 1e-6) / (rise + 1e-6)))
        p = m[w(-300, -90), j]
        out[f'p_amp_{L}'] = float(p[np.argmax(np.abs(p))])
        d = np.gradient(m[w(-70, 70), j]) * FS
        out[f'qrs_slope_{L}'] = float(np.abs(d).max())
    # Progresión precordial: R/(R+|S|).
    for L in ['V1', 'V2', 'V3', 'V4', 'V5', 'V6']:
        r, s = out[f'qrs_max_{L}'], -out[f'qrs_min_{L}']
        out[f'rs_ratio_{L}'] = r / (r + s + 1e-9)
    # Ancho del QRS por envolvente espacial y QT por retorno de la envolvente de T.
    env = np.sqrt((np.gradient(m[:, INDEP], axis=0) ** 2).sum(1)) * FS
    pkv = env[w(-70, 70)].max()
    on = a - ms(70) + int(np.argmax(env[w(-70, 70)] > 0.08 * pkv))
    seg = env[a:a + ms(140)]
    off = a + int(np.where(seg > 0.08 * pkv)[0].max()) if (seg > 0.08 * pkv).any() else a + ms(50)
    out['g_qrs_ms'] = (off - on) * 1000 / FS
    tm = np.sqrt((m[a + ms(120):a + ms(540), :][:, INDEP] ** 2).sum(1))
    tk = int(np.argmax(tm))
    tail = np.where(tm[tk:] < 0.15 * tm[tk])[0]
    out['g_qt_ms'] = (a + ms(120) + tk + (tail[0] if len(tail) else len(tm) - tk) - on) * 1000 / FS
    # Eje frontal por área neta del QRS (I, aVF).
    ai, af = m[on:off + 1, 0].sum(), m[on:off + 1, 5].sum()
    ang = np.degrees(np.arctan2(af, ai))
    out['g_axis_cos'], out['g_axis_sin'] = float(np.cos(np.radians(ang))), float(np.sin(np.radians(ang)))
    # Contenido no dipolar: energía del latido fuera de los 3 primeros modos (8 derivaciones).
    sv = np.linalg.svd(m[on - ms(150):a + ms(450), INDEP], compute_uv=False)
    out['g_nondipolar'] = float((sv[3:] ** 2).sum() / (sv ** 2).sum())
    # Energía de alta frecuencia dentro del QRS (40–150 Hz) / total.
    f, pw = welch(m[on:off + 1, INDEP], fs=FS, nperseg=min(64, off - on + 1), axis=0)
    band = (f >= 40)
    out['g_qrs_hf_frac'] = float(pw[band].sum() / (pw.sum() + 1e-12))
    # Similitud de forma de T entre derivaciones (T de un solo vector => ≈1).
    tw = m[a + ms(130):a + ms(460)][:, INDEP]
    tn = tw / (np.linalg.norm(tw, axis=0) + 1e-9)
    cc = np.abs(tn.T @ tn)
    out['g_t_shape_coherence'] = float(cc[np.triu_indices(8, 1)].mean())

    # Variabilidad latido a latido de la amplitud del QRS.
    for L in ['I', 'II', 'V2', 'V5']:
        j = LEADS.index(L)
        amps = []
        for p in used:
            seg = x[p - ms(70):p + ms(70), j]
            amps.append(seg.max() - seg.min())
        amps = np.array(amps)
        out[f'dyn_qrs_cv_{L}'] = float(np.std(amps) / (np.mean(amps) + 1e-9))
    return out


def group(name):
    if name.startswith('noise_'):
        return 'ruido'
    if name.startswith('dyn_'):
        return 'dinamica'
    return 'morfologia'
