"""花街舞台 · 曲库（对应《吟游诗人模拟器_公版音游候选曲库》PDF 的层级）

每首两份音轨：伴奏（游戏时钟）+ 演奏（示范轨），外加谱面 notes（easy/normal/hard）。
旋律为主题简化改编（拍点规整化、去自由速度），和声与编曲为本站自行编写。
"""
from songs_a import SONGS as _A
from songs_b import SONGS as _B
from songs_c import SONGS as _C

SONGS = _A + _B + _C
BY_ID = {s["id"]: s for s in SONGS}
