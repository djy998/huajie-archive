"""曲库体检：曲目表、MIDI 文件、生成好的 songs.json 与 charts/ 是否对得上，谱面是否合理

用法：python check.py   （先跑过 build.py；最后一行「问题 0」即可上传）
"""
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from build import ASSET_DIR, CHART_DIR, MIDI_DIR
from songs import DEFAULT, SONGS, TAGS

bad = 0
warn = 0


def problem(msg):
    global bad
    bad += 1
    print("✗", msg)


def caution(msg):
    global warn
    warn += 1
    print("·", msg)


ids = [s["id"] for s in SONGS]
for i in sorted({x for x in ids if ids.count(x) > 1}):
    problem(f"重复的 id：{i}")
if DEFAULT not in ids:
    problem(f"DEFAULT {DEFAULT!r} 不在曲目表里")
for s in SONGS:
    for k in ("id", "t", "tag"):
        if not s.get(k):
            problem(f"{s.get('id')}: 缺 {k}")
    if s.get("tag") not in TAGS:
        problem(f"{s['id']}: 分类 {s.get('tag')!r} 不在 TAGS 里")
    if not os.path.exists(os.path.join(MIDI_DIR, s["id"] + ".mid")):
        problem(f"{s['id']}: 缺 midi/{s['id']}.mid")
extra = sorted(f for f in os.listdir(MIDI_DIR) if f.endswith(".mid") and f[:-4] not in ids)
for f in extra:
    caution(f"midi/{f} 不在曲目表里（不会进曲库）")

try:
    with open(os.path.join(ASSET_DIR, "songs.json"), encoding="utf-8") as f:
        index = json.load(f)
except Exception as e:
    problem(f"songs.json 读不了：{e!r}（先跑 build.py）")
    index = {"songs": []}
built = {s["id"]: s for s in index.get("songs", [])}
if [s["id"] for s in index.get("songs", [])] != ids:
    problem("songs.json 和曲目表不一致：改过 songs.py 之后要重新跑 build.py")

for sid, entry in built.items():
    path = os.path.join(CHART_DIR, sid + ".json")
    if not os.path.exists(path):
        problem(f"{sid}: 缺 charts/{sid}.json")
        continue
    with open(path, encoding="utf-8") as f:
        rows = json.load(f).get("n", [])
    cnt = [sum(1 for r in rows if r[2] >= L) for L in (3, 2, 1)]
    if cnt != entry.get("cnt"):
        problem(f"{sid}: 谱面音数 {cnt} 和 songs.json 的 {entry.get('cnt')} 对不上")
    if any(r[0] < 0 for r in rows):
        problem(f"{sid}: 谱面时间倒退")
    if not (cnt[0] > 0 and cnt[0] <= cnt[1] <= cnt[2]):
        problem(f"{sid}: 三档音数不对 {cnt}")
    pitches = [r[1] for r in rows]
    if min(pitches) < 21 or max(pitches) > 108:
        caution(f"{sid}: 有超出钢琴音域的音 {min(pitches)}-{max(pitches)}")
    if entry["dur"] > 330:
        caution(f"{sid}: 有 {entry['dur'] / 60:.1f} 分钟长")
    if cnt[0] < 40:
        caution(f"{sid}: 轻松难度只有 {cnt[0]} 个音")
    print(f"  {sid:24s} {'★' * entry['diff']:5s} {entry['dur']:6.1f}s 轻松/标准/挑战 {cnt[0]:4d}/{cnt[1]:4d}/{cnt[2]:4d}")
stale = sorted(f for f in os.listdir(CHART_DIR) if f.endswith(".json") and f[:-5] not in built) if os.path.isdir(CHART_DIR) else []
for f in stale:
    caution(f"charts/{f} 是多余的（build.py 会自动删）")

print(f"\n曲目数 {len(SONGS)}，问题 {bad}，提醒 {warn}")
sys.exit(1 if bad else 0)
