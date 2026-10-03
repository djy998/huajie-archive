"""花街舞台演奏（音游）—— 音高/和声/谱面数据结构。

旋律 DSL（扒谱写法）：
  小节用 | 分隔；一个音 = 音名 + 八度 + :拍数（默认 1 拍）
  音名：c d e f g a b，可带 # 或 b（bb = 重降）；八度用科学音高记法（C4 = 中央 C = MIDI 60）
  双音（和弦旋律）用 + 连接：a4+c5:2
  休止：-:1（简写 -）
  例：'-:1 e5:0.5 e5:0.5 e5:1 | e5:0.5 c5:0.5 e5:1 a4:2 |'
和声 DSL：每小节若干和弦，逗号分隔，一个和弦占均分拍数
  例：'Am,Am | E7,E7 | Am,Am | Am'（4 小节 4/4，前两拍/后两拍）
  支持：根音 + 性质（m dim aug m7 7 maj7 sus2 sus4 6 m6 m9 9 11 13 add9）+ 转位 /bass
"""
import re

LETTERS = {"c": 0, "d": 2, "e": 4, "f": 5, "g": 7, "a": 9, "b": 11}
NOTE_RE = re.compile(r"^(?:([a-g])([#b]*)(-?\d))(?::(\d*\.?\d+))?$")

CHORD_QUAL = {
    "": [0, 4, 7],
    "m": [0, 3, 7],
    "+": [0, 4, 8], "aug": [0, 4, 8],
    "dim": [0, 3, 6], "o": [0, 3, 6],
    "sus2": [0, 2, 7], "sus4": [0, 5, 7],
    "6": [0, 4, 7, 9], "m6": [0, 3, 7, 9],
    "7": [0, 4, 7, 10], "maj7": [0, 4, 7, 11], "M7": [0, 4, 7, 11],
    "m7": [0, 3, 7, 10], "-7": [0, 3, 7, 10],
    "dim7": [0, 3, 6, 9], "m7b5": [0, 3, 6, 10], "ø7": [0, 3, 6, 10],
    "9": [0, 4, 7, 10, 14], "m9": [0, 3, 7, 10, 14], "maj9": [0, 4, 7, 11, 14],
    "11": [0, 4, 7, 10, 14, 17], "13": [0, 4, 7, 10, 14, 21],
    "add9": [0, 4, 7, 14], "madd9": [0, 3, 7, 14],
    "5": [0, 7],
}
CHORD_RE = re.compile(r"^([a-gA-G])([#b]*)(m?aj|dim|o|m|-|sus|aug|\+)?([\d9b5]*)?(?:/([a-g][#b]?)(\d))?$")


def parse_pitch(s):
    """'a#4' -> MIDI 号"""
    m = NOTE_RE.match(s)
    if not m:
        raise ValueError("无法解析的音: %r" % s)
    letter, acc, octv, dur = m.groups()
    midi = LETTERS[letter] + 12 * (int(octv) + 1)
    for a in acc or "":
        midi += 1 if a == "#" else -1
    return midi, float(dur if dur else 1.0)


def parse_melody(text):
    """返回 (events, total_beats)；events = [(start_beat, dur_beats, [midi, ...]), ...]"""
    events = []
    beat = 0.0
    for bar in text.split("|"):
        for tok in bar.split():
            if tok in ("|", "||", "|:"):
                continue
            specs = tok.split("+")
            first = specs[0]
            if first.startswith("-"):
                _, dur = parse_pitch("c4" + first[first.index(":"):] if ":" in first else "c4:1")
                beat += dur
                continue
            midis, dur = [], None
            for sp in specs:
                midi, d = parse_pitch(sp)
                midis.append(midi)
                dur = d if dur is None else dur
            events.append((round(beat, 6), round(dur, 6), sorted(midis)))
            beat += dur
    return events, beat


_SUFFIXES = ["m7b5", "maj7", "maj9", "add9", "madd9", "sus2", "sus4", "dim7",
             "m9", "m7", "m6", "7", "9", "11", "13", "6", "5", "maj", "dim", "aug",
             "sus", "o", "+", "M7", "-7", "m"]


def parse_chord(tok):
    """'Am7/G' -> (root_pc, [intervals...], bass_pc or None)"""
    tok = tok.strip()
    if not tok or tok == "*":
        return None
    m = re.match(r"^([a-gA-G])([#b]*)([^/]*)(?:/([a-gA-G])([#b]*))?$", tok)
    if not m:
        raise ValueError("无法解析的和弦: %r" % tok)
    letter, acc, qual, bletter, bacc = m.group(1).lower(), m.group(2), m.group(3), (m.group(4) or "").lower(), m.group(5)
    root = (LETTERS[letter] + sum(1 if a == "#" else -1 for a in acc)) % 12
    bass = None
    if bletter and bletter in LETTERS:
        bass = (LETTERS[bletter] + sum(1 if a == "#" else -1 for a in (bacc or ""))) % 12
    qual = (qual or "").strip()
    if not qual:
        ivs = CHORD_QUAL[""]
    else:
        hit = next((k for k in _SUFFIXES if qual == k), None)
        if hit is None:                      # 允许尾部带张力记号，如 G7b9 / C9#11
            hit = next((k for k in _SUFFIXES if qual.startswith(k)), None)
        if hit is None:
            raise ValueError("未知和弦性质 %r（%r）" % (qual, tok))
        if hit in ("maj", "M7"):
            hit = "maj7"
        elif hit == "sus":
            hit = "sus4"
        elif hit == "-7":
            hit = "m7"
        elif hit == "o":
            hit = "dim"
        elif hit == "+":
            hit = "aug"
        elif hit == "dim7":
            hit = "dim7"
        ivs = CHORD_QUAL[hit]
    return (root, list(ivs), bass)


def parse_harmony(text, bars, beats_per_bar):
    """-> [(start_beat, dur_beats, chord_tuple), ...]"""
    out = []
    for i, bar in enumerate([b.strip() for b in text.split("|") if b.strip()]):
        parts = [p.strip() for p in bar.split(",")]
        dur = beats_per_bar / len(parts)
        for j, p in enumerate(parts):
            ch = parse_chord(p)
            if ch is None:
                continue
            out.append((round(i * beats_per_bar + j * dur, 6), round(dur, 6), ch))
    return out


def midi_to_name(midi):
    names = ["C", "C♯", "D", "E♭", "E", "F", "F♯", "G", "A♭", "A", "B♭", "B"]
    return "%s%d" % (names[midi % 12], midi // 12 - 1)
