"""曲库 C：民歌 / 交响诗 / 拉格泰姆（含两首「轮廓改编」，标题里已注明）"""

SONGS = [
    dict(
        id="greensleeves", t="绿袖子", o="Greensleeves", c="传统英格兰曲调",
        note="6/8 摇曳 + 长音，Perfect 判定窗口很宽",
        bpm=168, bpb=6, style="waltz", perc="soft", diff=2, tag="民谣",
        mel_inst="lute", acc={"chord": "harp", "bass": "harp", "pad": "strings"},
        mel="""-:5 a4:1 | c5:2 d5:1 e5:2 f5:1 | d5:2 b4:1 g4:2 b4:1 | c5:2 a4:4 |
               b4:2 g4:1 e4:2 -:1 | -:5 a4:1 | c5:2 d5:1 e5:2 f5:1 | d5:2 b4:1 g4:1 b4:1 c5:1 |
               a4:6 | -:3 e5:3 | f5:2 e5:1 d5:2 e5:1 | c5:2 d5:1 a4:3 |
               -:3 b4:3 | c5:2 b4:1 a4:2 g#4:1 | a4:3 e5:3 | d5:2 c5:1 b4:2 a4:1 | g#4:3 a4:3 |
               a4:6""",
        har="""Am | Am | G | C | Am | Am | G | F |
               Am | Am | C | Am | E | Am | E | Am |
               Am | C | G | Am | E7 | Am""",
        final_chord=57,
        acc_reverb=0.34,
    ),
    dict(
        id="amazing-grace", t="奇异恩典", o="Amazing Grace（曲调 New Britain）", c="传统圣咏曲调（约翰·纽顿 词）",
        note="三音上行大跳开头，长音收尾，疗愈向",
        bpm=96, bpb=3, style="minuet", perc="none", diff=1, tag="谢幕",
        mel_inst="harp", acc={"chord": "pad", "bass": "strings", "pad": "strings"},
        mel="""-:2 g4:1 | d5:1 g5:1 b4:1 | a4:1 g4:1 e4:1 | d4:2 -:1 |
               -:2 g4:1 | d5:1 g5:1 b4:1 | a4:1 g4:1 d4:2 | g4:3 |
               -:2 b4:1 | d5:1 b4:1 d5:1 | b4:1 g4:1 d5:1 | e5:1 g5:1 g5:1 | e5:1 d5:2 |
               -:2 g4:1 | d5:1 g5:1 b4:1 | a4:1 g4:1 e4:1 | g4:3""",
        har="""G | G | C | G | G | G | D | G | G | G | C | G | D | G | C | D | G""",
        final_chord=67,
        acc_reverb=0.42,
    ),
    dict(
        id="moldau", t="伏尔塔瓦河（主题）", o="Die Moldau / Vltava — 主题", c="斯美塔那《我的祖国》",
        note="主题骨架取自公版 MIDI，速度规整化；长线条，练「跟住」",
        bpm=150, bpb=6, style="ostinato", perc="none", diff=2, tag="交响诗",
        mel_inst="violin", acc={"chord": "harp", "bass": "strings", "pad": "pad"},
        mel="""-:1 e5:2 f#5:1 g5:2 | a5:1 b5:2 b5:1 b5:2 | c6:3 c6:2 b5:1 | b5:2 a5:2 a5:2 |
               g5:2 a5:1 g5:2 f#5:1 | f#5:3 e5:3 | e5:2 f#5:1 g5:3 | a5:1 b5:2 c6:3 |
               d6:3 c6:2 b5:1 | b5:2 a5:2 g5:2 | f#5:2 g5:1 f#5:2 e5:1 | e5:6 |
               -:1 c5:2 d5:1 e5:2 | f#5:1 g5:2 a5:1 b5:2 | c6:1 d6:2 b5:3 | c6:1 b5:3 a5:2 |
               e5:2 f#5:1 g5:3 | a5:1 b5:2 c6:3 | b5:2 a5:2 g5:2 | f#5:3 e5:3""",
        har="""Em | Em | C | G | Am | B7 | Em | Em |
               C | G | Am | B7 | Em | C | G | Am |
               Em | C | G | B7 | Em | Em | C | Em""",
        reverb=0.42, acc_reverb=0.45,
    ),
    dict(
        id="flower-duet", t="花之二重唱（器乐版）", o="The Flower Duet — Sous le dôme épais", c="德利布《拉克美》",
        note="6/8 弱起切分：拍点不在小节头上，练「听觉节拍器」",
        bpm=174, bpb=6, style="arp", perc="none", diff=3, tag="抒情",
        mel_inst="flute", acc={"chord": "harp", "bass": "harp", "pad": "pad"},
        mel="""-:1 d#5:1 b4:1 g#4:1 d#5:1 e5:1 | d#5:1 -:1 b4:1 g#4:1 d#5:1 e5:1 |
               d#5:1 e5:1 f#5:1 g#5:1 -:1 f#5:1 | e5:1 d#5:1 c#5:1 b4:1 c#5:1 a#4:1 |
               -:1 d#5:1 b4:1 g#4:1 d#5:1 e5:1 | d#5:1 -:1 b4:1 g#4:1 d#5:1 f#5:1 |
               g#5:1 f#5:1 e5:1 d#5:1 c#5:1 d#5:1 | b4:3 -:3 |
               -:1 c#5:1 a#4:1 f#5:1 e5:1 d#5:1 | c#5:1 d#5:1 g#4:1 a#4:1 d#5:1 c#5:1 |
               b4:1 d#5:1 e5:1 f#5:2 g#5:1 | e5:1 b4:1 g#5:1 b5:3 |
               g#5:1 e5:1 d#5:2 c#5:2 | b4:1 g#4:1 b4:1 d#5:1 e5:1 d#5:1 |
               g#5:1 a#5:1 b5:2 a#5:1 g#5:1 | f#5:3 -:3""",
        har="""B | B | F# | G#m | B | F# | G#m | B |
               E | G#m | C#m | F# | B | G#m | F# | B""",
        final_chord=71,
        reverb=0.4, acc_reverb=0.45,
    ),
    dict(
        id="maple-leaf-rag", t="枫叶拉格", o="Maple Leaf Rag — A 段", c="斯科特·乔普林",
        note="A 段旋律取自 Mutopia 公版谱的右手声部；反拍重音是重点",
        bpm=132, bpb=2, style="stride", perc="pop", diff=4, tag="切分",
        mel_inst="piano", acc={"chord": "piano", "bass": "sinebass", "pad": "pad"},
        mel="""-:0.25 eb5:0.25 c5:0.5 eb5:0.25 f5:0.25 eb5:0.5 |
               ab5:0.25 f5:0.25 eb5:0.25 c5:0.25 eb5:0.5 f5:0.5 |
               -:0.25 eb5:0.25 g5:0.5 f5:0.25 eb5:0.25 c5:0.5 |
               ab5:0.5 bb5:0.25 c6:0.25 db6:1 |
               eb6:0.25 c6:0.25 bb5:0.25 ab5:0.25 bb5:0.5 ab5:0.5 |
               f5:0.25 eb5:0.25 c5:0.25 eb5:0.25 f5:0.5 eb5:0.5 |
               ab5:0.5 bb5:0.25 c6:0.25 db6:0.5 eb6:0.5 |
               db6:1 -:1 |
               -:0.25 f5:0.25 eb5:0.25 f5:0.25 ab5:0.5 f5:0.25 eb5:0.25 |
               db5:0.25 eb5:0.25 f5:0.5 ab5:0.25 bb5:0.25 c6:0.5 |
               bb5:0.25 ab5:0.25 f5:0.25 eb5:0.25 ab5:0.5 bb5:0.5 |
               c6:0.5 ab5:0.25 bb5:0.25 ab5:0.5 f5:0.5 |
               -:0.25 eb5:0.25 c5:0.25 eb5:0.25 f5:0.25 eb5:0.25 f5:0.25 |
               eb5:0.25 c5:0.25 eb5:0.25 ab4:0.25 c5:0.25 eb5:0.25 f5:0.25 eb5:0.25 |
               db5:1 -:1""",
        har="""Db | Ab7 | Db | Gb | Db | Ab7 | Db | Db |
               Bbm | Eb7 | Ab | Db | Bbm | Eb7 | Ab | Db""",
        final_chord=61,
        acc_reverb=0.22,
    ),
    dict(
        id="ragtime-two-step", t="拉格泰姆二步进", o="Ragtime Two-Step（风格仿作，非原谱）", c="乔普林风格 · 本站编",
        note="这一首是「乔普林风格」原创练习曲，不是原谱改编",
        bpm=138, bpb=2, style="stride", perc="pop", diff=4, tag="切分",
        mel_inst="piano", acc={"chord": "piano", "bass": "sinebass", "pad": "pad"},
        mel="""-:0.25 c5:0.25 f5:0.25 e5:0.25 d5:0.25 c5:0.5 |
               d5:0.25 e5:0.25 f5:0.5 a5:0.25 g5:0.25 f5:0.5 |
               -:0.25 e5:0.25 g5:0.25 a5:0.25 c6:0.5 a5:0.25 g5:0.25 |
               f5:0.25 d5:0.25 g5:0.25 f5:0.25 e5:0.25 c5:0.25 d5:0.25 e5:0.25 |
               f5:1 -:0.5 g5:0.5 |
               a5:0.25 g5:0.25 f5:0.25 e5:0.25 d5:0.25 c5:0.25 b4:0.25 c5:0.25 |
               d5:0.5 f5:0.25 a5:0.25 g5:0.5 f5:0.5 |
               e5:0.25 c5:0.25 d5:0.25 f5:0.25 e5:0.25 d5:0.25 c5:1""",
        har="""F | C7 | F | Bb | C7 | F | Bb,F | C7,F |
               F | C7 | Dm,A7 | Dm,A7 | Gm,C7 | F,C7 | Bb,F | C7,F""",
        final_chord=65,
        acc_reverb=0.22,
    ),
    dict(
        id="nachtmsik-rondo", t="小夜曲 · 回旋曲", o="Eine kleine Nachtmusik — Rondo（主题轮廓改编）", c="莫扎特",
        note="6/8 跳跃主题：八度大跳后接音阶，练跨手位",
        bpm=168, bpb=6, style="gigue", perc="soft", diff=3, tag="宫廷",
        mel_inst="violin", acc={"chord": "piano", "bass": "harp", "pad": "strings"},
        mel="""d5:1 d6:2 c#6:1 d6:2 | e6:1 d6:1 c#6:1 b5:1 a5:1 g5:1 | f#5:2 a5:2 d6:2 |
               c#6:1 d6:2 e6:1 f#6:1 g6:2 | f#6:1 e6:1 d6:1 c#6:1 b5:1 a5:1 | g5:3 a5:3 |
               d6:2 a5:1 f#5:2 d5:1 | a5:1 b5:1 c#6:1 d6:3 |
               d5:1 d6:2 c#6:1 d6:2 | e6:1 d6:1 c#6:1 b5:1 a5:1 g5:1 | f#5:2 a5:2 d6:2 |
               c#6:2 d6:4 | g5:1 a5:1 b5:1 c#6:1 d6:1 e6:1 | f#6:3 g6:3 | f#6:2 e6:2 d6:2 | d6:6""",
        har="""D | D | D | A | D | D | A | D |
               D | D | D | A | G | A | D | D""",
        final_chord=62,
        acc_reverb=0.26,
    ),
    dict(
        id="turkish-extended", t="土耳其进行曲 · 主题扩展版", o="Rondo alla turca — 主题 + 三声中部", c="莫扎特（扩展编曲）",
        note="同一条主题的加长版：A–B–A，中段换 C 大调",
        bpm=140, bpb=2, style="march", perc="march", diff=4, tag="进行曲",
        mel_inst="piano", acc={"chord": "trumpet", "bass": "bass", "pad": "strings"},
        mel="""b4:0.5 a4:0.5 g#4:0.5 a4:0.5 | c5:1 | d5:0.5 c5:0.5 b4:0.5 c5:0.5 | e5:1 |
               f5:0.5 e5:0.5 d#5:0.5 e5:0.5 | b5:0.5 a5:0.5 g#5:0.5 a5:0.5 | b5:1 a5:1 | g#5:2 |
               a4:1 c5:1 | e5:1 a5:1 | g5:1 f5:1 | e5:1 d5:1 | c5:1 b4:1 | a4:1 g#4:1 | a4:2 |
               a5:1 a5:1 | a5:0.5 g5:0.5 f5:0.5 e5:0.5 | d5:1 e5:1 | f5:1 e5:1 |
               d5:1 c5:1 | b4:1 a4:1 | g4:1 a4:1 | b4:1 a4:1 | g4:1 f4:1 | e4:2 |
               c5:1 c5:1 | c5:0.5 b4:0.5 a4:0.5 g4:0.5 | a4:1 b4:1 | c5:2 |
               b4:0.5 a4:0.5 g#4:0.5 a4:0.5 | c5:1 | d5:0.5 c5:0.5 b4:0.5 c5:0.5 | e5:1 |
               f5:0.5 e5:0.5 d#5:0.5 e5:0.5 | b5:0.5 a5:0.5 g#5:0.5 a5:0.5 | b5:1 a5:1 | a4:2""",
        har="""Am,Am | Am,Am | E,E | Am,Am | Am,Am | E,E | E,Am | Am,Am |
               Am,Am | E,E | Am,Am | E,Am | Am,Am | E,Am | Am,Am | Am,Am |
               A,A | A,E | A,E | A,A | E,E | E,A | A,E | A,A |
               F,F | G,G | C,C | C,F | Am,Am | E,E | E,Am | Am,Am""",
        final_chord=57,
        acc_reverb=0.24,
    ),
]
