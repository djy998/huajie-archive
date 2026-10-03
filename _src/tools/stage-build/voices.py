"""numpy 乐器合成：给渲染器用的音色库（全部现场生成，不用采样文件，避免版权问题）。

约定：每个音色函数返回 (samples: float32 array, tail: 余音秒数)。
输入频率 f（Hz）、时长 dur（秒）、力度 vel（0~1）、采样率 sr。
"""
import numpy as np
from scipy import signal

CACHE = {}


def _t(n, sr):
    return np.arange(n) / sr


def _partials(f, dur, sr, count, amp_fn, decay_fn, inharm=0.0, detune=0.0, vib=None):
    """按分音叠加（向量化）。count 分音数；amp_fn(n) / decay_fn(n, f) 为函数"""
    n = int(max(64, (dur + 0.02) * sr))
    t = _t(n, sr)
    out = np.zeros(n)
    for i in range(1, count + 1):
        amp = amp_fn(i)
        if amp < 1e-4:
            continue
        fi = f * i * (1.0 + inharm * i * i)
        if detune:
            fi *= 1.0 + detune * (1 if i % 2 else -1)
        rate = decay_fn(i, f)
        sig = np.sin(2 * np.pi * fi * t + i * 0.7)
        if vib:
            vr, vdepth, vdelay = vib
            sig = sig * (1.0 + 0.0)
            fmod = np.exp(-np.maximum(t - vdelay, 0) * 1.5) * (vdepth * vr)
            sig = np.sin(2 * np.pi * np.cumsum(fi + fmod) / sr + i * 0.7)
        out += amp * sig * np.exp(-t * rate)
    return out


def _noise(n, sr):
    return np.random.uniform(-1, 1, n)


def _lowpass(x, sr, cutoff, order=2):
    cutoff = min(cutoff, sr * 0.45)
    sos = signal.butter(order, cutoff / (sr / 2), btype="low", output="sos")
    return signal.sosfilt(sos, x)


def _highpass(x, sr, cutoff, order=2):
    cutoff = min(cutoff, sr * 0.44)
    sos = signal.butter(order, max(cutoff, 10) / (sr / 2), btype="high", output="sos")
    return signal.sosfilt(sos, x)


def _bandpass(x, sr, f0, q=1.0, order=2):
    f0 = min(max(f0, 30), sr * 0.4)
    sos = signal.butter(order, [max(f0 - q * f0, 20) / (sr / 2), min(f0 + q * f0, sr * 0.45) / (sr / 2)], btype="band", output="sos")
    return signal.sosfilt(sos, x)


def _fit(x, n):
    x = np.asarray(x)
    if len(x) == n:
        return x
    if len(x) > n:
        return x[:n]
    return np.concatenate([x, np.zeros(n - len(x))])


def _fade(x, sr, fin=0.003, fout=0.02):
    a, b = int(fin * sr), int(fout * sr)
    if a > 1:
        x[:a] *= np.linspace(0, 1, a)
    if b > 1:
        x[-b:] *= np.linspace(1, 0, b)
    return x


# ==== 音色 ====
def v_piano(f, dur, sr, vel):
    hold = max(dur, 0.35)
    n = int((hold + 1.1) * sr)
    body = _partials(f, hold + 1.0, sr, 14, lambda i: 1.0 / i ** 1.45,
                     lambda i, f: (2.0 + 1.1e-4 * f) * (1 + 0.55 * (i - 1)), inharm=2.2e-6, detune=0.0006)
    bright = _partials(f, min(hold, 0.4), sr, 26, lambda i: 0.5 / i ** 2.0, lambda i, f: 22 + i * 26)
    strike = _bandpass(_noise(int(0.02 * sr), sr), sr, f * 6, 1.2) * np.exp(-_t(int(0.02 * sr), sr) * 240)
    x = _fit(body, n) + _fit(bright, n) * 0.7 + _fit(strike, n) * 0.5
    x = _lowpass(x, sr, min(9000, 1200 + f * 6))
    x *= vel * 0.62
    return _fade(x, sr), 1.1


def v_harpsichord(f, dur, sr, vel):
    hold = max(min(dur, 1.1), 0.18)
    n = int((hold + 0.35) * sr)
    x = _partials(f, hold + 0.3, sr, 20, lambda i: 1.0 / i ** 1.05, lambda i, f: 4.5 + 0.006 * f + i * 1.9, detune=0.001)
    pick = _highpass(_noise(int(0.006 * sr), sr), sr, 2500) * 0.5
    x[: len(pick)] += pick
    x = _lowpass(_highpass(x, sr, 180), sr, 6500)
    x *= vel * 0.5
    return _fade(x, sr, 0.0008), 0.35


