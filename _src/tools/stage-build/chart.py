"""舞台演奏 · 从 MIDI 生成谱面

MIDI 里的每个音都会在游戏里出声：谱面挑出来的音由玩家弹，其余的（和弦里的其他音、谱面省掉的旋律音）由游戏按时间用轻音补上。
所以这里只回答一个问题：每个难度该让玩家弹哪些音。

  1. 读音符：合并所有轨道，按速度表换算成秒；同音高 15 ms 内的重复音只留一个
  2. 分簇：起音挨得很近（相邻 ≤ 35 ms、整簇 ≤ 150 ms，琶音式的和弦）的音算一簇，每簇取最高音当旋律候选
  3. 打分：后面空得越久（长音）、和弦重音、落在拍点上（MIDI 对齐网格时才看）、旋律转折、大跳越重要；
     起音时上方还有更高的音在响（被旋律盖住的伴奏音）大幅降分
  4. 按分数从高到低挑，和已挑的音至少隔开 gap 秒：先挑轻松，标准在轻松的基础上加，挑战再加（easy ⊂ normal ⊂ hard）

产出每个音的 lvl：3 = 三个难度都要弹，2 = 标准与挑战，1 = 只有挑战，0 = 只由游戏补音。
"""
import bisect
import math

import mido
import numpy as np

GAPS = {"easy": 0.5, "normal": 0.25, "hard": 0.125}   # 同一难度里两个音最少隔开的秒数
LEVEL = {"easy": 3, "normal": 2, "hard": 1}
COVERED_GAP = 0.8                                   # 标准难度里，伴奏音前后至少空这么久才选
CLUSTER_STEP = 0.035
CLUSTER_SPAN = 0.15


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
        elif msg.type == "program_change":
            programs.append(msg.program)
        elif msg.type == "note_on" and msg.velocity > 0 and msg.channel != 9:
            key = (ti, msg.channel, msg.note)
            if key in open_:
                s0, v0, k0 = open_.pop(key)
                out.append({"t": s0, "end": sec, "m": msg.note, "v": v0, "tick": k0})
            open_[key] = (sec, msg.velocity, tick)
        elif (msg.type == "note_off" or (msg.type == "note_on" and msg.velocity == 0)) and msg.channel != 9:
            key = (ti, msg.channel, msg.note)
            if key in open_:
                s0, v0, k0 = open_.pop(key)
                out.append({"t": s0, "end": sec, "m": msg.note, "v": v0, "tick": k0})
    for (ti, ch, m), (s0, v0, k0) in open_.items():
        out.append({"t": s0, "end": s0 + 0.5, "m": m, "v": v0, "tick": k0})
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
    info = {"tpb": tpb, "tempos": tempos, "sigs": sigs or [(0, 4, 4)], "tracks": track_names, "programs": programs}
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


def build_chart(notes, info, gap_scale=1.0):
    """-> (lvl 列表，与 notes 一一对应；附加信息)"""
    clusters = make_clusters(notes)
    k = len(clusters)
    # 被盖住：起音时上方还有更高的音在响、而且还要响一阵（旋律长音下面的伴奏音）；只拖了个尾巴的连音不算
    sounding = []
    for i, c in enumerate(clusters):
        top = c["top"]
        nxt = clusters[i + 1]["t"] - top["t"] if i + 1 < k else 1.0
        hold = max(0.12, 0.5 * min(nxt, top["end"] - top["t"]))
        sounding = [n for n in sounding if n["end"] > top["t"] + 0.04]
        c["covered"] = any(n["m"] > top["m"] and n["end"] - top["t"] >= hold for n in sounding)
        sounding += c["notes"]
    # 低音区：比前后 3 秒旋律的中位数低 9 个半音以上（乐句之间单独露出来的低音），和被盖住的音一样处理；
    # 一大段只有低音时中位数跟着下来，照样能选
    j0 = j1 = 0
    for c in clusters:
        while clusters[j0]["t"] < c["t"] - 3:
            j0 += 1
        while j1 < k and clusters[j1]["t"] <= c["t"] + 3:
            j1 += 1
        ms = sorted(x["top"]["m"] for x in clusters[j0:j1] if not x["covered"]) or [c["top"]["m"]]
        if not c["covered"] and c["top"]["m"] < ms[len(ms) // 2] - 9:
            c["covered"] = True

    score = []
    for i, c in enumerate(clusters):
        top = c["top"]
        nxt = clusters[i + 1]["t"] - c["t"] if i + 1 < k else 1.0
        prv = c["t"] - clusters[i - 1]["t"] if i else 1.0
        s = 0.55 * min(nxt, 0.8) / 0.8 + 0.2 * min(prv, 0.8) / 0.8
        s += 0.12 * (min(len(c["notes"]), 4) - 1)
        s += beat_strength(top["tick"], info)
        if 0 < i < k - 1:
            a, b = clusters[i - 1]["top"]["m"], clusters[i + 1]["top"]["m"]
            if (top["m"] > a and top["m"] >= b) or (top["m"] < a and top["m"] <= b):
                s += 0.08
        if i and abs(top["m"] - clusters[i - 1]["top"]["m"]) >= 5:
            s += 0.06
        if c["covered"]:
            s *= 0.3
        score.append(s + 1e-6 * (k - i))                 # 同分时先挑靠前的
    order = sorted(range(k), key=lambda i: -score[i])

    times = [c["top"]["t"] for c in clusters]
    picked = {}                                         # cluster 序号 -> 难度
    taken = []                                          # 已挑的时间（有序）

    def free(t, gap):
        j = bisect.bisect_left(taken, t)
        if j < len(taken) and taken[j] - t < gap - 1e-9:
            return False
        if j > 0 and t - taken[j - 1] < gap - 1e-9:
            return False
        return True

    for dens in ("easy", "normal", "hard"):
        gap = GAPS[dens] * gap_scale
        for i in order:
            if i in picked:
                continue
            if clusters[i]["covered"]:                 # 伴奏音：轻松不选；标准只在前后都空着的地方选
                if dens == "easy" or (dens == "normal" and not free(times[i], COVERED_GAP)):
                    continue
            if free(times[i], gap):
                picked[i] = dens
                bisect.insort(taken, times[i])

    lvl_of = {}
    for i, dens in picked.items():
        lvl_of[id(clusters[i]["top"])] = LEVEL[dens]
    lvl = [lvl_of.get(id(n), 0) for n in notes]
    beat = 60 / bpm_at(info, notes[0]["t"]) if info["grid"] is not None else estimate_beat(clusters)
    return lvl, {"clusters": k, "covered": sum(1 for c in clusters if c["covered"]), "beat": beat}


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
