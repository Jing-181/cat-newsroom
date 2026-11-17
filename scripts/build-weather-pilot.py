"""B halfbody pilot: identical full-source crop, scale, alignment and feather for all people."""
import json
from pathlib import Path
from PIL import Image, ImageFilter
root = Path(__file__).resolve().parents[1] / 'src/assets/weather-pilot'
for name in json.loads((root / 'candidates.json').read_text()):
    image = Image.open(root / f'{name}.webp').convert('RGB').resize((600, 600), Image.Resampling.LANCZOS)
    for variant, width in [('wide', 3000), ('mobile', 1100)]:
        if variant == 'mobile':
            # Frozen approved H5 treatment; do not change its pixels.
            canvas = image.crop((0, 0, 66, 600)).resize((width, 600)).filter(ImageFilter.GaussianBlur(22))
        else:
            # No image-edge stretching on desktop: shared paper/sky gradient only.
            paper, sky = (250, 243, 227), (227, 234, 239)
            canvas = Image.new('RGB', (width, 600))
            pixels = canvas.load()
            for y in range(600):
                for x in range(width):
                    blend = max(0, min(1, (x - (width - 1000)) / 500)) * (1 - y / 600) * .65
                    pixels[x, y] = tuple(round(paper[c] * (1-blend) + sky[c] * blend) for c in range(3))
        mask = Image.new('L', (600, 600), 255)
        mask.paste(Image.frombytes('L', (100, 1), bytes(round(255*x/100) for x in range(100))).resize((100, 600)), (0, 0))
        canvas.paste(image, (width-600, 0), mask)
        canvas.save(root / f'{name}-{variant}.webp', 'WEBP', quality=85, method=6)
