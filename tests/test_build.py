"""Single source: index.html and demo.html must be exactly what build.py makes from src/."""
import os, sys, importlib.util
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
spec = importlib.util.spec_from_file_location('build', os.path.join(ROOT, 'build.py')); build = importlib.util.module_from_spec(spec); spec.loader.exec_module(build)
results = []
def check(n, c, d=''): results.append((n, bool(c), str(d)[:200]))
src = build.build_personal()
idx = open(os.path.join(ROOT, 'index.html'), encoding='utf-8').read()
demo = open(os.path.join(ROOT, 'demo.html'), encoding='utf-8').read()
check('index.html is exactly the build of src/ (rebuild after editing the source)', idx == src)
check('demo.html is exactly the demo build of src/', demo == build.build_demo(src))
nxt = open(os.path.join(ROOT, 'demo-next.html'), encoding='utf-8').read()
check('demo-next.html (the old preview link) is the demo', nxt == demo)
check('both apps carry the design layer (html.nx, its styles and the logo)', all('class="nx"' in x and '.nx ' in x and '21365c' in x for x in (idx, demo)))
check('build flags: demo build is BUILD.demo=true, personal false (storage key and sync follow it)', 'const BUILD=Object.freeze({demo:true})' in demo and 'const BUILD=Object.freeze({demo:false})' in idx)
check('your real history is only in the personal app', 'REAL_EVENTS' in idx and 'REAL_EVENTS' not in demo)
check('tour only in the demo', 'tour-hole' in demo and 'tour-hole' not in idx and 'id="tourBtn"' in demo and 'tourBtn' not in idx)
check('fictional data only in the demo', 'function demoState()' in demo and 'function demoState()' not in idx)
ok = sum(r[1] for r in results)
print(f'\n{ok}/{len(results)} build tests passed\n')
for n, g, d in results: print(('PASS ' if g else 'FAIL ') + n + ('' if g else f'\n      → {d}'))
sys.exit(0 if ok == len(results) else 1)

