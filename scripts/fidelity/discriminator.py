"""Discriminador profundo real/sintético sobre la señal cruda (10 s, 12 derivaciones).

Uso:
  python scripts/fidelity/discriminator.py --data ~/datos/ecg-referencia \
      --train-synthetic DIR --test-synthetic DIR --out informe.json

- Entrena con reales de los pliegues 1–8 (ptb-xl/train_norm3000.txt) frente a
  sintéticos exportados con export-synthetic.mjs (semillas distintas a las de prueba).
- Evalúa con la reserva (pliegues 9–10, holdout_norm600.txt) frente a otro lote
  sintético. AUC 0,5 = la red no los distingue.
Es una cota más exigente que el banco de rasgos: ve la forma de onda completa.
"""
import argparse, json, os, sys
import numpy as np
import torch
from torch import nn
sys.path.insert(0, os.path.dirname(__file__))
from wfdb import read
from nets import ResNet1d, device
from sklearn.metrics import roc_auc_score
from scipy.signal import butter, filtfilt
from features import detect_beats, median_beat


def load_real(root, lst):
    xs = []
    for rel in [l.strip() for l in open(lst) if l.strip()]:
        fs, names, x = read(os.path.join(root, 'ptb-xl', rel))
        xs.append(x[:5000].T.astype(np.float32))
    return np.stack(xs)


def load_syn(d):
    idx = json.load(open(os.path.join(d, 'index.json')))
    return np.stack([np.fromfile(os.path.join(d, e['file']), dtype='<f4').reshape(-1, 12)[:5000].T for e in idx])


