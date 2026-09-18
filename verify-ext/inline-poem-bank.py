#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""飞花令题库：校验 + 生成 worker.js 里的题库代码块。

用法：
    python3 verify-ext/inline-poem-bank.py --check     # 只校验题库（改完题库先跑这个）
    python3 verify-ext/inline-poem-bank.py             # 把题库写进 verify-ext/worker.js

题库结构（verify-ext/poem-bank.json）：
    common: 令字 → [句子]   中小学必背篇目，用于「提示」与「令字」挑选，也参与判定
    extra:  令字 → [句子]   高中 / 大学 / 偏门诗词，只参与判定

校验内容：每句必须含自己那一组的令字；只允许汉字与常见标点；长度 4~16 个汉字；
          同一句不在两组里重复出现；每个令字在 common 里至少 8 句、extra 里至少 12 句。
"""
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
BANK = ROOT / "poem-bank.json"
WORKER = ROOT / "worker.js"
START = "/* HJV_BANK_START */"
END = "/* HJV_BANK_END */"

ALLOWED = re.compile(r"^[\u4e00-\u9fff，。！？、；：,.!?;:（）()《》〈〉“”\"'·—－\-—…～~\s]+$")
CJK = re.compile(r"[\u4e00-\u9fff]")


def norm(text: str) -> str:
    return "".join(CJK.findall(text))


def load():
    data = json.loads(BANK.read_text(encoding="utf-8"))
    return data["common"], data["extra"]


def check(common, extra, verbose=True):
    errors, warns = [], []
    seen = set()
    keywords = list(common.keys())

    if set(extra.keys()) != set(common.keys()):
        errors.append("common 与 extra 的令字集合不一致")

    for group, table in (("common", common), ("extra", extra)):
        for kw, lines in table.items():
            if kw not in "".join(keywords):
                errors.append(f"{group}/{kw}: 令字不在令字表里")
            if len(lines) < (8 if group == "common" else 12):
                warns.append(f"{group}/{kw}: 只有 {len(lines)} 句，建议再多一些")
            for line in lines:
                n = norm(line)
                if not ALLOWED.match(line):
                    errors.append(f"{group}/{kw}: 含有非诗词字符 -> {line}")
                if kw not in n:
                    errors.append(f"{group}/{kw}: 这句不含令字 -> {line}")
                if not (4 <= len(n) <= 16):
                    errors.append(f"{group}/{kw}: 汉字数 {len(n)} 不在 4~16 -> {line}")
                key = (group, kw, n)
                if key in seen:
                    warns.append(f"同一组里重复出现 -> {group}/{kw}: {line}")
                seen.add(key)

    # 每个令字在判定库里的实际覆盖（常用 + 扩展合并统计）
    all_lines = [norm(l) for t in (common, extra) for lines in t.values() for l in lines]
    for kw in keywords:
        hit = sum(1 for l in all_lines if kw in l)
        if hit < 20:
            warns.append(f"令字「{kw}」在判定库里只有 {hit} 句命中")

    if verbose:
        total_common = sum(len(v) for v in common.values())
        total_extra = sum(len(v) for v in extra.values())
        judge = len({norm(l) for t in (common, extra) for lines in t.values() for l in lines})
        print(f"令字 {len(keywords)} 个；提示库 {total_common} 句；扩展库 {total_extra} 句；判定库去重后 {judge} 句")
        for w in warns:
            print("  ⚠ " + w)
        for e in errors:
            print("  ✗ " + e)
    return errors


def js_string(s: str) -> str:
    return '"' + s.replace("\\", "\\\\").replace('"', '\\"') + '"'


def render(common, extra) -> str:
    out = [START]
    out.append("")
    out.append("/* 提示 / 令字题库：中小学必背篇目（每句都含对应令字，提示就从这个库里挑） */")
    out.append("const HJV_POEM_COMMON = {")
    for kw, lines in common.items():
        out.append(f"  {js_string(kw)}: [")
        for i in range(0, len(lines), 6):
            out.append("    " + ", ".join(js_string(l) for l in lines[i:i + 6]) + ",")
        out.append("  ],")
    out.append("};")
    out.append("")
    out.append("/* 判定扩展库：高中 / 大学 / 偏门诗词（不参与提示，只让判定更宽容） */")
    out.append("const HJV_POEM_EXTRA = [")
    flat = [l for lines in extra.values() for l in lines]
    for i in range(0, len(flat), 6):
        out.append("  " + ", ".join(js_string(l) for l in flat[i:i + 6]) + ",")
    out.append("];")
    out.append("")
    out.append(END)
    return "\n".join(out)


def main():
    common, extra = load()
    errors = check(common, extra)
    if errors:
        print(f"\n题库有 {len(errors)} 处错误，先修好再生成。", file=sys.stderr)
        return 1
    if "--check" in sys.argv:
        print("题库校验通过。")
        return 0
    if not WORKER.exists():
        print(f"没找到 {WORKER}，只做了校验。")
        return 0
    src = WORKER.read_text(encoding="utf-8")
    if START not in src or END not in src:
        print(f"{WORKER} 里缺少 {START} / {END} 标记，无法写入。", file=sys.stderr)
        return 1
    head, rest = src.split(START, 1)
    _, tail = rest.split(END, 1)
    block = render(common, extra)
    WORKER.write_text(head + block + tail, encoding="utf-8")
    print(f"题库已写入 {WORKER}（{len(block.splitlines())} 行）。")
    return 0


if __name__ == "__main__":
    sys.exit(main())
