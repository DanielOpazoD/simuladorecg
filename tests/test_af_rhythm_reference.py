import importlib.util
from pathlib import Path
import unittest
import numpy as np
spec=importlib.util.spec_from_file_location('af_reference',Path(__file__).resolve().parents[1]/'scripts/af-rhythm-reference.py')
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)

class AFReferenceTests(unittest.TestCase):
    def test_no_interval_crosses_a_rhythm_transition(self):
        episodes, windows=m.af_windows(np.arange(0,200),[(0,'(N'),(20,'(AFIB'),(81,'(N'),(100,'(AFIB')],200,1,60,20)
        self.assertEqual([(x['startSample'],x['stopSample']) for x in windows],[(20,80),(100,160)])
        self.assertEqual([x['intervals'] for x in windows],[59,59])
    def test_short_episode_is_reported_not_filled(self):
        episodes, windows=m.af_windows(np.arange(100),[(0,'(N'),(10,'(AFIB'),(30,'(N')],100,1)
        self.assertEqual(len(episodes),1);self.assertEqual(windows,[])
    def test_last_episode_uses_header_length_not_rounded_ten_hours(self):
        _,windows=m.af_windows(np.arange(121),[(0,'(AFIB')],121,1)
        self.assertEqual(len(windows),2);self.assertEqual(windows[-1]['stopSample'],120)
    def test_invalid_beat_order_fails_without_sorting(self):
        with self.assertRaisesRegex(ValueError,'chronology'):m.af_windows([0,2,1],[(0,'(AFIB')],100,1)
    def test_missing_boundary_beats_are_not_imputed(self):
        _,windows=m.af_windows(np.arange(10,50),[(0,'(AFIB')],60,1)
        self.assertEqual(windows[0]['intervals'],39)
    def test_independent_known_statistics_and_constant_lag(self):
        s=m.rr_stats([1,2,3,4]);self.assertEqual(s['meanSeconds'],2.5)
        self.assertAlmostEqual(s['sdSeconds'],np.sqrt(1.25));self.assertEqual(s['rmssdSeconds'],1)
        self.assertIsNone(m.rr_stats([1,1,1])['lagOne'])
    def test_nonpositive_nonfinite_rr_fails(self):
        for values in [[0,1],[-1,1],[float('nan'),1],[float('inf'),1]]:
            with self.assertRaises(ValueError):m.rr_stats(values)

if __name__=='__main__':unittest.main()