def transform(X, how):
    """Ablaciones para saber qué delata al sintético.
    band: 0,5–40 Hz (sin ruido fino ni deriva); median: latido mediano repetido
    cada 1 s (solo morfología, sin ruido ni dinámica)."""
    if how == 'none':
        return X
    if how == 'band':
        b, a = butter(2, [0.5 / 250, 40 / 250], 'band')
        return filtfilt(b, a, X, axis=-1).astype(np.float32)
    out = []
    for x in X:
        med, _ = median_beat(x.T.astype(np.float64), detect_beats(x.T.astype(np.float64)))
        if med is None:
            med = np.zeros((440, 12))
        beat = med - np.median(med[:20], 0)
        tile = np.zeros((5000, 12))
        for k in range(0, 5000 - len(beat), 500):
            tile[k:k + len(beat)] += beat
        out.append(tile.T.astype(np.float32))
    return np.stack(out)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--data', required=True)
    ap.add_argument('--train-synthetic', required=True)
    ap.add_argument('--test-synthetic', required=True)
    ap.add_argument('--out', required=True)
    ap.add_argument('--epochs', type=int, default=12)
    ap.add_argument('--seed', type=int, default=0)
    ap.add_argument('--transform', choices=['none', 'band', 'median'], default='none')
    ap.add_argument('--control', action='store_true', help='real contra real (debe dar ≈0,5)')
    ap.add_argument('--extra-real', help='lista de registros WFDB reales de otra base (ruta sin extensión) para calibrar la firma de equipo')
    ap.add_argument('--saliency', help='con --transform median: guarda |gradiente| medio por derivación y tiempo')
    a = ap.parse_args()
    root = os.path.expanduser(a.data)
    torch.manual_seed(a.seed)
    np.random.seed(a.seed)

    Xr, Xs = load_real(root, os.path.join(root, 'ptb-xl', 'train_norm3000.txt')), load_syn(a.train_synthetic)
    Tr, Ts = load_real(root, os.path.join(root, 'ptb-xl', 'holdout_norm600.txt')), load_syn(a.test_synthetic)
    if a.control:
        # Mitades aleatorias de los reales etiquetadas como si fueran clases distintas.
        perm, permT = np.random.default_rng(1).permutation(len(Xr)), np.random.default_rng(2).permutation(len(Tr))
        Xr, Xs = Xr[perm[:len(Xr) // 2]], Xr[perm[len(Xr) // 2:]]
        Tr, Ts = Tr[permT[:len(Tr) // 2]], Tr[permT[len(Tr) // 2:]]
    Xr, Xs, Tr, Ts = (transform(Z, a.transform) for Z in (Xr, Xs, Tr, Ts))
    X = np.concatenate([Xr, Xs])
    y = np.r_[np.zeros(len(Xr)), np.ones(len(Xs))].astype(np.float32)
    XT = np.concatenate([Tr, Ts])
    yT = np.r_[np.zeros(len(Tr)), np.ones(len(Ts))]

    dev = device()
    net = ResNet1d(1).to(dev)
    opt = torch.optim.AdamW(net.parameters(), 1e-3, weight_decay=1e-4)
    loss = nn.BCEWithLogitsLoss()
    rng = np.random.default_rng(a.seed)

    def predict(Z):
        net.eval()
        out = []
        with torch.no_grad():
            for i in range(0, len(Z), 128):
                out.append(torch.sigmoid(net(torch.from_numpy(Z[i:i + 128]).to(dev))).cpu().numpy().ravel())
        return np.concatenate(out)

    history = []
    for ep in range(a.epochs):
        net.train()
        order = rng.permutation(len(X))
        for i in range(0, len(order), 64):
            b = order[i:i + 64]
            # Recorte aleatorio de 8 s: la red no puede usar la posición absoluta de los latidos.
            off = rng.integers(0, 1001)
            xb = torch.from_numpy(X[b][:, :, off:off + 4000]).to(dev)
            opt.zero_grad()
            l = loss(net(xb).ravel(), torch.from_numpy(y[b]).to(dev))
            l.backward()
            opt.step()
        p = predict(XT[:, :, 500:4500])
        history.append(round(float(roc_auc_score(yT, p)), 4))
        print(f'época {ep + 1}: AUC prueba {history[-1]}', flush=True)
    p = predict(XT[:, :, 500:4500])
    rep = {'transformacion': a.transform, 'control_real_real': a.control, 'n_train_real': len(Xr), 'n_train_sint': len(Xs), 'n_test_real': len(Tr), 'n_test_sint': len(Ts),
           'auc_prueba': round(float(roc_auc_score(yT, p)), 4), 'auc_por_epoca': history,
           'sint_detectados_como_real_pct': round(float((p[len(Tr):] < 0.5).mean() * 100), 1),
           'reales_detectados_como_sint_pct': round(float((p[:len(Tr)] >= 0.5).mean() * 100), 1)}
    if a.extra_real:
        # ¿Llama "sintético" a ECG reales de otro equipo? Mide cuánto del AUC es firma
        # de la base de entrenamiento (PTB-XL) y no síntesis.
        xs = []
        for path in [l.strip() for l in open(a.extra_real) if l.strip()]:
            fs, names, x = read(path)
            if fs == 500 and x.shape[0] >= 5000 and x.shape[1] == 12:
                xs.append(x[:5000].T.astype(np.float32))
        XE = transform(np.stack(xs), a.transform)
        pe = predict(XE[:, :, 500:4500])
        rep['otra_base_real_n'] = len(XE)
        rep['otra_base_real_llamados_sinteticos_pct'] = round(float((pe >= 0.5).mean() * 100), 1)
        rep['auc_otra_base_real_vs_sinteticos'] = round(float(roc_auc_score(np.r_[np.zeros(len(pe)), np.ones(len(Ts))], np.r_[pe, p[len(Tr):]])), 4)
        rep['auc_ptbxl_vs_otra_base_real'] = round(float(roc_auc_score(np.r_[np.zeros(len(Tr)), np.ones(len(pe))], np.r_[p[:len(Tr)], pe])), 4)
    if a.saliency and a.transform == 'median':
        # Dónde mira la red: |∂logit/∂x| promediado sobre los sintéticos de prueba,
        # plegado sobre el período de 1 s del latido repetido (pico del QRS en 320 ms).
        net.eval()
        g = np.zeros((12, 500))
        for i in range(len(Tr), len(XT), 64):
            xb = torch.from_numpy(XT[i:i + 64, :, 500:4500]).to(dev).requires_grad_(True)
            net(xb).sum().backward()
            gr = xb.grad.abs().cpu().numpy().sum(0)  # (12, 4000)
            for k in range(0, 4000, 500):
                g += gr[:, k:k + 500]
        np.save(a.saliency, g / g.sum())
        LEADS = ['I', 'II', 'III', 'aVR', 'aVL', 'aVF', 'V1', 'V2', 'V3', 'V4', 'V5', 'V6']
        per_lead = g.sum(1) / g.sum()
        bins = g.sum(0).reshape(25, 20).sum(1) / g.sum()
        rep['saliencia_por_derivacion'] = {L: round(float(v), 3) for L, v in zip(LEADS, per_lead)}
        rep['saliencia_por_40ms_desde_menos320'] = [round(float(v), 3) for v in bins]
    json.dump(rep, open(a.out, 'w'), indent=1)
    print(json.dumps(rep, ensure_ascii=False))


if __name__ == '__main__':
    main()
