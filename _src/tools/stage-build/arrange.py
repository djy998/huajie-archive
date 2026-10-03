"""伴奏织体：把和声进行变成事件（低音 / 和弦 / 长音 / 打击）。

事件：(start_beat, dur_beats, midi, voice, gain)
voice 取 BASS / CHORD / PAD / MEL，由 build.py 按曲目配置换成具体音色；
打击乐用 ("p", 0, 'kick', ...) 形式（midi 字段存名字）。
"""

BASS, CHORD, PAD, MEL = "bass", "chord", "pad", "mel"

TRIAD_TOP = 3            # 和弦最多几个音


def chord_notes(chord, center=64, dense=True):
    """和弦 -> 中音区排列的 MIDI 列表（靠近 center）"""
    root, ivs, bass = chord
    pcs = [(root + iv) % 12 for iv in ivs]
    if not dense:
        pcs = pcs[:TRIAD_TOP] if len(pcs) > TRIAD_TOP else pcs
    # 去重（八度等价）
    out, seen = [], set()
    for i, p in enumerate(pcs):
        if p in seen and i < len(pcs) - 1:
            continue
        seen.add(p)
        out.append(p)
    midis = []
    base = center
    for p in out:
        c = base + ((p - (center % 12)) % 12)
        if c - 12 >= center - 7:
            c -= 12
        midis.append(c)
        base = c
    midis.sort()
    if midis and midis[0] < 52:                 # 别掉到低音区
        midis = [m + 12 if m < 52 else m for m in midis]
    return midis


def bass_note(chord, center=45, fifth=False):
    root, ivs, bass = chord
    p = (bass if bass is not None else root) if not fifth else (root + 7) % 12
    m = center + ((p - (center % 12)) % 12)
    if m - 12 >= center - 6:
        m -= 12
    return m


def _bars(bpb):
    def deco(fn):
        fn.bpb = bpb
        return fn
    return deco


