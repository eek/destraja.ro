# Desenează mâna vizitatorului peste cadrele video (headless Chrome nu arată cursorul).
#   python3 overlay.py <dir cadre> <dir ieșire> <dpr> [--touch]
# Citește <dir cadre>/cursor.json, scris de capture.mjs în modul video.
import json
import sys
from pathlib import Path

from PIL import Image, ImageDraw

src, dst, dpr = Path(sys.argv[1]), Path(sys.argv[2]), float(sys.argv[3])
touch = '--touch' in sys.argv
dst.mkdir(parents=True, exist_ok=True)
cursor = json.loads((src / 'cursor.json').read_text())
frames = sorted(src.glob('f*.png'))

# Săgeata clasică, în px CSS, cu vârful în (0, 0).
ARROW = [(0, 0), (0, 17), (4.5, 13), (7.5, 20), (10, 19), (7, 12.5), (12.5, 12.5)]
RIPPLE_FRAMES = 12

ripples = []  # (cadru de start, x, y)
for i, f in enumerate(frames):
    im = Image.open(f).convert('RGBA')
    layer = Image.new('RGBA', im.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    c = cursor[i] if i < len(cursor) else None
    if c and c.get('touch'):
        ripples.append((i, c['touch']['x'], c['touch']['y']))
    if touch:
        for start, x, y in ripples:
            k = (i - start) / RIPPLE_FRAMES
            if 0 <= k <= 1:
                r = (16 + 22 * k) * dpr
                a = int(150 * (1 - k))
                cx, cy = x * dpr, y * dpr
                d.ellipse((cx - r, cy - r, cx + r, cy + r), fill=(24, 33, 58, a // 3), outline=(255, 255, 255, a), width=int(2 * dpr))
    elif c:
        x, y = c['x'] * dpr, c['y'] * dpr
        if c['down']:
            r = 15 * dpr
            d.ellipse((x - r, y - r, x + r, y + r), fill=(24, 33, 58, 50), outline=(24, 33, 58, 120), width=int(1.5 * dpr))
        pts = [(x + px * dpr * 1.2, y + py * dpr * 1.2) for px, py in ARROW]
        d.polygon(pts, fill=(255, 255, 255, 255), outline=(24, 33, 58, 255), width=max(1, int(1.2 * dpr)))
    Image.alpha_composite(im, layer).convert('RGB').save(dst / f.name)
print(len(frames), 'cadre')
