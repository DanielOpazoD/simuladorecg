import copy
import importlib.util
import json
from pathlib import Path
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('reference', ROOT/'scripts/secondary-stt-reference.py')
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)

def fixture():
    metadata = b'ecg_id,patient_id,strat_fold,scp_codes\n1,10,1,"{\'CLBBB\': 100, \'IMI\': 15}"\n2,20,2,"{\'WPW\': 100}"\n'
    selection = {'metadataSha256': m.digest(metadata), 'records': [{'ecg_id': 1, 'patient_id': 10, 'fold': 1}, {'ecg_id': 2, 'patient_id': 20, 'fold': 2}]}
    description = b'published descriptor fixture'
    mapping = {'12sl': {'conversion': 'identity; published harmonized units', 'featureDescriptionSha256': m.digest(description), 'columnUnits': {'ST_Amp_I': 'mV', 'T_Amp_I': 'mV', 'QRS_AmpPP_I': 'mV'}}}
    features = {'groups': {'1': ['CD'], '2': ['CD']}, 'tables': {'12sl': {'1': {'ST_Amp_I': -.1, 'T_Amp_I': -.4, 'QRS_AmpPP_I': 1.2}}}}
    generated = {'records': [{'preset': 'lbbb', 'filter': 'off', 'leads': {'I': {'jMv': 0, 'j60Mv': .9, 'tPeakMv': -.25, 'qrsPeakToPeakMv': 1}}}]}
    return selection, metadata, features, mapping, description, generated

class ReferenceTests(unittest.TestCase):
    def test_signed_stj_and_t_are_separate_from_j60_and_missing(self):
        r = m.report(*fixture()); l = r['cohorts']['CLBBB']
        self.assertEqual(l['reference']['I']['jMv']['median'], -.1)
        self.assertEqual(l['reference']['I']['tPeakMv']['median'], -.4)
        self.assertEqual(l['syntheticUnfiltered']['I']['jMv'], 0)
        self.assertNotIn('j60Mv', l['syntheticUnfiltered']['I'])
        self.assertEqual(r['cohorts']['WPW']['patients'], 1)
        self.assertEqual(r['cohorts']['WPW']['reference']['I']['jMv']['missing'], 1)
        self.assertIsNone(r['cohorts']['WPW']['reference']['I']['jMv']['median'])
        self.assertEqual(l['cooccurringCodeCounts'], {'IMI': 1})
        self.assertTrue(l['smallSampleWarning'])
    def test_bad_units_do_not_become_amplitude_numbers(self):
        a = list(fixture()); a[3]['12sl']['columnUnits']['ST_Amp_I'] = 'uV'
        field = m.report(*a)['cohorts']['CLBBB']['reference']['I']['jMv']
        self.assertEqual(field['status'], 'unverified-units'); self.assertIsNone(field['median'])
    def test_descriptor_and_metadata_tampering_fail(self):
        for i, value in [(1, b'changed'), (4, b'changed')]:
            a = list(fixture()); a[i] = value
            with self.assertRaises(ValueError): m.report(*a)
    def test_duplicate_patient_record_and_reserved_patient_fail(self):
        for mode in ['duplicate', 'identity', 'reserved']:
            a = list(fixture())
            if mode == 'duplicate': a[0]['records'].append(copy.deepcopy(a[0]['records'][0]))
            if mode == 'identity': a[0]['records'][1]['patient_id'] = 10
            if mode == 'reserved':
                a[1] += b'3,10,9,"{\'NORM\':100}"\n'
                a[0]['metadataSha256'] = m.digest(a[1])
            with self.assertRaises(ValueError): m.report(*a)
    def test_features_cannot_select_a_different_cohort(self):
        a = list(fixture()); a[2]['groups'].pop('2')
        with self.assertRaises(ValueError): m.report(*a)
    def test_no_patient_diagnosis_text_or_demographics_escape(self):
        a = list(fixture()); a[1] = a[1].replace(b'scp_codes\n', b'scp_codes,report\n').replace(b'15}"\n', b'15}",PRIVATE_REPORT\n').replace(b'100}"\n', b'100}",PRIVATE_REPORT\n'); a[0]['metadataSha256'] = m.digest(a[1])
        text = json.dumps(m.report(*a)); self.assertNotIn('PRIVATE_REPORT', text); self.assertNotIn('patient_id', text)
    def test_quartiles_preserve_missing_and_do_not_zero_impute(self):
        self.assertEqual(m.stats([None, -1, 1, float('nan')]), {'total': 4, 'n': 2, 'missing': 2, 'q25': -.5, 'median': 0, 'q75': .5})
        self.assertIsNone(m.stats([])['median'])
    def test_real_cli_records_input_hashes_without_raw_metadata(self):
        a = fixture()
        with tempfile.TemporaryDirectory() as tmp:
            p = Path(tmp)
            for name, value in [('selection.json', a[0]), ('selected-features.json', a[2]), ('reviewed-feature-mapping.json', a[3]), ('generator-morphology.json', a[5])]: (p/name).write_text(json.dumps(value))
            (p/'feature_description.csv').write_bytes(a[4]); (p/'metadata.csv').write_bytes(a[1])
            subprocess.run(['python', str(ROOT/'scripts/secondary-stt-reference.py'), '--reference', str(p), '--metadata', str(p/'metadata.csv'), '--output', str(p/'report.json')], check=True, capture_output=True)
            r = json.loads((p/'report.json').read_text())
            self.assertEqual(r['inputSha256']['metadata'], m.digest(a[1])); self.assertFalse(r['clinicalValidation']); self.assertFalse(r['coefficientsFitted'])

if __name__ == '__main__': unittest.main()
