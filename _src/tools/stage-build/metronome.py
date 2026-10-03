"""舞台演奏 · 延迟校准用的节拍音（assets/bard/stage/metronome.mp3）
和曲目走同一条编码流程（render.write_mp3），校准量到的偏差才和正式演奏一致。
拍点：LEAD 秒后开始，每 GAP 秒一下，共 COUNT 下 —— 改了要同步改 bard-stage.js 里的 CAL。
用法：python3 metronome.py
"""
import os
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import render

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.environ.get("HJ_REPO") or os.path.abspath(os.path.join(HERE, "..", "..", ".."))
OUT = os.path.join(REPO, "assets", "bard", "stage", "metronome.mp3")

LEAD, GAP, COUNT = 1.2, 0.6, 10


def click(sr):
    """木鱼似的短促「嗒」：起音陡，50 ms 内衰完，拍点就是第一个采样"""
    t = np.arange(int(0.06 * sr)) / sr
    env = np.exp(-t * 70.0)
    y = 0.75 * np.sin(2 * np.pi * 1480 * t) + 0.35 * np.sin(2 * np.pi * 2960 * t) + 0.12 * np.sin(2 * np.pi * 740 * t)
    return (y * env).astype(np.float32)


def main():
    sr = render.SR
    total = LEAD + GAP * (COUNT - 1) + 0.9
    x = np.zeros(int(total * sr), dtype=np.float32)
    c = click(sr)
    for k in range(COUNT):
        i = int(round((LEAD + k * GAP) * sr))
        x[i:i + len(c)] += c
    x = 0.8 * x / np.max(np.abs(x))
    render.write_mp3(OUT, x, sr=sr, bitrate="64k")
    print("metronome ->", OUT, "%.2fs" % total)


if __name__ == "__main__":
    main()
