"""舞台演奏 · 从 MIDI 生成谱面

MIDI 里的每个音都会在游戏里出声：谱面挑出来的音由玩家弹，其余的（和弦里的其他音、谱面省掉的旋律音）由游戏按时间用轻音补上。
所以这里只回答一个问题：每个难度该让玩家弹哪些音。原则：三个难度都以主旋律为主，伴奏只在魔界花和泰坦、而且只在主旋律的空档里塞入。

  1. 读音符：合并所有轨道，按速度表换算成秒；同音高 15 ms 内的重复音只留一个；每个音记下来自哪条轨道、哪个通道（声部）
  2. 找主旋律：
     · 多声部（多条轨道 / 通道）：按「最常是最高音、覆盖全曲、少和弦、轨道名」挑出主旋律声部（melody_voice），
       其余声部全算伴奏
     · 主旋律声部里（单轨的曲子就是全部音）：起音挨得很近（相邻 ≤ 35 ms、整簇 ≤ 150 ms）的音算一簇，每簇的最高音是候选；
       用动态规划沿时间挑出一条旋律线（melody_line）：靠近当时的上方音区、和前一个旋律音不大跳、不跳过更高的音、
       不在别的长音底下（被盖住）的才算旋律；其余的簇算伴奏
  3. 打分（旋律音之间比）：后面空得越久（长音）、和弦重音、落在拍点上（MIDI 对齐网格时才看）、旋律转折、大跳越重要
  4. 按分数从高到低挑旋律音，和已挑的音至少隔开 gap 秒：先挑仙人刺，魔界花在仙人刺的基础上加，泰坦再加（easy ⊂ normal ⊂ hard）
  5. 魔界花、泰坦再在主旋律的空档里塞伴奏（FILL）：两个旋律起音之间空得够久、离前后旋律音够远、和别的要弹的音隔得开才塞，
     泰坦比魔界花塞得密；仙人刺只有旋律

产出每个音的 lvl：3 = 三个难度都要弹，2 = 魔界花与泰坦，1 = 只有泰坦，0 = 只由游戏补音。
"""
import bisect
import math

import mido
import numpy as np

GAPS = {"easy": 0.5, "normal": 0.25, "hard": 0.125}   # 同一难度里两个音最少隔开的秒数（乘歌曲的疏密倍数）
LEVEL = {"easy": 3, "normal": 2, "hard": 1}
CLUSTER_STEP = 0.035
CLUSTER_SPAN = 0.15
# 塞伴奏（魔界花、泰坦）：gap = 主旋律两个起音之间至少空这么久才塞；margin = 塞的音离前后旋律起音至少这么远；
# step = 塞的音和其他要弹的音至少隔开这么久（秒，都乘疏密倍数）。仙人刺只弹旋律
FILL = {
    "normal": {"gap": 0.8, "margin": 0.3, "step": 0.75},     # 魔界花：稀疏地塞，总音数和只按间隔挑音时相当
    "hard": {"gap": 0.3, "margin": 0.13, "step": 0.125},     # 泰坦：空档里按泰坦的间隔塞满
}
# 旋律线（melody_line）的动态规划参数：总分 = Σ 每个旋律音的分 − Σ 相邻两个旋律音之间的代价
MEL = {
    "env_win": 2.0,     # 上方音区：前后这么多秒里（没被盖住的）各簇最高音的 85 百分位
    "env_q": 0.85,
    "dev_free": 7,      # 比上方音区低这么多半音以内不扣分
    "dev_cost": 0.1,    # 再往下每低一个半音扣的分
    "covered": 2.0,     # 被别的长音盖住扣的分
    "chord": 0.15,      # 带和弦（和声化的旋律）加分
    "leap_free": 5,     # 和前一个旋律音相差这么多半音以内不扣分
    "leap_cost": 0.02,  # 再大的跳进按（超出的半音数）² 扣分
    "rest": 1.2,        # 隔了这么多秒才接上（换乐句）时，跳进代价打四折
    "skip_high": 0.8,   # 中间跳过一个比前后两个旋律音都高的音（没被盖住）扣的分
    "window": 24,       # 往回最多看这么多簇；更远的按固定代价接上
    "far": 0.3,
}
MELODY_WORDS = ("melody", "vocal", "voice", "lead", "main", "solo", "sing", "旋律", "主旋律", "人声", "主唱")
BACKING_WORDS = ("bass", "drum", "perc", "chord", "pad", "accomp", "backing", "rhythm", "伴奏", "和弦", "贝斯", "鼓")


