import numpy as np, re
def read(path):
    """Minimal WFDB reader (formats 16 and 32, single .dat). Returns fs, leads, mV array (n, ch)."""
    lines=[l for l in open(path+'.hea').read().splitlines() if l and not l.startswith('#')]
    rec=lines[0].split(); nch=int(rec[1]); fs=float(rec[2]); n=int(rec[3])
    names=[];gains=[];bases=[];fmt=None
    for l in lines[1:1+nch]:
        p=l.split(); fmt=p[1]; m=re.match(r'([-\d.e]+)(?:\(([-\d]+)\))?(?:/(\w+))?',p[2])
        g=float(m.group(1)); b=int(m.group(2)) if m.group(2) else int(p[4]); names.append(p[-1]); gains.append(g); bases.append(b)
    dt={'16':'<i2','32':'<i4'}[fmt]
    d=np.fromfile(path+'.dat',dtype=dt)[:n*nch].reshape(n,nch).astype(np.float64)
    return fs,names,(d-np.array(bases))/np.array(gains)
