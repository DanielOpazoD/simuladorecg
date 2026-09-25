import importlib.util
from pathlib import Path
import json
import unittest

spec=importlib.util.spec_from_file_location('noise',Path(__file__).resolve().parents[1]/'scripts/prepare-noise-stress.py')
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)


def packed(a,b):
    x,y=a&4095,b&4095
    return bytes([x&255,((y>>8)<<4)|(x>>8),y&255])

class NoiseReaderTests(unittest.TestCase):
    def fixture(self):
        a=[-29,2047,-2048,0]; b=[25,-1,-1024,7]
        h=f'bw 2 360 4\nbw.dat 212 0 12 0 {a[0]} {sum(a)&65535} 0 noise1\nbw.dat 212 0 12 0 {b[0]} {sum(b)&65535} 0 noise2\n'
        return h.encode(),b''.join(packed(x,y) for x,y in zip(a,b)),[a,b]

    def test_signed_packed_samples_and_unknown_units(self):
        h,raw,expected=self.fixture();actual,meta=m.decode212(h,raw)
        self.assertEqual(actual,expected);self.assertEqual(meta['sourceGain'],0)
        self.assertEqual(meta['sourceUnits'],'uncalibrated digital counts')

    def test_initial_value_and_checksum_corruption_fail(self):
        h,raw,_=self.fixture()
        for wrong in (raw[:-1],raw+b'\0',b'\0'+raw[1:],raw[:3]+b'\0'+raw[4:]):
            with self.assertRaises(ValueError):m.decode212(h,wrong)

    def test_gain_or_format_not_guessed(self):
        h,raw,_=self.fixture()
        for wrong in (h.replace(b'212',b'16'),h.replace(b'212 0',b'212 200/mV'),h.replace(b'360',b'500')):
            with self.assertRaises(ValueError):m.decode212(wrong,raw)

    def test_protocol_freezes_product_and_matrix(self):
        p=json.loads(m.PROTOCOL.read_text())
        self.assertEqual(p['productFingerprintSha256'],m.transport.product_fingerprint())
        self.assertEqual(len(p['records'])*len(p['segmentStartsSeconds'])*len(p['snrDb'])*len(p['filters'])*len(p['presets']),900)
        self.assertEqual(p['resample']['up']*p['sourceFs']/p['resample']['down'],p['outputFs'])
        self.assertFalse(p['clinicalValidation']);self.assertFalse(p['analyzerTuned'])

if __name__=='__main__':unittest.main()
