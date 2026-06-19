import json, subprocess, os

build_xml = open('D:/pobdCompare/tests/fixtures/builds/yewuheng1.build', 'r', encoding='utf-8').read()

env = os.environ.copy()
env['POB_ROOT'] = r'D:\PathOfBuilding-PoE2-dev\PathOfBuilding-PoE2-dev'

result = subprocess.run(
    [r'C:\Users\Administrator\AppData\Local\Programs\Python\Python310\python.exe', r'D:/pobdCompare/packages/pob2-worker/python/driver.py'],
    input=json.dumps({'buildXml': build_xml, 'skillNumber': 1, 'weaponSet': 1, 'config': {}}) + '\n',
    capture_output=True,
    text=True,
    encoding='utf-8',
    env=env,
    cwd=r'D:\PathOfBuilding-PoE2-dev\PathOfBuilding-PoE2-dev\src'
)

print('STDOUT:', result.stdout[:2000])
print('STDERR:', result.stderr[:2000])

try:
    lines = [l for l in result.stdout.strip().split('\n') if l.strip()]
    for line in reversed(lines):
        try:
            data = json.loads(line)
            print('passiveNodes type:', type(data.get('passiveNodes')))
            print('passiveNodes value:', data.get('passiveNodes'))
            print('passiveNodes count:', len(data.get('passiveNodes', [])))
            break
        except:
            continue
except Exception as e:
    print('Parse error:', e)
