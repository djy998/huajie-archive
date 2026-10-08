/* 花舞之街 · 站点配置与内容 */

/* Worker 挂在本站 /api/*，须同源 */
const WORKER_URL = "/api/";
const TURNSTILE_SITE_KEY = "0x4AAAAAAExPobWO4wUg253f";
const GROUP_QQ = "453278026";
const INFO_COPY_TAIL = "若你懂麦穗，便懂希望；若你懂苍穹，便懂年华。有人说桂花树代表叹息，其实它只是在掌心酝酿清风。你我走过山间，芦苇呆呆飘荡，屋檐也勇敢了起来。有人说雏菊代表一生，其实它只是在巷口找寻清风。";   // 复制花街介绍时附在末尾
const SHARE_TEXT = "ff14莫古力区梦羽花街网站试运行中！https://swayingsussurrusstreet.dpdns.org/";

/* 直达链接；#ti、#survey 同时写在 boot.js */
const TICKET_HASH = "#ti";
const SURVEY_HASH = "#survey";
const VENUE_HASH = "#venue";
const TICKET_TITLE = "莫古力中秋月轮祭 · 购票";

/* 首页卡片底图；悬停图在 style.css */
const TILE_BG = {
  day: {
    latestTile:  "assets/site/tile-latest-day.webp",
    archiveTile: "assets/site/tile-archive-day.webp",
    miniTile:    "assets/site/tile-mini-day.webp",
    infoTile:    "assets/site/tile-info-day.webp",
    bookingTile: "assets/site/tile-booking-day.webp",
    groupTile:   "assets/site/tile-group-day.webp",
  },
  night: {
    latestTile:  "assets/site/tile-latest-night.webp",
    archiveTile: "assets/site/tile-archive-night.webp",
    miniTile:    "assets/site/tile-mini-night.webp",
    infoTile:    "assets/site/tile-info-night.webp",
    bookingTile: "assets/site/tile-booking-night.webp",
    groupTile:   "assets/site/tile-group-night.webp",
  },
};
const SKY_IMAGES = { day: "assets/site/sky-day.webp", night: "assets/site/sky-night.webp" };
/* 竖屏用的窄版天空，文件名规则同时写在 boot.js */
const SKY_IMAGES_PORTRAIT = { day: "assets/site/sky-day-p.webp", night: "assets/site/sky-night-p.webp" };
/* 弹窗与表单卡片底图；替换同名图片时 ?v= 加一 */
const INFO_BG_IMAGE = "assets/site/info-bg.webp?v=2";
const INFO_BG_SOFT = "assets/site/info-bg-soft.webp?v=1";   // 弹出卡片用：同一张图加 52% 不透明度（卡片底约 6% 透明）

/* 花街介绍 · 建成记录视频：heading 为小标题，cover 为封面（可省略） */
const INFO_RECORD_VIDEOS = [
  {
    heading: "花舞之街",
    bvid: "BV1554y1h7By",
    aid: 844834734,
    cid: 315146059,
    page: 1,
    danmaku: false,
    title: "花舞之街建成记录",
    cover: "infogal/info-29.webp",
  },
  {
    heading: "薰风花语町",
    bvid: "BV1wbxHe9Ejz",
    aid: 113205993014805,
    cid: 32384222155,
    page: 1,
    danmaku: false,
    title: "薰风花语町建成记录",
    cover: "infogal/record-xunfeng.webp",
  },
];

/* 花街介绍 · 相册 */
const INFO_GALLERY = Array.from({ length: 39 }, (_, i) =>
  `infogal/info-${String(i + 1).padStart(2, "0")}.webp`
);

/* 白天飘落的花叶，ar = 宽 / 高；boot.js 有同样的列表 */
const DAY_FX_LEAVES = [
  { ar: 1.6,   src: "assets/site/leaf-01.webp" },
  { ar: 1.1,   src: "assets/site/leaf-02.webp" },
  { ar: 0.807, src: "assets/site/leaf-03.webp" },
  { ar: 1.257, src: "assets/site/leaf-04.webp" },
  { ar: 1.086, src: "assets/site/leaf-05.webp" },
  { ar: 0.949, src: "assets/site/leaf-06.webp" },
  { ar: 0.864, src: "assets/site/leaf-07.webp" },
  { ar: 1.517, src: "assets/site/leaf-08.webp" },
  { ar: 0.568, src: "assets/site/leaf-09.webp" },
];

