"""花街舞台演奏 · 曲库生成器（MIDI 版）

读取 songs.py 的曲目表和 midi/<id>.mid，产出：
  · assets/bard/stage/songs.json        曲目索引（选曲窗口用：曲名、星级、时长、速度、音域…，不含谱面）
  · assets/bard/stage/charts/<id>.json  每首的音符与分级（点开这首时才下载）

charts/<id>.json：{"v": 2, "n": [[距上一个音的毫秒, MIDI 音高, 级别], ...]}，第一个音在 0 秒。
级别 3 = 轻松起就要弹，2 = 标准起，1 = 只有挑战，0 = 只由游戏补音（规则见 chart.py）。

用法：python build.py            （全部重写，几秒钟；需要 pip install mido numpy）
      python build.py --dry-run  （只打印统计，不写文件）
"""
import argparse
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import chart
from songs import DEFAULT, SONGS, TAGS

REPO = os.environ.get("HJ_REPO") or os.path.abspath(os.path.join(HERE, "..", "..", ".."))
ASSET_DIR = os.path.join(REPO, "assets", "bard", "stage")
CHART_DIR = os.path.join(ASSET_DIR, "charts")
MIDI_DIR = os.path.join(HERE, "midi")

# MIDI 轨道名 / 音色号 → 模拟器乐器（「跟随曲目」用）
TRACK_INST = {
    "piano": "piano", "harp": "harp", "lute": "lute", "electricguitar": "lute", "guitar": "lute",
    "violin": "violin", "viola": "viola", "cello": "cello", "contrabass": "bass", "doublebass": "bass",
    "flute": "flute", "fife": "fife", "oboe": "oboe", "clarinet": "clarinet", "panpipes": "panpipes",
    "trumpet": "trumpet", "trombone": "trombone", "tuba": "tuba", "horn": "horn", "sax": "sax", "saxophone": "sax",
    "churchorgan": "clarinet", "organ": "clarinet", "fiddle": "fiddle",
}
STAR_CUTS = [0.3, 0.75]                # 每档里按难度分排名切成三段：轻松 1~3 星、标准 2~4 星、挑战 3~5 星
LEVELS = (3, 2, 1)                     # 轻松 / 标准 / 挑战 在谱面里的级别（lvl ≥ 这个数的音要弹）


def guess_inst(info):
    for name in info["tracks"]:
        key = "".join(ch for ch in name.lower() if ch.isalpha())
        if key in TRACK_INST:
            return TRACK_INST[key]
    for p in info["programs"]:
        if p < 8:
            return "piano"
        if 24 <= p < 32:
            return "lute"
        gm = {40: "violin", 41: "viola", 42: "cello", 43: "bass", 45: "fiddle", 46: "harp", 56: "trumpet", 57: "trombone",
              58: "tuba", 60: "horn", 65: "sax", 68: "oboe", 71: "clarinet", 72: "fife", 73: "flute", 75: "panpipes"}
        if p in gm:
            return gm[p]
    return "piano"


def pct(vals, q):
    vals = sorted(vals)
    return vals[min(len(vals) - 1, max(0, int(round(q * (len(vals) - 1)))))]