def read_notes(path):
    """-> (notes, info)。notes: [{t, end, m, v, tick}]（秒，按起音排序），info: 网格、速度、拍号等"""
    mf = mido.MidiFile(path, clip=True)
    tpb = mf.ticks_per_beat
    evs = []
    for ti, tr in enumerate(mf.tracks):
        tick = 0
        for i, msg in enumerate(tr):
            tick += msg.time
            evs.append((tick, 0 if msg.type in ("set_tempo", "time_signature") else 1, ti, i, msg))
    evs.sort(key=lambda e: e[:4])
    tempo, last, sec = 500000, 0, 0.0
    tempos, sigs, track_names, programs = [], [], [], []
    names_by_track = {}
    open_, out = {}, []
    for tick, _, ti, _, msg in evs:
        sec += (tick - last) * tempo / 1e6 / tpb
        last = tick
        if msg.type == "set_tempo":
            tempo = msg.tempo
            tempos.append((tick, sec, mido.tempo2bpm(tempo)))
        elif msg.type == "time_signature":
            sigs.append((tick, msg.numerator, msg.denominator))
        elif msg.type == "track_name" and msg.name.strip():
            track_names.append(msg.name.strip())
            names_by_track.setdefault(ti, msg.name.strip())
        elif msg.type == "program_change":
            programs.append(msg.program)
        elif msg.type == "note_on" and msg.velocity > 0 and msg.channel != 9:
            key = (ti, msg.channel, msg.note)
            if key in open_:
                s0, v0, k0 = open_.pop(key)
                out.append({"t": s0, "end": sec, "m": msg.note, "v": v0, "tick": k0, "voice": key[:2]})
            open_[key] = (sec, msg.velocity, tick)
        elif (msg.type == "note_off" or (msg.type == "note_on" and msg.velocity == 0)) and msg.channel != 9:
            key = (ti, msg.channel, msg.note)
            if key in open_:
                s0, v0, k0 = open_.pop(key)
                out.append({"t": s0, "end": sec, "m": msg.note, "v": v0, "tick": k0, "voice": key[:2]})
    for (ti, ch, m), (s0, v0, k0) in open_.items():
        out.append({"t": s0, "end": s0 + 0.5, "m": m, "v": v0, "tick": k0, "voice": (ti, ch)})
    out.sort(key=lambda n: (n["t"], -n["m"]))

    notes, recent = [], {}
    for n in out:
        p = recent.get(n["m"])
        if p is not None and n["t"] - p["t"] < 0.015:      # 叠在一起的同音（两条轨道重复写了）
            p["end"] = max(p["end"], n["end"])
            continue
        n["end"] = max(n["end"], n["t"] + 0.03)
        notes.append(n)
        recent[n["m"]] = n
    if not tempos or tempos[0][0] > 0:
        tempos.insert(0, (0, 0.0, 120.0))
    info = {"tpb": tpb, "tempos": tempos, "sigs": sigs or [(0, 4, 4)], "tracks": track_names, "programs": programs,
            "voice_names": {(ti, ch): names_by_track.get(ti, "") for ti, ch in {n["voice"] for n in notes}}}
    info["grid"] = detect_grid([n["tick"] for n in notes], tpb)
    return notes, info


