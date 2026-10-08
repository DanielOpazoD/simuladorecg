import copy
import hashlib
import importlib.util
import json
from pathlib import Path
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('isolated', Path(__file__).resolve().parents[1] / 'scripts/isolated-phenotype-reference.py')
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)
P = json.loads(m.PROTOCOL.read_text())

def row(ecg=1, patient=1, fold=1, codes=None, age='50'):
    return {'ecg_id': str(ecg), 'patient_id': str(patient), 'strat_fold': str(fold),
            'scp_codes': repr(codes if codes is not None else {'LAFB': 100, 'SR': 0}),
            'age': age, 'filename_hr': f'records500/00000/{ecg:05d}_hr'}

class IsolatedPhenotypeTests(unittest.TestCase):
    def test_only_isolated_confident_labels(self):
        rows = [row(), row(2,2,codes={'LAFB':100,'LVH':100}), row(3,3,codes={'LPFB':100,'RVH':15}), row(4,4,codes={'WPW':80})]
        result = m.select(rows,P)
        self.assertEqual([r['ecg_id'] for r in result['records']],[1])
        self.assertEqual(result['recordExclusions']['not-isolated-target-label'],3)
    def test_all_records_of_heldout_patient_excluded_even_unrelated_diagnosis(self):
        rows=[row(),row(2,1,fold=9,codes={'MI':100}),row(3,3)]
        self.assertEqual([r['patient_id'] for r in m.select(rows,P)['records']],[3])
    def test_lowest_eligible_record_per_patient_not_lowest_unrelated(self):
        rows=[row(3),row(2),row(1,codes={'MI':100})]
        self.assertEqual(m.select(rows,P)['records'][0]['ecg_id'],2)
    def test_patient_with_multiple_eligible_groups_is_excluded(self):
        r=m.select([row(),row(2,codes={'NORM':100}),row(3,3)],P)
        self.assertEqual(r['multiGroupPatientsExcluded'],1)
        self.assertEqual([x['patient_id'] for x in r['records']],[3])
    def test_order_is_deterministic_and_input_order_independent(self):
        rows=[row(i,i) for i in range(1,31)]
        a,b=m.select(rows,P),m.select(list(reversed(rows)),P)
        self.assertEqual(a,b)
        self.assertEqual(a['groups']['LAFB']['selectedPatients'],20)
        self.assertEqual(a['groups']['LAFB']['eligiblePatients'],30)
    def test_scarcity_is_retained_without_replacement_or_calibration_claim(self):
        r=m.select([row(codes={'LPFB':100})],P)
        self.assertEqual(r['groups']['LPFB']['selectedPatients'],1)
        self.assertTrue(r['groups']['LPFB']['belowRequestedMaximum'])
        self.assertFalse(r['groups']['LPFB']['clinicalCalibrationEligible'])
        self.assertEqual(r['groups']['WPW']['selectedPatients'],0)
    def test_age_gate_and_deidentified_older_adults(self):
        rows=[row(1,1,age='17'),row(2,2,age=''),row(3,3,age='18'),row(4,4,age='300')]
        self.assertEqual({r['ecg_id'] for r in m.select(rows,P)['records']},{3,4})
    def test_duplicate_invalid_fold_and_path_are_errors(self):
        for rows in [[row(),row()],[row(fold=11)],[{**row(),'filename_hr':'../00001_hr'}]]:
            with self.subTest(rows=rows),self.assertRaises(ValueError):m.select(rows,P)
    def test_malformed_labels_are_not_silently_dropped(self):
        for codes in ['[]',"{'LAFB': True}","{'LAFB': 101}","{'LAFB': '100'}","{'LAFB': -1}"]:
            with self.subTest(codes=codes),self.assertRaises((ValueError,SyntaxError)):
                m.select([{**row(),'scp_codes':codes}],P)
    def test_cohort_policy_cannot_silently_expand(self):
        for key,value in [('developmentFolds',list(range(1,11))),('requiredTargetLikelihood',50),('allowedAdditionalLabels',['SR','RVH']),('excludeWholePatientIfAnyHeldoutRecord',False),('excludePatientsWithMultipleEligibleGroups',False),('minimumAgeYears',0)]:
            p=copy.deepcopy(P);p[key]=value
            with self.subTest(key=key),self.assertRaises(ValueError):m.select([row()],p)
    def test_nonpositive_or_boolean_cap_rejected(self):
        for cap in [0,-1,True,1.5]:
            p=copy.deepcopy(P);p['maximumPatientsPerGroup']=cap
            with self.assertRaises(ValueError):m.select([row()],p)
    def test_source_metadata_bytes_are_pinned_before_selection(self):
        with self.assertRaisesRegex(ValueError,'Metadata differs'):m.frozen_selection(b'not the source')
    def test_metadata_only_registered_cohort_cannot_be_changed_by_selection_logic(self):
        with patch.object(m.reader,'digest',side_effect=lambda b: P['metadataSha256'] if b == b'metadata' else hashlib.sha256(b).hexdigest()),patch.object(m.reader,'read_rows',return_value=[row()]):
            with self.assertRaisesRegex(ValueError,'registered metadata-only cohort'):m.frozen_selection(b'metadata')
    def test_exported_selection_has_no_demographics_or_free_text(self):
        r=m.select([{**row(),'report':'private text','sex':'0','height':'180'}],P)
        self.assertEqual(set(r['records'][0]),{'ecg_id','patient_id','fold','group','sourcePath'})
    def test_tampered_selection_rejected_before_waveforms(self):
        class Release:
            manifest_hash=P['releaseManifestSha256']
            def get(self,name):
                if name != 'ptbxl_database.csv':raise AssertionError('Waveform accessed')
                return b'metadata'
        with patch.object(m.reader,'Release',return_value=Release()),patch.object(m,'frozen_selection',return_value=({'correct':True},P)):
            with self.assertRaisesRegex(ValueError,'Selection changed'):m.acquire({'correct':False},P,Path('.'),Path('.'))

if __name__=='__main__':unittest.main()