def v_lute(f, dur, sr, vel):
    hold = max(min(dur, 1.4), 0.25)
    n = int((hold + 0.5) * sr)
    x = _partials(f, hold + 0.45, sr, 18, lambda i: 1.0 / i ** 1.2, lambda i, f: 3.4 + 0.004 * f + i * 1.5)
    x[: int(0.004 * sr)] *= np.linspace(1, 0.2, int(0.004 * sr))
    x = _lowpass(_highpass(x, sr, 120), sr, 4200)
    x *= vel * 0.55
    return _fade(x, sr, 0.001), 0.45


def v_harp(f, dur, sr, vel):
    hold = max(min(dur, 2.2), 0.4)
    n = int((hold + 0.8) * sr)
    x = _partials(f, hold + 0.7, sr, 16, lambda i: 1.0 / i ** 1.5, lambda i, f: 1.8 + 0.0025 * f + i * 0.85)
    x = _lowpass(x, sr, 5200)
    x *= vel * 0.6
    return _fade(x, sr, 0.001), 0.8


def v_musicbox(f, dur, sr, vel):
    hold = max(min(dur, 1.6), 0.3)
    ratios = [1.0, 2.76, 5.4, 8.93, 13.3]
    amps = [1.0, 0.42, 0.2, 0.09, 0.05]
    dec = [2.6, 4.5, 8.0, 12.0, 18.0]
    t = _t(int((hold + 1.3) * sr), sr)
    x = np.zeros_like(t)
    for r, a, d in zip(ratios, amps, dec):
        x += a * np.sin(2 * np.pi * f * r * t + r) * np.exp(-t * d * (1 + 0.25 * min(f, 2000) / 1200))
    click = _highpass(_noise(int(0.004 * sr), sr), sr, 4000) * 0.25
    x[: len(click)] += click
    x *= vel * 0.6
    return _fade(x, sr, 0.0008), 1.3


def v_strings(f, dur, sr, vel):
    hold = dur + 0.55
    n = int(hold * sr)
    x = np.zeros(n)
    for d in (-5, 0, 5):
        fi = f * (1 + d / 1200.0)
        x += _fit(_partials(fi, dur + 0.4, sr, 22, lambda i: 1.0 / i ** 1.15,
                             lambda i, f: 0.05 + i * 0.02, vib=(5.2, 0.0035, 0.35)), n)
    atk = int(min(0.18, dur * 0.3) * sr)
    env = np.ones(n)
    env[:atk] = np.linspace(0, 1, atk) ** 1.5
    x = _fit(x, n) * env
    x += _bandpass(_noise(n, sr), sr, f * 3.2, 0.7) * 0.05
    x = _lowpass(_highpass(x, sr, 150), sr, min(5200, 700 + f * 7))
    x *= vel * 0.3
    return x, 0.55


def v_flute(f, dur, sr, vel):
    hold = dur + 0.35
    n = int(hold * sr)
    x = _fit(_partials(f, dur + 0.25, sr, 6, lambda i: [1, 0.22, 0.07, 0.04, 0.02, 0.01][i - 1],
                  lambda i, f: 0.02, vib=(5.1, 0.004, 0.25)), n)
    breath = _bandpass(_noise(n, sr), sr, f * 2.0, 1.6) * 0.06
    atk = int(0.07 * sr)
    env = np.ones(n)
    env[:atk] = np.linspace(0, 1, atk) ** 2
    env[-int(0.08 * sr):] *= np.linspace(1, 0, int(0.08 * sr))
    x = (x + breath) * env
    x = _highpass(x, sr, 220)
    x *= vel * 0.5
    return x, 0.35


def v_reed(f, dur, sr, vel):  # 双簧管 / 竖笛
    hold = dur + 0.3
    n = int(hold * sr)
    amps = [0.55, 1.0, 0.85, 0.6, 0.42, 0.3, 0.2, 0.13, 0.09, 0.05]
    x = _fit(_partials(f, dur + 0.2, sr, 10, lambda i: amps[i - 1], lambda i, f: 0.03, vib=(5.3, 0.005, 0.3)), n)
    atk = int(0.05 * sr)
    env = np.ones(n)
    env[:atk] = np.linspace(0, 1, atk) ** 1.6
    env[-int(0.1 * sr):] *= np.linspace(1, 0, int(0.1 * sr))
    x = x * env
    x = _lowpass(_highpass(x, sr, 240), sr, 6800)
    x *= vel * 0.4
    return x, 0.3


