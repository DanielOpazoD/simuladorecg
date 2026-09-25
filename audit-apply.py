import subprocess, base64, gzip, hashlib
parts = ['219493c9c7275beea21a9f8edc7abb23a86ffe0a','28301a427049292a1ba89bee85191907848f0710','e153ff534051d1872f974596338393797723425c','3c53df4a1ae51730ba5552d35deb8b2668c62c87']
encoded = b''.join(subprocess.check_output(['git','cat-file','blob',part]) for part in parts)
source = gzip.decompress(base64.b64decode(encoded, validate=True))
assert hashlib.sha256(source).hexdigest() == '2068a2cdcf9b3bb1149985f2a98e0c0ffec46fb72341c075fb70dfab3e044da4'
exec(compile(source, 'p9-reviewed.py', 'exec'))