def build_song(song):
    path = os.path.join(MIDI_DIR, song["id"] + ".mid")
    notes, info = chart.read_notes(path)
    if not notes:
        raise ValueError("MIDI 里没有音符")
    lvl, extra = chart.build_chart(notes, info, song.get("gap", 1.0))
    t0 = notes[0]["t"]
    rows, prev = [], 0
    for n, l in zip(notes, lvl):
        ms = int(round((n["t"] - t0) * 1000))
        rows.append([ms - prev, n["m"], l])
        prev = ms
    times = {L: [n["t"] - t0 for n, l in zip(notes, lvl) if l >= L] for L in (1, 2, 3)}
    played = [n["m"] for n, l in zip(notes, lvl) if l > 0]
    lo, hi = pct(played, 0.03), pct(played, 0.97)
    while hi - lo < 7:
        lo, hi = lo - 1, hi + 1 if (hi - lo) % 2 else hi
    end = max(n["end"] for n in notes) - t0
    grid = info["grid"] is not None
    bpm = chart.main_bpm(info, t0, t0 + end) if grid else round(60 / extra["beat"])
    entry = {
        "id": song["id"], "t": song["t"], "o": song.get("o", ""), "c": song.get("c", ""), "tag": song["tag"],
        "note": song.get("note", ""), "diff": 3, "diffs": [3, 3, 3], "dur": round(end, 1), "bpm": int(bpm), "est": not grid,
        "beat": round(extra["beat"], 3), "inst": song.get("inst") or guess_inst(info), "range": [lo, hi],
        "cnt": [len(times[3]), len(times[2]), len(times[1])],
    }
    # 每档各算一个难度分：平均每秒音数和最密 5 秒的每秒音数
    scores = []
    for L in LEVELS:
        avg, peak = chart.density(times[L])
        scores.append(0.6 * avg + 0.4 * peak)
    stats = {"scores": scores, "all": len(notes), "covered": extra["covered"]}
    return entry, {"v": 2, "n": rows}, stats


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    ids = [s["id"] for s in SONGS]
    if len(set(ids)) != len(ids):
        raise SystemExit("songs.py 里有重复的 id")
    if DEFAULT not in ids:
        raise SystemExit(f"songs.py 的 DEFAULT {DEFAULT!r} 不在曲目表里")
    for s in SONGS:
        if s["tag"] not in TAGS:
            raise SystemExit(f"{s['id']}: 分类 {s['tag']!r} 不在 TAGS 里")

    built = []
    for s in SONGS:
        try:
            built.append(build_song(s))
        except Exception as e:
            raise SystemExit(f"!! {s['id']} 失败：{e!r}")

    # 星级：轻松 / 标准 / 挑战每档各一个。每档在整个曲库里按这一档的难度分排名，切成三段，
    # 轻松占 1~3 星、标准 2~4 星、挑战 3~5 星（谱面按最小间隔挑音，同一档的疏密本来就接近，
    # 所有档混在一起排的话，标准档几乎全是 3 星）。轻松简单而挑战很难的曲子，两档会差到 3 星。
    # 同一首越难的档星级不低于前一档；diff 仍写标准档的星级，给旧版网页用
    for k in range(len(LEVELS)):
        order = sorted(range(len(built)), key=lambda i: built[i][2]["scores"][k])
        for rank, i in enumerate(order):
            q = rank / max(1, len(order) - 1)
            built[i][0]["diffs"][k] = 1 + k + sum(1 for c in STAR_CUTS if q >= c)
    for entry, _, _ in built:
        d = entry["diffs"]
        for k in range(1, len(d)):
            d[k] = max(d[k], d[k - 1])
        entry["diff"] = d[1]

    for entry, _, st in built:
        print("  %-24s %s %5.0fs %3d拍/分%s 轻松/标准/挑战 %4d/%4d/%4d（共 %4d）音域 %d-%d %s" % (
            entry["id"], "/".join(str(d) for d in entry["diffs"]) + "星", entry["dur"], entry["bpm"],
            "≈" if entry["est"] else " ", *entry["cnt"], st["all"], *entry["range"], entry["inst"]))
    if args.dry_run:
        return

    os.makedirs(CHART_DIR, exist_ok=True)
    keep = set()
    for entry, data, _ in built:
        name = entry["id"] + ".json"
        keep.add(name)
        with open(os.path.join(CHART_DIR, name), "w", encoding="utf-8") as f:
            json.dump(data, f, separators=(",", ":"))
    for name in os.listdir(CHART_DIR):
        if name.endswith(".json") and name not in keep:
            os.remove(os.path.join(CHART_DIR, name))
            print("  删除多余的谱面", name)
    with open(os.path.join(ASSET_DIR, "songs.json"), "w", encoding="utf-8") as f:
        json.dump({"v": 2, "first": DEFAULT, "tags": TAGS, "songs": [b[0] for b in built]}, f, ensure_ascii=False, separators=(",", ":"))
    print(f"{len(built)} 首 → {os.path.join(ASSET_DIR, 'songs.json')}、{CHART_DIR}")


if __name__ == "__main__":
    main()
