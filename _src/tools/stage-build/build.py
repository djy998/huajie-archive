"""花街舞台演奏 · 曲目生成器
读取 songs.py 里扒好的旋律 + 和声，产出：
  · assets/bard/stage/songs.json   曲库与谱面（音游用，时间为秒）
  · assets/bard/stage/<id>.perf.mp3 演奏轨（主旋律）
  · assets/bard/stage/<id>.acc.mp3  伴奏轨（自动播放的那条）
  · assets/bard/stage/midi/<id>.mid   扒谱成果（可导入 DAW / Synthesia 对照）

用法：python3 build.py [--songs a,b] [--midi] [--bitrate 64k] [--only-json]
  --only-json  只重写 songs.json（不渲染音频、不写 MIDI，几秒钟）
"""
import argparse
import json
import os
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import arrange
import render
import voices
from theory import parse_harmony, parse_melody

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.environ.get("HJ_REPO") or os.path.abspath(os.path.join(HERE, "..", "..", ".."))
ASSET_DIR = os.path.join(REPO, "assets", "bard", "stage")
MIDI_DIR = os.path.join(ASSET_DIR, "midi")

ACC_GAINS = {"chord": 0.85, "bass": 1.05, "pad": 0.75, "p": 0.8}
DEFAULT_ACC = {"chord": "lute", "bass": "bass", "pad": "strings"}


def apply_instruments(ev, mapping):
    """把抽象声部（chord/bass/pad/mel）换成具体音色名"""
    return [(t, d, m, (mapping.get(v, v) if v != "p" else "p"), g) for (t, d, m, v, g) in ev]


def expand(song):
    """旋律 / 和声的重复段：repeat: n 或 repeat: [[n, 升调半音], ...]"""
    mel, total = parse_melody(song["mel"])
    base = list(mel)
    reps = song.get("repeat")
    if isinstance(reps, int):
        reps = [[reps, 0]]
    for item in reps or []:
        n, transpose = item if isinstance(item, list) else (item, 0)
        for k in range(1, n):
            mel += [(round(t + total * k, 6), d, [p + transpose for p in ps]) for (t, d, ps) in base]
        total = float(total * n)
    return mel, total


def melody_events(mel, lead_beats):
    """主旋律事件（演奏轨）：双音时高音更响"""
    ev = []
    for (t, d, ps) in mel:
        top = max(ps)
        for p in ps:
            ev.append((t + lead_beats, d, p, "mel", 1.0 if p == top else 0.7))
    return ev


def accompaniment_events(song, harmony, total, lead_beats):
    pat = arrange.PATTERNS[song["style"]]
    ev = [(t + lead_beats, d, m, v, g) for (t, d, m, v, g) in pat(harmony, song["bpb"], total)]
    perc = arrange.percussion(song.get("perc", "none"), harmony, song["bpb"], total, song.get("perc_flags"))
    ev += [(t + lead_beats, 0, m, "p", g) for (t, d, m, v, g) in perc]
    if song.get("final_chord") is not None:
        root = song["final_chord"]
        for m in (root, root + 7, root + 12, root + 16):
            ev.append((total + lead_beats, 3.5, m, "chord", 0.85))
    return ev


def chart_notes(tempo, mel, lead, opts):
    """三个难度的谱面（秒）：easy 稀 / normal 旋律原样 / hard 加和弦音与长音细分"""
    spb = lambda t: round(tempo.sec(t + lead), 3)
    out = {}
    for dens in ("easy", "normal", "hard"):
        min_gap = {"easy": 1.15, "normal": 0.4, "hard": 0.16}[dens]
        notes = []
        for (t, d, ps) in mel:
            pitches = [max(ps)] if dens != "hard" else sorted(set(ps), reverse=True)
            subs = [0.0]
            if dens == "hard" and d >= 3.0:
                n = int(min(4, max(2, round(d / 1.5))))
                subs = [k * (d / n) for k in range(n)]
            elif dens == "hard" and d >= 2.0:
                subs = [0.0, d / 2]
            for off in subs:
                for p in pitches:
                    tt = t + off
                    if notes:
                        dt = tt - notes[-1][0]
                        if dens == "hard":
                            if dt < -1e-9 or (abs(dt) < 1e-9 and p == notes[-1][1]):
                                continue
                        elif dt < min_gap - 1e-6:
                            continue
                    notes.append((tt, p))
        out[dens] = [[spb(t), m] for (t, m) in notes]
    return out



def normalize_harmony(song, bars):
    """校验和声文本：每个 token 必须是可解析的和弦；小节数补齐/截断到旋律长度"""
    from theory import parse_chord
    parts = [b.strip() for b in song["har"].split("|") if b.strip()]
    if not parts:
        raise ValueError(f"{song['id']}: 和声为空")
    for i, b in enumerate(parts):
        for tok in [t.strip() for t in b.split(",")]:
            if parse_chord(tok) is None:
                raise ValueError(f"{song['id']}: 第 {i + 1} 小节非法和弦 {tok!r}")
    if len(parts) < bars:
        print(f"  · {song['id']}: 和声只有 {len(parts)} 小节（旋律 {bars}），重复末小节补齐")
        parts += [parts[-1]] * (bars - len(parts))
    elif len(parts) > bars:
        print(f"  · {song['id']}: 和声 {len(parts)} 小节 > 旋律 {bars}，截断")
        parts = parts[:bars]
    return " | ".join(parts)


