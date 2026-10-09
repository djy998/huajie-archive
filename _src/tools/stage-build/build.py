"""花街舞台演奏 · 曲库生成器（MIDI 版）

读取 songs.py 的曲目表和 midi/<id>.mid，产出：
  · assets/bard/stage/songs.json        公开曲目（songs.py 里 show=True 的）的索引（选曲窗口用：曲名、星级、时长、速度、音域…，不含谱面）
    星级 diffs = [仙人刺, 魔界花, 泰坦]，半星为一档，0.5 ~ 5 星共 10 档（见 rate_stars）
  · assets/bard/stage/songs-all.json    全部曲目的索引：网页不直接读它，访客在选曲搜索框输对曲库密码后由 Worker 转发
  · assets/bard/stage/charts/<id>.json  每首的音符与分级（点开这首时才下载）

charts/<id>.json：{"v": 2, "n": [[距上一个音的毫秒, MIDI 音高, 级别], ...]}，第一个音在 0 秒。
级别 3 = 仙人刺起就要弹，2 = 魔界花起，1 = 只有泰坦，0 = 只由游戏补音（规则见 chart.py）。

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
STAR_STEPS = 10                        # 星级 0.5 ~ 5 星，每半星一档
LEVELS = (3, 2, 1)                     # 仙人刺 / 魔界花 / 泰坦 在谱面里的级别（lvl ≥ 这个数的音要弹）
# 三档的判定窗不同（GOOD 半窗 0.45 / 0.36 / 0.29 秒，和 bard-stage.js 的 DIFFS 一致）：同样疏密，窗越窄越难。
# 难度分乘上 √(仙人刺 GOOD 半窗 / 这一档 GOOD 半窗)
GOOD_WIN = (0.45, 0.36, 0.29)
WIN_FACTOR = tuple((GOOD_WIN[0] / w) ** 0.5 for w in GOOD_WIN)


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
    # 每档各算一个难度分：平均每秒音数和最密 5 秒的每秒音数，再按这一档的判定窗加权
    scores = []
    for k, L in enumerate(LEVELS):
        avg, peak = chart.density(times[L])
        scores.append((0.6 * avg + 0.4 * peak) * WIN_FACTOR[k])
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
    if not any(s.get("show") for s in SONGS):
        raise SystemExit("songs.py 里至少要有一首公开（show=True）的曲子，不然访客打开舞台没有曲子可选")

    built = []
    for s in SONGS:
        try:
            built.append(build_song(s))
        except Exception as e:
            raise SystemExit(f"!! {s['id']} 失败：{e!r}")

    rate_stars(built)

    for entry, _, st in built:
        print("  %-24s %s %5.0fs %3d拍/分%s 仙人刺/魔界花/泰坦 %4d/%4d/%4d（共 %4d）音域 %d-%d %s" % (
            entry["id"], star_text(entry["diffs"]), entry["dur"], entry["bpm"],
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
    entries = [b[0] for b in built]
    public = [e for e, s in zip(entries, SONGS) if s.get("show")]
    write_index("songs-all.json", DEFAULT, TAGS, entries)
    write_index("songs.json", public_first(public), [t for t in TAGS if any(e["tag"] == t for e in public)], public)
    print(f"{len(built)} 首（公开 {len(public)} 首）→ {os.path.join(ASSET_DIR, 'songs.json')}、songs-all.json、{CHART_DIR}")


def rate_stars(built):
    """星级：每首每档单独算，0.5 ~ 5 星每半星一档，共 STAR_STEPS 档。
    所有曲子的三档混在一起，按难度分（已按判定窗加权）排名，均分成 10 档：星数只看这一档谱面本身有多难，
    不看它是哪一档，所以疏的曲子的魔界花可以比密的曲子的泰坦星多，仙人刺也可以比别的曲子的泰坦星多。
    同一首三档尽量不同星：越难的档至少比前一档多半星（顶到 5 星时往下让）。diff 仍写魔界花档的星级，给旧版网页用"""
    pool = sorted((st["scores"][k], i, k) for i, (_, _, st) in enumerate(built) for k in range(len(LEVELS)))
    steps = [[STAR_STEPS] * len(LEVELS) for _ in built]
    for rank, (_, i, k) in enumerate(pool):
        steps[i][k] = min(STAR_STEPS, 1 + rank * STAR_STEPS // len(pool))
    for (entry, _, _), d in zip(built, steps):
        for k in range(1, len(d)):
            d[k] = max(d[k], d[k - 1] + 1)
        for k in range(len(d)):
            d[k] = min(d[k], STAR_STEPS - (len(d) - 1 - k))
        entry["diffs"] = [star_value(x) for x in d]
        entry["diff"] = entry["diffs"][1]


def star_value(step):
    """档位（1 ~ 10）→ 星数：整星写整数（3），半星写小数（2.5）"""
    return step // 2 if step % 2 == 0 else step / 2


def star_text(diffs):
    return "/".join(f"{d:g}" for d in diffs) + "星"


def public_first(public):
    """公开曲库第一次打开时选中的：DEFAULT 是公开的就用它，否则挑魔界花档星级最低、最短的一首"""
    if any(e["id"] == DEFAULT for e in public):
        return DEFAULT
    return min(public, key=lambda e: (e["diffs"][1], e["dur"]))["id"]


def write_index(name, first, tags, songs):
    with open(os.path.join(ASSET_DIR, name), "w", encoding="utf-8") as f:
        json.dump({"v": 2, "first": first, "tags": tags, "songs": songs}, f, ensure_ascii=False, separators=(",", ":"))


if __name__ == "__main__":
    main()
