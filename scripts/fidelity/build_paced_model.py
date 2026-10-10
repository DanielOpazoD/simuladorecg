"""Modelo de forma del latido con estimulación ventricular (marcapasos), aprendido
de PTB-XL (CC BY 4.0). Solo pliegues 1–8 (9–10: reserva del banco).

Uso: python scripts/fidelity/build_paced_model.py --data ~/datos/ecg-referencia \
        --out src/engine/realistic/models/VPACE.json [--report informe.json]

Por registro con PACE (500 Hz):
  1. Latido dominante del registro (≥ 60 % de los latidos con correlación ≥ 0,85
     con la mediana): en un registro estimulado, el complejo estimulado.
  2. Espiga: el máximo de la derivada espacial antes del QRS, si es estrecho
     (≤ 10 ms por encima de la mitad de su pico) y al menos el doble de abrupto que
     el QRS (140 de 196 registros). Se retira de la plantilla por interpolación y
     se guardan su amplitud por derivación y su forma media normalizada: el
     complejo aprendido no la lleva (el muestreo por modos la borraba: 0,005 mV en
     II) y el motor la dibuja una sola vez con ese tamaño y esa forma filtrada.
  3. Fiduciales y fases como la extrasístole (sin P propia). Solo complejos con
     QRS ≥ 120 ms (estimulación ventricular; la auricular conserva un QRS normal).
La población se ajusta con la misma función que las clases. Sin trazados ni
registros individuales.
"""
import argparse, ast, csv, json, os, sys
import numpy as np
from scipy.signal import butter, filtfilt
sys.path.insert(0, os.path.dirname(__file__))
from wfdb import read
from features import detect_beats, INDEP, ms, FS
from build_shape_model import CLASS_POST_MS, fit_and_write
from build_pvc_model import windows, qrs_corr, align, fiducials, segment_pvc, PRE


SPIKE_HALF = 10  # ±ms de la forma de la espiga


def remove_spike(t8):
    """(plantilla sin espiga, amplitud por derivación, forma normalizada) o (t8, None, None)."""
    a = ms(PRE)
    d = np.sqrt((np.diff(t8, axis=0) ** 2).sum(1))
    lo, hi = a - ms(200), a + ms(40)
    s = lo + int(np.argmax(d[lo:hi]))
    width = int((d[max(0, s - ms(10)):s + ms(10)] > 0.5 * d[s]).sum())
    qrs_slope = np.median(np.sort(d[a - ms(60):a + ms(100)])[-ms(20):])
    if width > ms(10) or d[s] < 2 * qrs_slope:
        return t8, None, None
    i0, i1 = max(0, s - ms(SPIKE_HALF)), min(len(t8) - 1, s + ms(SPIKE_HALF))
    out = t8.copy()
    for j in range(t8.shape[1]):
        out[i0:i1 + 1, j] = np.linspace(t8[i0, j], t8[i1, j], i1 - i0 + 1)
    spike = t8[i0:i1 + 1] - out[i0:i1 + 1]          # (tiempo, 8)
    k = int(np.argmax(np.abs(spike).sum(1)))
    amp = spike[k]                                   # amplitud firmada en el pico
    lead = int(np.argmax(np.abs(amp)))
    shape = spike[:, lead] / amp[lead]               # forma normalizada (pico = 1)
    return out, amp, shape


def record_paced(x):
    b, a = butter(2, [0.5 / (FS / 2), 100 / (FS / 2)], 'band')  # 100 Hz: la espiga sigue siendo estrecha
    x = filtfilt(b, a, x, axis=0)
    pk = detect_beats(x)
    if len(pk) < 5:
        return None
    ok, W = windows(x[:, INDEP], pk)
    if W is None or len(ok) < 5:
        return None
    ref = np.median(W, 0)
    corr = np.array([qrs_corr(w, ref) for w in W])
    dom = corr >= 0.85
    if dom.mean() < 0.6:
        return None
    tpl = align(W[dom])
    tpl, spike, shape = remove_spike(tpl)
    # Sin espiga, la plantilla pasa a la banda de las demás (40 Hz).
    bl, al = butter(4, 40 / (FS / 2))
    tpl = filtfilt(bl, al, tpl, axis=0)
    fid = fiducials(tpl)
    if fid is None:
        return None
    on, off, apex, end, _ = fid
    qrs_ms, stt_ms = (off - on) * 1000 / FS, (end - off) * 1000 / FS
    if not (120 <= qrs_ms <= 240 and 160 <= stt_ms <= 520):
        return None
    rr = np.diff(pk) / FS
    return {'v': segment_pvc(tpl, fid), 'qrs': qrs_ms, 'stt': stt_ms, 'frac': (apex - off) / max(1, end - off),
            'rr': float(np.median(rr)), 'spike': spike, 'shape': shape}


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
    vecs, durs, rrs, spikes, shapes, seen = [], [], [], [], [], set()
    rej = {'archivo': 0, 'sin_estimulacion_ventricular': 0}
    for row in rows:
        scp = ast.literal_eval(row['scp_codes'])
        if 'PACE' not in scp or row['strat_fold'] not in [str(i) for i in range(1, 9)]:
            continue
        if row['patient_id'] in seen or not row['age'] or float(row['age']) < 18:
            continue
        try:
            _, _, x = read(os.path.join(root, 'ptb-xl', row['filename_hr']))
        except (ValueError, OSError):
            rej['archivo'] += 1
            continue
        f = record_paced(x)
        if f is None:
            rej['sin_estimulacion_ventricular'] += 1
            continue
        seen.add(row['patient_id'])
        vecs.append(f['v'])
        durs.append([100.0, 50.0, f['qrs'], f['stt'], min(0.9, max(0.1, f['frac']))])
        rrs.append(f['rr'])
        if f['spike'] is not None:
            spikes.append(f['spike'])
            shapes.append(f['shape'])
    V, D, RR = np.array(vecs), np.array(durs), np.array(rrs)
    print(f'Latidos estimulados: {len(V)}; rechazos: {rej}; espigas: {len(spikes)}', file=sys.stderr)
    model, rep = fit_and_write(V, D, RR, rej, 'VPACE', a.components, a.sample_scale, CLASS_POST_MS,
                               'PTB-XL 1.0.3 (CC BY 4.0), latido estimulado en el ventrículo (mediana por registro), pliegues 1-8, PACE',
                               a.out, None)
    Sp = np.array(spikes)
    norms = np.linalg.norm(Sp, axis=1)
    # Dirección mediana (vector unitario) y tamaño log-normal; forma media a 500 Hz.
    unit = np.median(Sp / norms[:, None], 0)
    model['spike'] = {'unit': (unit / np.linalg.norm(unit)).round(4).tolist(),
                      'logNormMean': round(float(np.log(norms).mean()), 4), 'logNormSd': round(float(np.log(norms).std(ddof=1)), 4),
                      'shape500Hz': np.mean(shapes, 0).round(4).tolist(), 'n': len(Sp)}
    json.dump(model, open(a.out, 'w'), separators=(',', ':'))
    rep['spike'] = {k: v for k, v in model['spike'].items() if k != 'shape500Hz'}
    print(json.dumps({k: v for k, v in rep.items() if k != 'explained_curve'}), file=sys.stderr)
    if a.report:
        json.dump(rep, open(a.report, 'w'), indent=1)


if __name__ == '__main__':
    main()
