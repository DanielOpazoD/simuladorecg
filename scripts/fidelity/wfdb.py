import numpy as np, re
def read(path):
    """Minimal WFDB reader (formats 16, 32 and 212, with an optional byte offset as in
    16+512; single .dat). Returns fs, leads, mV array (n, ch)."""
    lines=[l for l in open(path+'.hea').read().splitlines() if l and not l.startswith('#')]
    rec=lines[0].split(); nch=int(rec[1]); fs=float(rec[2]); n=int(rec[3])
    names=[];gains=[];bases=[];fmt=None
    for l in lines[1:1+nch]:
        p=l.split(); fmt=p[1]; m=re.match(r'([-\d.e]+)(?:\(([-\d]+)\))?(?:/(\w+))?',p[2])
        g=float(m.group(1)); b=int(m.group(2)) if m.group(2) else int(p[4]); names.append(p[-1]); gains.append(g); bases.append(b)
    fmt,_,skip=fmt.partition('+'); skip=int(skip or 0)
    if fmt=='212':
        # Two 12-bit two's-complement samples packed in three bytes.
        raw=np.fromfile(path+'.dat',dtype=np.uint8,offset=skip)
        raw=raw[:len(raw)//3*3].reshape(-1,3).astype(np.int32)
        s0=raw[:,0]|((raw[:,1]&0x0F)<<8); s1=raw[:,2]|((raw[:,1]&0xF0)<<4)
        v=np.empty(len(raw)*2,dtype=np.int32); v[0::2]=s0; v[1::2]=s1
        v=np.where(v>2047,v-4096,v)
        d=v[:n*nch].reshape(-1,nch)[:n].astype(np.float64)
    else:
        dt={'16':'<i2','32':'<i4'}[fmt]
        d=np.fromfile(path+'.dat',dtype=dt,offset=skip)[:n*nch].reshape(n,nch).astype(np.float64)
    return fs,names,(d-np.array(bases))/np.array(gains)


MIT_CODES = {1: 'N', 2: 'L', 3: 'R', 4: 'a', 5: 'V', 6: 'F', 7: 'J', 8: 'A', 9: 'S', 10: 'E', 11: 'j', 12: '/', 13: 'Q',
             14: '~', 16: '|', 18: 's', 19: 'T', 20: '*', 21: 'D', 22: '"', 23: '=', 24: 'p', 25: 'B', 26: '^', 27: 't',
             28: '+', 29: 'u', 30: '?', 31: '!', 32: '[', 33: ']', 34: 'e', 35: 'n', 36: '@', 37: 'x', 38: 'f', 39: '(',
             40: ')', 41: 'r'}


def read_ann(path, ext='atr'):
    """Minimal MIT-format annotation reader. Returns (samples, symbols, aux texts)."""
    b = np.fromfile(path + '.' + ext, dtype='<u2')
    i, t, samples, symbols, aux = 0, 0, [], [], []
    while i < len(b):
        w = int(b[i]); code, d = w >> 10, w & 0x3FF; i += 1
        if code == 0 and d == 0:
            break
        if code == 59:  # SKIP: 32-bit interval, high word first
            t += (int(b[i]) << 16) | int(b[i + 1]); i += 2
            continue
        if code in (60, 61, 62):  # NUM, SUB, CHN
            continue
        if code == 63:  # AUX of the previous annotation: d bytes
            raw = b[i:i + (d + 1) // 2].astype('<u2').tobytes()[:d]
            if aux:
                aux[-1] = raw.decode('latin-1').rstrip('\x00')
            i += (d + 1) // 2
            continue
        t += d
        samples.append(t); symbols.append(MIT_CODES.get(code, '?')); aux.append('')
    return np.array(samples), symbols, aux