def build_song(song, args):
    bpb = song["bpb"]
    mel, total = expand(song)
    lead = float(song.get("lead", 4))          # 开场空拍：给第一个气泡留出漂移时间
    bars = int(np.ceil(total / bpb))
    harmony = parse_harmony(normalize_harmony(song, bars + 1), bars + 1, bpb)
    tempo = render.Tempo(song["bpm"])

    vmap = dict(DEFAULT_ACC)
    vmap.update(song.get("acc") or {})
    vmap["mel"] = song.get("mel_inst", "piano")
    mel_ev = apply_instruments(melody_events(mel, lead), vmap)
    acc_ev = apply_instruments(accompaniment_events(song, harmony, total, lead), vmap)
    end_sec = tempo.sec(total + lead + 4.0) + 1.5

    inst = song.get("mel_inst", "piano")
    n = int(end_sec * render.SR)
    dur = n / render.SR
    if not args.only_json:
        voices.CACHE.clear()
        perf = render.render_events(mel_ev, tempo, gains={"mel": 1.0}, reverb=song.get("reverb", 0.3))
        voices.CACHE.clear()
        acc = render.render_events(acc_ev, tempo, gains=ACC_GAINS, reverb=song.get("acc_reverb", 0.26))
        perf = render.normalize(render.soft_clip(perf[:n]), 0.86)
        acc = render.normalize(render.soft_clip(acc[:n]), 0.8)

    entry = {
        "id": song["id"], "t": song["t"], "o": song.get("o", ""), "c": song.get("c", ""),
        "note": song.get("note", ""), "bpb": bpb, "bars": bars, "dur": round(dur, 2),
        "lead": round(tempo.sec(lead), 2),
        "tempo": [[round(b, 3), bpm] for (b, bpm) in
                  (song["bpm"] if isinstance(song["bpm"], list) else [(0, song["bpm"])])],
        "acc": "%s.acc.mp3" % song["id"], "perf": "%s.perf.mp3" % song["id"],
        "inst": inst, "style": song["style"], "diff": song.get("diff", 2), "tag": song.get("tag", ""),
    }
    allp = [p for (t, d, ps) in mel for p in ps]
    entry["range"] = [min(allp), max(allp)]
    entry["notes"] = chart_notes(tempo, mel, lead, {})
    # 完整旋律（秒，双音逐个列出）：谱面里删掉的音由游戏用轻音补上，示范轨没加载上时也靠它保底
    entry["mel"] = [[round(tempo.sec(t + lead), 3), p] for (t, d, ps) in mel for p in sorted(set(ps), reverse=True)]
    if args.audio != "skip" and not args.only_json:
        os.makedirs(args.out or ASSET_DIR, exist_ok=True)
        render.write_mp3(os.path.join(args.out or ASSET_DIR, entry["acc"]), acc, bitrate=args.bitrate)
        render.write_mp3(os.path.join(args.out or ASSET_DIR, entry["perf"]), perf, bitrate=args.perf_bitrate)
    if args.midi and not args.only_json:
        os.makedirs(MIDI_DIR, exist_ok=True)
        render.write_midi(os.path.join(MIDI_DIR, song["id"] + ".mid"), mel_ev, acc_ev, tempo,
                          program_mel={"piano": 0, "lute": 19, "harp": 46, "musicbox": 10,
                                       "flute": 73, "organ": 19, "strings": 48}.get(inst, 0),
                          title="%s (%s)" % (song.get("o") or song["t"], song.get("c", "")))
    print("  %-20s %5.1fs 小节%3d 音数 %3d/%3d/%3d 音域%3d-%3d" % (
        song["id"], dur, bars, len(entry["notes"]["easy"]), len(entry["notes"]["normal"]),
        len(entry["notes"]["hard"]), min(allp), max(allp)))
    return entry


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--songs", default="")
    ap.add_argument("--out", default="")
    ap.add_argument("--bitrate", default="72k")
    ap.add_argument("--perf-bitrate", default="56k")
    ap.add_argument("--midi", action="store_true")
    ap.add_argument("--only-json", action="store_true")
    ap.add_argument("--audio", default="")
    ap.add_argument("--list", action="store_true")
    args = ap.parse_args()

    import songs as LIB
    want = [s for s in args.songs.split(",") if s.strip()]
    lib = [s for s in LIB.SONGS if not want or s["id"] in want]
    if args.list:
        for s in LIB.SONGS:
            print(s["id"], "|", s["t"], "|", s.get("c", ""))
        return
    entries = []
    for s in lib:
        try:
            entries.append(build_song(s, args))
        except Exception as e:
            print("!! %s 失败: %r" % (s["id"], e))
            raise
    if not want:
        path = os.path.join(args.out or ASSET_DIR, "songs.json")
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, "w", encoding="utf-8") as f:
            json.dump({"v": 1, "songs": entries}, f, ensure_ascii=False, separators=(",", ":"))
        print("songs.json ->", path)


if __name__ == "__main__":
    main()