def v_brass(f, dur, sr, vel):
    hold = dur + 0.35
    n = int(hold * sr)
    x = _fit(_partials(f, dur + 0.25, sr, 16, lambda i: 1.0 / i ** 0.8, lambda i, f: 0.04, vib=(5.4, 0.004, 0.4)), n)
    atk = int(0.035 * sr)
    env = np.ones(n)
    env[:atk] = np.linspace(0, 1, atk) ** 1.2
    bright = np.concatenate([np.linspace(1.6, 1.0, min(int(0.25 * sr), n)), np.ones(n)])[:n]
    x = x * env * np.minimum(bright, 1.6)
    x = _lowpass(_highpass(x, sr, 180), sr, 6000)
    x *= vel * 0.34
    return x, 0.35


def v_bass(f, dur, sr, vel):
    f = max(f, 27.5)
    hold = max(min(dur, 1.6), 0.28)
    n = int((hold + 0.3) * sr)
    x = _partials(f, hold + 0.25, sr, 10, lambda i: 1.0 / i ** 1.6, lambda i, f: 2.2 + i * 1.1)
    x = _lowpass(x, sr, 1400)
    thump = _lowpass(_noise(int(0.006 * sr), sr), sr, 500) * 0.4
    x[: len(thump)] += thump
    x *= vel * 0.8
    return _fade(x, sr, 0.0015), 0.3


def v_sinebass(f, dur, sr, vel):  # 巴洛克通奏低音（管风琴低音）
    hold = max(dur, 0.3)
    t = _t(int((hold + 0.2) * sr), sr)
    x = (np.sin(2 * np.pi * f * t) + 0.35 * np.sin(2 * np.pi * f * 2 * t)) * np.exp(-t * 1.2)
    env = np.ones(len(x))
    env[: int(0.02 * sr)] = np.linspace(0, 1, int(0.02 * sr))
    x *= env * vel * 0.7
    return x, 0.2


def v_organ(f, dur, sr, vel):
    t = _t(int((dur + 0.18) * sr), sr)
    amps = [1, 0.5, 0.35, 0.22, 0.12, 0.08]
    x = np.zeros_like(t)
    for i, a in enumerate(amps, start=1):
        x += a * np.sin(2 * np.pi * f * i * t + i)
    trem = 1 + 0.03 * np.sin(2 * np.pi * 5.3 * t)
    env = np.ones_like(t)
    a, r = int(0.03 * sr), int(0.12 * sr)
    env[:a] = np.linspace(0, 1, a)
    env[-r:] *= np.linspace(1, 0, r)
    x = _lowpass(x * trem * env, sr, 5200)
    x *= vel * 0.3
    return x, 0.18


def v_pad(f, dur, sr, vel):  # 柔和合成垫（夜色类曲目）
    t = _t(int((dur + 0.9) * sr), sr)
    x = np.zeros_like(t)
    for d in (-7, 0, 7):
        x += np.sin(2 * np.pi * f * (1 + d / 1500.0) * t) + 0.3 * np.sin(2 * np.pi * f * 2 * t)
    x /= 3
    a = int(0.35 * sr)
    env = np.ones_like(t)
    env[: min(a, len(t))] = np.linspace(0, 1, min(a, len(t)))
    env[-int(0.5 * sr):] *= np.linspace(1, 0, int(0.5 * sr))
    x = _lowpass(x * env, sr, 2600)
    x *= vel * 0.26
    return x, 0.9


# ==== 打击乐 ====
def v_kick(dur, sr, vel):
    t = _t(int(0.32 * sr), sr)
    f = 62 * np.exp(-t * 26) + 34
    x = np.sin(2 * np.pi * np.cumsum(f) / sr) * np.exp(-t * 13)
    return x * vel * 0.9, 0.32


def v_snare(dur, sr, vel):
    t = _t(int(0.2 * sr), sr)
    n = _bandpass(_noise(len(t), sr), sr, 1900, 0.8) * np.exp(-t * 26)
    tone = np.sin(2 * np.pi * 190 * t) * np.exp(-t * 34) * 0.35
    return _highpass(n + tone, sr, 260) * vel * 0.5, 0.2


