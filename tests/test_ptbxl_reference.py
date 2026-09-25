import importlib.util
import json
import math
from pathlib import Path
import struct
import unittest

spec=importlib.util.spec_from_file_location('benchmark',Path(__file__).resolve().parents[1]/'scripts/ptbxl-benchmark.py')
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)


class SelectionTests(unittest.TestCase):
    def setUp(self):
        self.p={'seed':'test','patientCount':2,'medianCount':1}
        self.rows=[{'ecg_id':str(i),'patient_id':str((i+1)//2),'strat_fold':'1'} for i in range(1,9)]

    def test_order_invariance_and_patient_uniqueness(self):
        a=m.select(self.rows,self.p)
        self.assertEqual(a,m.select(list(reversed(self.rows)),self.p))
        self.assertEqual(len({r['patient_id'] for r in a['records']}),2)
        self.assertTrue(all(r['ecg_id']%2==1 for r in a['records']))

    def test_sibling_in_holdout_excludes_patient(self):
        self.rows[0]['strat_fold']='9'
        a=m.select(self.rows, {**self.p,'patientCount':3})
        self.assertEqual(a['excludedPatients'],1)
        self.assertNotIn(1,[r['patient_id'] for r in a['records']])

    def test_duplicate_key_rejected(self):
        with self.assertRaises(ValueError):m.select(self.rows+[self.rows[0]],self.p)

    def test_insufficient_not_backfilled_from_holdout(self):
        with self.assertRaises(ValueError):m.select(self.rows,{**self.p,'patientCount':5})

    def test_integer_ids_not_silently_truncated(self):
        self.assertEqual(m.integer('23.0'),23)
        for value in ['1.2','NaN','0','-1']:
            with self.assertRaises(ValueError):m.integer(value)


class StatisticsTests(unittest.TestCase):
    def test_missing_zero_and_denominator(self):
        s=m.summary([0,None,2,float('nan')]);self.assertEqual((s['n'],s['missing'],s['total']),(2,2,4))
        self.assertEqual(s['median'],1)
        self.assertEqual(s['coverage'],.5)

    def test_type7_quantile_and_sample_sd(self):
        self.assertEqual(m.quantile([0,10],.25),2.5)
        self.assertAlmostEqual(m.summary([1,2,3])['sd'],1)

    def test_empty_and_one(self):
        self.assertIsNone(m.summary([])['mean']);self.assertIsNone(m.summary([1])['sd'])

    def test_circular_wrap_and_indeterminate(self):
        self.assertAlmostEqual(abs(m.summary([179,-179],True)['meanDirectionDeg']),180)
        self.assertIsNone(m.summary([0,180],True)['meanDirectionDeg'])

    def test_signed_values_and_nonfinite(self):
        self.assertEqual(m.number('-.25'),-.25);self.assertEqual(m.number('0'),0)
        self.assertIsNone(m.number('nan'));self.assertIsNone(m.number('inf'))
        with self.assertRaises(ValueError):m.number('unreviewed')

    def test_progression_requires_all_six_leads(self):
        row={**{f'R_Amp_V{i}':i/10 for i in range(1,7)},**{f'S_Amp_V{i}':-.3 for i in range(1,7)}}
        self.assertEqual(m.progression(row),'V3')
        row.pop('S_Amp_V1');self.assertIsNone(m.progression(row))

    def test_zero_and_invalid_signs_not_normalized_away(self):
        row={**{f'R_Amp_V{i}':0 for i in range(1,7)},**{f'S_Amp_V{i}':0 for i in range(1,7)}}
        self.assertIsNone(m.progression(row))
        row['S_Amp_V1']=.1;self.assertIsNone(m.progression(row))

    def test_schema_requires_units_and_named_key(self):
        p={'globalFeatures':{'QRS_Dur_Global':'ms'},'providerAxes':{'x':'QRS_AxisFront_Global'},'leadFeatures':{}}
        d={'QRS_Dur_Global':{'unit':'ms'},'QRS_AxisFront_Global':{'unit':'degrees'}}
        h=['QRS_Dur_Global','ecg_id','QRS_AxisFront_Global']
        self.assertEqual(m.validate_schema(h,d,p,'x')['QRS_Dur_Global'],'ms')
        d['QRS_Dur_Global']['unit']='s'
        with self.assertRaises(ValueError):m.validate_schema(h,d,p,'x')

    def test_csv_duplicate_header(self):
        with self.assertRaises(ValueError):m.read_rows(b'ecg_id,a,a\n1,2,3\n')


class MedianTests(unittest.TestCase):
    def fixture(self,gain='1000(100)/mV'):
        values=[100,1100,-400];raw=struct.pack('<36h',*[v for v in values for _ in range(12)])
        h='old/path/m 12 500 3\n'+'\n'.join(f'old/path/m.dat 16 {gain} 16 0 100 800 0 {l}' for l in m.LEADS)+'\n'
        return h.encode(),raw

    def test_calibration_with_nonzero_baseline_and_prefix(self):
        h,raw=self.fixture();sample,normalized,filename,_,_=m.decode_median(h,raw)
        self.assertEqual(sample['leads']['II'],[0,1,-.5]);self.assertEqual(filename,'m.dat')
        self.assertTrue(normalized.startswith(b'm 12 500'))
        self.assertNotEqual(m.digest(h),m.digest(normalized))

    def test_explicit_microvolt_units(self):
        h,raw=self.fixture('1(100)/uV');sample,*_=m.decode_median(h,raw)
        self.assertEqual(sample['leads']['V5'],[0,1,-.5])

    def test_corrupt_checksum_fails(self):
        h,raw=self.fixture()
        with self.assertRaises(ValueError):m.decode_median(h,b'\x00'*len(raw))

    def test_missing_sample_is_not_large_voltage(self):
        h,raw=self.fixture();raw=struct.pack('<36h',*[v for v in [100,1100,-32768] for _ in range(12)])
        h=h.replace(b' 800 ',b' -31568 ')
        sample,*_=m.decode_median(h,raw);self.assertIsNone(sample['leads']['I'][2])

    def test_unrecognized_gain_not_guessed(self):
        for unit in ['mVolts','', 'counts']:
            h,raw=self.fixture(f'1000(100)/{unit}')
            with self.assertRaises(ValueError):m.decode_median(h,raw)

    def test_wrong_length_rejected(self):
        h,raw=self.fixture()
        with self.assertRaises(ValueError):m.decode_median(h,raw[:-2])

    def test_product_freeze(self):
        p=json.loads(m.PROTOCOL.read_text());self.assertEqual(m.product_fingerprint(),p['productFingerprintSha256'])

if __name__=='__main__':unittest.main()
