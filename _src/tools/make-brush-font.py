"""生成标题毛笔字（马善政 Ma Shan Zheng，SIL OFL 1.1）的两个子集，并改写 style.css 里的 @font-face。
- assets/site/brush.woff2：现有标题用到的字 + 半角字符与常用标点，开屏时预加载，必须小；
- assets/site/brush-ext-<n>.woff2：常用字（花语字频表前 COMMON_COUNT 字里字体有的）+ 站内常用词，
  按字频切成每份 SLICE 字，靠 unicode-range 按需下载：标题里用到哪份的字才取哪份，平时不占流量。
标题用了两个文件都没有的字时才需要重新运行。
用法（_src 目录）：pip install fonttools brotli && python tools/make-brush-font.py
"""
import json
import re
import urllib.request
from pathlib import Path

from fontTools import subset
from fontTools.ttLib import TTFont

SRC = Path(__file__).resolve().parent.parent
SITE = SRC.parent / "assets" / "site"
CORE_OUT = SITE / "brush.woff2"
EXT_NAME = "brush-ext-{}.woff2"
CSS = SRC / "style.css"
FONT_URL = "https://raw.githubusercontent.com/google/fonts/main/ofl/mashanzheng/MaShanZheng-Regular.ttf"
CACHE = SRC / "tools" / "MaShanZheng-Regular.ttf"
COMMON_COUNT = 3500   # 字频表前多少字放进扩展字库（马善政大约收了其中 2950 字）
SLICE = 250           # 扩展字库每份字数（约 100 KB）
SITE_WORDS = (        # 站内与游戏里常见、字频表靠后的字
    "花舞之街薰风花语町莫古力梦羽宝境高脚孤丘艾欧泽亚星芒节守护天节新年降神节恋人节红莲祭金碟祭"
    "光之战士陆行鸟拉拉菲尔猫魅族敖龙族鲁加族维埃拉族硌狮族精灵族人族迷宫演奏占卜舞团话剧游街烟花灯笼"
    "鱼信鱼丽光风院霁月拼图大赛限时休闲通关恭喜暂停继续游玩方法网格提示原图边框"
)
BASIC = [*range(0x20, 0x7F), 0xB7, 0x2014, *range(0x2018, 0x201E), 0x2026,
         0x3001, 0x3002, *range(0x300A, 0x3010), *range(0xFF01, 0xFF20)]


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
    return set(ch for ch in "".join(parts) if ord(ch) > 0x2E7F)


def unicode_range(codes):
    """码位 → CSS unicode-range（连续的合并成区间）"""
    codes = sorted(set(codes))
    out, i = [], 0
    while i < len(codes):
        j = i
        while j + 1 < len(codes) and codes[j + 1] == codes[j] + 1:
            j += 1
        out.append(f"U+{codes[i]:x}" if i == j else f"U+{codes[i]:x}-{codes[j]:x}")
        i = j + 1
    return ",".join(out)


def make_subset(codes, out):
    opts = subset.Options()
    opts.flavor = "woff2"
    opts.layout_features = ["*"]
    opts.hinting = False
    opts.desubroutinize = True
    font = subset.load_font(str(CACHE), opts)
    sub = subset.Subsetter(opts)
    sub.populate(unicodes=sorted(codes))
    sub.subset(font)
    subset.save_font(font, str(out), opts)


def face(file, codes):
    return ('@font-face {\n  font-family: "HJ Brush";\n'
            f'  src: url("assets/site/{file}") format("woff2");\n'
            f"  font-display: swap;\n  unicode-range: {unicode_range(codes)};\n}}\n")


def write_css(core, slices):
    block = ("/* @@BRUSH_FACES@@ 由 tools/make-brush-font.py 生成：标题字子集（开屏预加载）+ 常用字扩展（用到哪份才下载哪份） */\n"
             + face("brush.woff2", core)
             + "".join(face(EXT_NAME.format(i + 1), codes) for i, codes in enumerate(slices))
             + "/* @@BRUSH_FACES_END@@ */")
    css = CSS.read_text(encoding="utf-8")
    marked = re.compile(r"/\* @@BRUSH_FACES@@.*?@@BRUSH_FACES_END@@ \*/", re.S)
    plain = re.compile(r'@font-face \{\s*font-family: "HJ Brush";[^}]*\}')   # 第一次运行：替换原来的单个 @font-face
    if marked.search(css):
        css = marked.sub(lambda _: block, css, count=1)
    elif plain.search(css):
        css = plain.sub(lambda _: block, css, count=1)
    else:
        raise SystemExit("style.css 里找不到 HJ Brush 的 @font-face")
    CSS.write_text(css, encoding="utf-8")


def main():
    if not CACHE.exists():
        urllib.request.urlretrieve(FONT_URL, CACHE)
    cmap = TTFont(str(CACHE)).getBestCmap()
    han = json.loads((SRC / "huayu" / "zi-data.json").read_text(encoding="utf-8"))["han"]
    core = {ord(c) for c in heading_chars()} | set(BASIC)
    core = {c for c in core if c in cmap}
    ext = []   # 按字频排序，去重
    for ch in han[:COMMON_COUNT] + SITE_WORDS:
        c = ord(ch)
        if c in cmap and c not in core and c not in ext:
            ext.append(c)
    slices = [ext[i:i + SLICE] for i in range(0, len(ext), SLICE)]
    for old in SITE.glob("brush-ext*.woff2"):
        old.unlink()
    make_subset(core, CORE_OUT)
    for i, codes in enumerate(slices):
        make_subset(codes, SITE / EXT_NAME.format(i + 1))
    write_css(core, slices)
    missing = sorted(c for c in heading_chars() if ord(c) not in cmap)
    print(f"标题字 {len(core - set(BASIC))} 个 → {CORE_OUT.name}（{CORE_OUT.stat().st_size // 1024} KB）")
    sizes = [(SITE / EXT_NAME.format(i + 1)).stat().st_size // 1024 for i in range(len(slices))]
    print(f"常用字 {len(ext)} 个 → {len(slices)} 份 brush-ext-*.woff2（每份 {min(sizes)}–{max(sizes)} KB，用到哪份才下载哪份）")
    if missing:
        print("字体里没有的标题字（会退回其他字体）：", "".join(missing))


if __name__ == "__main__":
    main()