/* 背景音乐 { src, title, mode? }，mode 为 day / night 时随昼夜换曲；留空不播放 */
const MUSIC_TRACKS = [
  // { src: "assets/audio/huajie-day.mp3",   title: "花街·白昼",   mode: "day"   },
  // { src: "assets/audio/huajie-night.mp3", title: "花街·灯笼下", mode: "night" },
];
/* 最新活动视频：src（本站视频地址，优先）或 bvid 非空时显示播放按钮。
   B 站视频须填 aid / cid，取自 api.bilibili.com/x/web-interface/view?bvid=… 的 data.aid、data.cid */
const LATEST_VIDEO = {
  src: "",
  poster: "poster-moguri-2026.webp",
  bvid: "BV15eeu66Eze",
  aid: 117285691852006,
  cid: 41971092695,
  page: 1,
  start: 0,
  danmaku: false,
  defaultOpen: false,
};

/* 最新活动。poster / manual / review / feedback 为字符串或
   { text, images, link: { url, label }, links: [{ url, label, image? }], video: { bvid, aid, cid, … }, titles, note }；
   survey: true 时「反馈与建议」显示活动问卷 */
const LATEST_EVENT = {
  title: "2026莫古力花舞之街月轮祭",
  dateLabel: "",
  location: "",
  cover: "poster-moguri-2026.webp",
  areas: [
    {
      name: "",
      shops: [
        { num: "31·32·34·36", name: "真理馆", desc: "迷宫探索", price: "" },
        { num: "33·44", name: "Miumiucandy拉拉菲尔主题店", desc: "书信、故事续写·漂流瓶", price: "" },
        { num: "35", name: "麦田舞团", desc: "舞蹈", price: "" },
        { num: "38", name: "青木原", desc: "情景游戏/抽奖", price: "" },
        { num: "39·40", name: "七海小镇", desc: "限时游戏（庭院）", price: "" },
        { num: "41", name: "丽姬娅·群星", desc: "占卜（自营）", price: "" },
        { num: "42", name: "Paradise·乐园", desc: "舞蹈", price: "" },
        { num: "43", name: "抹茶Sweetheart", desc: "小品", price: "" },
        { num: "49", name: "†龙门†龙娘伊甸园", desc: "指名", price: "" },
        { num: "场外", name: "深夜相亲大会", desc: "相亲交友活动（雄心广场旁 · 中心泳池处）", price: "" },
        { num: "场外", name: "老二次元音乐社", desc: "乐队演奏（高脚市场旁）", price: "" }
      ]
    }
  ],
  manual: { images: ["assets/latest/latest-002.webp?v=2"] },
  poster: { images: ["poster-moguri-2026.webp", "assets/latest/latest-001.webp?v=2"] },
  review: {
    video: {
      bvid: "BV1shat6BETu",
      aid: 117341459451164,
      cid: 42240708501,
      page: 1,
      danmaku: false,
      title: "活动回顾视频",
    },
    links: [
      { url: "https://www.bilibili.com/video/BV1aZhd6fESZ/", label: "【直播回放】雪人小肥！猪区梦羽中秋花街！中秋快乐！ 2026年09月26日20点场",
        image: "assets/latest/review-live-2.webp" },
    ],
    titles: { video: "活动剪影", links: "直播回放", images: "活动相册" },
    images: [
      "assets/latest/review-001.webp",
      "assets/latest/review-002.webp",
      "assets/latest/review-003.webp",
    ],
  },
  feedback: "",
  survey: true,
};