def detect_grid(ticks, tpb):
    """MIDI 是否对齐十六分音符网格（允许整体偏移几个 tick）-> 偏移量或 None"""
    step = max(1, tpb // 4)
    tol = max(1, tpb // 48)
    best, best_off = 0.0, 0
    for off in range(0, step, max(1, step // 24)):
        hit = sum(1 for t in ticks if min((t - off) % step, step - (t - off) % step) <= tol)
        if hit > best:
            best, best_off = hit, off
    return best_off if ticks and best / len(ticks) >= 0.85 else None


def bpm_at(info, sec):
    bpm = info["tempos"][0][2]
    for (_, s, b) in info["tempos"]:
        if s <= sec + 1e-6:
            bpm = b
    return bpm


def main_bpm(info, t0, t1):
    """按持续时间加权、出现最多的速度（显示用）"""
    spans = {}
    tl = info["tempos"]
    for i, (_, s, b) in enumerate(tl):
        a = max(s, t0)
        e = min(tl[i + 1][1] if i + 1 < len(tl) else t1, t1)
        if e > a:
            spans[round(b)] = spans.get(round(b), 0) + (e - a)
    return max(spans.items(), key=lambda kv: kv[1])[0] if spans else round(tl[0][2])


def estimate_beat(clusters):
    """网格不可靠时（按秒录进来的 MIDI）用起音自相关估一个拍长（秒），偏好 70~160 拍/分"""
    if len(clusters) < 8:
        return 0.5
    res = 0.01
    env = np.zeros(int((clusters[-1]["t"] + 1) / res) + 2)
    for c in clusters:
        env[int(c["t"] / res)] += 1.0 + 0.5 * (len(c["notes"]) - 1)
    env = np.convolve(env, [0.25, 0.5, 1.0, 0.5, 0.25], mode="same")   # 容忍几十毫秒的不齐
    best, best_lag = -1.0, 50
    for lag in range(28, 120):                       # 0.28 ~ 1.2 秒
        s = float(np.dot(env[:-lag], env[lag:])) + 0.5 * float(np.dot(env[:-2 * lag], env[2 * lag:]))
        bpm = 60 / (lag * res)
        prior = math.exp(-0.5 * (math.log2(bpm / 110) / 0.6) ** 2)
        if s * prior > best:
            best, best_lag = s * prior, lag
    return best_lag * res


def make_clusters(notes):
    out = []
    for n in notes:
        c = out[-1] if out else None
        if c and n["t"] - c["last"] <= CLUSTER_STEP and n["t"] - c["t"] <= CLUSTER_SPAN:
            c["notes"].append(n)
            c["last"] = n["t"]
        else:
            out.append({"t": n["t"], "last": n["t"], "notes": [n]})
    for c in out:
        c["top"] = max(c["notes"], key=lambda n: (n["m"], -n["t"]))
    return out


def beat_strength(tick, info):
    """拍点强弱（MIDI 对齐网格时）：小节第一拍 > 拍点 > 半拍 > 三连音 > 十六分"""
    off = info["grid"]
    if off is None:
        return 0.0
    tpb = info["tpb"]
    t = tick - off
    frac = (t % tpb) / tpb
    near = lambda x: min(abs(frac - x), 1 - abs(frac - x)) < 1 / 24
    if near(0):
        s = 0.45
        bar_start, num, den = 0, 4, 4
        for (k, n_, d_) in info["sigs"]:
            if k <= tick:
                bar_start, num, den = k, n_, d_
        bar = int(round(tpb * num * 4 / den))
        if bar > 0 and (t - (bar_start - off)) % bar < tpb / 24:
            s += 0.3
        return s
    if near(0.5):
        return 0.22
    if near(1 / 3) or near(2 / 3):
        return 0.15
    if near(0.25) or near(0.75):
        return 0.06
    return 0.0


def mark_covered(clusters):
    """被盖住：起音时上方还有更高的音在响、而且还要响一阵（旋律长音下面的伴奏音）；只拖了个尾巴的连音不算"""
    k = len(clusters)
    sounding = []
    for i, c in enumerate(clusters):
        top = c["top"]
        nxt = clusters[i + 1]["t"] - top["t"] if i + 1 < k else 1.0
        hold = max(0.12, 0.5 * min(nxt, top["end"] - top["t"]))
        sounding = [n for n in sounding if n["end"] > top["t"] + 0.04]
        c["covered"] = any(n["m"] > top["m"] and n["end"] - top["t"] >= hold for n in sounding)
        sounding += c["notes"]


def melody_voice(notes, info):
    """多声部（轨道 / 通道）时挑出主旋律声部；只有一个像样的声部时返回 None（全部音都算主旋律声部）。
    依据：最常提供当时的最高音、覆盖全曲、少和弦（单音线条）、轨道名（melody / vocal / 旋律 … 加分，bass / chord / 伴奏 … 减分）"""
    by = {}
    for n in notes:
        by.setdefault(n["voice"], []).append(n)
    voices = [v for v, ns in by.items() if len(ns) >= 8]
    if len(voices) < 2:
        return None
    allc = make_clusters(notes)
    span = max(notes[-1]["t"] - notes[0]["t"], 1.0)
    bins = max(1, int(span / 2.0) + 1)
    best, best_v = None, None
    for v in voices:
        ns = by[v]
        top_share = sum(1 for c in allc if c["top"]["voice"] == v) / len(allc)
        cover = len({int((n["t"] - notes[0]["t"]) / 2.0) for n in ns}) / bins
        own = make_clusters(ns)
        mono = sum(1 for c in own if len(c["notes"]) == 1) / len(own)
        name = (info.get("voice_names") or {}).get(v, "").lower()
        word = 1.5 if any(w in name for w in MELODY_WORDS) else -1.5 if any(w in name for w in BACKING_WORDS) else 0.0
        score = 2.0 * top_share + 1.0 * cover + 0.5 * mono + word
        if best is None or score > best:
            best, best_v = score, v
    return best_v


def melody_line(clusters):
    """在（主旋律声部的）各簇里挑出旋律线 -> 旋律簇的序号集合。
    动态规划：best[i] = 第 i 簇当旋律音时、到它为止的最高总分；分数见 MEL 的说明"""
    k = len(clusters)
    if not k:
        return set()
    tops = [c["top"]["m"] for c in clusters]
    times = [c["t"] for c in clusters]
    free_tops = [(t, m) for t, m, c in zip(times, tops, clusters) if not c["covered"]] or list(zip(times, tops))
    ft = [t for t, _ in free_tops]

    def env_at(t):
        for w in (MEL["env_win"], MEL["env_win"] * 2, 1e9):
            a, b = bisect.bisect_left(ft, t - w), bisect.bisect_right(ft, t + w)
            if b - a >= 4 or w > 1e8:
                ms = sorted(m for _, m in free_tops[a:b])
                return ms[min(len(ms) - 1, int(MEL["env_q"] * (len(ms) - 1) + 0.5))]

    node = []
    for i, c in enumerate(clusters):
        dev = env_at(times[i]) - tops[i]
        s = 1.0 - MEL["dev_cost"] * max(0, dev - MEL["dev_free"])
        if c["covered"]:
            s -= MEL["covered"]
        if len(c["notes"]) >= 2:
            s += MEL["chord"]
        node.append(s)

    def trans(j, i):
        leap = abs(tops[i] - tops[j])
        cost = MEL["leap_cost"] * max(0, leap - MEL["leap_free"]) ** 2
        if times[i] - times[j] > MEL["rest"]:
            cost *= 0.4
        return cost

    W = MEL["window"]
    best = [0.0] * k
    prev = [-1] * k
    far_best, far_arg = -math.inf, -1                  # 比 W 簇更早的最好结果（长空档直接接上）
    for i in range(k):
        if i - W - 1 >= 0 and best[i - W - 1] > far_best:
            far_best, far_arg = best[i - W - 1], i - W - 1
        cand, arg = -0.5, -1                           # 从这里开始（前面都不是旋律）
        if far_arg >= 0 and far_best - MEL["far"] > cand:
            cand, arg = far_best - MEL["far"], far_arg
        hi = -1                                        # j 和 i 之间（没被盖住的）最高音
        for j in range(i - 1, max(-1, i - W - 1), -1):
            if j < i - 1 and not clusters[j + 1]["covered"]:
                hi = max(hi, tops[j + 1])
            v = best[j] - trans(j, i)
            if hi > max(tops[i], tops[j]) + 1:
                v -= MEL["skip_high"]
            if v > cand:
                cand, arg = v, j
        best[i] = node[i] + cand
        prev[i] = arg
    i = max(range(k), key=lambda x: best[x])
    line = set()
    while i >= 0:
        line.add(i)
        i = prev[i]
    return line


def importance(seq, info):
    """一串簇（按时间）里每个的轻重：后面空得越久（长音）、和弦重音、拍点、旋律转折、大跳越重要"""
    k = len(seq)
    out = []
    for i, c in enumerate(seq):
        top = c["top"]
        nxt = seq[i + 1]["t"] - c["t"] if i + 1 < k else 1.0
        prv = c["t"] - seq[i - 1]["t"] if i else 1.0
        s = 0.55 * min(nxt, 0.8) / 0.8 + 0.2 * min(prv, 0.8) / 0.8
        s += 0.12 * (min(len(c["notes"]), 4) - 1)
        s += beat_strength(top["tick"], info)
        if 0 < i < k - 1:
            a, b = seq[i - 1]["top"]["m"], seq[i + 1]["top"]["m"]
            if (top["m"] > a and top["m"] >= b) or (top["m"] < a and top["m"] <= b):
                s += 0.08
        if i and abs(top["m"] - seq[i - 1]["top"]["m"]) >= 5:
            s += 0.06
        if c.get("covered"):
            s *= 0.3
        out.append(s + 1e-6 * (k - i))                  # 同分时先挑靠前的
    return out


def build_chart(notes, info, gap_scale=1.0):
    """-> (lvl 列表，与 notes 一一对应；附加信息)"""
    mv = melody_voice(notes, info)
    pool = [n for n in notes if mv is None or n["voice"] == mv]
    mcl = make_clusters(pool)
    mark_covered(mcl)
    line = melody_line(mcl)
    melody = [mcl[i] for i in sorted(line)]
    mel_ids = {id(n) for c in melody for n in c["notes"]}
    mel_times = [c["top"]["t"] for c in melody]
    # 伴奏：主旋律声部里不在旋律线上的簇，加上其他声部的音
    acl = make_clusters([n for n in notes if id(n) not in mel_ids])
    mark_covered(acl)

    picked = {}                                         # 簇的 id -> 难度
    taken = []                                          # 已挑的时间（有序）

    def free(t, gap):
        j = bisect.bisect_left(taken, t)
        if j < len(taken) and taken[j] - t < gap - 1e-9:
            return False
        if j > 0 and t - taken[j - 1] < gap - 1e-9:
            return False
        return True

    ms = importance(melody, info)
    order = sorted(range(len(melody)), key=lambda i: -ms[i])
    acs = importance(acl, info)
    acc_order = sorted(range(len(acl)), key=lambda i: -acs[i])
    fills = 0

    def add_fills(dens):
        nonlocal fills
        f = FILL[dens]
        fg, fm, fs = f["gap"] * gap_scale, max(f["margin"], GAPS["hard"]) * gap_scale, f["step"] * gap_scale
        for i in acc_order:
            c = acl[i]
            if id(c) in picked:
                continue
            t = c["top"]["t"]
            j = bisect.bisect_left(mel_times, t)
            a = mel_times[j - 1] if j else -math.inf
            b = mel_times[j] if j < len(mel_times) else math.inf
            if b - a < fg or t - a < fm or b - t < fm or not free(t, fs):
                continue
            picked[id(c)] = dens
            bisect.insort(taken, t)
            fills += 1

    for dens in ("easy", "normal", "hard"):
        gap = GAPS[dens] * gap_scale
        for i in order:
            c = melody[i]
            if id(c) not in picked and free(c["top"]["t"], gap):
                picked[id(c)] = dens
                bisect.insort(taken, c["top"]["t"])
        if dens in FILL:
            add_fills(dens)

    for c in melody:
        c["top"]["role"] = "mel"                        # 调试、体检用：哪些音在旋律线上
    lvl_of = {}
    for c in melody + acl:
        if id(c) in picked:
            lvl_of[id(c["top"])] = LEVEL[picked[id(c)]]
    lvl = [lvl_of.get(id(n), 0) for n in notes]
    allc = make_clusters(notes)
    beat = 60 / bpm_at(info, notes[0]["t"]) if info["grid"] is not None else estimate_beat(allc)
    name = (info.get("voice_names") or {}).get(mv, "") if mv is not None else ""
    return lvl, {"clusters": len(allc), "covered": len(acl), "melody": len(melody), "fills": fills,
                 "melody_voice": None if mv is None else f"轨道 {mv[0]} 通道 {mv[1] + 1}" + (f"（{name}）" if name else ""),
                 "beat": beat}


def density(times, win=5.0):
    """(平均每秒音数, 最密 5 秒的每秒音数)"""
    if len(times) < 2:
        return 0.0, 0.0
    span = max(times[-1] - times[0], 1.0)
    peak, j = 0, 0
    for i in range(len(times)):
        while times[i] - times[j] > win:
            j += 1
        peak = max(peak, i - j + 1)
    return len(times) / span, peak / win
