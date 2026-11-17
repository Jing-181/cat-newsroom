"""Rebuild weather banners from original local WebP copies; never edit library originals.
Run: PYTHONPATH=/tmp/hana-avatar-pillow python3 scripts/build-weather-art.py
Normalized crop/head measurements are hand-reviewed, not face-detector output.
"""
import json
from pathlib import Path
from PIL import Image, ImageFilter

root = Path(__file__).resolve().parents[1]
assets = root / 'src/assets/weather'
metadata = json.loads((assets / 'composition.json').read_text())
reference = .39
for name, spec in metadata.items():
    source = Image.open(assets / f'{name}.webp').convert('RGB')
    x0, y0, x1, y1 = spec['crop']
    head = spec['head']
    ratio = (head[3] - head[1]) / (y1 - y0)
    assert .8 * reference <= ratio <= 1.2 * reference, (name, ratio)
    assert y0 < head[1] < head[3] < y1, name
    crop = source.crop((round(x0*source.width), round(y0*source.height), round(x1*source.width), round(y1*source.height)))
    height = 600
    crop = crop.resize((round(crop.width * height / crop.height), height), Image.Resampling.LANCZOS)
    for variant, width in [('wide', 3000), ('mobile', 1100)]:
        background = crop.crop((0, 0, max(12, crop.width//9), height)).resize((width, height)).filter(ImageFilter.GaussianBlur(22))
        mask = Image.new('L', crop.size, 255)
        fade = min(100, crop.width//6)
        # Fade only the scene edge; leave the character and hands opaque.
        mask.paste(Image.frombytes('L', (fade, 1), bytes(round(255*x/fade) for x in range(fade))).resize((fade, height)), (0, 0))
        background.paste(crop, (width-crop.width, 0), mask)
        background.save(assets / f'{name}-{variant}.webp', 'WEBP', quality=85, method=6)
    print(f'{name}: head/banner={ratio:.3f}, scale={1/(y1-y0):.2f}, pose={spec["pose"]}')
