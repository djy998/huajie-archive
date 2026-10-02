"""生成标题毛笔字子集 assets/site/brush.woff2（马善政 Ma Shan Zheng，SIL OFL 1.1）。标题出现新字时运行。
用法（_src 目录）：pip install fonttools brotli && python tools/make-brush-font.py
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
    html = (SRC / "index.html").read_text(encoding="utf-8")
    cfg = (SRC / "config.js").read_text(encoding="utf-8")
    js = "".join((SRC / f).read_text(encoding="utf-8")
                 for f in ["main.js", "ticket.js", "venue.js", "survey.js", "admin.js", "verify.js", "puzzle.js"])
    parts = []
    parts += re.findall(r"<h[1-3][^>]*>(.*?)</h[1-3]>", html + js, re.S)
    parts += re.findall(r'class="[^"]*(?:section-title|info-title|about-thanks|about-done-title|guide-sign|tab-sec-title)[^"]*"[^>]*>(.*?)<', html, re.S)
    parts += re.findall(r'title:\s*"([^"]*)"', cfg)
    parts += re.findall(r"titles:\s*\{([^}]*)\}", cfg)
    parts += re.findall(r'TICKET_TITLE\s*=\s*"([^"]*)"', cfg)
    survey = (SRC / "survey.js").read_text(encoding="utf-8")
    parts += re.findall(r'^\s*title:\s*"([^"]*)"', survey, re.M)
    parts += re.findall(r'SURVEY_SECTION_NO\s*=\s*(\[[^\]]*\])', survey)
    parts += re.findall(r'CONTEST_DEFAULT_TITLE\s*=\s*"([^"]*)"', js)   # 大赛标题（毛笔字）的默认名称
    return sorted(set(ch for ch in "".join(parts) if ord(ch) > 0x2E7F))


def main():
    if not CACHE.exists():
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
