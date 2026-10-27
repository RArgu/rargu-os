"""Rebuild the RArgu OS mock: python3 -I docs/mockups/rargu-os-src/build.py [output-name.html]
Default output: rargu-os-v0.8.html (spec 014 T5: v0.7 with coloured stack chips). v0.7 builds from
rargu-os-src-v0.7/, v0.6 from rargu-os-src-v0.6/. A new mock version passes its
own name and must not overwrite an older file.
Joins part1.html + part2.js + reused.js + part3.js and inlines the Pixel Operator fonts, the Castle Wars sprite
sheets, the CastleSiege piece masks and the app icons, so the mock is one self-contained HTML file."""
import base64, json, os, sys
HERE = os.path.dirname(os.path.abspath(__file__))
R = os.path.normpath(os.path.join(HERE, '../../..')) + '/'
b64 = lambda p: base64.b64encode(open(p, 'rb').read()).decode()
t = ''.join(open(os.path.join(HERE, f)).read() for f in ['part1.html', 'part2.js', 'reused.js', 'part3.js'])
t = t.replace('__FONT_PX__', b64(R + 'public/fonts/PixelOperator.ttf')).replace('__FONT_PXB__', b64(R + 'public/fonts/PixelOperator-Bold.ttf')).replace('__FONT_MONO__', b64(R + 'public/fonts/PixelOperatorMono.ttf'))
sp = {}
for n in ['swordsman', 'spearman', 'hammerman', 'archer', 'knight', 'wizard']:
    d = json.load(open(R + f'src/apps/castlewars/art/{n}.json'))
    f = list(d['frames'].values())[0]['frame']
    sp[n] = {'w': f['w'], 'h': f['h'], 'tags': {x['name']: [x['from'], x['to']] for x in d['meta']['frameTags']}, 'src': 'data:image/png;base64,' + b64(R + f'src/apps/castlewars/art/{n}.png')}
t = t.replace('__SPRITES__', json.dumps(sp)).replace('__MASKS__', open(os.path.join(HERE, 'masks.json')).read())
for k, a in [('PAINT', 'paint'), ('MUSIC', 'tracker'), ('NOTES', 'writer')]:
    t = t.replace(f'__ICON_{k}__', 'data:image/png;base64,' + b64(R + f'src/apps/{a}/icon.png'))
DEFAULT = 'rargu-os-v0.8.html'
name = sys.argv[1] if len(sys.argv) > 1 else DEFAULT
out = os.path.join(HERE, '..', name)
if name != DEFAULT and os.path.exists(out):
    sys.exit(f'{name} exists; mock versions are never overwritten')
open(out, 'w').write(t)
print(out, len(t))