/* 往期活动，新的在前。id 用于 #event-<id> 与点赞；tabs 限定显示的标签页；hideReview 隐藏活动回顾 */
const ARCHIVE_EVENTS = [
  {
    id: "ny2026",
    year: "2026",
    title: "莫古力跨年盛典",
    dateLabel: "2026年1月1日–1月2日",
    location: "莫古力区 · 梦羽宝境 高脚孤丘 22/23扩建区",
    cover: "assets/gallery/gallery-001.jpg",
    manual: { images: ["assets/gallery/gallery-002.jpg","assets/gallery/gallery-003.jpg"] },
    poster: { images: ["assets/gallery/gallery-004.jpg"] },
    review: { link: { url: "https://www.bilibili.com/video/BV1VhivB1EC1/", label: "查看活动回顾视频" } },
    areas: [
      {
        name: "薰风花语町会场（22扩建区）",
        shops: [
          { num: "49", name: "Blue Red·藍红", desc: "搓澡项目，先在55号房购买信物后前往49号房交易", price: "100w/次" },
          { num: "49", name: "夜幕", desc: "演奏", price: "" },
          { num: "54", name: "随缘猫咖", desc: "战术板猜画RP，答对可在客户群展示成果", price: "免费" },
          { num: "55", name: "Blue Red·藍红", desc: "陪聊服务", price: "40w/30min" },
          { num: "55", name: "龙门", desc: "轻无指名", price: "" },
          { num: "56", name: "青木原", desc: "元旦特辑情景互动游戏，需购票参与", price: "现场票30w" },
          { num: "57", name: "温馨小屋", desc: "摆摊区域，出售新版本制装及食药等", price: "现场议价" },
          { num: "58", name: "Paradise乐园", desc: "女子团舞演出，每日两场，21:00 / 22:20开始", price: "需购票" },
          { num: "60", name: "天海座", desc: "短剧《附子》，免费观看需凭票", price: "凭票免费" },
          { num: "街头泳池处", name: "节日妖精", desc: "游戏", price: "" }
        ]
      },
      {
        name: "花舞之街会场（23扩建区）",
        shops: [
          { num: "31·32·34·36", name: "真理馆", desc: "陆行鸟区知名迷宫品牌主题迷宫，免费畅玩", price: "免费" },
          { num: "33", name: "渡鸦予花邮局", desc: "代笔明信片 / 故事线写 / 一对一源流瓶", price: "10w/次" },
          { num: "35", name: "海棠", desc: "舞蹈演出，每日两场", price: "80w/两张" },
          { num: "38", name: "海棠", desc: "轻负指名服务", price: "35w/30min" },
          { num: "40", name: "Roseveil", desc: "兑奖处", price: "" },
          { num: "41", name: "深夜相亲大会", desc: "嘉宾10分钟自我介绍及台下聊天互动", price: "—" },
          { num: "42", name: "好感度+1协议", desc: "轻负指名服务，另提供点歌服务", price: "40w/30min" },
          { num: "43", name: "有问密室", desc: "需购票入场，今日剧目《余生》", price: "80w/人，限购2张" },
          { num: "45", name: "萨雷安艺术大学", desc: "抽奖约稿", price: "免费/自愿" },
          { num: "49", name: "Roseveil", desc: "主线活动，魔法少女互动演出", price: "100w" },
          { num: "街头中央区", name: "海之诗", desc: "演奏", price: "" }
        ]
      }
    ]
  },
  {
    id: "autumn2025",
    hideReview: true,
    year: "2025",
    title: "金秋新生庆典游园会",
    dateLabel: "2025年9月21日 20:30–0:00",
    location: "莫古力区 · 梦羽宝境 高脚孤丘22区（扩建西南区）",
    cover: "assets/gallery/gallery-005.jpg",
    manual: { images: ["assets/gallery/gallery-006.jpg"] },
    poster: { images: ["assets/gallery/gallery-007.jpg"] },
    review: {},
    areas: [
      {
        name: "",
        shops: [
          { num: "49", name: "魔女的秘密", desc: "猜灯谜", price: "" },
          { num: "54", name: "丽姬娅", desc: "占卜", price: "" },
          { num: "55", name: "One club&Oceano ai stelle", desc: "舞蹈+指名", price: "" },
          { num: "56", name: "青木原", desc: "情景游戏", price: "" },
          { num: "58", name: "太阳神&GLF", desc: "指名陪玩+舞蹈+游戏", price: "" },
          { num: "60", name: "海之心&有间密室", desc: "话剧", price: "" },
          { num: "60", name: "PARADISE·乐园", desc: "团舞", price: "" },
          { num: "场外街头", name: "克拉维亚", desc: "演奏", price: "" }
        ]
      }
    ]
  },
  {
    id: "ny2025",
    hideReview: true,
    year: "2025",
    title: "花语町·花舞之街 莫古力跨年盛典",
    dateLabel: "2024年12月31日–2025年1月1日",
    location: "莫古力区 · 梦羽宝境 高脚孤丘22/23区扩建区",
    cover: "assets/gallery/gallery-020.jpg",
    manual: { images: ["assets/gallery/gallery-021.jpg","assets/gallery/gallery-022.jpg","assets/gallery/gallery-023.jpg","assets/gallery/gallery-044.webp"] },
    poster: { images: ["assets/gallery/gallery-025.jpg"] },
    review: {},
    areas: [
      {
        name: "花语町会场（22扩建区）",
        shops: [
          { num: "49", name: "海波所及之馆", desc: "搓澡", price: "" },
          { num: "55", name: "PARADISE·乐园", desc: "舞蹈", price: "" },
          { num: "54", name: "抹茶", desc: "小游戏、接待", price: "" },
          { num: "56·57", name: "青木原", desc: "游戏", price: "" },
          { num: "58", name: "NOX", desc: "歌会", price: "" },
          { num: "60", name: "zero", desc: "演奏", price: "" },
          { num: "60", name: "丽姬娅", desc: "舞台剧", price: "" }
        ]
      },
      {
        name: "花街会场（23扩建区）",
        shops: [
          { num: "31", name: "截稿日", desc: "速写", price: "" },
          { num: "35", name: "GLF&三号楼", desc: "指名、演出、互动", price: "" },
          { num: "35", name: "十六夜律湿", desc: "cosplay大赛", price: "" },
          { num: "37·39", name: "龙门", desc: "龙娘陪玩", price: "" },
          { num: "38", name: "海波所及之馆", desc: "指名", price: "" },
          { num: "40", name: "太阳神", desc: "龙男接待", price: "" },
          { num: "41", name: "有间密室", desc: "舞台剧", price: "" },
          { num: "42", name: "野狗舞团", desc: "舞蹈", price: "" },
          { num: "43", name: "黑星cos号出租店", desc: "白字rp互动", price: "" },
          { num: "43", name: "新月学院", desc: "公开课+修女忏悔", price: "" },
          { num: "44·45", name: "<Dreamin'chu>", desc: "堂食+外带", price: "" },
          { num: "场外房屋管理人旁空地", name: "深夜相亲大会", desc: "相亲交友", price: "" },
          { num: "场外街头", name: "总统乐团", desc: "演奏", price: "" }
        ]
      }
    ]
  },
  {
    id: "honglian2024",
    year: "2024",
    title: "红莲夏日祭",
    dateLabel: "2024年夏",
    location: "莫古力区 · 梦羽宝境",
    cover: "assets/gallery/gallery-008.jpg",
    manual: { images: ["assets/gallery/gallery-009.jpg","assets/gallery/gallery-010.jpg","assets/gallery/gallery-011.jpg","assets/gallery/gallery-012.jpg","assets/gallery/gallery-013.jpg","assets/gallery/gallery-014.jpg","assets/gallery/gallery-015.jpg","assets/gallery/gallery-016.jpg","assets/gallery/gallery-017.jpg","assets/gallery/gallery-018.jpg"] },
    poster: { images: ["assets/gallery/gallery-043.webp"] },
    review: {},
    hideReview: true,
    areas: [
      {
        name: "",
        shops: [
          { num: "60", name: "丽姬娅", desc: "走秀", price: "" },
          { num: "55", name: "PARADISE·乐园", desc: "团舞", price: "" },
          { num: "49", name: "海波所及之馆", desc: "搓澡+击鼓传花", price: "" },
          { num: "53", name: "太阳神", desc: "车队+指名", price: "" },
          { num: "58", name: "GLF", desc: "指名+香槟舞", price: "" },
          { num: "56", name: "青木原", desc: "情景游戏", price: "" },
          { num: "60", name: "海之心", desc: "话剧", price: "" },
          { num: "场外街头", name: "老二次元音乐社", desc: "演奏", price: "" }
        ]
      }
    ]
  },
  {
    id: "ny2024",
    year: "2023",
    title: "“铃声与牵绊的温暖”跨年盛典",
    dateLabel: "2023年12月31日 20:00–0:00",
    location: "莫古力区 · 梦羽宝境 高脚孤丘23区（扩建北区）31–45号",
    cover: "assets/gallery/gallery-039.webp",
    tabs: ["poster", "review"],
    poster: { images: ["assets/gallery/gallery-040.jpg"] },
    review: { note: "莫古正在考古中……" }
  },
  {
    id: "welcome2023",
    hideReview: true,
    year: "2023",
    title: "新生庆典游园会",
    dateLabel: "2023年8月20日 20:30-23:30",
    location: "莫古力区 · 梦羽宝境 沙都22区扩建西南",
    cover: "assets/gallery/gallery-026.jpg",
    manual: { images: ["assets/gallery/gallery-027.jpg","assets/gallery/gallery-028.jpg","assets/gallery/gallery-029.jpg","assets/gallery/gallery-030.jpg","assets/gallery/gallery-031.jpg"] },
    poster: { images: ["assets/gallery/gallery-032.jpg"] },
    review: {},
    areas: [
      {
        name: "游园地图（22扩建区西南）",
        shops: [
          { num: "55", name: "太阳神", desc: "龙男接待，热情迷人的龙男们期待与你邂逅，凭信物享30分钟陪玩服务", price: "凭信物" },
          { num: "56", name: "祎雨（个人）", desc: "推理题，逻辑与想象的交锋，水族馆推理游戏挑战", price: "—" },
          { num: "57", name: "青木原", desc: "温馨小屋，致力于开发多样的特色游戏", price: "—" },
          { num: "59", name: "三日月", desc: "主题摄影，凭信物可享一次摄影服务", price: "—" },
          { num: "60", name: "海之心 & 麦田", desc: "《海之心》话剧演出 + 麦田舞团团舞表演，花语大本营", price: "门票50w/人" }
        ]
      },
      {
        name: "场外",
        shops: [
          { num: "场外", name: "光阴神之诗", desc: "合奏乐队，活动期间不定时在街道拐角出现演出", price: "免费观赏" }
        ]
      }
    ]
  },
  {
    id: "ny2023",
    year: "2022",
    title: "花舞之街新年集市",
    dateLabel: "2022年12月31日 20:00–0:00",
    location: "莫古力区 · 梦羽宝境 高脚孤丘23区（扩建北区）31–45号",
    cover: "assets/gallery/gallery-037.webp",
    tabs: ["poster", "review"],
    poster: { images: ["assets/gallery/gallery-038.jpg"] },
    review: { note: "莫古正在考古中……" }
  },
  {
    id: "xmas2021",
    year: "2021",
    title: "花舞之街星芒集市",
    dateLabel: "2021年12月24日–26日 每晚20:00–23:00",
    location: "莫古力区 · 梦羽宝境 高脚孤丘23区（扩建北区）31–45号",
    cover: "assets/gallery/gallery-035.webp",
    tabs: ["poster", "review"],
    poster: { images: ["assets/gallery/gallery-036.jpg"] },
    review: {
      video: {
        bvid: "BV1aY411a7n7",
        aid: 252898582,
        cid: 476134860,
        page: 1,
        danmaku: false,
        title: "活动回顾视频",
        cover: "assets/gallery/gallery-035.webp",
      },
    }
  }
];