def v_hat(dur, sr, vel):
    t = _t(int(0.07 * sr), sr)
    x = _highpass(_noise(len(t), sr), sr, 7200) * np.exp(-t * 60)
    return x * vel * 0.22, 0.07


def v_roll(dur, sr, vel):
    n = int(dur * sr)
    t = np.arange(n) / sr
    x = _bandpass(_noise(n, sr), sr, 2200, 0.9) * np.exp(-t * 2.0)
    x *= 0.5 + 0.5 * np.sin(2 * np.pi * 14 * t)
    env = np.ones(n)
    if len(env) > 40:
        env[:40] = np.linspace(0, 1, 40)
        env[-40:] *= np.linspace(1, 0, 40)
    return x * env * vel * 0.34, 0.05


def v_cymbal(dur, sr, vel):
    t = _t(int(1.4 * sr), sr)
    x = _highpass(_noise(len(t), sr), sr, 5200) * np.exp(-t * 4.2)
    return x * vel * 0.3, 1.4


def v_tambourine(dur, sr, vel):
    t = _t(int(0.3 * sr), sr)
    x = _highpass(_noise(len(t), sr), sr, 6000) * np.exp(-t * 16)
    return x * vel * 0.28, 0.3


# ==== 表 ====
ALIAS = {
    "humm": "pad",
    "bagpipes": "reed",
    "sax": "reed",
    "panpipes": "flute",
    "fife": "flute",
    "trumpet": "brass", "horn": "brass", "trombone": "brass", "tuba": "brass", "brass": "brass",
    "violin": "strings", "viola": "strings", "cello": "strings", "ensemble": "strings",
    "oboe": "reed", "clarinet": "reed", "pipe": "reed", "bagpipe": "reed",
    "guitar": "lute", "mandolin": "lute", "vihuela": "lute",
    "celesta": "musicbox", "glockenspiel": "musicbox", "bell": "musicbox",
    "pizz": "harp", "pizzicato": "harp", "luteharp": "harp",
    "synth": "pad", "choir": "pad",
}
TUNED = {
    "piano": v_piano,
    "harp": v_harp,
    "lute": v_lute,
    "harpsichord": v_harpsichord,
    "musicbox": v_musicbox,
    "strings": v_strings,
    "flute": v_flute,
    "reed": v_reed,
    "brass": v_brass,
    "bass": v_bass,
    "sinebass": v_sinebass,
    "organ": v_organ,
    "pad": v_pad,
}
PERC = {"kick": v_kick, "snare": v_snare, "hat": v_hat, "roll": v_roll,
        "cymbal": v_cymbal, "tamb": v_tambourine}


def note(name, midi, dur, sr, vel=1.0):
    """带缓存的音符合成"""
    key = (name, midi, min(round(dur, 2), 3.4), round(vel, 2))
    got = CACHE.get(key)
    if got is not None:
        return got
    f = 440.0 * 2 ** ((midi - 69) / 12.0)
    fn = TUNED.get(ALIAS.get(name, name))
    if fn is None:
        raise KeyError("未知音色 %r" % name)
    x, tail = fn(f, dur, sr, vel)
    x = np.asarray(x, dtype=np.float64)
    CACHE[key] = (x, tail)
    if len(CACHE) > 60000:
        CACHE.clear()
        CACHE[key] = (x, tail)
    return x, tail


def perc(name, sr, dur=0.2, vel=1.0):
    x, tail = PERC[name](dur, sr, vel)
    return np.asarray(x, dtype=np.float64), tail


def make_ir(sr, seconds=1.7, decay=5.2, mix_stereo=False):
    """简易混响冲激：噪声 * 指数衰减 + 几个早期反射"""
    n = int(seconds * sr)
    t = np.arange(n) / sr
    rnd = np.random.default_rng(7)
    body = rnd.uniform(-1, 1, n) * np.exp(-t * decay)
    # 低频少一点、高频多一点扩散
    body = _lowpass(body, sr, 3800)
    early = [0.011, 0.019, 0.031, 0.047, 0.068, 0.091]
    for i, e in enumerate(early):
        k = int(e * sr)
        if k < n:
            body[k] += 0.4 * (0.7 ** i)
    body[: int(0.002 * sr)] *= np.linspace(0, 1, int(0.002 * sr))
    body /= np.sqrt(np.sum(body ** 2) + 1e-9)
    return body * 0.55
