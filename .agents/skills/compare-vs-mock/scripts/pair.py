"""compare-vs-mock: python3 -I pair.py <out.png> <mock.png> <app.png> [more.png ...] — side by side, each scaled to
1200 px high, grey gutters. Images of different aspect ratios scale differently (note it when comparing sizes)."""
import sys
from PIL import Image

out, *ins = sys.argv[1:]
H = 1200
ims = [Image.open(p).convert("RGB") for p in ins]
ims = [i.resize((round(i.width * H / i.height), H)) for i in ims]
o = Image.new("RGB", (sum(i.width for i in ims) + 20 * (len(ims) - 1), H), (200, 200, 200))
x = 0
for i in ims:
    o.paste(i, (x, 0))
    x += i.width + 20
o.save(out)