/* 小型活动回顾，新的在前。full：点开后显示的图片；pinLast：固定在最后 */
const MINI_REVIEWS = [
  { image: "assets/gallery/gallery-033.jpg", caption: "女精群&兔娘群春游团建" },
  { image: "assets/gallery/gallery-034.jpg", caption: "2026年跨年举火把巡游-从格里达尼亚走到乌尔达哈" },
  { image: "assets/gallery/gallery-041.webp", full: "assets/gallery/gallery-042.jpg", pinLast: true,
    caption: "“花舞之街-结缘之地”跨服婚礼包办（仅展示往期活动形式，详情请至活动群咨询）" }
];

/* 日历标注：date 或 start + end；tone 为 rose / gold / teal / wisteria / blue / orange */
const HJ_CAL_ITEMS = [
  { start: "2021-12-24", end: "2021-12-26", label: "2021 花舞之街星芒集市", tone: "rose" },
  { date: "2022-12-31", label: "2022 花舞之街新年集市", tone: "gold" },
  { date: "2023-08-20", label: "海之心3周年 & 新生庆典游园会", tone: "rose" },
  { date: "2023-12-31", label: "“铃声与牵绊的温暖”2023跨年盛典", tone: "gold" },
  { date: "2024-08-27", label: "海之心4周年 & 红莲夏日祭", tone: "rose" },
  { start: "2024-12-31", end: "2025-01-01", label: "2025 花语町·花舞之街莫古力跨年盛典", tone: "gold" },
  { date: "2025-09-21", label: "金秋新生庆典游园会", tone: "orange" },
  { start: "2026-01-01", end: "2026-01-02", label: "2026 莫古力跨年盛典", tone: "gold" },
  { date: "2026-09-26", label: "2026 莫古力中秋月轮祭", tone: "orange" },
  { start: "2026-09-24", end: "2026-10-13", label: "FFXV 联动", tone: "blue" },
  { start: "2026-08-04", end: "2026-10-05", label: "妖怪手表联动", tone: "teal" },
];
