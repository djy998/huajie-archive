"""曲库 A：教学 / 进行曲 / 巴洛克 / 古典

旋律 = 主题「简化改编」（拍点规整、去自由速度与装饰音）；har = 自己编的和声骨架。
DSL 见 theory.py 顶部说明。
"""

SONGS = [
    dict(
        id="ode-to-joy", t="欢乐颂", o="Ode to Joy（贝多芬第九交响曲末乐章主题）", c="贝多芬",
        note="四拍子规整、音域窄，第一首就弹它",
        bpm=126, bpb=4, style="march", perc="fanfare", diff=1, tag="教学",
        mel_inst="brass", acc={"chord": "trumpet", "bass": "bass", "pad": "strings"},
        mel="""e5:1 e5:1 f5:1 g5:1 | g5:1 f5:1 e5:1 d5:1 | c5:1 c5:1 d5:1 e5:1 | e5:1.5 d5:0.5 d5:2 |
               e5:1 e5:1 f5:1 g5:1 | g5:1 f5:1 e5:1 d5:1 | c5:1 c5:1 d5:1 e5:1 | d5:1.5 c5:0.5 c5:2 |
               d5:1 d5:1 e5:1 c5:1 | d5:1 e5:0.5 f5:0.5 e5:1 c5:1 | d5:1 e5:1 f5:1 e5:1 | d5:1 c5:1 a4:2 |
               e5:1 e5:1 f5:1 g5:1 | g5:1 f5:1 e5:1 d5:1 | c5:1 c5:1 d5:1 e5:1 | d5:1.5 c5:0.5 c5:2 |""",
        har="""C,C | G,G | C,Am | G,C | C,C | G,G | C,Am | G,C |
               Am,Am | G,G | C,Am | G,C | C,C | G,G | C,Am | G,C""",
        final_chord=60,
    ),
    dict(
        id="twinkle", t="小星星", o="Twinkle, Twinkle, Little Star", c="传统法国曲调",
        note="C 大调，怎么点都不难听",
        bpm=116, bpb=4, style="minuet", perc="none", diff=1, tag="教学",
        mel_inst="musicbox", acc={"chord": "harp", "bass": "harp", "pad": "pad"},
        mel="""c5:1 c5:1 g5:1 g5:1 | a5:1 a5:1 g5:2 | f5:1 f5:1 e5:1 e5:1 | d5:1 d5:1 c5:2 |
               g5:1 g5:1 f5:1 f5:1 | e5:1 e5:1 d5:1 d5:1 | g5:1 g5:1 f5:1 f5:1 | e5:1 e5:1 d5:2 |
               c5:1 c5:1 g5:1 g5:1 | a5:1 a5:1 g5:2 | f5:1 f5:1 e5:1 e5:1 | d5:1 d5:1 c5:2 |""",
        har="""C | G | Am,F | C,G | C,F | C,G | C,F | G,G | C | G | Am,F | C,G""",
        final_chord=60,
    ),
    dict(
        id="frere-jacques", t="两只老虎同源曲调", o="Frère Jacques", c="传统法国童谣",
        note="六个音走完一首，教学关首选",
        bpm=112, bpb=4, style="minuet", perc="none", diff=1, tag="教学",
        mel_inst="flute", acc={"chord": "lute", "bass": "bass", "pad": "pad"},
        mel="""c4:1 d4:1 e4:1 f4:1 | c4:1 d4:1 e4:1 f4:1 | e4:1 f4:1 g4:2 | e4:1 f4:1 g4:2 |
               g4:0.5 a4:0.5 g4:0.5 f4:0.5 e4:0.5 f4:0.5 g4:0.5 c4:0.5 |
               g4:0.5 a4:0.5 g4:0.5 f4:0.5 e4:0.5 f4:0.5 g4:0.5 c4:0.5 |
               c4:0.5 g3:0.5 c4:2 | c4:0.5 g3:0.5 c4:2 |""",
        har="""C | C | G7,G7 | G7,G7 | C,F | C,F | G,C | G,C""",
        final_chord=60,
    ),
    dict(
        id="old-macdonald", t="老麦克唐纳有个农场", o="Old MacDonald Had a Farm", c="传统英格兰曲调",
        note="重复句式，适合「隐藏趣味关」",
        bpm=126, bpb=4, style="minuet", perc="soft", diff=1, tag="滑稽",
        mel_inst="reed", acc={"chord": "lute", "bass": "bass", "pad": "pad"},
        mel="""e4:1 e4:1 e4:1 e4:1 | d4:1 c4:1 c4:1 d4:1 | e4:1 g4:1 g4:1 e4:1 | e4:4 |
               a4:1 a4:1 g4:1 e4:1 | d4:1 c4:1 c4:2 | d4:1 e4:1 d4:1 c4:1 | a3:4 |""",
        har="""C | C | C,G | C,C | F,C | C,G | C,G | C,C""",
        final_chord=60,
    ),
    dict(
        id="auld-lang-syne", t="友谊地久天长", o="Auld Lang Syne", c="传统苏格兰歌曲",
        note="跨年谢幕曲，长音收尾",
        bpm=88, bpb=4, style="minuet", perc="none", diff=1, tag="谢幕",
        mel_inst="harp", acc={"chord": "lute", "bass": "bass", "pad": "strings"},
        mel="""d4:1.5 d4:0.5 | g4:2 b4:1 a4:1 | g4:1 e4:1 g4:1 c5:1 | b4:2 a4:1 f4:1 |
               d4:1.5 d4:0.5 | g4:2 b4:1 c5:1 | d5:2 c5:1 a4:1 | g4:4 |
               a4:1 b4:1 c5:2 | b4:1 a4:1 g4:4 | f4:1 g4:1 a4:1 b4:1 | c5:2 a4:2 |
               g4:1 e4:1 g4:1 b4:1 | a4:1 g4:1 f4:1 d4:1 | g4:4 -:2""",
        har="""C,C | C,G | C,Dm | G,C | C,C | C,G | C,Dm | G,C |
               Am,Am | Dm,A | Dm,A | G,C | C,Dm | G,Dm | C,G | C,C""",
        final_chord=60,
    ),
    dict(
        id="mountain-king", t="山魔王的宫殿", o="In the Hall of the Mountain King", c="格里格《培尔·金特》",
        note="保留原曲逐渐加速的结构，越到后面越密",
        bpm=[(0, 108), (16, 120), (32, 134)], bpb=2,
        style="march", perc="march", perc_flags={"roll_end": True, "final_cymbal": True},
        diff=4, tag="地狱",
        mel_inst="pizz", acc={"chord": "strings", "bass": "bass", "pad": "strings"},
        mel="""-:1 f#5:1 | a4:1 a4:1 | a#4:1 b4:1 | c#5:1 a4:1 | a4:1 a4:1 | a#4:1 b4:1 | c#5:1 c#5:1 |
               b4:1 a4:1 | b4:1 c#5:1 | d5:1 e5:1 | f#5:1 d5:1 | f5:1 c#5:1 | f5:2 |
               -:1 f#6:1 | a5:1 a5:1 | a#5:1 b5:1 | c#6:1 a5:1 | a5:1 a5:1 | a#5:1 b5:1 | c#6:1 c#6:1 |
               b5:1 a5:1 | b5:1 c#6:1 | d6:1 e6:1 | f#6:1 d6:1 | f6:1 c#6:1 | f6:2 |""",
        har="""Am,Am | Am,Am | E,E | Am,Am | Am,Am | E,E | Am,E | Am,Am |
               Am,Am | Am,Am | E,E | Am,Am | Am,Am | E,E | Am,E | Am,Am""",
        final_chord=57,
    ),
    dict(
        id="mountain-king-easy", t="山魔王的宫殿（简化）", o="In the Hall of the Mountain King — simplified",
        c="格里格（教学版）", note="同一首的低速版，先在这里练熟再上正谱",
        bpm=92, bpb=2, style="minuet", perc="none", diff=1, tag="教学",
        mel_inst="lute", acc={"chord": "lute", "bass": "bass", "pad": "pad"},
        mel="""a4:2 | a4:1 a4:1 | b4:1 c#5:1 | d5:2 | c#5:1 b4:1 | a4:2 | b4:1 c#5:1 | d5:1 e5:1 |
               a5:2 | a5:1 g#5:1 | f#5:1 e5:1 | d5:2 | c#5:1 b4:1 | a4:2 | e5:1 a5:1 | a4:2""",
        har="""Am,Am | Am,Am | E,E | Am,Am | Am,Am | E,E | Am,E | Am,Am |
               Am,Am | E,E | F,E | Am,Am | Am,Am | E,E | Am,E | Am,Am""",
        final_chord=57,
    ),
    dict(
        id="fur-elise", t="致爱丽丝", o="Für Elise, WoO 59", c="贝多芬",
        note="三拍子的摇动主题，旋律线最好认",
        bpm=126, bpb=3, style="arp", perc="none", diff=2, tag="教学",
        mel_inst="piano", acc={"chord": "piano", "bass": "harp", "pad": "strings"},
        mel="""-:0.5 e5:0.5 d#5:0.5 | e5:0.5 d#5:0.5 e5:1 | b4:1 d5:1 c5:1 | a4:1.5 e4:1 g#4:0.5 |
               b4:1 c5:1.5 a4:0.5 | b4:1 c5:1 a4:1 | a4:3 |
               -:0.5 e5:0.5 d#5:0.5 | e5:0.5 d#5:0.5 e5:1 | b4:1 d5:1 c5:1 | a4:1.5 b4:0.5 c5:1 |
               d5:1 e5:1 c5:1 | b4:1 a4:1 g#4:1 | a4:3 |""",
        har="""Am | Am,E | Am,E7 | Am,E7 | Am | E,Am | Am,Am |
               Am | Am,E | Am,E7 | Am,E7 | F,C | G,E7 | Am,Am""",
        acc_reverb=0.3,
    ),
    dict(
        id="entertainer", t="艺人", o="The Entertainer", c="斯科特·乔普林",
        note="切分音密集，练反拍",
        bpm=126, bpb=4, style="stride", perc="pop", diff=4, tag="切分",
        mel_inst="piano", acc={"chord": "piano", "bass": "sinebass", "pad": "pad"},
        mel="""-:0.5 c4:0.5 e4:0.5 g4:0.5 | a4:1.5 g4:0.5 e4:0.5 g4:0.5 a4:0.5 |
               c5:1.5 a4:0.5 f#4:0.5 a4:1 | d5:0.5 c5:0.5 a4:0.5 c5:0.5 d5:1.5 |
               e5:0.5 d5:0.5 c5:0.5 a4:0.5 c5:0.5 d5:0.5 e5:1 | c5:0.5 a4:0.5 f#4:0.5 a4:0.5 c5:1.5 |
               d5:1 c5:1 a4:1 f#4:1 | e4:2 -:2 |""",
        har="""C,C7 | F,F | C,C | G7,G7 | C,C | F,F | C,G7 | C,C""",
        final_chord=60,
    ),
    dict(
        id="hungarian-5", t="匈牙利舞曲第五号", o="Hungarian Dance No. 5", c="勃拉姆斯",
        note="强弱对比鲜明，左右交替很带感",
        bpm=126, bpb=4, style="minuet", perc="soft", diff=3, tag="切分",
        mel_inst="violin", acc={"chord": "piano", "bass": "bass", "pad": "strings"},
        mel="""-:1 b4:0.5 c5:0.5 d5:1 g5:1 | f#5:1 g5:0.5 a5:0.5 b5:2 | a5:1 g5:1 f#5:1 e5:1 |
               d5:1 b4:0.5 c5:0.5 d5:1 g5:1 | g5:2 f5:1 e5:1 | d5:1 c5:1 b4:2 |
               e5:1 f#5:1 g5:1 a5:1 | b5:1 a5:1 g5:1 f#5:1 | e5:1 d5:1 c5:1 b4:1 | a4:2 -:2 |
               a4:1 b4:1 c5:1 d5:1 | e5:1 f5:1 g5:2 | f5:1 e5:1 d5:1 c5:1 | b4:1 a4:1 g#4:1 a4:1 |
               d5:2 b4:2 | c5:1 d5:1 e5:1 f5:1 | g5:1 f5:1 e5:1 d5:1 | c5:1 b4:1 a4:2""",
        har="""Am,Am | E,E | Am,Am | Am,E | Am,Am | E,E | Am,E | Am,Am |
               C,C | G,G | C,F | C,G | C,G | C,G | F,C | G,Am""",
        final_chord=57,
    ),
    dict(
        id="turkish-march", t="土耳其进行曲", o="Rondo alla turca, K.331", c="莫扎特",
        note="十六分音符成对出现，练手速",
        bpm=140, bpb=2, style="march", perc="march", diff=3, tag="进行曲",
        mel_inst="piano", acc={"chord": "trumpet", "bass": "bass", "pad": "strings"},
        mel="""b4:0.5 a4:0.5 g#4:0.5 a4:0.5 | c5:1 | d5:0.5 c5:0.5 b4:0.5 c5:0.5 | e5:1 |
               f5:0.5 e5:0.5 d#5:0.5 e5:0.5 | b5:0.5 a5:0.5 g#5:0.5 a5:0.5 | b5:0.5 a5:0.5 g#5:0.5 a5:0.5 | c6:1 |
               a5:1 c6:1 | b5:1 a5:1 | g5:1 a5:1 | b5:1 a5:1 | g5:1 a5:1 | b5:1 a5:1 | g5:1 f#5:1 | e5:2 |
               f5:1 a5:1 | a5:0.5 g5:0.5 f5:0.5 e5:0.5 | d5:1 g4:1 | e5:1 f5:1 | g5:2 |
               a5:0.5 g5:0.5 f5:0.5 e5:0.5 | d5:2 | c5:1 d5:1 | e5:2 |
               f5:0.5 e5:0.5 d5:0.5 c5:0.5 | b4:2""",
        har="""Am,Am | Am,Am | E,E | Am,Am | Am,Am | E,E | E,Am | Am,Am |
               A,A | A,A | E,E | E,A | A,A | F,F | G,G | Am,Am""",
        final_chord=57,
    ),
    dict(
        id="radetzky", t="拉德茨基进行曲", o="Radetzky March, Op. 228", c="老约翰·施特劳斯",
        note="重拍就是大泡泡，Perfect 时想拍手",
        bpm=126, bpb=2, style="march", perc="march", perc_flags={"final_cymbal": True},
        diff=2, tag="庆典",
        mel_inst="brass", acc={"chord": "trumpet", "bass": "bass", "pad": "strings"},
        mel="""d5:1 d5:0.5 d5:0.5 | e5:1 d5:1 | c5:1 b4:1 | a4:1 g4:1 | a4:1 b4:1 | c5:1 d5:1 |
               e5:1 e5:1 | d5:1 c5:1 | b4:1 a4:1 | g4:2 |
               d5:1 e5:1 | f#5:1 e5:1 | d5:1 c5:1 | b4:1 a4:1 | g4:1 a4:1 | b4:1 d5:1 |
               e5:1 d5:1 | c5:1 b4:1 | a4:1 b4:1 | g4:2""",
        har="""D,D | D,A | D,D | G,A | D,D | D,A | D,D | A,D |
               D,D | G,A | D,D | A,A | D,D | A,D | G,A | D,D""",
        final_chord=62,
    ),
    dict(
        id="william-tell", t="威廉退尔序曲", o="William Tell Overture — 终曲", c="罗西尼",
        note="骑兵冲锋的循环动机，越点越上头",
        bpm=144, bpb=2, style="march", perc="march", diff=3, tag="庆典",
        mel_inst="brass", acc={"chord": "trumpet", "bass": "bass", "pad": "strings"},
        mel="""e5:0.5 e5:0.5 e5:1 | b4:1 e5:1 | g#5:1 b5:1 | e5:1 e5:1 |
               d#5:1 e5:1 | f#5:1 g#5:1 | b5:2 | e5:1 b4:1 |
               g#4:1 b4:1 | e5:0.5 e5:0.5 e5:1 | b4:1 g#4:1 | e5:2 |
               f#5:1 g#5:1 | a#5:1 b5:1 | e6:2 | b5:2 |
               e5:1 e5:1 | b4:1 e5:1 | g#5:1 e5:1 | b5:2 |
               c6:1 b5:1 | a5:1 g#5:1 | f#5:1 e5:1 | b4:2 |
               e5:0.5 e5:0.5 e5:1 | g#5:1 b5:1 | e6:2 | e5:2""",
        har="""E,E | E,E | E,B | E,E | E,B | E,B | E,E | E,B |
               E,E | E,E | E,B | E,E | A,B | E,B | A,B | E,E |
               E,E | E,B | A,B | E,E | C,B | A,B | E,B | E,E""",
        final_chord=64,
    ),
    dict(
        id="sugar-plum", t="糖梅仙子之舞", o="Dance of the Sugar Plum Fairy", c="柴可夫斯基《胡桃夹子》",
        note="八音盒 + 三拍子，花街魔法感",
        bpm=132, bpb=3, style="waltz", perc="waltz", diff=3, tag="八音盒",
        mel_inst="celesta", acc={"chord": "harp", "bass": "harp", "pad": "strings"},
        mel="""-:1.5 e6:0.5 d#6:0.5 e6:0.5 | b5:1.5 a5:1.5 g#5:1.5 | e5:2 f#5:1 | g#5:1.5 a5:0.5 g#5:0.5 e5:0.5 |
               b5:1.5 -:1.5 | e6:0.5 d#6:0.5 e6:0.5 | b5:1.5 a5:1.5 g#5:1.5 | e5:2 f#5:1 | g#5:3""",
        har="""E,E | C#m,C#m | A,A | B7,B7 | E,E | C#m,A | B7 | E,E""",
        reverb=0.42, acc_reverb=0.4,
    ),
    dict(
        id="1812-overture", t="1812 序曲", o="1812 Overture, Op. 49 — 主题", c="柴可夫斯基",
        note="教堂主题 + 齐奏，做压轴",
        bpm=84, bpb=4, style="chorale", perc="fanfare", diff=2, tag="史诗",
        mel_inst="organ", acc={"chord": "brass", "bass": "bass", "pad": "strings"},
        mel="""f4:1 g4:1 a4:2 | g4:1 f4:1 e4:2 | f4:1 e4:1 d4:1 c4:1 | d4:2 e4:2 |
               f4:1 g4:1 a4:1 b4:1 | c5:2 a4:2 | d5:1 c5:1 b4:1 a4:1 | g4:4 |
               c5:1 c5:1 c5:2 | b4:1 a4:1 g4:2 | a4:1 b4:1 c5:1 d5:1 | e5:4 |
               d5:1 c5:1 b4:1 a4:1 | g4:1 a4:1 f4:2 | g4:2 a4:1 b4:1 | c5:4""",
        har="""F,C | F,C | Bb,F | C,F | F,C | F,C | Gm,C | F,F |
               F,C | Dm,A | Dm,A | C,F | Bb,F | C,F | Gm,C | F,F""",
        final_chord=53,
    ),
    dict(
        id="bumblebee", t="野蜂飞舞", o="Flight of the Bumblebee", c="里姆斯基-科萨科夫",
        note="半音狂飞（主题走向改编 + 加长段），Boss 关",
        bpm=168, bpb=2, style="perpetuum", perc="none", diff=5, tag="Boss",
        mel_inst="flute", acc={"chord": "strings", "bass": "bass", "pad": "strings"},
        mel="""a#5:0.5 b5:0.5 a5:0.5 g#5:0.5 | a5:0.5 g5:0.5 f#5:0.5 f5:0.5 |
               e5:0.5 f5:0.5 e5:0.5 d#5:0.5 | e5:0.5 d5:0.5 c#5:0.5 c5:0.5 |
               b4:0.5 c5:0.5 b4:0.5 a#4:0.5 | b4:0.5 a4:0.5 g#4:0.5 g4:0.5 |
               f#4:0.5 g4:0.5 f#4:0.5 f4:0.5 | e4:1 -:1 |
               e5:0.5 f5:0.5 e5:0.5 d#5:0.5 | e5:0.5 d5:0.5 c#5:0.5 c5:0.5 |
               b4:0.5 c5:0.5 b4:0.5 a#4:0.5 | b4:0.5 a4:0.5 g#4:0.5 g4:0.5 |
               f#4:0.5 g4:0.5 f#4:0.5 f4:0.5 | g4:0.5 g#4:0.5 a4:0.5 a#4:0.5 |
               b4:0.5 c5:0.5 c#5:0.5 d5:0.5 | e5:1 -:1 |
               e6:0.5 d6:0.5 c6:0.5 b5:0.5 | a5:0.5 b5:0.5 c6:0.5 d6:0.5 |
               e6:0.5 d6:0.5 c#6:0.5 c6:0.5 | b5:0.5 c6:0.5 d6:0.5 e6:0.5 |
               f6:0.5 e6:0.5 d#6:0.5 d6:0.5 | c6:0.5 d6:0.5 e6:0.5 f6:0.5 |
               g6:0.5 f#6:0.5 f6:0.5 e6:0.5 | e6:1 -:1 |
               a5:0.5 g#5:0.5 g5:0.5 f#5:0.5 | f5:0.5 e5:0.5 d#5:0.5 e5:0.5 |
               f5:0.5 g5:0.5 g#5:0.5 a5:0.5 | b5:0.5 a5:0.5 g#5:0.5 a5:0.5 |
               a#5:0.5 b5:0.5 c6:0.5 d6:0.5 | e6:0.5 d6:0.5 c6:0.5 b5:0.5 |
               a5:0.5 g5:0.5 f5:0.5 e5:0.5 | a5:1 -:1""",
        har="""Am,Am | E,E | Am,Am | E,E | Am,Am | E,E | E,Am | Am,Am |
               Am,Am | E,E | Am,Am | E,E | E,Am | Am,Am | E,E | Am,Am""",
        final_chord=57,
    ),
    dict(
        id="toccata-dm", t="D 小调托卡塔与赋格", o="Toccata and Fugue, BWV 565", c="巴赫",
        note="开场那一串下行就是判定线",
        bpm=112, bpb=4, style="baroque", perc="none", diff=4, tag="教堂",
        mel_inst="organ", acc={"chord": "organ", "bass": "sinebass", "pad": "strings"},
        mel="""a5:1 | g5:0.5 a5:0.5 f5:1 e5:1 | d5:0.5 e5:0.5 c5:1 a4:2 |
               d5:1 c5:1 b4:1 a4:1 | g4:1 a4:1 b4:0.5 c5:0.5 d5:1 | e5:1 f5:1 g5:2 |
               a5:1 g5:1 f5:1 e5:1 | d5:1 e5:1 f5:4 |
               a4:1 b4:1 c5:1 d5:1 | e5:1 f5:1 g5:1 a5:1 | b5:1 a5:1 g5:1 f5:1 | e5:1 d5:1 c5:1 b4:1 |
               a4:1 g4:1 f4:1 e4:1 | d4:4 -:4""",
        har="""Dm,Dm | A,A | Dm,Dm | Gm,Gm | A,A | Dm,Dm | Bb,A | Dm,Dm |
               Dm,Dm | Gm,Gm | A,A | Dm,Dm | A,A | Dm,Dm""",
        final_chord=50,
    ),
    dict(
        id="air-g-string", t="G 弦上的咏叹调", o="Air on the G String, BWV 1068", c="巴赫",
        note="极慢长音，练「跟住」而不是「快点」",
        bpm=64, bpb=4, style="pad", perc="none", diff=1, tag="夜景",
        mel_inst="violin", acc={"chord": "harp", "bass": "strings", "pad": "strings"},
        mel="""d5:3 c5:1 | b4:2 c5:1 a4:1 | g4:2 a4:1 b4:1 | a4:3 g4:1 | f4:2 g4:1 d5:1 |
               c5:4 | b4:3 a4:1 | g4:4 |
               d5:2 e5:1 f5:1 | e5:3 d5:1 | c5:2 d5:1 e5:1 | d5:4 |
               a4:1 b4:1 c5:1 d5:1 | e5:4 | f5:3 e5:1 | d5:4""",
        har="""C,G | Am,E | F,C | G,Dm | C,G | Am,E | F,C | G,G |
               G,D | Em,C | Am,Em | Dm,A | G,D | C,G | F,C | G,G""",
        reverb=0.5, acc_reverb=0.5,
    ),
    dict(
        id="canon-in-d", t="D 大调卡农", o="Canon in D", c="帕赫贝尔",
        note="固定八和弦循环，一层层叠上来",
        bpm=84, bpb=4, style="alberti", perc="none", diff=2, tag="夜景",
        mel_inst="violin", acc={"chord": "harp", "bass": "harp", "pad": "strings"},
        mel="""f#5:2 d5:2 b4:2 a4:2 | f#4:2 a4:2 d5:2 a4:2 | e5:2 c5:2 a4:2 g#4:2 | e4:2 g#4:2 c5:2 g#4:2 |
               d5:2 b4:2 a4:2 f#4:2 | b4:2 d5:2 f#5:2 d5:2 | g5:2 e5:2 b4:2 d5:2 | a4:2 e5:2 f#5:2 a5:2 |
               b5:1 a5:1 g5:1 f#5:1 e5:1 f#5:1 g5:1 a5:1 | b5:1 a5:1 g5:1 f#5:1 e5:1 d5:1 c5:1 b4:1 |
               a5:1 g5:1 f5:1 e5:1 d5:1 e5:1 f5:1 g5:1 | a5:1 g5:1 f5:1 e5:1 d5:1 c5:1 b4:1 a4:1""",
        har="""D,D | A,A | Bm,Bm | F#m,F#m | G,G | D,D | G,G | A,A | D,A | Bm,F#m | G,D | G,A""",
        final_chord=62,
    ),
    dict(
        id="brandenburg-3", t="勃兰登堡协奏曲第三号", o="Brandenburg Concerto No. 3, BWV 1048", c="巴赫",
        note="重复动机强，适合齐奏",
        bpm=132, bpb=3, style="gigue", perc="none", diff=3, tag="巴洛克",
        mel_inst="violin", acc={"chord": "harpsichord", "bass": "harp", "pad": "strings"},
        mel="""d5:1 c5:1 b4:1 | a4:1 b4:1 c5:1 | d5:1 e5:1 f#5:1 | g5:2 a5:1 |
               g5:1 f#5:1 e5:1 | d5:1 e5:1 f#5:1 | g5:1 a5:1 b5:1 | a5:3 |
               b5:1 a5:1 g5:1 | f#5:1 g5:1 a5:1 | b5:1 c6:1 d6:1 | g5:3 |
               f#5:1 g5:1 a5:1 | b5:1 a5:1 g5:1 | f#5:1 e5:1 d5:1 | g5:3""",
        har="""G,G | G,G | D,D | G,G | Em,Em | D,D | G,D | G,G |
               G,G | D,D | G,G | C,C | D,D | G,D | G,D | G,G""",
        final_chord=55,
    ),
    dict(
        id="jesu-joy", t="耶稣，人类渴望的喜乐", o="Jesu, Joy of Man's Desiring, BWV 147", c="巴赫",
        note="规整伴奏 + 歌唱旋律",
        bpm=100, bpb=4, style="alberti", perc="none", diff=2, tag="教堂",
        mel_inst="trumpet", acc={"chord": "organ", "bass": "sinebass", "pad": "strings"},
        mel="""g4:1 g4:1 c5:1 e5:1 | d5:1 c5:1 d5:2 | e5:1 d5:1 c5:1 b4:1 | a4:2 g4:2 |
               c5:1 b4:1 a4:1 g4:1 | a4:1 b4:1 c5:2 | d5:1 e5:1 f5:1 g5:1 | c5:4 |
               e5:1 e5:1 d5:1 c5:1 | b4:1 c5:1 d5:2 | c5:1 b4:1 a4:1 g4:1 | f4:1 e4:1 d4:2 |
               g4:1 c5:1 e5:1 g5:1 | a5:1 g5:1 e5:2 | d5:1 c5:1 b4:1 a4:1 | g4:4""",
        har="""C,C | F,G | C,G | C,G | C,G | F,C | F,C | G,C |
               C,G | F,G | C,Dm | G,G | C,G | F,C | G,C | C,C""",
        final_chord=60,
    ),
    dict(
        id="water-hornpipe", t="水上音乐 · 号角舞曲", o="Water Music — Hornpipe, HWV 349", c="亨德尔",
        note="巴洛克舞曲，重拍清楚",
        bpm=120, bpb=4, style="baroque", perc="soft", diff=2, tag="宫廷",
        mel_inst="trumpet", acc={"chord": "harpsichord", "bass": "harp", "pad": "strings"},
        mel="""d5:1 d5:1 d5:0.5 e5:0.5 f5:1 | g5:1 f5:1 e5:1 d5:1 | c5:0.5 d5:0.5 e5:1 a4:1 |
               d5:2 c5:1 b4:1 | c5:0.5 b4:0.5 a4:1 g4:0.5 a4:0.5 | b4:1 c5:1 d5:1 e5:1 |
               f5:1 e5:1 d5:1 c5:1 | d5:4 |
               a4:1 b4:1 c5:1 d5:1 | e5:1 f5:1 g5:1 a5:1 | g5:0.5 f5:0.5 e5:0.5 d5:0.5 c5:1 |
               d5:1 e5:1 f5:1 g5:1 | a5:2 g5:1 f5:1 | e5:1 d5:1 c5:1 b4:1 | a4:1 g4:1 f4:1 d4:1 | g4:4""",
        har="""D,D | G,A | D,D | A,D | D,G | A,D | G,A | D,D |
               D,D | G,A | D,A | D,G | A,D | G,A | D,A | D,D""",
        final_chord=62,
    ),
    dict(
        id="sarabande", t="萨拉班德舞曲", o="Sarabande in D minor, HWV 437", c="亨德尔",
        note="第二拍才是重拍，跟平时的习惯相反",
        bpm=66, bpb=3, style="pad", perc="none", diff=2, tag="庄重",
        mel_inst="cello", acc={"chord": "harpsichord", "bass": "strings", "pad": "strings"},
        mel="""d5:1 a4:1 d5:1 | c#5:1 d5:1 e5:1 | f5:1 e5:1 d5:1 | c5:1 b4:1 a4:1 |
               d5:1 a4:1 d5:1 | e5:1 f5:1 g5:1 | f5:1 e5:1 d5:1 | c#5:3 |
               d5:1 e5:1 f5:1 | g5:1 f5:1 e5:1 | d5:1 c5:1 b4:1 | a4:1 b4:1 c5:1 |
               d5:1 c5:1 b4:1 | a4:1 g4:1 f4:1 | e4:1 a4:1 d5:1 | d5:3""",
        har="""Dm,Dm | A,A | Bb,Bb | A,A | Dm,Dm | Gm,Gm | A,A | Dm,Dm |
               Dm,Bb | A,A | Dm,Dm | F,F | Gm,Gm | A,A | Dm,A | Dm,Dm""",
        reverb=0.4,
    ),
    dict(
        id="hallelujah", t="哈利路亚合唱", o="Messiah — Hallelujah Chorus, HWV 56", c="亨德尔",
        note="段落对比强，副歌可以整场一起点",
        bpm=104, bpb=4, style="chorale", perc="fanfare", diff=3, tag="教堂",
        mel_inst="trumpet", acc={"chord": "organ", "bass": "sinebass", "pad": "strings"},
        mel="""d5:1 d5:1 d5:1 c5:1 | b4:1 b4:1 a4:1 a4:1 | g4:2 d5:2 | d5:1 d5:1 d5:1 c5:1 |
               b4:2 a4:2 | g4:4 |
               d5:0.5 d5:0.5 d5:1 e5:1 | f5:1 e5:1 d5:1 c5:1 | b4:1 a4:1 g4:1 f4:1 | e4:2 d4:2 |
               d5:1 e5:1 f5:1 g5:1 | a5:1 g5:1 f5:1 e5:1 | d5:1 c5:1 b4:1 a4:1 | b4:4 |
               g4:1 a4:1 b4:1 c5:1 | d5:1 e5:1 f5:1 g5:1 | a5:4 | g5:2 d5:2""",
        har="""G,G | C,D | G,G | G,G | C,D | G,G |
               D,D | G,G | C,D | G,G | G,G | C,D | G,D | G,G |
               C,D | G,D | G,D | G,G | C,D | G,D | D,D | G,G""",
        final_chord=55,
    ),
    dict(
        id="kleine-nachtmusik", t="小夜曲 K.525", o="Eine kleine Nachtmusik — I", c="莫扎特",
        note="开场 forte 的主和弦分解，节拍极明确",
        bpm=132, bpb=4, style="baroque", perc="soft", diff=2, tag="宫廷",
        mel_inst="violin", acc={"chord": "piano", "bass": "harp", "pad": "strings"},
        mel="""d5:1 d5:1 d5:1 a4:1 | g4:1 g4:1 g4:1 a4:1 | f#4:4 | a4:1 a4:1 a4:1 d5:1 |
               c5:1 c5:1 c5:1 d5:1 | a4:4 | d5:1 f#5:1 a5:1 d6:1 | c6:1 a5:1 f#5:1 a5:1 |
               g5:1 f#5:1 e5:1 d5:1 | c5:1 b4:1 a4:1 g4:1 | f#4:1 g4:1 a4:1 d5:1 | a4:4""",
        har="""D,D | A,A | D,D | D,D | F#m,A | D,D | G,A | D,A |
               D,A | G,A | D,D | A,D | G,A | D,D | D,A | D,D""",
        final_chord=62,
    ),
    dict(
        id="saints-go-marching", t="圣者进行曲", o="When the Saints Go Marching In", c="传统歌曲",
        note="重复句式 + 强拍，酒馆庆典用",
        bpm=132, bpb=4, style="stride", perc="pop", diff=2, tag="庆典",
        mel_inst="trumpet", acc={"chord": "piano", "bass": "sinebass", "pad": "pad"},
        mel="""c5:1 c5:1 c5:1 d5:0.5 e5:0.5 | c5:1 -:1 g4:1 c5:1 | a4:1 a4:1 a4:1 b4:0.5 c5:0.5 |
               a4:1 -:1 e4:1 a4:1 | g4:1 g4:1 g4:1 a4:0.5 b4:0.5 | g4:1 -:1 e4:1 g4:1 |
               f4:1 g4:1 a4:1 b4:1 | c5:2 -:2 |
               c5:1 d5:1 e5:1 f5:1 | g5:2 e5:1 c5:1 | a4:1 b4:1 c5:1 a4:1 | g4:4 |
               f4:1 g4:1 a4:1 c5:1 | b4:1 a4:1 g4:1 e4:1 | d4:1 e4:1 f4:1 g4:1 | c5:4""",
        har="""C,C | C,C | F,C | C,G | C,C7 | F,F | C,G | C,C |
               Am,Am | Dm,Dm | G7,C | F,F | C,C | Dm,A | G7,C | C,C""",
        final_chord=60,
    ),
]
