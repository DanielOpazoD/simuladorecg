import importlib.util,unittest
from pathlib import Path
spec=importlib.util.spec_from_file_location('ref',Path(__file__).resolve().parents[1]/'scripts/af-ltaf-reference.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
class Tests(unittest.TestCase):
 def fixture(self,extra=()):
  events=[(0,'+','(AFIB')]+[(i,'N','') for i in range(10,1200,10)]+list(extra);events.sort(key=lambda e:e[0]);return list(zip(*events))
 def test_full_windows_do_not_bridge_transition(self):
  a=self.fixture([(650,'+','(N')]);r=m.windows(*a,1200,10);self.assertEqual(len(r['windows']),1);self.assertEqual(r['windows'][0]['stopSample'],600)
 def test_record_end_is_not_rounded_to_nominal_hours(self):
  r=m.windows(*self.fixture(),1199,10);self.assertEqual(len(r['windows']),1)
 def test_excludes_whole_confounded_window_without_dropping_beats(self):
  r=m.windows(*self.fixture([(150,'|','')]),1200,10);self.assertFalse(r['windows'][0]['primaryEligible']);self.assertTrue(r['windows'][1]['primaryEligible']);self.assertEqual(r['windows'][0]['intervals'],58)
 def test_annotation_comments_are_not_invented_beats(self):
  r=m.windows(*self.fixture([(155,'"','PSE')]),1200,10);self.assertEqual(r['windows'][0]['intervals'],58);self.assertTrue(r['windows'][0]['primaryEligible'])
 def test_duplicate_beats_and_conflicting_rhythms_fail(self):
  for extra in [[(10,'V','')],[(0,'+','(N')]]:
   with self.assertRaises(ValueError):m.windows(*self.fixture(extra),1200,10)
 def test_outside_auxiliary_comment_is_disclosed_without_extending_recording(self):
  r=m.windows(*self.fixture([(1500,'\"','Aux')]),1200,10);self.assertEqual(r['outsideAncillaryAnnotations'],1);self.assertEqual(len(r['windows']),2)
  for symbol in ['N','+']:
   with self.assertRaises(ValueError):m.windows(*self.fixture([(1500,symbol,'(AFIB')]),1200,10)
 def test_missing_summaries_are_null_not_zero(self):
  self.assertIsNone(m.record_summary([])['medianCV']);self.assertEqual(m.record_summary([])['windows'],0)
 def test_rr_units_and_constant_interval(self):
  s=m.summarize_rr([.5,.5,.5]);self.assertEqual(s['rate'],120);self.assertEqual(s['cv'],0);self.assertIsNone(s['lag1'])
if __name__=='__main__':unittest.main()
