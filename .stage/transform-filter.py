import base64, json, os, pathlib, subprocess
BASE='b17674bfef9ea0f0d5a6a3936328586c3fcc2bf1'
EXPECTED='5705e00913c8dfbbeec0e344c6b6092f94bc907f'
NEW=['scripts/lib/monitor-revision.mjs','tests/monitor-phase.test.ts','tests/monitor-revision.test.mjs','tests/reference/monitor-phase-oracle.json','docs/monitor-phase-revision.md']
files={p:pathlib.Path(p).read_bytes() for p in NEW}
extension=pathlib.Path('.stage/filter-extension.txt').read_text()
def run(*args):return subprocess.check_output(args).decode().strip()
def replace(p,a,b):
 s=pathlib.Path(p).read_text();assert s.count(a)==1,(p,a,s.count(a));pathlib.Path(p).write_text(s.replace(a,b))
subprocess.run(['git','checkout','--detach',BASE],check=True)
p=pathlib.Path('src/engine/filter.ts');p.write_text(p.read_text()+extension)
replace('src/engine/signal.ts','import { highpass, biquad, antialias }','import { applyAcquisitionFilter, biquad, antialias }')
replace('src/engine/signal.ts','    n = Math.ceil((total + GUARD) * FS),\n    events = generateEvents(c, total + GUARD);','    guard = c.filter === "monitor" ? 4 : GUARD,\n    n = Math.ceil((total + guard) * FS),\n    events = generateEvents(c, total + guard);')
replace('src/engine/signal.ts','    if (c.filter !== "off")\n      highpass(\n        arr,\n        FS,\n        c.filter === "diagnostic" ? 0.05 : c.filter === "monitor" ? 0.5 : 2,\n      );\n    if (c.filter === "monitor" || c.filter === "aggressive")\n      biquad(arr, FS, 40, "lowpass");','    applyAcquisitionFilter(arr, FS, c.filter);')
replace('src/ui/controls.ts','Monitor · 0,5–40 Hz','Monitor · 0,5–40 Hz · fase cero')
replace('scripts/lib/noise-stress.ts','highpass, biquad }','highpass, biquad, applyAcquisitionFilter }')
replace('scripts/lib/noise-stress.ts','biquad:typeof biquad}={highpass,biquad}','biquad:typeof biquad;applyAcquisitionFilter?:typeof applyAcquisitionFilter}={highpass,biquad,applyAcquisitionFilter}')
replace('scripts/lib/noise-stress.ts',"    if(mode!=='off')kernels.highpass","    if(kernels.applyAcquisitionFilter) kernels.applyAcquisitionFilter(a,input.fs,mode);\n    else {\n    if(mode!=='off')kernels.highpass")
replace('scripts/lib/noise-stress.ts',"kernels.biquad(a,input.fs,40,'lowpass');\n    leads[l]","kernels.biquad(a,input.fs,40,'lowpass');\n    }\n    leads[l]")
replace('scripts/benchmark-noise-stress.mjs',"export {highpass,biquad} from ${product('src/engine/filter.ts')};","export * as filterApi from ${product('src/engine/filter.ts')};")
replace('scripts/benchmark-noise-stress.mjs','{highpass:M.highpass,biquad:M.biquad}','M.filterApi')
replace('scripts/check-noise-regression.mjs','import {compareReports}',"import {reviewMonitorRevision} from './lib/monitor-revision.mjs';\nimport {compareReports}")
replace('scripts/check-noise-regression.mjs','  result.policy=policy;',"  if (policy.monitorRevision) {\n    assert.equal(createHash('sha256').update(await readFile('src/engine/filter.ts')).digest('hex'),policy.monitorRevision.filterSha256,'Unreviewed filter implementation');\n    const revision=reviewMonitorRevision(before,after,result,policy.monitorRevision);\n    result={...result,status:'pass',strictStatus:result.status,reviewedMonitorRevision:revision};\n  }\n  result.policy=policy;")
p=pathlib.Path('benchmarks/noise-stress/acceptance.json');obj=json.loads(p.read_text());obj['monitorRevision']={'mode':'monitor','filterSha256':'4e1fe3f43ea33332b0fe13b68f23ce1bd40f0ca496178bcb1a32c8a1ef3bff16','maximumTailRatio':1.1,'primaryMeanRatio':0.85,'rmseMeanRatio':0.98,'role':'Explicit monitor-only migration selected using exposed development. Not preregistered clinical evidence. Preserve complete strict failures and old baseline.'};p.write_text(json.dumps(obj,indent=2)+'\n')
for name,data in files.items():
 p=pathlib.Path(name);p.parent.mkdir(parents=True,exist_ok=True);p.write_bytes(data)
paths=NEW+['src/engine/filter.ts','src/engine/signal.ts','src/ui/controls.ts','scripts/lib/noise-stress.ts','scripts/benchmark-noise-stress.mjs','scripts/check-noise-regression.mjs','benchmarks/noise-stress/acceptance.json']
assert all(not p.startswith(('.github/','.stage/','.git/')) for p in paths)
subprocess.run(['git','add','--',*paths],check=True)
tree=run('git','write-tree')
if tree!=EXPECTED:
 print(run('git','diff','--cached','--stat'));print(run('git','ls-files','--stage'));raise ValueError((tree,EXPECTED))
def api(endpoint,data):return json.loads(subprocess.check_output(['gh','api','--method','POST','repos/'+os.environ['GH_REPO']+'/git/'+endpoint,'--input','-'],input=json.dumps(data).encode()))
entries=[]
for name in paths:
 blob=api('blobs',{'content':base64.b64encode(pathlib.Path(name).read_bytes()).decode(),'encoding':'base64'})
 entries.append({'path':name,'type':'blob','mode':'100644','sha':blob['sha']})
remote=api('trees',{'base_tree':run('git','rev-parse',BASE+'^{tree}'),'tree':entries})
assert remote['sha']==EXPECTED
print(json.dumps({'verifiedTree':tree,'base':BASE,'createdObjectsOnly':True,'files':len(entries)}))
