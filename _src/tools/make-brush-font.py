"""重新生成标题用的毛笔字 assets/site/brush.woff2（马善政 Ma Shan Zheng，SIL OFL 1.1 授权，可自由使用和裁剪）。
标题里出现了新字（例如新活动名）时跑一次；没跑的话新字会退回 Google 字体 / 系统字体，不影响使用。
用法（在 _src 目录）：
  pip install fonttools brotli
  python tools/make-brush-font.py
字体原件从 GitHub 下载：google/fonts 仓库 ofl/mashanzheng/MaShanZheng-Regular.ttf
"""
import re
import urllib.request
from pathlib import Path

from fontTools import subset

SRC = Path(__file__).resolve().parent.parent
OUT = SRC.parent / "assets" / "site" / "brush.woff2"
FONT_URL = "https://raw.githubusercontent.com/google/fonts/main/ofl/mashanzheng/MaShanZheng-Regular.ttf"
CACHE = SRC / "tools" / "MaShanZheng-Regular.ttf"


def heading_chars():
    """用毛笔字显示的文字：各级标题、活动名、几处落款"""
    html = (SRC / "index.html").read_text(encoding="utf-8")
    cfg = (SRC / "config.js").read_text(encoding="utf-8")
    js = "".join((SRC / f).read_text(encoding="utf-8")
                 for f in ["main.js", "ticket.js", "venue.js", "survey.js", "admin.js", "verify.js"])
    parts = []
    parts += re.findall(r"<h[1-3][^>]*>(.*?)</h[1-3]>", html + js, re.S)
    parts += re.findall(r'class="[^"]*(?:section-title|info-title|about-thanks|about-done-title|guide-sign|tab-sec-title)[^"]*"[^>]*>(.*?)<', html, re.S)
    parts += re.findall(r'title:\s*"([^"]*)"', cfg)
    parts += re.findall(r"titles:\s*\{([^}]*)\}", cfg)
    parts += re.findall(r'TICKET_TITLE\s*=\s*"([^"]*)"', cfg)
    return sorted(set(ch for ch in "".join(parts) if ord(ch) > 0x2E7F))


def main():
    if not CACHE.exists():
        print("下载字体原件…")
        urllib.request.urlretrieve(FONT_URL, CACHE)
    chars = heading_chars()
    opts = subset.Options()
    opts.flavor = "woff2"
    opts.layout_features = ["*"]
    opts.hinting = False
    opts.desubroutinize = True
    font = subset.load_font(str(CACHE), opts)
    sub = subset.Subsetter(opts)
    ascii_and_punct = [*range(0x20, 0x7F), 0xB7, 0x2014, *range(0x2018, 0x201E), 0x2026,
                       0x3001, 0x3002, *range(0x300A, 0x3010), *range(0xFF01, 0xFF20)]
    sub.populate(unicodes=[ord(c) for c in chars] + ascii_and_punct)
    sub.subset(font)
    subset.save_font(font, str(OUT), opts)
    print(f"{len(chars)} 个汉字 → {OUT}（{OUT.stat().st_size // 1024} KB）")


if __name__ == "__main__":
    main()
