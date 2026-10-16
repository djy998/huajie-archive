"""人机验证 · 文科生：把 20 个令字用 Noto Serif SC（网站自带字体，OFL）画成 64×64 的灰度字模，拼成一张竖条 PNG，输出 base64，贴进 Worker 的 POEM_GLYPHS（顺序同 POEM_KEYWORDS）。
需要 pip install fonttools brotli pillow。
用法：python make_poem_glyphs.py <字体目录> <输出预览.png>"""
import base64, io, os, sys, tempfile
from fontTools.ttLib import TTFont
from PIL import Image, ImageDraw, ImageFont

KEYS = "春花月风山水云雨天人日江夜秋白红明雪千心"
CELL = 64
font_dir, preview = sys.argv[1], sys.argv[2]

# 找出每个字在哪一片 woff2 里，转成 ttf 给 PIL 用
paths = {}
for f in sorted(os.listdir(font_dir)):
    if not f.endswith(".woff2"):
        continue
    font = TTFont(os.path.join(font_dir, f))
    cmap = font.getBestCmap()
    hit = [c for c in KEYS if ord(c) in cmap and c not in paths]
    if not hit:
        continue
    tmp = os.path.join(tempfile.gettempdir(), "hjglyph_" + f.replace(".woff2", ".ttf"))
    font.flavor = None
    font.save(tmp)
    for c in hit:
        paths[c] = tmp
missing = [c for c in KEYS if c not in paths]
assert not missing, missing

sheet = Image.new("L", (CELL, CELL * len(KEYS)), 0)
for i, c in enumerate(KEYS):
    font = ImageFont.truetype(paths[c], 54)
    tile = Image.new("L", (CELL, CELL), 0)
    d = ImageDraw.Draw(tile)
    l, t, r, b = d.textbbox((0, 0), c, font=font, stroke_width=2)
    d.text(((CELL - (r - l)) / 2 - l, (CELL - (b - t)) / 2 - t), c, font=font, fill=255, stroke_width=2, stroke_fill=255)
    sheet.paste(tile, (0, i * CELL))

buf = io.BytesIO()
sheet.save(buf, "PNG", optimize=True)
data = buf.getvalue()
sheet.save(preview)
print(len(data), "bytes")
print(base64.b64encode(data).decode())
