"""生成缩略图 resized/720、resized/1280 与竖屏天空 sky-*-p.webp，档位按 config.js 中的写法判断。
用法（_src 目录）：pip install pillow && python tools/make-thumbs.py [--force]
"""
import re
import sys
from pathlib import Path

from PIL import Image, ImageOps

SRC = Path(__file__).resolve().parent.parent
ROOT = SRC.parent
OUT = ROOT / "resized"

TIERS = {720: 74, 1280: 80}   # 宽度 → WebP 质量
GALLERY_DIRS = ["infogal"]
SKIES = ["assets/site/sky-day.webp", "assets/site/sky-night.webp"]
SKY_PORTRAIT_WIDTH = 1200
SKY_QUALITY = 86
WEBP_MAX_SIDE = 16383
IMG_RE = r"[^\"'?#\s]+\.(?:webp|jpe?g|png)"


def config_images():
    """{ 相对路径: {档位} }"""
    text = (SRC / "config.js").read_text(encoding="utf-8")
    text = re.sub(r"/\*.*?\*/", "", text, flags=re.S)
    text = re.sub(r"^\s*//.*$", "", text, flags=re.M)
    text = re.sub(r"\bfull:\s*\"[^\"]*\"", "", text)
    want = {}

    def add(path, tiers):
        if path.startswith(("assets/site/", "http:", "https:", "/")):
            return
        want.setdefault(path, set()).update(tiers)

    for m in re.finditer(r"\bcover:\s*\"(" + IMG_RE + r")", text, re.I):
        add(m.group(1), {720, 1280})
    for m in re.finditer(r"\bimage:\s*\"(" + IMG_RE + r")", text, re.I):
        add(m.group(1), {720})
    for m in re.finditer(r"\"(" + IMG_RE + r")(?:\?[^\"]*)?\"", text, re.I):
        path = m.group(1)
        if path not in want:
            add(path, {1280})
    for d in GALLERY_DIRS:
        for f in sorted((ROOT / d).glob("*")):
            if f.suffix.lower() in (".webp", ".jpg", ".jpeg", ".png"):
                add(f.relative_to(ROOT).as_posix(), {720})
    return want


def load(path):
    im = Image.open(path)
    im = ImageOps.exif_transpose(im)
    if im.mode in ("LA", "PA") or (im.mode == "P" and "transparency" in im.info):
        im = im.convert("RGBA")
    elif im.mode not in ("RGB", "RGBA"):
        im = im.convert("RGB")
    return im


def fit(im, max_w):
    w, h = im.size
    scale = min(1.0, max_w / w, WEBP_MAX_SIDE / h)
    if scale < 1:
        im = im.resize((max(1, round(w * scale)), max(1, round(h * scale))), Image.LANCZOS)
    return im


def fresh(src, dst, force):
    return not force and dst.exists() and dst.stat().st_mtime >= src.stat().st_mtime


def main():
    force = "--force" in sys.argv
    made = skipped = 0
    missing = []
    for rel, tiers in sorted(config_images().items()):
        src = ROOT / rel
        if not src.exists():
            missing.append(rel)
            continue
        im = None
        for width in sorted(tiers):
            dst = OUT / str(width) / Path(rel).with_suffix(".webp")
            if fresh(src, dst, force):
                skipped += 1
                continue
            im = im or load(src)
            dst.parent.mkdir(parents=True, exist_ok=True)
            fit(im, width).save(dst, "WEBP", quality=TIERS[width], method=6)
            made += 1
            print(f"{dst.relative_to(ROOT)}  {src.stat().st_size // 1024} KB → {dst.stat().st_size // 1024} KB")

    for rel in SKIES:
        src = ROOT / rel
        dst = src.with_name(src.stem + "-p.webp")
        if not src.exists() or fresh(src, dst, force):
            continue
        im = load(src)
        w, h = im.size
        if w > SKY_PORTRAIT_WIDTH:
            left = (w - SKY_PORTRAIT_WIDTH) // 2
            im = im.crop((left, 0, left + SKY_PORTRAIT_WIDTH, h))
        im.save(dst, "WEBP", quality=SKY_QUALITY, method=6)
        made += 1
        print(f"{dst.relative_to(ROOT)}  {src.stat().st_size // 1024} KB → {dst.stat().st_size // 1024} KB")

    print(f"生成 {made} 张，跳过 {skipped} 张（已是最新）")
    for rel in missing:
        print(f"找不到 config.js 里写的图片：{rel}")


if __name__ == "__main__":
    main()