def each_bar(bars, bpb):
    """把和声切成每小节：返回 [(bar_start, [(off, dur, chord), ...]), ...]"""
    out = []
    cur = None
    for (t, d, ch) in bars:
        idx = int(t // bpb)
        while cur is None or cur[0] < idx * bpb:
            cur = (idx * bpb, [])
            out.append(cur)
        cur[1].append((t - cur[0], d, ch))
    return out


# ==== 各种织体（每个函数返回事件列表）====
def pattern_pads(bars, bpb, total, **kw):
    ev = []
    for start, items in each_bar(bars, bpb):
        for off, d, ch in items:
            for m in chord_notes(ch, dense=False):
                ev.append((start + off, d, m, PAD, 1.0))
            ev.append((start + off, d, bass_note(ch), BASS, 1.0))
    return ev


def pattern_ostinato(bars, bpb, total, eighth=True, **kw):
    """反复音型：每拍和弦 + 低音（波莱罗、野蜂飞舞类）"""
    ev = []
    for start, items in each_bar(bars, bpb):
        beats = int(bpb)
        per = beats // len(items) if items else beats
        for off, d, ch in items:
            notes = chord_notes(ch, dense=False)
            for k in range(int(per * (2 if eighth else 1))):
                b = off + k * (0.5 if eighth else 1.0)
                if b >= off + per:
                    break
                for m in notes:
                    ev.append((start + b, 0.5 if eighth else 1.0, m, CHORD, 0.7))
            for k in range(int(per)):
                ev.append((start + off + k, 0.9, bass_note(ch, fifth=(k % 2 == 1)), BASS, 1.0))
    return ev


def pattern_march(bars, bpb, total, **kw):
    ev = []
    for si, (start, items) in enumerate(each_bar(bars, bpb)):
        beats = int(bpb)
        chs = [ch for _, _, ch in items] or [None]
        for k in range(beats):
            ch = chs[min(int(k * len(chs) / beats), len(chs) - 1)]
            if k % 2 == 0:
                ev.append((start + k, 0.9, bass_note(ch, fifth=(k % 4 == 2)), BASS, 1.15))
            else:
                for m in chord_notes(ch, dense=False):
                    ev.append((start + k, 0.75, m, CHORD, 0.95))
        if beats == 4:
            for m in chord_notes(chs[-1], dense=False):
                ev.append((start + 3.5, 0.4, m, CHORD, 0.6))
    return ev


def pattern_waltz(bars, bpb, total, **kw):
    ev = []
    for start, items in each_bar(bars, bpb):
        chs = [ch for _, _, ch in items] or [None]
        for k in range(int(bpb)):
            ch = chs[min(int(k * len(chs) / bpb), len(chs) - 1)]
            if k == 0:
                ev.append((start, 0.9, bass_note(ch), BASS, 1.1))
            else:
                for m in chord_notes(ch, dense=False):
                    ev.append((start + k, bpb - 1.0, m, CHORD, 0.8))
        if bpb >= 3:
            for m in chord_notes(chs[0], dense=False):
                ev.append((start + 1, 0.8, m + 0, PAD, 0.35))
    return ev


def pattern_baroque(bars, bpb, total, **kw):
    """巴洛克：低音一三拍 + 8 分音符分解和弦"""
    ev = []
    for start, items in each_bar(bars, bpb):
        for off, d, ch in items:
            n = chord_notes(ch)
            ev.append((start + off, d, bass_note(ch), BASS, 1.0))
            span = max(d - 0.0, 0.5)
            k = 0
            t = off + 0.5
            seq = [0, len(n) - 1, (len(n) - 1) // 2, len(n) - 1] if n else []
            while t < off + span - 0.01 and seq:
                ev.append((start + t, 0.5, n[seq[k % len(seq)]], CHORD, 0.72))
                k += 1
                t += 0.5
    return ev


def pattern_alberti(bars, bpb, total, **kw):
    ev = []
    for start, items in each_bar(bars, bpb):
        for off, d, ch in items:
            ev.append((start + off, d, bass_note(ch), BASS, 0.95))
            n = chord_notes(ch)
            if not n:
                continue
            order = [n[0], n[-1], n[len(n) // 2], n[-1]]
            k, t = 0, off
            while t < off + d - 0.01:
                ev.append((start + t, 0.5, order[k % len(order)], CHORD, 0.62))
                k += 1
                t += 0.5
    return ev


def pattern_stride(bars, bpb, total, **kw):
    """拉格泰姆 stride：一三低音、二四反拍和弦"""
    ev = []
    for start, items in each_bar(bars, bpb):
        chs = [ch for _, _, ch in items] or [None]
        for k in range(int(bpb)):
            ch = chs[min(int(k * len(chs) / bpb), len(chs) - 1)]
            if k % 2 == 0:
                ev.append((start + k, 0.55, bass_note(ch, fifth=(k % 4 == 2)), BASS, 1.05))
                ev.append((start + k + 0.5, 0.4, bass_note(ch), BASS, 0.5))
            else:
                for m in chord_notes(ch):
                    ev.append((start + k, 0.45, m, CHORD, 0.9))
                ev.append((start + k + 0.5, 0.4, chord_notes(ch)[0] + 12 if chord_notes(ch) else 60, CHORD, 0.45))
    return ev


def pattern_arp(bars, bpb, total, sixteenth=False, **kw):
    """流动的分解和弦（竖琴 / 钢琴琶音）"""
    step = 0.25 if sixteenth else 0.5
    ev = []
    for start, items in each_bar(bars, bpb):
        for off, d, ch in items:
            n = chord_notes(ch)
            ev.append((start + off, d, bass_note(ch), BASS, 0.9))
            if not n:
                continue
            seq = sorted(n) + [sorted(n)[0] + 12]
            k, t = 0, off
            while t < off + d - 0.01:
                ev.append((start + t, step * 1.6, seq[k % len(seq)], CHORD, 0.5))
                k += 1
                t += step
    return ev


def pattern_minuet(bars, bpb, total, **kw):
    ev = []
    for start, items in each_bar(bars, bpb):
        for off, d, ch in items:
            ev.append((start + off, 0.9, bass_note(ch), BASS, 0.95))
            for m in chord_notes(ch, dense=False):
                ev.append((start + off + 1, d - 1 if d > 1 else 0.9, m, CHORD, 0.8))
    return ev


def pattern_chorale(bars, bpb, total, **kw):
    """四部和声块状（合唱 / 管风琴）"""
    ev = []
    for start, items in each_bar(bars, bpb):
        for off, d, ch in items:
            for m in chord_notes(ch):
                ev.append((start + off, d, m, PAD, 1.0))
            ev.append((start + off, d, bass_note(ch, center=41), BASS, 1.0))
    return ev


def pattern_turkish(bars, bpb, total, **kw):
    ev = []
    for si, (start, items) in enumerate(each_bar(bars, bpb)):
        chs = [ch for _, _, ch in items] or [None]
        for k in range(int(bpb)):
            ch = chs[min(int(k * len(chs) / bpb), len(chs) - 1)]
            if k % 2 == 0:
                ev.append((start + k, 0.85, bass_note(ch, fifth=(k % 4 == 2)), BASS, 1.15))
            for m in chord_notes(ch, dense=False):
                ev.append((start + k, 0.5, m, CHORD, 0.7))
    return ev


def pattern_pavan(bars, bpb, total, **kw):
    ev = []
    for start, items in each_bar(bars, bpb):
        for off, d, ch in items:
            n = chord_notes(ch, dense=False)
            ev.append((start + off, 1.0, bass_note(ch), BASS, 1.0))
            half = d / 2.0
            for j, m in enumerate(n):
                ev.append((start + off + half, half * 0.9, m, CHORD, 0.7))
            for j, m in enumerate(n):
                ev.append((start + off, half * 0.9, m, PAD, 0.4))
    return ev


def pattern_gigue(bars, bpb, total, **kw):
    ev = []
    for start, items in each_bar(bars, bpb):
        for off, d, ch in items:
            n = chord_notes(ch, dense=False)
            ev.append((start + off, 0.9, bass_note(ch), BASS, 1.0))
            k, t = 0, off
            while t < off + d - 0.01 and n:
                ev.append((start + t, 0.55, n[(k * 2) % len(n)], CHORD, 0.55))
                k += 1
                t += 1.0
    return ev



def pattern_perpetuum(bars, bpb, total, **kw):
    """无穷动：低音落拍 + 十六分分解（练习曲 / 暴风雨 / 群蜂）"""
    ev = []
    for start, items in each_bar(bars, bpb):
        for off, d, ch in items:
            ev.append((start + off, 0.5, bass_note(ch), BASS, 1.0))
            n = sorted(set(chord_notes(ch, 67)))
            if not n:
                continue
            seq = n + [n[0] + 12] + list(reversed(n))
            k, t = 0, off
            while t < off + d - 0.01:
                ev.append((start + t, 0.42, seq[k % len(seq)], CHORD, 0.42))
                k += 1
                t += 0.25
    return ev


PATTERNS = {
    "pad": pattern_pads,
    "ostinato": pattern_ostinato,
    "march": pattern_march,
    "waltz": pattern_waltz,
    "baroque": pattern_baroque,
    "alberti": pattern_alberti,
    "stride": pattern_stride,
    "arp": pattern_arp,
    "minuet": pattern_minuet,
    "chorale": pattern_chorale,
    "turkish": pattern_turkish,
    "pavan": pattern_pavan,
    "gigue": pattern_gigue,
    "perpetuum": pattern_perpetuum,
}


# ==== 打击乐：perc 名字决定一套鼓点（事件里 midi 字段存 "p:kick" 之类）====
def percussion(kind, bars, bpb, total, flags=None):
    """kind: none / march / waltz / pop / ostinato / soft / fanfare"""
    flags = flags or {}
    ev = []
    if kind == "none":
        return ev
    bars_list = each_bar(bars, bpb)
    for si, (start, items) in enumerate(bars_list):
        beats = int(bpb)
        last = si == len(bars_list) - 1
        add = lambda t, name, g: ev.append((t, 0, "p:" + name, "p", g))
        if kind == "march":
            for k in range(beats):
                add(start + k, "kick" if k % 2 == 0 else "snare", 1.0 if k % 2 == 0 else 0.8)
                add(start + k + 0.5, "hat", 0.4)
            if flags.get("roll_end") and si % 8 == 7:
                for j in range(8):
                    add(start + beats - 1 + j * 0.125, "roll", 0.55)
            if last and flags.get("final_cymbal"):
                add(start, "cymbal", 0.8)
        elif kind == "fanfare":
            add(start, "kick", 1.0)
            add(start + beats - 0.5, "snare", 0.5)
            for j in range(8):
                add(start + j * 0.5, "hat", 0.3)
            if last:
                add(start, "cymbal", 0.9)
        elif kind == "waltz":
            add(start, "kick", 0.8)
            for k in range(1, beats):
                add(start + k, "hat", 0.35)
            if last and flags.get("final_cymbal"):
                add(start, "cymbal", 0.6)
        elif kind == "pop":
            for k in range(beats):
                add(start + k, "kick" if k in (0, 2) else "snare", 0.9 if k in (0, 2) else 0.7)
                add(start + k + 0.5, "hat", 0.35)
        elif kind == "ostinato":
            for k in range(beats):
                add(start + k, "snare", 0.75)
            if last and flags.get("final_cymbal"):
                add(start, "cymbal", 0.8)
        elif kind == "soft":
            for k in range(beats):
                add(start + k, "hat", 0.25)
    return ev
