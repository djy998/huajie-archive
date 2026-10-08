"""舞台演奏 · 曲目表

每首对应 midi/<id>.mid（吟游诗人演奏用的 MIDI，单乐器、C3–C6 为主）。
  t     曲名（有通行中文名就用中文）
  o     副标题：原名、出处
  c     作曲 / 演唱；不确定就留空，界面上不显示
  tag   分类，取 TAGS 里的一项（选曲窗口按它筛）
  note  （可选）大厅里的一行介绍
  inst  （可选）「跟随曲目」时用的音色，模拟器里的乐器 id；不写就按 MIDI 轨道名猜
  gap   （可选）谱面疏密倍数，>1 更稀、<1 更密，默认 1
  show  （可选）True = 所有人都能在选曲窗口看到；不写 = 隐藏，要在选曲窗口的搜索框输入曲库密码（Worker 的 PASSWORD_STAGE）
        按回车后才显示。build.py 把公开的写进 songs.json，全部写进 songs-all.json（只经 Worker 发给输对密码的人）
星级、时长、速度、音数都由 build.py 从 MIDI 算出来，不用手填。列表顺序就是选曲窗口里的顺序。
"""

DEFAULT = "you-are-my-sunshine"   # 第一次打开舞台时选中的曲子（挑一首短、简单、耳熟的）；它是隐藏曲时，公开曲库改选公开曲里最简单的一首

TAGS = ["古典", "游戏", "动画", "影视", "日系流行", "欧美流行", "菲律宾流行", "其他"]

