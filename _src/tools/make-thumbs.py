"""生成网站用的缩小版图片（原图保持不动）：
  resized/720/…   缩略图：花街相册格子、往期活动封面卡片、小型回顾、跳转磁贴
  resized/1280/…  页面里直接显示的大图：活动海报 / 手册 / 回顾图、详情页横幅、视频封面
  assets/site/sky-day-p.webp、sky-night-p.webp  竖屏（手机）用的天空，从原图中间裁窄
网站先显示缩小版，点开大图时再看原图；某张图没有缩小版时网站会自动退回原图（能用，只是慢一些）。

哪些图要生成、生成哪一档，按 config.js 里的写法自动判断：
  cover: "…"（封面）              → 720 + 1280
  image: "…"（小型回顾、跳转磁贴）   → 720
  其它写在 config.js 里的图片地址     → 1280（full: 点开看的原图除外）
  infogal/ 文件夹（花街相册）        → 720
  assets/site/ 下的网站素材不处理（它们本来就是按网页尺寸做的）

加了新图片（新活动的海报、封面、相册等）后在 _src 目录跑一次：
  pip install pillow
  python tools/make-thumbs.py
已经生成过、原图也没改过的会跳过；加 --force 全部重新生成。
生成的 resized 文件夹和 sky-*-p.webp 跟网站其它文件一起上传。
"""
import re
import sys
from pathlib import Path

from PIL import Image, ImageOps

SRC = Path(__file__).resolve().parent.parent   # _src
ROOT = SRC.parent                              # 网站根目录
OUT = ROOT / "resized"

TIERS = {720: 74, 1280: 80}                    # 最大宽度 → WebP 质量
GALLERY_DIRS = ["infogal"]
SKIES = ["assets/site/sky-day.webp", "assets/site/sky-night.webp"]
SKY_PORTRAIT_WIDTH = 1200
SKY_QUALITY = 86
WEBP_MAX_SIDE = 16383
IMG_RE = r"[^\"'?#\s]+\.(?:webp|jpe?g|png)"


def config_images():
    """从 config.js 里找出图片地址和要生成的档位：{ 相对路径: {720, 1280} }"""
    text = (SRC / "config.js").read_text(encoding="utf-8")
    text = re.sub(r"/\*.*?\*/", "", text, flags=re.S)            # 去掉注释
    text = re.sub(r"^\s*//.*$", "", text, flags=re.M)
    text = re.sub(r"\bfull:\s*\"[^\"]*\"", "", text)            # 小型回顾点开看的原图，不用缩小
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
