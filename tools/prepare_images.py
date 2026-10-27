# Обрезает пустые поля у картинок и определяет их вид: cutout (без фона), white (на белом фоне), photo (фото с фоном).
# Нужен Pillow (pip install pillow). Запуск: python tools/prepare_images.py папка-с-исходниками static/img image_kinds.json
# Брать исходники, а не уже обработанные картинки: иначе поля добавятся ещё раз
import json, os, sys
from PIL import Image, ImageChops
SRC, DST, OUT = sys.argv[1], sys.argv[2], sys.argv[3]
SKIP = {"wallpaper-light.webp", "wallpaper-dark.webp", "favicon.png"}
kinds = json.load(open(OUT)) if os.path.exists(OUT) else {}
def pad(im, frac, fill):
    w, h = im.size; p = int(max(w, h) * frac)
    c = Image.new(im.mode, (w + 2 * p, h + 2 * p), fill); c.paste(im, (p, p)); return c
for name in sorted(os.listdir(SRC)):
    if name in SKIP or not name.endswith(".webp"): continue
    im = Image.open(os.path.join(SRC, name)); im.load()
    kind = "photo"
    if im.mode in ("RGBA", "LA", "P"):
        im = im.convert("RGBA")
        a = im.getchannel("A")
        corners = [a.getpixel(p) for p in [(0, 0), (im.width - 1, 0), (0, im.height - 1), (im.width - 1, im.height - 1)]]
        if min(a.getextrema()) < 20 and sum(c < 20 for c in corners) >= 2:
            box = a.point(lambda v: 255 if v > 12 else 0).getbbox()
            if box: im = pad(im.crop(box), 0.04, (0, 0, 0, 0))
            kind = "cutout"
        else:
            im = im.convert("RGB")
    if kind == "photo":
        rgb = im.convert("RGB")
        corners = [rgb.getpixel(p) for p in [(0, 0), (rgb.width - 1, 0), (0, rgb.height - 1), (rgb.width - 1, rgb.height - 1)]]
        spread = max(max(c[i] for c in corners) - min(c[i] for c in corners) for i in range(3))
        light = min(sum(c) / 3 for c in corners) > 228
        if spread < 18 and light:
            bg = Image.new("RGB", rgb.size, tuple(sum(c[i] for c in corners) // 4 for i in range(3)))
            diff = ImageChops.difference(rgb, bg).convert("L").point(lambda v: 255 if v > 28 else 0)
            box = diff.getbbox()
            if box: rgb = pad(rgb.crop(box), 0.06, bg.getpixel((0, 0)))
            kind = "white"
        im = rgb
    im.save(os.path.join(DST, name), quality=88)
    kinds["img/" + name] = kind
json.dump(kinds, open(OUT, "w"), indent=0, sort_keys=True)
from collections import Counter; print(Counter(kinds.values()))
