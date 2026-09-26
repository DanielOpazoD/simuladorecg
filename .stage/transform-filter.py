import base64, json, os, pathlib, subprocess
BASE='2e7cd106fb3723dcbe2a38c26ecb4b1c989bc0d5'
EXPECTED='8bbf9f9cc341dc7f8195b6bf0b8fa4143adfb7cd'
NEW=['src/engine/measurement-support.ts','src/ui/measurement-support.ts','tests/measurement-support.test.ts','docs/measurement-support-quality.md','benchmarks/measurement-quality/protocol.json']
files={p:pathlib.Path(p).read_bytes() for p in NEW}
patch=pathlib.Path('.stage/changes.diff').read_bytes()
def run(*args):return subprocess.check_output(args).decode().strip()
subprocess.run(['git','checkout','--detach',BASE],check=True)
subprocess.run(['git','apply','--index','-'],input=patch,check=True)
for name,data in files.items():
 p=pathlib.Path(name);p.parent.mkdir(parents=True,exist_ok=True);p.write_bytes(data)
subprocess.run(['git','add','--',*NEW],check=True)
tree=run('git','write-tree');assert tree==EXPECTED,(tree,EXPECTED)
paths=run('git','diff','--cached','--name-only').splitlines()
assert all(not p.startswith(('.github/','.stage/','.git/')) for p in paths)
def api(endpoint,data):return json.loads(subprocess.check_output(['gh','api','--method','POST','repos/'+os.environ['GH_REPO']+'/git/'+endpoint,'--input','-'],input=json.dumps(data).encode()))
entries=[]
for name in paths:
 blob=api('blobs',{'content':base64.b64encode(pathlib.Path(name).read_bytes()).decode(),'encoding':'base64'})
 entries.append({'path':name,'type':'blob','mode':'100644','sha':blob['sha']})
remote=api('trees',{'base_tree':run('git','rev-parse',BASE+'^{tree}'),'tree':entries})
assert remote['sha']==EXPECTED
print(json.dumps({'verifiedTree':tree,'base':BASE,'createdObjectsOnly':True,'files':len(entries)}))