SONGS = [
    # ==== 古典 ====
    dict(id="canon-in-d", t="D 大调卡农", o="Canon in D", c="帕赫贝尔", tag="古典", show=True),
    dict(id="fur-elise", t="致爱丽丝", o="Für Elise", c="贝多芬", tag="古典", show=True),
    dict(id="clair-de-lune", t="月光", o="Clair de lune（《贝加莫组曲》）", c="德彪西", tag="古典", show=True),
    dict(id="nocturne-op9-2", t="夜曲 Op.9 No.2", o="Nocturne in E♭ major", c="肖邦", tag="古典", show=True),
    dict(id="beethoven-virus", t="贝多芬病毒", o="Beethoven Virus（改编自《悲怆》奏鸣曲）", c="BanYa", tag="古典"),

    # ==== 游戏 ====
    dict(id="baka-mitai", t="像个笨蛋", o="ばかみたい（《如龙》系列）", c="", tag="游戏"),
    dict(id="dearly-beloved", t="Dearly Beloved", o="《王国之心》", c="下村阳子", tag="游戏"),
    dict(id="simple-and-clean", t="Simple and Clean", o="《王国之心》主题曲", c="宇多田光", tag="游戏"),
    dict(id="simple-and-clean-2", t="Simple and Clean（另一版）", o="《王国之心》主题曲 · 另一份编配", c="宇多田光", tag="游戏"),
    dict(id="lazy-afternoons", t="Lazy Afternoons", o="《王国之心 II》黄昏之镇", c="下村阳子", tag="游戏"),
    dict(id="eyes-on-me", t="Eyes on Me", o="《最终幻想 VIII》主题曲", c="王菲", tag="游戏"),
    dict(id="spira-unplugged", t="Spira Unplugged", o="《最终幻想 X》", c="", tag="游戏"),
    dict(id="neath-dark-waters", t="'Neath Dark Waters", o="《最终幻想 XIV》", c="", tag="游戏"),
    dict(id="yanxia-night", t="延夏（夜）", o="Yanxia night theme · 《最终幻想 XIV：红莲之狂潮》", c="", tag="游戏"),
    dict(id="the-princess", t="The Princess", o="《Slay the Princess》", c="Brandon Boone", tag="游戏"),
    dict(id="your-reality", t="Your Reality", o="《心跳文学部》", c="Dan Salvato", tag="游戏"),
    dict(id="haru-urara", t="致春乌拉拉", o="Tribute to Haru Urara（《赛马娘》）", c="", tag="游戏"),
    dict(id="masayoshi-soken-bee-my-honey-solo-debra-vanhouten", t="Bee My Honey", o="Solo-Debra Vanhouten", c="Masayoshi Soken", tag="游戏", note="蜂蜂小甜心，甜到你心中！"),

    # ==== 动画 ====
    dict(id="ichirin-no-hana", t="一轮之花", o="一輪の花（《死神》OP）", c="HIGH and MIGHTY COLOR", tag="动画"),
    dict(id="alones", t="Alones", o="《死神》OP", c="Aqua Timez", tag="动画"),
    dict(id="after-dark", t="After Dark", o="《死神》OP", c="ASIAN KUNG-FU GENERATION", tag="动画"),
    dict(id="rolling-star", t="Rolling Star", o="《死神》OP", c="YUI", tag="动画"),
    dict(id="ranbu-no-melody", t="乱舞的旋律", o="乱舞のメロディ（《死神》OP）", c="SID", tag="动画"),
    dict(id="change", t="chAngE", o="《死神》OP", c="miwa", tag="动画"),
    dict(id="ready-steady-go", t="READY STEADY GO", o="《钢之炼金术师》OP", c="L'Arc~en~Ciel", tag="动画"),
    dict(id="ready-steady-go-lite", t="READY STEADY GO（精简版）", o="《钢之炼金术师》OP · 和弦更少的编配", c="L'Arc~en~Ciel", tag="动画"),
    dict(id="rewrite", t="Rewrite", o="《钢之炼金术师》OP", c="ASIAN KUNG-FU GENERATION", tag="动画"),
    dict(id="kesenai-tsumi", t="无法消除的罪", o="消せない罪（《钢之炼金术师》ED）", c="北出菜奈", tag="动画"),
    dict(id="drivers-high", t="Driver's High", o="《麻辣教师 GTO》OP", c="L'Arc~en~Ciel", tag="动画"),
    dict(id="ride-on-shooting-star", t="Ride on Shooting Star", o="《FLCL》", c="the pillows", tag="动画"),
    dict(id="last-dinosaur", t="Last Dinosaur", o="《FLCL》", c="the pillows", tag="动画"),
    dict(id="last-dinosaur-lite", t="Last Dinosaur（精简版）", o="《FLCL》 · 和弦更少的编配", c="the pillows", tag="动画"),
    dict(id="i-think-i-can", t="I Think I Can", o="《FLCL》", c="the pillows", tag="动画"),
    dict(id="carnival", t="Carnival", o="《FLCL》", c="the pillows", tag="动画"),
    dict(id="little-busters", t="Little Busters", o="《FLCL》", c="the pillows", tag="动画"),
    dict(id="ouchi-ni-kaeritai", t="想回家", o="おうちに帰りたい（《为美好的世界献上祝福！》ED）", c="", tag="动画"),

    # ==== 影视 ====
    dict(id="this-is-berk", t="This is Berk", o="《驯龙高手》", c="John Powell", tag="影视"),
    dict(id="my-heart-will-go-on", t="我心永恒", o="My Heart Will Go On（《泰坦尼克号》）", c="Céline Dion", tag="影视"),
    dict(id="shallow", t="Shallow", o="《一个明星的诞生》", c="Lady Gaga、Bradley Cooper", tag="影视"),

    # ==== 日系流行 ====
    dict(id="plastic-love", t="Plastic Love", o="", c="竹内玛莉亚", tag="日系流行"),
    dict(id="mesmerizer", t="Mesmerizer", o="メズマライザー（feat. 初音未来、重音 Teto）", c="", tag="日系流行"),

    # ==== 欧美流行 ====
    dict(id="you-are-my-sunshine", t="你是我的阳光", o="You Are My Sunshine", c="美国传统歌曲", tag="欧美流行"),
    dict(id="fly-me-to-the-moon", t="带我飞向月球", o="Fly Me to the Moon", c="Frank Sinatra", tag="欧美流行"),
    dict(id="eternal-flame", t="Eternal Flame", o="", c="The Bangles", tag="欧美流行"),
    dict(id="kiss-me", t="Kiss Me", o="", c="Sixpence None the Richer", tag="欧美流行"),
    dict(id="a-thousand-miles", t="A Thousand Miles", o="", c="Vanessa Carlton", tag="欧美流行"),
    dict(id="19-2000", t="19-2000", o="", c="Gorillaz", tag="欧美流行"),
    dict(id="the-rock-show", t="The Rock Show", o="", c="blink-182", tag="欧美流行"),
    dict(id="suavemente", t="Suavemente", o="", c="Elvis Crespo", tag="欧美流行"),
    dict(id="bubbly", t="Bubbly", o="", c="Colbie Caillat", tag="欧美流行"),
    dict(id="party-rock-anthem", t="Party Rock Anthem", o="", c="LMFAO", tag="欧美流行"),
    dict(id="stereo-hearts", t="Stereo Hearts", o="", c="Gym Class Heroes", tag="欧美流行"),
    dict(id="call-me-maybe", t="Call Me Maybe", o="", c="Carly Rae Jepsen", tag="欧美流行"),
    dict(id="what-makes-you-beautiful", t="What Makes You Beautiful", o="", c="One Direction", tag="欧美流行"),
    dict(id="classic", t="Classic", o="", c="MKTO", tag="欧美流行"),
    dict(id="chandelier", t="Chandelier", o="", c="Sia", tag="欧美流行"),
    dict(id="trap-queen", t="Trap Queen", o="短版", c="Fetty Wap", tag="欧美流行"),
    dict(id="me-too", t="Me Too", o="", c="Meghan Trainor", tag="欧美流行"),
    dict(id="starving", t="Starving", o="", c="Hailee Steinfeld", tag="欧美流行"),
    dict(id="pink-pony-club", t="Pink Pony Club", o="", c="Chappell Roan", tag="欧美流行"),
    dict(id="luther", t="Luther", o="", c="Kendrick Lamar、SZA", tag="欧美流行"),

    # ==== 菲律宾流行（OPM） ====
    dict(id="alapaap", t="Alapaap", o="", c="Eraserheads", tag="菲律宾流行"),
    dict(id="magasin", t="Magasin", o="", c="Eraserheads", tag="菲律宾流行"),
    dict(id="with-a-smile", t="With a Smile", o="", c="Eraserheads", tag="菲律宾流行"),
    dict(id="kailan", t="Kailan", o="", c="Eraserheads", tag="菲律宾流行"),
    dict(id="overdrive", t="Overdrive", o="", c="Eraserheads", tag="菲律宾流行"),
    dict(id="panalangin", t="Panalangin", o="", c="APO Hiking Society", tag="菲律宾流行"),
    dict(id="gitara", t="Gitara", o="", c="Parokya ni Edgar", tag="菲律宾流行"),
    dict(id="halaga", t="Halaga", o="", c="Parokya ni Edgar", tag="菲律宾流行"),
    dict(id="harana", t="Harana", o="", c="Parokya ni Edgar", tag="菲律宾流行"),
    dict(id="huling-sayaw", t="Huling Sayaw", o="", c="Kamikazee", tag="菲律宾流行"),
    dict(id="narda", t="Narda", o="", c="Kamikazee", tag="菲律宾流行"),
    dict(id="halik", t="Halik", o="", c="Kamikazee", tag="菲律宾流行"),
    dict(id="ambisyoso", t="Ambisyoso", o="", c="Kamikazee", tag="菲律宾流行"),
    dict(id="migraine", t="Migraine", o="", c="Moonstar88", tag="菲律宾流行"),
    dict(id="torete", t="Torete", o="", c="Moonstar88", tag="菲律宾流行"),
    dict(id="antukin", t="Antukin", o="", c="Rico Blanco", tag="菲律宾流行"),
    dict(id="your-universe", t="Your Universe", o="", c="Rico Blanco", tag="菲律宾流行"),
    dict(id="buko", t="Buko", o="", c="Jireh Lim", tag="菲律宾流行"),
    dict(id="magkabilang-mundo", t="Magkabilang Mundo", o="", c="Jireh Lim", tag="菲律宾流行"),
    dict(id="akin-ka-na-lang", t="Akin Ka Na Lang", o="", c="Itchyworms", tag="菲律宾流行"),
    dict(id="kundiman", t="Kundiman", o="", c="Silent Sanctuary", tag="菲律宾流行"),
    dict(id="nobela", t="Nobela", o="", c="Join the Club", tag="菲律宾流行"),
    dict(id="porque", t="Porque", o="", c="Maldita", tag="菲律宾流行"),
    dict(id="prom", t="Prom", o="", c="Sugarfree", tag="菲律宾流行"),
    dict(id="sundo", t="Sundo", o="", c="Imago", tag="菲律宾流行"),
    dict(id="tell-me-where-it-hurts", t="Tell Me Where It Hurts", o="", c="MYMP", tag="菲律宾流行"),
    dict(id="will-you-ever-learn", t="Will You Ever Learn", o="", c="Typecast", tag="菲律宾流行"),
    dict(id="uhaw", t="Uhaw", o="", c="Dilaw", tag="菲律宾流行"),
    dict(id="salamin-salamin", t="Salamin, Salamin", o="", c="BINI", tag="菲律宾流行"),

    # ==== 其他（出处待补） ====
    dict(id="crazy", t="Crazy", o="", c="", tag="其他"),
    dict(id="crazy-for-you", t="Crazy for You", o="", c="", tag="其他"),
    dict(id="dream", t="Dream", o="", c="", tag="其他"),
    dict(id="stay-with-me", t="Stay with Me", o="", c="", tag="其他"),
    dict(id="touch", t="Touch", o="", c="", tag="其他"),
    dict(id="your-song", t="Your Song", o="", c="", tag="其他"),
]

BY_ID = {s["id"]: s for s in SONGS}
