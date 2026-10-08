"""Prepare the existing vanilla specimen's disposable local world; verify official bytes."""
import hashlib
import json
from pathlib import Path
import urllib.request

root = Path('work/minecraft')
server = root / 'server'
server.mkdir(parents=True, exist_ok=True)
manifest = json.load(urllib.request.urlopen('https://piston-meta.mojang.com/mc/game/version_manifest_v2.json'))
version = next(v for v in manifest['versions'] if v['id'] == '26.1.1')
data = json.load(urllib.request.urlopen(version['url']))
spec = data['downloads']['server']
meta = {'id': data['id'], 'type': data['type'], 'releaseTime': data['releaseTime'],
        'server_url': spec['url'], 'server_sha1': spec['sha1'], 'server_size': spec['size'],
        'version_metadata_url': version['url']}
(root / 'server-version.json').write_text(json.dumps(meta, indent=2) + '\n')
jar = server / 'server.jar'
if not jar.exists() or hashlib.sha1(jar.read_bytes()).hexdigest() != spec['sha1']:
    urllib.request.urlretrieve(spec['url'], jar)
assert hashlib.sha1(jar.read_bytes()).hexdigest() == spec['sha1']
(server / 'server.properties').write_text('''server-port=25565
online-mode=false
enforce-secure-profile=false
gamemode=survival
force-gamemode=true
difficulty=peaceful
spawn-protection=0
generate-structures=false
level-type=minecraft:flat
view-distance=5
simulation-distance=5
enable-rcon=true
rcon.port=25575
rcon.password=relatte-ci
enable-query=false
motd=reLATTE interface superspace disposable proof
''')
(server / 'eula.txt').write_text('eula=true\n')
print(json.dumps(meta))
