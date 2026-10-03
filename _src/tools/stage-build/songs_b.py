"""曲库 B：浪漫派 / 标题音乐 / 民歌与进行曲游戏化版本"""

SONGS = [
    dict(
        id="spring-vivaldi", t="四季 · 春", o="The Four Seasons — Spring, RV 269 I", c="维瓦尔第",
        note="鸟鸣段做成上下跳的小气泡",
        bpm=132, bpb=4, style="baroque", perc="none", diff=3, tag="季节",
        mel_inst="violin", acc={"chord": "harpsichord", "bass": "harp", "pad": "strings"},
        mel="""e5:1 e5:1 e5:0.5 f#5:0.5 g5:1 | g5:1 f#5:1 e5:1 d5:1 | c#5:1 d5:1 e5:2 |
               b4:1 c#5:1 d5:1 e5:1 | a4:1 b4:1 c#5:1 d5:1 | g4:1 a4:1 b4:1 c#5:1 |
               e5:0.5 e5:0.5 e5:1 b4:2 | e5:4 |
               a5:1 g5:1 f#5:1 e5:1 | d5:1 e5:1 f#5:1 g5:1 | e5:1 d5:1 c#5:1 b4:1 | a4:4 |
               g5:1 f#5:1 e5:1 d5:1 | c#5:1 d5:1 e5:1 f#5:1 | g5:2 a5:1 b5:1 | e5:4""",
        har="""C,C | G,G | C,G | C,G | C,G | F,G | C,G | C,C |
               F,C | G,C | C,F | G,G | C,G | F,G | C,G | C,C""",
        final_chord=60,
    ),
    dict(
        id="summer-storm", t="四季 · 夏（暴风雨）", o="The Four Seasons — Summer, RV 315 III", c="维瓦尔第",
        note="连续十六分，密度最高的一关",
        bpm=176, bpb=4, style="perpetuum", perc="none", diff=5, tag="Boss",
        mel_inst="violin", acc={"chord": "strings", "bass": "sinebass", "pad": "strings"},
        mel="""g5:0.5 f5:0.5 e5:0.5 d5:0.5 c5:0.5 d5:0.5 e5:0.5 f5:0.5 |
               g5:0.5 a5:0.5 g5:0.5 f5:0.5 e5:0.5 d5:0.5 c5:0.5 b4:0.5 |
               a4:0.5 b4:0.5 c5:0.5 d5:0.5 e5:0.5 f5:0.5 g5:0.5 a5:0.5 | g5:1 f5:1 e5:1 d5:1 |
               c5:0.5 d5:0.5 e5:0.5 f5:0.5 g5:0.5 a5:0.5 b5:0.5 c6:0.5 |
               d6:0.5 c6:0.5 b5:0.5 a5:0.5 g5:0.5 f5:0.5 e5:0.5 d5:0.5 |
               c5:0.5 b4:0.5 a4:0.5 g4:0.5 f4:0.5 g4:0.5 a4:0.5 b4:0.5 | c5:4 |
               g5:0.5 f5:0.5 e5:0.5 d5:0.5 c5:0.5 d5:0.5 e5:0.5 f5:0.5 |
               g5:0.5 a5:0.5 b5:0.5 c6:0.5 d6:0.5 c6:0.5 b5:0.5 a5:0.5 |
               g5:0.5 f5:0.5 e5:0.5 d5:0.5 c5:0.5 b4:0.5 a4:0.5 g4:0.5 | a4:4""",
        har="""C,C | G,G | C,C | F,G | C,C | G,G | F,G | C,C | C,G | C,G | F,G | C,C""",
        acc_reverb=0.25,
    ),
    dict(
        id="autumn-feast", t="四季 · 秋", o="The Four Seasons — Autumn, RV 293 I", c="维瓦尔第",
        note="庆祝丰收的舞曲节奏",
        bpm=144, bpb=4, style="gigue", perc="soft", diff=3, tag="季节",
        mel_inst="violin", acc={"chord": "harpsichord", "bass": "harp", "pad": "strings"},
        mel="""f5:1 f5:1 f5:1 f5:1 | e5:1 f5:1 g5:2 | f5:1 e5:1 d5:1 c5:1 | a4:1 c5:1 d5:2 |
               f5:1 f5:1 f5:1 e5:1 | d5:1 e5:1 f5:2 | e5:1 d5:1 c5:1 b4:1 | a4:4 |
               d5:1 e5:1 f5:1 g5:1 | a5:1 g5:1 f5:1 e5:1 | d5:1 c5:1 b4:1 a4:1 | g4:4 |
               f5:1 g5:1 a5:1 b5:1 | c6:1 b5:1 a5:1 g5:1 | f5:1 e5:1 d5:1 c5:1 | f5:4""",
        har="""Dm,Dm | A,A | Bb,Bb | F,F | C,C | Bb,Bb | A,A | Dm,Dm |
               Gm,Gm | A,A | Dm,Dm | Bb,F | C,A | Dm,Dm | A,A | Dm,Dm""",
        final_chord=50,
    ),
    dict(
        id="winter-1", t="四季 · 冬", o="The Four Seasons — Winter, RV 297 I", c="维瓦尔第",
        note="冰晶气泡 + 抖动的重复音",
        bpm=100, bpb=4, style="ostinato", perc="none", diff=4, tag="季节",
        mel_inst="violin", acc={"chord": "strings", "bass": "sinebass", "pad": "pad"},
        mel="""a5:1 g5:1 f5:1 e5:1 | d5:1 c5:1 b4:1 a4:1 | a4:1 b4:1 c5:1 d5:1 | e5:4 |
               f5:1 e5:1 d5:1 c5:1 | b4:1 a4:1 g4:1 f4:1 | e4:1 f4:1 g4:1 a4:1 | a4:4 |
               c6:0.5 c6:0.5 c6:0.5 c6:0.5 b5:0.5 a5:0.5 g5:0.5 f5:0.5 |
               e5:0.5 f5:0.5 g5:0.5 a5:0.5 b5:0.5 a5:0.5 g5:0.5 f5:0.5 |
               e5:1 d5:1 c5:1 b4:1 | a4:1 g4:1 f4:1 e4:1 | d4:2 -:2 |
               f4:1 g4:1 a4:1 d5:1 | a4:1 b4:1 c5:1 f5:1 | d5:4""",
        har="""Dm,Dm | Gm,Gm | A,A | Dm,Dm | Bb,Bb | Gm,Gm | Am,A | Dm,Dm |
               Dm,A | Bb,F | Gm,A | Dm,Dm | Bb,F | C,F | Gm,A | Dm,Dm""",
        acc_reverb=0.3,
    ),
    dict(
        id="swan-lake", t="天鹅湖主题", o="Swan Lake — Scene, Op. 20", c="柴可夫斯基",
        note="长旋律、宽松判定",
        bpm=76, bpb=4, style="pad", perc="none", diff=2, tag="夜景",
        mel_inst="reed", acc={"chord": "strings", "bass": "strings", "pad": "pad"},
        mel="""b4:3 d5:1 | c5:2 b4:1 a4:1 | b4:1 a4:1 g#4:1 e4:1 | a4:2 g#4:2 |
               a4:1.5 b4:0.5 c#5:2 d5:1 b4:1 | a4:2 g#4:1 e4:1 | b4:4 |
               d5:2 f5:2 | e5:2 d5:1 c#5:1 | b4:1 c#5:1 d5:1 e5:1 | c#5:2 b4:2 |
               a4:2 b4:1 c5:1 | d5:1 c5:1 b4:1 a4:1 | g#4:2 a4:2 | b4:4""",
        har="""Bm,Bm | Em,Em | Bm,F# | Bm,Bm | Em,C#m | F#,F#7 | Bm,Bm | Bm,G |
               Em,Em | A,D | G,G | Em,C#m | F#,F# | Bm,Bm""",
        reverb=0.42,
    ),
    dict(
        id="blue-danube", t="蓝色多瑙河", o="An der schönen blauen Donau, Op. 314", c="小约翰·施特劳斯",
        note="三拍子摆动，Perfect 时可以轻轻摇",
        bpm=138, bpb=3, style="waltz", perc="waltz", diff=2, tag="华尔兹",
        mel_inst="violin", acc={"chord": "harp", "bass": "harp", "pad": "strings"},
        mel="""a4:1 c#5:1 e5:1 | a5:2 g#5:1 | a5:1 b5:1 c#6:1 | d6:2 c#6:1 |
               b5:1 a5:1 g#5:1 | a5:2 e5:1 | f#5:1 g#5:1 a5:1 | b5:3 |
               a5:1 g#5:1 a5:1 | b5:1 c#6:1 d6:1 | e6:2 d6:1 | c#6:1 b5:1 a5:1 |
               g#5:1 a5:1 b5:1 | c#6:3 | d6:1 c#6:1 b5:1 | a5:3 |
               e5:1 a5:1 c#6:1 | b5:1 a5:1 g#5:1 | a5:2 f#5:1 | g#5:1 a5:1 b5:1 |
               c#6:2 b5:1 | a5:1 g#5:1 a5:1 | e5:2 c#5:1 | a4:3""",
        har="""A,A | E,E | A,A | D,A | E,A | A,E | D7,A | A,A |
               A,F#m | D,A | E,A | A,E | D,A | A,A | E,A | A,A |
               A,A | E,E | A,D | E,A | A,D | E,A | A,E | A,A""",
        acc_reverb=0.34,
    ),
    dict(
        id="morning-mood", t="晨景", o="Morning Mood（《培尔·金特》第一组曲）", c="格里格",
        note="长音多、密度低，适合「跟着呼吸点」",
        bpm=80, bpb=6, style="pad", perc="none", diff=1, tag="夜景",
        mel_inst="flute", acc={"chord": "strings", "bass": "strings", "pad": "pad"},
        mel="""-:2 e5:1 | f#5:1 e5:1 b4:1 c#5:2 | e5:3 b4:3 | c#5:2 b4:1 g#4:1 e4:1 | g#4:1 b4:1 e5:3 |
               -:2 b4:1 | c#5:1 e5:1 f#5:2 e5:1 | d#5:3 e5:3 | f#5:2 g#5:1 a5:3 | b5:6 |
               -:2 e5:1 | f#5:1 g#5:1 a5:2 b4:1 | c#5:1 b4:1 a4:1 g#4:1 e4:1 | g#4:1 a4:1 b4:3 | e5:6""",
        har="""E,E | C#m,B | A,E | B,E | E,E | C#m,A | E,B | C#m,B | E,E | A,B |
               C#m,B | G#m,C#m | F#m,B | E,E""",
        reverb=0.42, acc_reverb=0.45,
    ),
    dict(
        id="solveigs-song", t="索尔维格之歌", o="Solveig's Song, Op. 52", c="格里格",
        note="极长的乐句，练「跟住」",
        bpm=60, bpb=4, style="pad", perc="none", diff=2, tag="夜景",
        mel_inst="flute", acc={"chord": "strings", "bass": "harp", "pad": "pad"},
        mel="""a4:2 b4:1 a4:1 | g4:2 e4:2 | a4:1 b4:1 c5:1 d5:1 | e5:4 |
               d5:2 c5:1 b4:1 | a4:2 g#4:2 | a4:4 |
               e5:2 f#5:1 e5:1 | d5:2 b4:2 | e5:1 f#5:1 g#5:1 a5:1 | b5:4 |
               a5:2 g#5:1 a5:1 | b5:4 | e5:2 a4:2 | a4:4""",
        har="""Am,Am | Am,Em | Am,E | Am,Am | Em,Em | E,E | Am,Am | Am,Am |
               C,G | Am,E | Am,Am | C,G | E,Em | Am,E | Am,Am""",
        reverb=0.48, acc_reverb=0.5,
    ),
    dict(
        id="anitras-dance", t="安妮特拉之舞", o="Anitra's Dance（《培尔·金特》）", c="格里格",
        note="拨弦 + 切分，花街舞娘主题",
        bpm=138, bpb=4, style="minuet", perc="pop", diff=3, tag="舞曲",
        mel_inst="pizz", acc={"chord": "pizz", "bass": "bass", "pad": "strings"},
        mel="""d#5:0.5 e5:0.5 f#5:1 e5:0.5 d#5:0.5 c#5:0.5 | d#5:1 e5:0.5 d#5:0.5 c#5:0.5 b4:0.5 |
               a4:1 d#5:0.5 e5:0.5 f#5:1 e5:1 | d#5:1 e5:1 f#5:2 |
               b5:1 a5:0.5 g#5:0.5 f#5:1 e5:1 | d#5:1 e5:1 f#5:1 g#5:1 |
               a5:1 g#5:0.5 f#5:0.5 e5:1 d#5:1 | c#5:2 d#5:2 |
               f#5:1 g#5:1 a5:1 b5:1 | c#6:2 b5:1 a5:1 | g#5:1 a5:1 b5:1 c#6:1 | d#6:4 |
               b5:1 a5:1 g#5:1 f#5:1 | e5:1 d#5:1 c#5:1 b4:1 | a4:2 f#4:2 | d#5:4""",
        har="""B,B | F#,F# | B,B | E,B | F#,B | E,B | F#,B | B,B |
               G#m,G#m | C#m,F# | B,E | F#,G#m | C#m,F# | G#m,C#m | F#,B | B,B""",
        final_chord=59,
    ),
    dict(
        id="nocturne-op9", t="夜曲 Op.9 No.2", o="Nocturne in E♭ major, Op. 9 No. 2", c="肖邦",
        note="歌唱性强、拍点宽松，练音色不练速度",
        bpm=64, bpb=4, style="arp", perc="none", diff=2, tag="夜景",
        mel_inst="piano", acc={"chord": "piano", "bass": "harp", "pad": "strings"},
        mel="""g5:2 f5:1 -:1 | eb5:1 g5:1 c6:2 | bb5:2 ab5:1 g5:1 | f5:1 g5:1 eb5:2 |
               c5:2 -:1 eb5:1 | g5:1 f5:1 eb5:2 | c5:2 bb4:2 | ab4:1 bb4:1 c5:4 |
               eb5:1 f5:1 g5:1 ab5:1 | bb5:1 c6:1 d6:2 | eb6:2 d6:1 c6:1 | bb5:4 |
               g5:2 f5:1 eb5:1 | c5:2 -:2 | ab4:1 bb4:1 c5:1 eb5:1 | f5:4""",
        har="""Eb,Bb | Eb,Bb | Ab,Eb | Bb7,Eb | Ab,Eb | Bb7,Eb | Eb,Bb | Eb,Ab |
               Ab,Eb | Eb,Bb | Fm,Bb | Eb,Gm | Ab,Eb | Bb7,Eb | Eb,Bb | Eb,Eb""",
        reverb=0.44, acc_reverb=0.42,
    ),
    dict(
        id="minute-waltz", t="一分钟圆舞曲", o="Minute Waltz, Op. 64 No. 1", c="肖邦",
        note="三拍子 + 快速经过句，练换手",
        bpm=152, bpb=3, style="waltz", perc="waltz", diff=4, tag="华尔兹",
        mel_inst="piano", acc={"chord": "piano", "bass": "harp", "pad": "strings"},
        mel="""ab5:1 a5:1 ab5:1 | c6:1 ab5:1 f5:1 | g5:1 ab5:1 c6:1 | f6:1 e6:1 eb6:1 |
               eb6:1 f6:1 g#6:1 | ab6:2 g6:1 | f6:1 e6:1 eb6:1 | eb6:1 f6:1 ab5:1 |
               g#5:2 ab5:1 | c6:2 f5:1 | g5:2 ab5:1 | c6:3 |
               eb6:1 d6:1 db6:1 | c6:1 ab5:1 g5:1 | f#5:1 g5:1 ab5:1 | ab5:1 g5:1 f5:1 |
               eb5:1 f5:1 g#5:1 | ab5:1 c6:1 eb6:1 | f6:2 eb6:1 | db6:3 |
               eb6:2 db6:1 | c6:2 ab5:1 | ab5:2 g5:1 | g5:2 f#5:1 |
               f5:2 g5:1 | a5:2 ab5:1 | b5:2 c6:1 | f6:3""",
        har="""Db,Ab | Db,Ab | Ab,Db | Db,Fm | Ab,Db | Db,Ab | Gb,Db | Ab,Ab |
               Db,Ab | Db,Ab | Ab,Db | Db,Ab | Ebm,Ab | Db,Ab | Ab,Db | Db,Ab |
               Gb,Db | Ab,Db | Db,Ab | Db,Fm | Ab,Db | Db,Ab | Bb7,Db | Ab,Db |
               Db,Ab | E,E | Ab,Db | Db,Db""",
        acc_reverb=0.3,
    ),
    dict(
        id="raindrop", t="雨滴前奏曲", o="Prelude Op. 28 No. 15 “Raindrop”", c="肖邦",
        note="固定的重复音当节拍点",
        bpm=76, bpb=4, style="ostinato", perc="none", diff=3, tag="循环",
        mel_inst="cello", acc={"chord": "piano", "bass": "sinebass", "pad": "pad"},
        mel="""f5:1 e5:1 f5:1 g5:1 | ab5:2 g5:1 f5:1 | f5:1 g5:1 ab5:1 c6:1 | ab5:2 -:2 |
               ab5:1 g5:1 f5:1 e5:1 | f5:1 e5:1 d5:1 c5:1 | bb4:1 c5:1 d5:1 e5:1 | f5:4 |
               f#5:1 g#5:1 a5:1 b5:1 | c#6:2 b5:1 a5:1 | g#5:1 a5:1 c#6:1 b5:1 | a5:4 |
               f5:1 e5:1 f5:1 g5:1 | ab5:2 g5:1 f5:1 | e5:1 eb5:1 d5:1 db5:1 | c5:2 -:2""",
        har="""Db,Db | Ab,Ab | Db,Fm | Ab,Db | Gb,Gb | Ab,Ab | Db,Fm | Db,Db |
               Db,Db | Ab,Ab | Fm,Fm | Ab,Fm | A,A | B,A | E,E | Db,Db""",
        acc_reverb=0.34,
    ),
    dict(
        id="revolutionary", t="革命练习曲", o="Etude Op. 10 No. 12 “Revolutionary”", c="肖邦",
        note="左手跑动 = 高密度谱面，极限键盘关",
        bpm=152, bpb=4, style="perpetuum", perc="none", diff=5, tag="Boss",
        mel_inst="piano", acc={"chord": "strings", "bass": "sinebass", "pad": "strings"},
        mel="""eb5:0.5 d5:0.5 c5:0.5 bb4:0.5 ab4:0.5 bb4:0.5 c5:0.5 d5:0.5 | eb5:1 ab4:1 f4:1 eb4:1 |
               eb5:0.5 d5:0.5 c5:0.5 bb4:0.5 ab4:0.5 g4:0.5 f4:0.5 eb4:0.5 | d5:1 c5:1 bb4:1 ab4:1 |
               g4:1 ab4:1 bb4:1 c5:1 | d5:1 eb5:1 f5:1 g5:1 | ab5:1 g5:1 f5:1 eb5:1 | d5:4 |
               eb5:0.5 f5:0.5 g5:0.5 ab5:0.5 bb5:0.5 ab5:0.5 g5:0.5 f5:0.5 |
               eb5:1 d5:1 c5:1 bb4:1 | ab4:1 bb4:1 c5:1 d5:1 | eb5:4 |
               eb5:0.5 d5:0.5 c5:0.5 bb4:0.5 ab4:0.5 bb4:0.5 c5:0.5 d5:0.5 |
               eb5:1 ab4:1 f4:1 eb4:1 | f4:0.5 g4:0.5 ab4:0.5 bb4:0.5 c5:1 d5:1 | eb5:4""",
        har="""Cm,Cm | Gm,Cm | Ab,Ab | Gm,Cm | Fm,Fm | Gm,Cm | Ab,Gm | Cm,Cm |
               Cm,Fm | Gm,Cm | Ab,Gm | Cm,Cm | Cm,Fm | Gm,Cm | Ab,Gm | Cm,Cm""",
        acc_reverb=0.28,
    ),
    dict(
        id="moonlight", t="月光奏鸣曲第一乐章", o="Piano Sonata No. 14 “Moonlight” — I", c="贝多芬",
        note="三连音摇动的慢板，气泡慢慢飘",
        bpm=54, bpb=4, style="arp", perc="none", diff=2, tag="夜景",
        mel_inst="piano", acc={"chord": "piano", "bass": "harp", "pad": "pad"},
        mel="""g#4:2 c5:1 e5:1 | d5:4 | c5:2 e5:2 | d5:4 |
               g#4:2 c5:1 e5:1 | f#5:2 g#5:2 | a5:2 g#5:1 f#5:1 | e5:4 |
               d5:2 e5:1 f#5:1 | g#5:4 | a5:2 b5:2 | g#5:4 |
               f#5:2 e5:1 d5:1 | c5:2 b4:1 g#4:1 | c5:4 | g#4:4""",
        har="""C#m,C#m | A,A | E,E | B7,B7 | C#m,G#m | A,E | F#m7,G#m | C#m,C#m |
               F#m,F#m | C#m,C#m | D,D | G#m,G#m | A,A | E,E | B7,B7 | C#m,C#m""",
        reverb=0.45, acc_reverb=0.5,
    ),
    dict(
        id="appassionata", t="热情奏鸣曲末乐章", o="Piano Sonata No. 23, Op. 57 — III", c="贝多芬",
        note="高速分解 + 强重音，第二段高潮",
        bpm=160, bpb=4, style="perpetuum", perc="none", diff=5, tag="Boss",
        mel_inst="piano", acc={"chord": "strings", "bass": "sinebass", "pad": "strings"},
        mel="""d5:0.5 f5:0.5 a5:0.5 d6:0.5 c6:0.5 a5:0.5 f5:0.5 d5:0.5 |
               d5:0.5 f5:0.5 a5:0.5 d6:0.5 c6:0.5 a5:0.5 g5:0.5 f5:0.5 |
               e5:0.5 g5:0.5 c6:0.5 g5:0.5 e5:0.5 c5:0.5 b4:0.5 c5:0.5 |
               d5:1 a4:1 f4:1 d4:1 |
               f5:1 f5:1 f5:1 e5:1 | d5:1 c5:1 b4:1 a4:1 | g4:1 a4:1 b4:1 c5:1 | d5:4 |
               d6:1 c6:1 a5:1 f5:1 | d6:1 c6:1 a5:1 f5:1 | g5:1 f5:1 e5:1 d5:1 |
               c5:1 b4:1 a4:1 g4:1 | f4:1 a4:1 d5:1 f5:1 | d5:1 f5:1 a5:1 d6:1 |
               a4:2 -:2 | a5:2 -:2""",
        har="""Fm,Fm | Fm,C7 | Fm,Fm | Bb,Fm | C7,C7 | Fm,Fm | C7,Fm | Fm,Fm |
               Fm,Fm | C7,C7 | Fm,Db | Eb,Db | C7,Fm | Bb,C7 | Fm,Fm | Fm,Fm""",
        acc_reverb=0.28,
    ),
    dict(
        id="symphony-5", t="第五交响曲 · 命运动机", o="Symphony No. 5, Op. 67 — I", c="贝多芬",
        note="短-短-短-长：把教学核心做成点击",
        bpm=120, bpb=4, style="march", perc="march", diff=3, tag="强节奏",
        mel_inst="brass", acc={"chord": "strings", "bass": "bass", "pad": "strings"},
        mel="""g4:0.5 g4:0.5 g4:0.5 eb4:1.5 | f4:0.5 f4:0.5 f4:0.5 d4:1.5 |
               eb4:0.5 eb4:0.5 eb4:0.5 c4:1.5 | d4:1.5 -:2.5 |
               g4:0.5 g4:0.5 g4:0.5 eb4:1 | eb4:1 d4:1 c4:1 b3:1 |
               c4:0.5 c4:0.5 c4:0.5 a3:1 | a3:1 g3:1 f3:1 e3:1 | d3:2 -:2 |
               g4:0.5 g4:0.5 g4:0.5 eb5:1.5 | d5:0.5 d5:0.5 d5:0.5 c5:1.5 |
               b4:0.5 b4:0.5 b4:0.5 a4:1 | g4:1 f4:1 e4:1 d4:1 | c4:2 -:2""",
        har="""Cm,Cm | Gm,Cm | Ab,Eb | Bb7,Eb | Cm,Cm | Ab,Eb | Fm,Cm | Gm,Cm |
               Cm,Gm | Ab,Eb | Fm,Cm | Gm,Cm | Cm,Gm | Cm,Cm""",
        final_chord=48,
    ),
    dict(
        id="spring-sonata", t="春天奏鸣曲", o="Violin Sonata No. 5, Op. 24 — I", c="贝多芬",
        note="有歌唱感又有速度变化",
        bpm=120, bpb=4, style="baroque", perc="soft", diff=3, tag="抒情",
        mel_inst="violin", acc={"chord": "piano", "bass": "harp", "pad": "strings"},
        mel="""g5:0.5 a5:0.5 b5:1 d5:1 | e5:1 f5:0.5 g5:0.5 f5:1 e5:1 | d5:1 e5:1 f5:1 g5:1 |
               a5:2 g5:1 f5:1 | e5:1 d5:1 c5:1 b4:1 | a4:1 b4:1 c5:1 d5:1 | g4:4 |
               g5:1 g5:1 a5:1 b5:1 | c6:1 b5:1 a5:1 g5:1 | f5:1 g5:1 a5:1 b5:1 | c6:2 d6:2 |
               b5:1 a5:1 g5:1 f5:1 | e5:1 f5:1 g5:1 a5:1 | d5:1 c5:1 b4:1 a4:1 | g4:4""",
        har="""G,D | C,G | D,G | C,D | G,D | C,D | G,G | Bm,Em |
               Am,D | G,D | C,G | D,A | G,D | C,D | D,G | G,G""",
        final_chord=55,
    ),
    dict(
        id="pathetique", t="悲怆第二乐章", o="Piano Sonata No. 8, Op. 13 — II", c="贝多芬",
        note="如歌的慢板，长音 + 大跳",
        bpm=60, bpb=4, style="pad", perc="none", diff=2, tag="夜景",
        mel_inst="piano", acc={"chord": "harp", "bass": "strings", "pad": "strings"},
        mel="""g4:2 c5:1 eb5:1 | d5:2 eb5:1 f5:1 | g5:2 ab5:1 g5:1 | f5:2 eb5:2 |
               d5:1 eb5:1 f5:1 g5:1 | ab5:2 g5:1 f5:1 | eb5:2 d5:1 c5:1 | bb4:4 |
               c5:2 d5:2 | eb5:2 f5:2 | g5:1 f5:1 eb5:1 d5:1 | c5:4 |
               eb5:2 g5:2 | ab5:1 g5:1 f5:1 eb5:1 | d5:1 c5:1 bb4:1 ab4:1 | g4:4""",
        har="""Eb,Bb | Eb,Bb | Cm,Gm | Ab,Eb | Eb,Bb | Cm,Fm | Bb7,Eb | Eb,Ab |
               Ab,Eb | Eb,Bb | Ab,Eb | Bb7,Eb | Eb,Bb | Cm,Bb7 | Ab,Eb | Eb,Eb""",
        reverb=0.45, acc_reverb=0.45,
    ),
    dict(
        id="fur-elise-trio", t="致爱丽丝 · 中段", o="Für Elise — B section", c="贝多芬",
        note="轻快的 C 大调中段，练左右分工",
        bpm=132, bpb=3, style="minuet", perc="none", diff=3, tag="教学",
        mel_inst="piano", acc={"chord": "piano", "bass": "harp", "pad": "strings"},
        mel="""c5:1 b4:1 a4:1 | b4:1 c5:1 d5:1 | e5:1 d5:1 c5:1 | b4:1 a4:1 g#4:1 |
               a4:1 b4:1 c5:1 | d5:1 e5:1 f5:1 | e5:1 d5:1 c5:1 | b4:3 |
               e5:0.5 e5:0.5 e5:1 | f5:1 e5:1 d5:1 | c5:1 b4:1 a4:1 | g#4:1 a4:1 b4:1 |
               c5:1 d5:1 e5:1 | d5:1 c5:1 b4:1 | a4:1 b4:1 c5:1 | b4:3""",
        har="""C,C | G,G | C,G | E,E |
               C,F | G,C | F,G | C,C |
               C,G | F,G | C,E | G,C | F,G | C,G | E,E | C,C""",
        acc_reverb=0.3,
    ),
    dict(
        id="hungarian-rhapsody-2", t="匈牙利狂想曲第二号", o="Hungarian Rhapsody No. 2 — Lassan", c="李斯特",
        note="慢段 + 快段，难度曲线友好",
        bpm=88, bpb=4, style="pad", perc="soft", diff=4, tag="炫技",
        mel_inst="piano", acc={"chord": "piano", "bass": "strings", "pad": "strings"},
        mel="""a4:1 b4:1 c5:2 | d5:1 c5:1 b4:1 a4:1 | g#4:1 a4:1 b4:2 | e5:4 |
               f5:1 e5:1 d5:1 c5:1 | b4:1 a4:1 g#4:1 a4:1 | b4:4 |
               d5:2 e5:1 f5:1 | g5:1 f5:1 e5:1 d5:1 | c5:1 b4:1 a4:1 g#4:1 | a4:4 |
               c6:0.5 b5:0.5 a5:0.5 g5:0.5 f5:0.5 e5:0.5 d5:0.5 c5:0.5 |
               b4:0.5 c5:0.5 d5:0.5 e5:0.5 f5:0.5 g5:0.5 a5:0.5 b5:0.5 |
               c6:1 b5:1 a5:1 g5:1 | f5:1 e5:1 d5:1 c5:1 | a4:4""",
        har="""Am,Am | E,E | Am,G | E,E | F,E | Am,E | Am,Am | Dm,E |
               Am,E | F,E | Am,E | Ab,F | E,Am | F,E | E,Am | Am,Am""",
        acc_reverb=0.34,
    ),
    dict(
        id="liebestraum-3", t="爱之梦第三号", o="Liebesträume No. 3, S. 541", c="李斯特",
        note="长旋律 + 三连音伴奏",
        bpm=72, bpb=4, style="arp", perc="none", diff=3, tag="夜景",
        mel_inst="piano", acc={"chord": "piano", "bass": "harp", "pad": "strings"},
        mel="""g#4:1 c#5:1 e5:2 | f#5:2 e5:2 | d5:2 e5:1 c#5:1 | b4:4 |
               e5:2 g#5:2 | a5:2 b5:2 | c#6:2 b5:2 | a5:4 |
               g#5:1 a5:1 b5:2 | c#6:2 b5:1 a5:1 | g#5:2 e5:2 | f#5:4 |
               e5:1 f#5:1 g#5:2 | a5:2 b5:1 c#6:1 | d6:4 | b5:4 |
               c#6:2 b5:2 | a5:2 g#5:2 | f#5:2 e5:2 | b4:4""",
        har="""Ab,E | Ab,E | Ab,E | E,B |
               Ab,E | Fm,B | E,Ab | Ab,Fm |
               B,E | Ab,E | E,B | Fm,B | E,E | Fm,E | B,E | E,E""",
        reverb=0.45, acc_reverb=0.4,
    ),
    dict(
        id="gymnopedie", t="裸体歌舞 No.1", o="Gymnopédie No. 1", c="萨蒂",
        note="极慢、极空，适合深夜放松",
        bpm=66, bpb=3, style="pad", perc="none", diff=1, tag="夜景",
        mel_inst="piano", acc={"chord": "pad", "bass": "strings", "pad": "pad"},
        mel="""-:1 b3:1 d4:1 | g3:1 b3:1 d4:1 | b3:1 d4:1 g4:1 | e4:1 d4:1 b3:1 |
               -:1 b3:1 d4:1 | g3:1 b3:1 d4:1 | b3:1 d4:1 g4:1 | e4:1 d4:1 b3:1 |
               d4:1 e4:1 g4:1 | f4:1 e4:1 d4:1 | b3:1 d4:1 g4:1 | a3:1 b3:1 d4:1 |
               e4:1 g4:1 b4:1 | a4:1 g4:1 e4:1 | d4:1 e4:1 g4:1 | d4:2 -:1""",
        har="""D7,D7 | G,G | D7,D7 | G,G | D7,D7 | G,G | D7,D7 | G,G |
               D7,D7 | G,G | D7,D7 | G,G | D7,D7 | G,G | D7,Em | G,G""",
        reverb=0.45, acc_reverb=0.5,
    ),
    dict(
        id="claire-de-lune", t="月光", o="Clair de lune（《贝加马斯克组曲》）", c="德彪西",
        note="自由速度较多，这里节拍化了；练弱音与呼吸",
        bpm=66, bpb=4, style="arp", perc="none", diff=2, tag="夜景",
        mel_inst="piano", acc={"chord": "harp", "bass": "harp", "pad": "pad"},
        mel="""-:1 f5:1 d#5:1 b4:1 | f5:2 a#5:2 | g5:2 f5:2 | d#5:1 f5:1 g5:2 |
               a#5:1 c6:1 a#5:1 g5:1 | f5:1 g5:1 a#5:2 | g5:1 f5:1 d#5:2 | c#5:4 |
               -:1 a#5:1 g#5:1 f5:1 | a#5:2 c#6:2 | b5:4 | g#5:1 a#5:1 b5:2 |
               c#6:1 b5:1 a#5:1 g5:1 | f5:1 e5:1 d5:1 c5:1 | d5:4 |
               -:1 f5:1 d#5:1 b4:1 | f5:2 a#5:2 | g5:4""",
        har="""Db,Db | Gm,Db | Eb,Gm | Ab,Db | Db,Fm | Gm,Db | Ab,Db | Bb7,Eb |
               Fm,Ab | Db,Fm | Eb,Fm | Db,Eb | Ab,Fm | Db,Eb | Gm,Db | Db,Db""",
        reverb=0.5, acc_reverb=0.5,
    ),
    dict(
        id="bolero", t="波莱罗舞曲", o="Boléro", c="拉威尔",
        note="固定节奏循环 + 一段段加乐器，最适合音游",
        bpm=108, bpb=4, style="ostinato", perc="ostinato", diff=3, tag="循环",
        mel_inst="flute", acc={"chord": "piano", "bass": "sinebass", "pad": "pad"},
        mel="""c5:1 d5:1 e5:0.5 d5:0.5 c5:1 b4:1 | c5:0.5 d5:0.5 e5:0.5 f5:0.5 e5:1 d5:1 |
               c5:1 b4:1 a4:1 g4:1 | f4:1 e4:1 d4:1 e4:0.5 f4:0.5 g4:0.5 a4:0.5 |
               b4:1 c5:1 d5:1 e5:1 | f5:1 e5:1 d5:1 c5:1 | b4:1 a4:1 g4:1 f4:1 | e4:4 |
               e5:1 f5:1 g5:1 f5:1 | e5:1 d5:1 c5:1 b4:1 | c5:1 b4:1 a4:1 g4:1 | f4:1 g4:1 a4:4 |
               a4:0.5 b4:0.5 c5:1 d5:1 e5:1 f5:1 | g5:1 f5:1 e5:1 d5:1 | c5:1 b4:1 bb4:1 a4:1 | g4:4""",
        har="""C,C | C,G | C,F | C,G | C,Dm | Em,Am | F,G | C,G |
               Dm,Dm | G,G | C,Am | F,G | C,Dm | Em,Am | F,G | C,C""",
        acc_reverb=0.26,
    ),
    dict(
        id="pavane", t="帕凡舞曲", o="Pavane, Op. 50", c="福雷",
        note="庄重缓慢，走步速度",
        bpm=76, bpb=4, style="pavan", perc="soft", diff=2, tag="宫廷",
        mel_inst="flute", acc={"chord": "pad", "bass": "strings", "pad": "pad"},
        mel="""f#5:2 a5:1 g#5:1 | f#5:1 e5:1 f#5:2 | g#5:2 b5:1 a5:1 | f#5:4 |
               e5:2 f#5:1 g#5:1 | a5:2 b5:1 c#6:1 | b5:1 a5:1 g#5:1 f#5:1 | e5:4 |
               f#5:1 g#5:1 a5:1 b5:1 | c#6:2 b5:1 a5:1 | g#5:1 a5:1 b5:1 c#6:1 | d6:4 |
               c#6:2 b5:1 a5:1 | g#5:1 f#5:1 e5:1 d5:1 | c#5:2 d5:1 e5:1 | f#5:4 |
               b5:2 a5:1 g#5:1 | f#5:2 e5:1 f#5:1 | g#5:4 | a5:4""",
        har="""F#m,F#m | Bm,F#m | C#m,F#m | Bm,C#m | F#m,Bm | E,F#m | Bm,C#m | F#m,F#m |
               D,D | A,E | Bm,F#m | C#m,F#m | Bm,E | F#m,Bm | C#m,F#m | Bm,F#m |
               E,D | A,Bm | F#m,C#m | Bm,Bm""",
        reverb=0.45, acc_reverb=0.45,
    ),
    dict(
        id="new-world-largo", t="新世界 · 慢板主题", o="Symphony No. 9 “From the New World” — II", c="德沃夏克",
        note="宽广旋律，大泡泡慢速",
        bpm=60, bpb=4, style="pad", perc="none", diff=1, tag="夜景",
        mel_inst="reed", acc={"chord": "strings", "bass": "strings", "pad": "pad"},
        mel="""e5:2 d5:1 c#5:1 | b4:4 | e5:1 e5:1 f#5:2 | g#5:2 f#5:1 e5:1 | d5:4 |
               b4:2 d5:1 e5:1 | c#5:4 | a4:2 b4:1 d5:1 | e5:4 |
               f#5:2 g#5:2 | a5:1 g#5:1 f#5:1 e5:1 | d5:2 e5:1 d5:1 | c#5:4 |
               b4:2 a4:2 | g#4:2 a4:1 b4:1 | e5:4 | b4:4""",
        har="""Dm,Gm | Dm,Dm | Gm,Cm | Gm,Cm | Gm,Cm | Cm,Gm | Ab,Dm | Gm,Dm |
               Cm,Gm | Ab,Dm | Gm,Cm | Dm,Gm | Ab,Dm | Bb,Eb | Gm,Cm | Dm,Gm""",
        reverb=0.45, acc_reverb=0.45,
    ),
    dict(
        id="slavonic-8", t="斯拉夫舞曲 Op.46 No.8", o="Slavonic Dance Op. 46 No. 8", c="德沃夏克",
        note="D 大调 furiant，重拍切换快",
        bpm=144, bpb=3, style="waltz", perc="pop", diff=3, tag="舞曲",
        mel_inst="violin", acc={"chord": "piano", "bass": "bass", "pad": "strings"},
        mel="""d5:1 f#5:1 a5:1 | b5:1 a5:1 f#5:1 | g5:1 f#5:1 e5:1 | d5:1 c#5:1 d5:1 |
               e5:1 f#5:1 g5:1 | a5:1 b5:1 c#6:1 | d6:2 c#6:1 | a5:3 |
               f#5:1 g5:1 a5:1 | b5:1 c#6:1 d6:1 | e6:2 d6:1 | c#6:3 |
               d6:1 c#6:1 b5:1 | a5:1 g5:1 f#5:1 | e5:1 f#5:1 g5:1 | a5:3 |
               b5:1 a5:1 g5:1 | f#5:1 e5:1 d5:1 | c#5:1 d5:1 e5:1 | f#5:3 |
               g5:1 a5:1 b5:1 | c#6:1 d6:1 e6:1 | f#6:2 e6:1 | d6:3""",
        har="""D,D | D,A | G,D | A,D | D,A | G,A | D,D | Bm,G |
               Em,A | D,A | C,D | A,D | D,G | A,D | F#m,Bm | Em,A |
               G,D | A,D | D,A | Bm,Em | Am,D | G,A | D,A | D,D""",
        final_chord=62,
    ),
    dict(
        id="lacrimosa", t="落泪经", o="Requiem, K.626 — Lacrimosa", c="莫扎特",
        note="只做纯器乐主题，适合剧情关",
        bpm=72, bpb=4, style="baroque", perc="none", diff=2, tag="教堂",
        mel_inst="violin", acc={"chord": "organ", "bass": "strings", "pad": "strings"},
        mel="""a4:1 a4:1 g4:1 f4:1 | e4:1 f4:1 g4:1 a4:1 | d5:1 c5:1 b4:1 a4:1 | g4:4 |
               a4:1 b4:1 c5:1 d5:1 | e5:1 d5:1 c5:1 b4:1 | a4:1 g4:1 f4:1 e4:1 | d4:4 |
               f5:1 e5:1 d5:1 c5:1 | b4:1 c5:1 d5:1 e5:1 | a5:1 g5:1 f5:1 e5:1 | d5:4 |
               c5:1 b4:1 a4:1 g4:1 | f4:1 e4:1 d4:1 c4:1 | b3:1 c4:1 d4:1 e4:1 | a4:4""",
        har="""Dm,Dm | A,A | Dm,Dm | Gm,A | Dm,A | Gm,A | Dm,A | Dm,Dm |
               Bb,Gm | A,Dm | Gm,Dm | A,A | F,Gm | A,Dm | A,A | Dm,Dm""",
        acc_reverb=0.45,
    ),
    dict(
        id="nessun-dorma", t="今夜无人入睡（旋律）", o="Nessun dorma — “Vincerò” 旋律", c="普契尼",
        note="只用旋律、不用歌词；结尾的大跳是关底",
        bpm=76, bpb=4, style="pad", perc="soft", diff=3, tag="咏叹",
        mel_inst="trumpet", acc={"chord": "strings", "bass": "strings", "pad": "pad"},
        mel="""e4:1 g4:1 a4:2 | b4:2 a4:2 | g4:1 a4:1 b4:1 c5:1 | d5:4 |
               e5:2 d5:1 c5:1 | b4:2 a4:2 | g4:1 a4:1 g4:1 e4:1 | a4:4 |
               c5:1 d5:1 e5:2 | f5:2 e5:1 d5:1 | c5:1 d5:1 e5:2 | a4:4 |
               e5:1 f5:1 g5:2 | a5:2 b5:2 | c6:2 -:2 | c6:1 b5:1 a5:1 g5:1 | a5:4""",
        har="""Am,F | E,Am | Am,E | Am,F | C,G | F,E | Am,E | Am,Am |
               F,E | Am,E | F,G | C,E | F,G | C,F | Dm,E | Am,Am""",
        final_chord=57,
    ),
    dict(
        id="la-donna-mobile", t="女人善变（旋律）", o="La donna è mobile — Rigoletto", c="威尔第",
        note="三拍子小调俏皮话，短句结构明确",
        bpm=144, bpb=3, style="waltz", perc="waltz", diff=3, tag="歌剧",
        mel_inst="flute", acc={"chord": "pizz", "bass": "bass", "pad": "strings"},
        mel="""b4:1 e5:1 d5:1 | c5:1 b4:1 a4:1 | b4:1 c5:1 d5:1 | e5:3 |
               f#5:1 g5:1 f#5:1 | e5:1 d5:1 c5:1 | b4:1 a4:1 b4:1 | e4:3 |
               e5:1 e5:1 f#5:1 | g5:1 f#5:1 e5:1 | d5:1 e5:1 c#5:1 | a4:3 |
               b4:1 c5:1 d5:1 | e5:1 d5:1 c5:1 | b4:1 a4:1 g#4:1 | a4:3 |
               e5:1 f#5:1 g#5:1 | a5:1 g#5:1 f#5:1 | e5:1 d5:1 c#5:1 | b4:3""",
        har="""Em,Em | Am,Am | Em,B7 | Em,Em | C,G | Am,Em | B7,Em | Em,Em |
               Am,Am | C,G | B7,Em | Am,Em | B7,Em | Am,B7 | Em,B7 | Em,Em |
               Am,C | B7,Em | Am,B7 | Em,Em""",
        final_chord=64,
    ),
    dict(
        id="ride-valkyries", t="女武神的骑行", o="Die Walküre — Ride of the Valkyries", c="瓦格纳",
        note="铜管齐奏，做 Boss 开场",
        bpm=132, bpb=4, style="march", perc="march", diff=4, tag="史诗",
        mel_inst="brass", acc={"chord": "brass", "bass": "bass", "pad": "strings"},
        mel="""d5:1 d5:1 d5:1 a5:1 | f5:1 d5:1 a5:0.5 a#5:0.5 | b5:1 f5:1 d6:1 |
               c6:1 a5:1 f5:1 d6:1 | e6:1 d6:1 c6:1 a5:1 | f5:1 a5:1 d6:2 |
               a5:1 a#5:1 b5:1 c6:1 | d6:2 -:2 |
               d6:0.5 d6:0.5 c6:0.5 a5:0.5 f5:0.5 d5:0.5 a4:0.5 d5:0.5 |
               f5:1 d5:1 a5:1 d6:1 | c6:1 a5:1 f5:1 a5:1 | d6:2 -:2 |
               a5:1 b5:1 c6:1 d6:1 | e6:1 f6:1 g6:2 | f6:1 e6:1 d6:1 c6:1 | d6:4""",
        har="""D,D | Bb,D | Gm,D | Bb,D | F,D | Gm,A | D,A | D,D |
               D,Bb | Gm,D | Bb,F | Gm,D | A,D | Bb,F | Gm,A | D,D""",
        final_chord=62,
    ),
    dict(
        id="when-johnny", t="约翰尼凯旋归来", o="When Johnny Comes Marching Home", c="帕特里克·吉尔摩 / 传统歌曲",
        note="进行曲节拍极其明确",
        bpm=120, bpb=4, style="march", perc="march", diff=2, tag="进行曲",
        mel_inst="flute", acc={"chord": "trumpet", "bass": "bass", "pad": "strings"},
        mel="""e5:1 e5:1 e5:1 d5:1 | c5:1 d5:1 e5:2 | d5:1 d5:1 c5:1 c5:1 | a4:2 g#4:1 a4:1 |
               b4:1 c5:1 d5:1 e5:1 | f5:1 e5:1 d5:2 | c5:1 c5:1 a4:1 a4:1 | e4:2 -:2 |
               a4:1 a4:1 b4:1 c5:1 | d5:1 d5:1 c5:1 a4:1 | e5:1 e5:1 f5:1 g5:1 | a5:2 -:2 |
               g5:1 f5:1 e5:1 d5:1 | c5:1 d5:1 e5:2 | d5:1 c5:1 b4:1 a4:1 | a4:4""",
        har="""Am,Am | Am,Em | E,Am | Am,Em | Am,E | Am,E | E,Am | Am,Am |
               F,G | Am,Em | F,G | Am,E | F,G | C,G | E,Am | Am,Am""",
        final_chord=57,
    ),
    dict(
        id="shall-we-gather", t="在河边相聚", o="Shall We Gather at the River", c="罗伯特·洛里",
        note="四拍子规则、旋律自然，慢速疗愈关",
        bpm=92, bpb=4, style="minuet", perc="none", diff=1, tag="抒情",
        mel_inst="harp", acc={"chord": "lute", "bass": "harp", "pad": "pad"},
        mel="""d5:1 d5:1 e5:1 d5:1 | c5:2 a4:2 | d5:1 e5:1 f5:1 e5:1 | d5:4 |
               c5:1 d5:1 e5:1 c5:1 | d5:1 c5:1 a4:2 | d5:1 d5:1 e5:1 d5:1 | c5:4 |
               f5:1 f5:1 e5:1 f5:1 | g5:2 f5:2 | e5:1 f5:1 g5:1 a5:1 | f5:4 |
               e5:1 d5:1 c5:1 d5:1 | e5:2 d5:2 | c5:1 d5:1 e5:1 c5:1 | d5:4""",
        har="""G,G | D,D | G,D | G,G | C,D | G,D | G,C | D,D |
               D,G | C,D | D,G | D,G | C,D | G,D | C,D | G,G""",
        final_chord=67,
    ),
    dict(
        id="girl-left-behind", t="我留下的姑娘", o="The Girl I Left Behind Me", c="传统苏格兰 / 美国民谣",
        note="行进旋律，适合左右交替",
        bpm=128, bpb=4, style="march", perc="soft", diff=2, tag="旅途",
        mel_inst="fife", acc={"chord": "lute", "bass": "bass", "pad": "strings"},
        mel="""e4:1 e4:1 f#4:1 g4:1 | a4:2 b4:1 a4:1 | g4:1 f#4:1 e4:1 d4:1 | e4:4 |
               a4:1 a4:1 b4:1 c#5:1 | d5:2 b4:2 | a4:1 g4:1 f#4:1 e4:1 | d4:4 |
               e5:1 d5:1 c5:1 b4:1 | a4:1 b4:1 c5:2 | b4:1 a4:1 g4:1 f#4:1 | e4:4 |
               d5:1 e5:1 f#5:1 g5:1 | a5:2 g5:2 | f#5:1 e5:1 d5:1 c#5:1 | b4:4""",
        har="""Em,Em | Am,B7 | Em,B7 | Em,Am |
               F#m,B7 | Em,B7 | Am,B7 | Em,Em | C,Am | B7,Em | C,B7 | Em,Am |
               B7,Em | Am,B7 | Em,B7 | Em,Em""",
        final_chord=64,
    ),
    dict(
        id="saints-dixie", t="圣者进行曲（迪克西兰）", o="The Saints — Dixieland style", c="传统旋律（游戏化编曲）",
        note="同一条旋律的爵士版，切分更狠",
        bpm=150, bpb=4, style="stride", perc="pop", diff=4, tag="爵士",
        mel_inst="sax", acc={"chord": "piano", "bass": "sinebass", "pad": "pad"},
        mel="""c5:0.5 -:0.5 c5:0.5 d5:0.5 e5:1 c5:0.5 -:0.5 | a4:0.5 -:0.5 a4:0.5 b4:0.5 c5:1 a4:0.5 -:0.5 |
               g4:0.5 -:0.5 g4:0.5 a4:0.5 b4:1 g4:0.5 e4:0.5 | f4:1 e4:0.5 d4:0.5 c4:1 -:1 |
               c5:1 e5:1 g5:0.5 -:0.5 e5:1 c5:1 | a4:1 b4:0.5 c5:0.5 a4:1 f4:1 |
               g4:1 e4:1 c4:1 e4:1 | d4:2 -:2 |
               e5:0.5 f5:0.5 g5:1 a5:0.5 b5:0.5 c6:1 | b5:1 a5:1 g5:1 e5:1 |
               c6:0.5 b5:0.5 a5:0.5 g5:0.5 a5:1 -:1 | g5:1 e5:1 c5:1 a4:1 |
               f5:1 e5:1 d5:1 c5:1 | b4:1 c5:1 d5:1 e5:1 | c5:2 -:2""",
        har="""C,C7 | F,F | C,C7 | G7,C | Am,Am | Dm,G7 | C,A7 | Dm,G7 |
               C,E7 | Am,Am | F,C | C7,F | Dm,G7 | C,G7 | C,D7 | G7,C""",
        final_chord=60,
    ),
    dict(
        id="scarborough-fair", t="斯卡布罗集市", o="Scarborough Fair（传统英国民歌）", c="传统英格兰曲调",
        note="只用旋律、自配伴奏；3/4 摆动",
        bpm=96, bpb=3, style="pad", perc="none", diff=2, tag="民谣",
        mel_inst="panpipes", acc={"chord": "harp", "bass": "harp", "pad": "strings"},
        mel="""a4:1.5 g4:0.5 e4:1 | a4:1 c5:1 d5:1 | e5:1.5 d5:0.5 c5:1 | a4:1 g4:1 e4:1 |
               a4:1.5 g4:0.5 e4:1 | a4:1 b4:1 c5:1 | d5:2 c5:1 | a4:3 |
               c5:1.5 d5:0.5 e5:1 | d5:1 c5:1 b4:1 | a4:1.5 b4:0.5 c5:1 | b4:1 a4:1 g4:1 |
               e4:1 g4:1 a4:1 | g4:1 e4:1 c4:1 | d4:2 -:1 | e4:3""",
        har="""Am,Am | Am,E | Am,Em | Am,E | Am,C | G,Am | Em,Am | Am,Am |
               Am,Em | C,G | Am,E | Am,Em | C,G | Am,E | Em,Am | Am,Am""",
        acc_reverb=0.45,
    ),
    dict(
        id="gymnopedie-2", t="裸体歌舞 No.2", o="Gymnopédie No. 2", c="萨蒂",
        note="同系列的第二首，稍微走动一点",
        bpm=72, bpb=4, style="pad", perc="none", diff=2, tag="夜景",
        mel_inst="piano", acc={"chord": "pad", "bass": "strings", "pad": "pad"},
        mel="""d4:1 f4:1 a4:2 | b4:2 a4:2 | g4:1 a4:1 b4:2 | d5:4 |
               c5:1 b4:1 a4:2 | g4:2 d4:2 | e4:1 f4:1 g4:2 | a4:4 |
               d5:1 c5:1 b4:1 a4:1 | g4:1 a4:1 b4:2 | c5:2 b4:2 | a4:4 |
               f4:1 g4:1 a4:1 b4:1 | c5:2 d5:2 | b4:1 a4:1 g4:1 f4:1 | d4:4""",
        har="""Dm,Dm | Gm,Dm | Bb,A | Dm,Dm | Eb,Dm | Gm,A | Dm,Bb | Gm,A |
               Dm,Dm | Gm,Dm | Bb,A | Dm,Dm | Eb,Dm | Gm,Dm | A,Dm | Dm,Dm""",
        reverb=0.45, acc_reverb=0.5,
    ),
    dict(
        id="consolation-3", t="爱之梦 · 安慰 No.3", o="Consolation No. 3, S. 172", c="李斯特",
        note="D♭ 大调的夜曲式主题，最宽容的判定",
        bpm=60, bpb=4, style="arp", perc="none", diff=1, tag="夜景",
        mel_inst="piano", acc={"chord": "piano", "bass": "harp", "pad": "pad"},
        mel="""-:2 d#5:1 f5:1 | ab5:2 f5:2 | d#5:1 e5:1 f5:2 | g5:4 |
               ab5:2 bb5:2 | c6:2 d6:2 | eb6:4 | ab5:4 |
               bb5:1 ab5:1 g5:1 f5:1 | eb5:1 f5:1 g5:2 | ab5:4 | f5:4 |
               d#5:1 f5:1 ab5:2 | bb5:2 c6:2 | d6:4 | db6:4""",
        har="""Db,Db | Db,Ab | Ebm,Ab | Db,Db | Ab,Db | Ebm,Ab | Bb7,Eb | Ab,Db |
               Db,Fm | Gm,Fm | Ab,Db | Ebm,Ab | Db,Ab | Bb7,Db | Ab,Db | Db,Db""",
        reverb=0.5, acc_reverb=0.5,
    ),
]
