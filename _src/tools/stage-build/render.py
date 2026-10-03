"""渲染：把拍子上的事件变成音频（时间轴由速度表决定，音游谱面和音频共用同一套换算）。"""
import os
import subprocess
import tempfile
import numpy as np
import soundfile as sf
from scipy import signal as sg

import voices

SR = 32000


class Tempo:
    """分段速度表：[(起始拍, BPM), ...]"""

    def __init__(self, map_):
        self.map = list(map_) if isinstance(map_, list) else [(0.0, float(map_))]
        if self.map[0][0] != 0:
            self.map.insert(0, (0.0, self.map[0][1]))
        self.beats, self.cum, self.bpm = [], [], []
        t = 0.0
        for i, (b, bpm) in enumerate(self.map):
            if i:
                b0, bpm0 = self.map[i - 1]
                t += (b - b0) * 60.0 / bpm0
            self.beats.append(b)
            self.cum.append(t)
            self.bpm.append(bpm)

    def sec(self, beat):
        i = 0
        while i + 1 < len(self.beats) and self.beats[i + 1] <= beat + 1e-9:
            i += 1
        b0, bpm = self.beats[i], self.bpm[i]
        return self.cum[i] + (beat - b0) * 60.0 / bpm

    @property
    def total_sec(self):
        b, bpm = self.map[-1]
        return self.sec(b + 0.0001)

    def spb(self, beat):
        i = 0
        while i + 1 < len(self.beats) and self.beats[i + 1] <= beat + 1e-9:
            i += 1
        return 60.0 / self.bpm[i]


def render_events(events, tempo, sr=SR, tail=2.4, reverb=0.24, gains=None, pans=None):
    """events: [(beat, dur_beats, midi_or_name, voice, gain)] -> (numpy, 每拍起点秒表)"""
    gains = gains or {}
    end = 0.0
    pre = []
    for (b, d, m, v, g) in events:
        t = tempo.sec(b)
        dur = max(tempo.sec(b + d) - t, 0.06) if d else 0.06
        pre.append((t, dur, m, v, g))
        end = max(end, t + (dur if v != "p" else 0.6))
    n = int((end + tail) * sr)
    stems = {}
    for (t, dur, m, v, g) in pre:
        gv = g * gains.get(v, 1.0)
        if gv <= 0:
            continue
        if v == "p":
            x, tl = voices.perc(m.split(":", 1)[1], sr, dur, gv)
        else:
            x, tl = voices.note(v, m, dur, sr, gv)
        if not len(x):
            continue
        stem = stems.setdefault(v, np.zeros(n))
        i = int(t * sr)
        j = min(n, i + len(x))
        if j > i:
            stem[i:j] += x[: j - i]
    out = np.zeros(n)
    ir = voices.make_ir(sr, 1.6, 5.4) if reverb > 0 else None
    for v, stem in stems.items():
        dry = stem.copy()
        if ir is not None and v != "p":
            wet = sg.fftconvolve(stem, ir)[:n] * reverb * (1.35 if v in ("strings", "pad", "flute", "musicbox") else 1.0)
        elif ir is not None:
            wet = sg.fftconvolve(stem, voices.make_ir(sr, 0.55, 11.0))[:n] * reverb * 0.35
        else:
            wet = 0.0
        peak = np.max(np.abs(dry)) or 1.0
        dry *= min(1.0, 0.62 / peak)
        out += dry
        if ir is not None:
            out += wet
    return out


def normalize(x, peak=0.9):
    m = float(np.max(np.abs(x))) or 1.0
    return x * (peak / m)


def soft_clip(x, drive=1.06):
    return np.tanh(x * drive) / np.tanh(drive)


def write_mp3(path, x, sr=SR, bitrate="64k", mono=True):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    ff = __import__("imageio_ffmpeg").get_ffmpeg_exe()
    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
        wav = tmp.name
    sf.write(wav, np.asarray(x, dtype=np.float32), sr, subtype="FLOAT")
    cmd = [ff, "-y", "-loglevel", "error", "-i", wav, "-ac", "1" if mono else "2", "-ar", str(sr),
           "-c:a", "libmp3lame", "-b:a", bitrate, path]
    subprocess.run(cmd, check=True)
    os.unlink(wav)


def write_ogg(path, x, sr=SR, q=2):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    ff = __import__("imageio_ffmpeg").get_ffmpeg_exe()
    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
        wav = tmp.name
    sf.write(wav, np.asarray(x, dtype=np.float32), sr, subtype="FLOAT")
    subprocess.run([ff, "-y", "-loglevel", "error", "-i", wav, "-ac", "1", "-ar", str(sr),
                    "-c:a", "libvorbis", "-q:a", str(q), path], check=True)
    os.unlink(wav)


def _ascii_txt(t):
    """MIDI meta 只支持 latin-1：非拉丁字符丢掉，保留英文名"""
    return "".join(ch for ch in (t or "") if ord(ch) < 256).strip() or "score"


def write_midi(path, melody_events, acc_events, tempo, program_mel=0, program_acc=0, title=""):
    """导出扒谱结果（演奏 = melody 轨，伴奏 = 和声轨），方便你自己再改"""
    from mido import MidiFile, MidiTrack, MetaMessage, Message

    mid = MidiFile()
    mid.ticks_per_beat = 96
    tpq = 96

    def add(name, events, program, chan):
        tr = MidiTrack()
        mid.tracks.append(tr)
        tr.append(MetaMessage("track_name", name=_ascii_txt(name), time=0))
        if title and chan == 0:
            tr.append(MetaMessage("text", text=_ascii_txt(title), time=0))
        tr.append(MetaMessage("set_tempo", tempo=int(60e6 / tempo.bpm[0]), time=0))
        for b, bpm in tempo.map[1:]:
            tr.append(MetaMessage("set_tempo", tempo=int(60e6 / bpm), time=int(b * tpq)))
        tr.append(Message("program_change", program=program, channel=chan, time=0))
        rows = []
        for (t, d, m, v, g) in events:
            if v == "p":
                num = {"p:kick": 36, "p:snare": 38, "p:hat": 42, "p:roll": 37, "p:cymbal": 49, "p:tamb": 54}[m]
                rows.append((t, 0.12, num, 70))
            else:
                rows.append((t, max(d, 0.12), m, int(30 + 90 * g)))
        rows.sort(key=lambda r: r[0])
        cur = 0.0
        for (t, d, note, vel) in rows:
            dt = int(round(t * tpq)) - int(round(cur * tpq))
            cur = t
            tr.append(Message("note_on", note=note, velocity=max(20, min(127, vel)), time=max(dt, 0)))
            tr.append(Message("note_off", note=note, velocity=0, time=int(round(d * tpq))))
        tr.append(MetaMessage("end_of_track", time=0))

    add("Performance", melody_events, program_mel, 0)
    add("Accompaniment", acc_events, program_acc, 1)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    mid.save(path)
