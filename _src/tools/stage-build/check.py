"""曲库体检：解析旋律/和声、检查音域、小节数、音色、时长"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from songs import SONGS
from theory import parse_melody, parse_harmony, parse_chord, midi_to_name
import arrange, voices
from build import normalize_harmony

bad = 0
seen = set()
for s in SONGS:
    sid = s["id"]
    if sid in seen:
        print("重复 id:", sid); bad += 1
    seen.add(sid)
    for k in ("id", "t", "o", "c", "note", "bpm", "bpb", "style", "diff", "tag", "mel_inst", "mel", "har"):
        if k not in s:
            print(f"{sid}: 缺字段 {k}"); bad += 1
    if s["style"] not in arrange.PATTERNS:
        print(f"{sid}: 未知织体 {s['style']}"); bad += 1
    if s.get("perc", "none") not in ("none", "kick", "snare", "roll", "hat", "cymbal", "tamb"):
        ok = s.get("perc", "none") in ("march", "waltz", "pop", "ostinato", "soft", "fanfare")
        if not ok:
            print(f"{sid}: 未知鼓型 {s.get('perc')}"); bad += 1
    for v in [s.get("mel_inst")] + list((s.get("acc") or {}).values()):
        if v and v not in voices.TUNED and v not in voices.ALIAS:
            print(f"{sid}: 未知音色 {v}"); bad += 1
    try:
        mel, total = parse_melody(s["mel"])
    except Exception as e:
        print(f"{sid}: 旋律解析失败 {e}"); bad += 1; continue
    if not mel:
        print(f"{sid}: 旋律为空"); bad += 1; continue
    pitches = [p for (_, _, ps) in mel for p in ps]
    if any(p < 36 or p > 100 for p in pitches):
        print(f"{sid}: 音域越界 {min(pitches)}-{max(pitches)}"); bad += 1
    bars = int(-(-total // s["bpb"]))
    try:
        hb = len(normalize_harmony(s, bars + 1).split("|"))
    except Exception as e:
        print(f"{sid}: 和声校验失败 {e}"); bad += 1; continue
    bpm = s["bpm"]
    if isinstance(bpm, list):
        for pair in bpm:
            int(pair[0])
            if not (40 <= pair[1] <= 240):
                print(f"{sid}: bpm 异常 {pair}"); bad += 1
    elif not (40 <= bpm <= 240):
        print(f"{sid}: bpm 异常 {bpm}"); bad += 1
    secs = total / bpm_first if (bpm_first := (bpm[0][1] if isinstance(bpm, list) else bpm)) / 60 else 0
    n_notes = len(mel)
    print(f"{sid:22s} {s['t']:14s} {bars:3d}小节 {n_notes:4d}音 {min(pitches):3d}-{max(pitches):3d} "
          f"{midi_to_name(min(pitches)):4s}-{midi_to_name(max(pitches)):4s} {secs:5.0f}s "
          f"{'/'.join(str(len(set(x[1] if isinstance(x, tuple) else x))) for x in [])}")
print(f"\n曲目数 {len(SONGS)}，问题 {bad}")
