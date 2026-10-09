"""Diagnóstico a nivel de latido: ¿de dónde viene la diferencia morfológica?

Compara pares de conjuntos de latidos medianos (12 derivaciones, −320…+560 ms
alrededor del pico de energía del QRS) con una red 1D y validación por mitades:
  crudo       mediana calculada del registro PTB-XL 500 Hz (como en el banco)
  12sl        latido mediano 12SL de PTB-XL+ del mismo registro (fuente del modelo)
  recon       ese 12SL proyectado sobre los 64 modos del modelo (truncamiento)
  sintetico   mediana calculada de un ECG exportado del motor
Uso: python scripts/fidelity/beat_discriminator.py --data ~/datos/ecg-referencia \
        --synthetic DIR --pairs crudo:12sl,crudo:sintetico,12sl:recon
"""
import argparse, base64, json, os, sys
import numpy as np
import torch
from torch import nn
sys.path.insert(0, os.path.dirname(__file__))
from wfdb import read
from features import detect_beats, median_beat, ms
from nets import ResNet1d, device
from sklearn.metrics import roc_auc_score

L = ms(320) + ms(560)


def peak_window(beat):
    """Recorta −320…+560 ms alrededor del pico de energía del QRS de un latido."""
    from features import _bp, INDEP
    f = _bp(beat[:, INDEP], 5, 25)
    e = np.sqrt((np.gradient(f, axis=0) ** 2).sum(1))
    c = int(np.argmax(e[ms(150):len(beat) - ms(150)])) + ms(150)
    lo = c - ms(320)
    if lo < 0 or lo + L > len(beat):
        return None
    w = beat[lo:lo + L]
    return w - np.median(w[ms(200):ms(235)], 0)


def raw_median(x):
    med, _ = median_beat(x, detect_beats(x))
    return None if med is None else med - np.median(med[ms(200):ms(235)], 0)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--data', required=True)
    ap.add_argument('--synthetic', required=True)
    ap.add_argument('--pairs', default='crudo:12sl,crudo:sintetico,12sl:recon,recon:sintetico')
    ap.add_argument('--model', default='src/engine/realistic/normal-shape-model.json')
    a = ap.parse_args()
    root = os.path.expanduser(a.data)
    sets = {k: [] for k in ['crudo', '12sl', 'recon', 'sintetico']}
    M = json.load(open(a.model))
    mean = np.frombuffer(base64.b64decode(M['mean']), '<f4').astype(float)
    basis = np.frombuffer(base64.b64decode(M['basis']), '<i2').astype(float).reshape(M['components'], -1) * np.array(M['basisScale'])[:, None]
    sys.path.insert(0, os.path.dirname(__file__))
    from build_shape_model import segment, INDEP as MODEL_LEADS, PHASES
    import csv
    fid = {}
    r = csv.reader(open(os.path.join(root, 'ptb-xl-plus', 'features', '12sl_features.csv')))
    h = next(r)
    ix = {k: h.index(k + '_Global') for k in ['P_On', 'P_Off', 'QRS_On', 'QRS_Off', 'T_Off']}
    ie = h.index('ecg_id')
    for row in r:
        try:
            fid[int(float(row[ie]))] = {k: float(row[i]) for k, i in ix.items()}
        except ValueError:
            pass
    for rel in [l.strip() for l in open(os.path.join(root, 'ptb-xl', 'train_norm3000.txt')) if l.strip()][:2000]:
        eid = int(rel.split('/')[-1].split('_')[0])
        p = os.path.join(root, 'ptb-xl-plus', 'median_beats', '12sl', '%05d' % (eid // 1000 * 1000), '%05d_medians' % eid)
        if not os.path.exists(p + '.dat') or eid not in fid:
            continue
        _, _, x = read(os.path.join(root, 'ptb-xl', rel))
        cr = raw_median(x)
        _, _, m12 = read(p)
        m12 = m12 / 1000
        w12 = peak_window(m12)
        if cr is None or w12 is None:
            continue
        sets['crudo'].append(cr)
        sets['12sl'].append(w12)
        # Reconstrucción con los 64 modos, devuelta al tiempo original por fase.
        f = fid[eid]
        try:
            v, _ = segment(m12, f)
        except Exception:
            continue
        z = (v.reshape(-1) - mean) @ np.linalg.pinv(basis)
        rec = (mean + z @ basis).reshape(-1, 8)
        recon = m12.copy()
        t = np.arange(600) * 2.0
        bounds = [f['P_On'], f['P_Off'], f['QRS_On'], f['QRS_Off']]
        # Solo QRS y ST-T definen la diferencia de interés; P y post se interpolan igual.
        pts = np.cumsum([0] + [n for _, n in PHASES])
        apex = None
        times = np.concatenate([np.linspace(*seg, n) for seg, n in zip(
            [(f['P_On'], f['P_Off']), (f['P_Off'], f['QRS_On']), (f['QRS_On'], f['QRS_Off'])], [p[1] for p in PHASES[:3]])])
        sel = [0, 1, 6, 7, 8, 9, 10, 11]
        for j, lead in enumerate(sel):
            recon[:, lead] = np.interp(t, times, rec[:len(times), j], left=np.nan, right=np.nan)
        recon[:, 2] = recon[:, 1] - recon[:, 0]
        recon[:, 3] = -(recon[:, 0] + recon[:, 1]) / 2
        recon[:, 4] = recon[:, 0] - recon[:, 1] / 2
        recon[:, 5] = recon[:, 1] - recon[:, 0] / 2
        recon = np.where(np.isnan(recon), m12, recon)
        wr = peak_window(recon - np.median(recon[:20], 0) + np.median(m12[:20], 0))
        if wr is not None:
            sets['recon'].append(wr)
    idx = json.load(open(os.path.join(a.synthetic, 'index.json')))
    for e in idx[:2000]:
        x = np.fromfile(os.path.join(a.synthetic, e['file']), dtype='<f4').reshape(-1, 12).astype(np.float64)
        b = raw_median(x)
        if b is not None:
            sets['sintetico'].append(b)
    dev = device()
    out = {}
    for pair in a.pairs.split(','):
        A, B = pair.split(':')
        XA, XB = np.stack(sets[A]).transpose(0, 2, 1).astype(np.float32), np.stack(sets[B]).transpose(0, 2, 1).astype(np.float32)
        n = min(len(XA), len(XB))
        X = np.concatenate([XA[:n], XB[:n]])
        y = np.r_[np.zeros(n), np.ones(n)].astype(np.float32)
        rng = np.random.default_rng(0)
        perm = rng.permutation(len(X))
        tr, te = perm[:int(0.7 * len(X))], perm[int(0.7 * len(X)):]
        torch.manual_seed(0)
        net = ResNet1d(1, width=32).to(dev)
        opt = torch.optim.AdamW(net.parameters(), 1e-3, weight_decay=1e-4)
        lossf = nn.BCEWithLogitsLoss()
        for ep in range(10):
            net.train()
            for i in range(0, len(tr), 64):
                b = tr[i:i + 64]
                opt.zero_grad()
                lossf(net(torch.from_numpy(X[b]).to(dev)).ravel(), torch.from_numpy(y[b]).to(dev)).backward()
                opt.step()
        net.eval()
        with torch.no_grad():
            p = torch.sigmoid(net(torch.from_numpy(X[te]).to(dev))).cpu().numpy().ravel()
        out[pair] = {'n_por_clase': int(n), 'auc': round(float(roc_auc_score(y[te], p)), 4)}
        print(pair, out[pair], flush=True)


if __name__ == '__main__':
    main()
