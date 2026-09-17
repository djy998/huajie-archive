/* =============================================================================
   花舞之街 · 薰风花语町 —— 验证扩展模块（粘贴到 Cloudflare Worker 里用）
   -----------------------------------------------------------------------------
   本文件是「新增」代码，不依赖 Worker 里原有的任何函数，也不依赖任何 npm 包。
   用法：把本文件的全部内容粘贴到 worker.js 的末尾，然后在 worker.js 里加四处调用：

     ① 顶部（在 fetch 处理函数的开头）：
          if (request.method === "GET") {
            const img = await hjVerifyImage(env, request);
            if (img) return img;
          }

     ② 解析出 body（JSON）之后，分发 action 的地方：
          const hv = await hjVerifyHandle(env, body);
          if (hv) return json(hv);          // json() 换成你原来的返回函数

     ③ 原来判断「Turnstile token / 算术题答案」的地方（比如 submit_ticket、verify_turnstile）：
          const vp = await hjVerifyCheckProof(env, body);
          if (!vp.ok) return json({ ok: false, error: "captcha" });

     ④ 可选：想在自己代码里单独消费通行证时用 await hjVerifyConsume(env, body.verifyPass)。

   三种手动验证都在这里出题、在这里判卷，正确答案不会下发到前端：
     · ff14 —— 看职业图标选职业（三选一），图标由 /api?jobicon=<题目 id> 代理，
               地址里不含职业名，避免「看图片地址就知道答案」
     · poem —— 飞花令，令字与判卷范围都取自下面的诗词库（中小学必背篇目为主）
     · math —— 算术题
   答对后发一张一次性通行证（verifyPass，10 分钟有效、只能用一次）。
   ============================================================================= */

/* =============================================================================
   1. 常量与题库
   ============================================================================= */

/* 站点地址：Worker 通过它去取仓库里的职业图标（只有在 Worker 和网站不同域时才需要改）。
   也可以在 Worker 里设置环境变量 HJ_SITE_ORIGIN 覆盖。 */
var HJV_SITE_ORIGIN = "https://swayingsussurrusstreet.dpdns.org";

/* 职业列表：必须和仓库 jobicon/ 目录下的文件名（去掉 .png）完全一致 */
var HJV_JOBS = [
  "骑士", "战士", "暗黑骑士", "绝枪战士", "武僧", "龙骑士", "忍者", "武士", "钐镰客", "蝰蛇剑士",
  "吟游诗人", "机工士", "舞者", "黑魔法师", "召唤师", "赤魔法师", "绘灵法师", "青魔法师",
  "白魔法师", "学者", "占星术士", "贤者", "驯兽师",
];

/* 飞花令令字：都是最常见、最容易接上来的字（春江花月夜、风花雪月…） */
var HJV_KEYWORDS = [
  "春", "花", "月", "风", "山", "水", "云", "雨", "天", "人",
  "日", "江", "夜", "秋", "白", "红", "明", "雪", "千", "心",
];

/* 诗词库：中小学必背古诗词里的名句为主。
   判卷规则：去掉标点空格后，答案必须（1）含令字（2）至少 5 个字（3）是下面某一句的连续片段。
   所以「整句」「其中半句」「一句里的一段」都算对，用户不必和标点较劲。 */
var HJV_POEM_LINES = [
  /* —— 春 —— */
  "春眠不觉晓，处处闻啼鸟。",
  "好雨知时节，当春乃发生。",
  "野火烧不尽，春风吹又生。",
  "春去花还在，人来鸟不惊。",
  "春种一粒粟，秋收万颗子。",
  "迟日江山丽，春风花草香。",
  "国破山河在，城春草木深。",
  "谁言寸草心，报得三春晖。",
  "不知细叶谁裁出，二月春风似剪刀。",
  "爆竹声中一岁除，春风送暖入屠苏。",
  "春风又绿江南岸，明月何时照我还。",
  "竹外桃花三两枝，春江水暖鸭先知。",
  "春色满园关不住，一枝红杏出墙来。",
  "等闲识得东风面，万紫千红总是春。",
  "最是一年春好处，绝胜烟柳满皇都。",
  "春潮带雨晚来急，野渡无人舟自横。",
  "春江潮水连海平，海上明月共潮生。",
  "沉舟侧畔千帆过，病树前头万木春。",
  "落红不是无情物，化作春泥更护花。",
  "忽如一夜春风来，千树万树梨花开。",
  "春蚕到死丝方尽，蜡炬成灰泪始干。",
  "春宵一刻值千金，花有清香月有阴。",
  "春风得意马蹄疾，一日看尽长安花。",
  "人面不知何处去，桃花依旧笑春风。",
  "春城无处不飞花，寒食东风御柳斜。",
  "白雪却嫌春色晚，故穿庭树作飞花。",
  "自古逢秋悲寂寥，我言秋日胜春朝。",
  "两个黄鹂鸣翠柳，一行白鹭上青天。",
  "黑发不知勤学早，白首方悔读书迟。",
  "白日放歌须纵酒，青春作伴好还乡。",
  "一水护田将绿绕，两山排闼送青来。",

  /* —— 花 —— */
  "夜来风雨声，花落知多少。",
  "解落三秋叶，能开二月花。",
  "桃花潭水深千尺，不及汪伦送我情。",
  "故人西辞黄鹤楼，烟花三月下扬州。",
  "黄四娘家花满蹊，千朵万朵压枝低。",
  "接天莲叶无穷碧，映日荷花别样红。",
  "停车坐爱枫林晚，霜叶红于二月花。",
  "借问酒家何处有，牧童遥指杏花村。",
  "采得百花成蜜后，为谁辛苦为谁甜。",
  "我家洗砚池头树，朵朵花开淡墨痕。",
  "梅子金黄杏子肥，麦花雪白菜花稀。",
  "人间四月芳菲尽，山寺桃花始盛开。",
  "待到重阳日，还来就菊花。",
  "山重水复疑无路，柳暗花明又一村。",
  "沾衣欲湿杏花雨，吹面不寒杨柳风。",
  "莫道不销魂，帘卷西风，人比黄花瘦。",
  "花谢花飞花满天，红消香断有谁怜。",
  "稻花香里说丰年，听取蛙声一片。",
  "云想衣裳花想容，春风拂槛露华浓。",
  "人间四月芳菲尽，山寺桃花始盛开。",

  /* —— 月 —— */
  "举头望明月，低头思故乡。",
  "床前明月光，疑是地上霜。",
  "小时不识月，呼作白玉盘。",
  "举杯邀明月，对影成三人。",
  "月落乌啼霜满天，江枫渔火对愁眠。",
  "露从今夜白，月是故乡明。",
  "海上生明月，天涯共此时。",
  "明月松间照，清泉石上流。",
  "月出惊山鸟，时鸣春涧中。",
  "明月几时有，把酒问青天。",
  "二十四桥明月夜，玉人何处教吹箫。",
  "月上柳梢头，人约黄昏后。",
  "星垂平野阔，月涌大江流。",
  "秦时明月汉时关，万里长征人未还。",
  "深林人不知，明月来相照。",
  "我寄愁心与明月，随君直到夜郎西。",
  "峨眉山月半轮秋，影入平羌江水流。",
  "野旷天低树，江清月近人。",
  "可怜九月初三夜，露似真珠月似弓。",
  "明月别枝惊鹊，清风半夜鸣蝉。",
  "湖光秋月两相和，潭面无风镜未磨。",
  "三十功名尘与土，八千里路云和月。",
  "月黑雁飞高，单于夜遁逃。",
  "长安一片月，万户捣衣声。",
  "明月出天山，苍茫云海间。",

  /* —— 风 —— */
  "千磨万击还坚劲，任尔东西南北风。",
  "千里莺啼绿映红，水村山郭酒旗风。",
  "儿童散学归来早，忙趁东风放纸鸢。",
  "北风卷地白草折，胡天八月即飞雪。",
  "夜阑卧听风吹雨，铁马冰河入梦来。",
  "谁家玉笛暗飞声，散入春风满洛城。",
  "长风破浪会有时，直挂云帆济沧海。",
  "风急天高猿啸哀，渚清沙白鸟飞回。",
  "溪云初起日沉阁，山雨欲来风满楼。",
  "千里黄云白日曛，北风吹雁雪纷纷。",
  "湖光秋月两相和，潭面无风镜未磨。",
  "好风凭借力，送我上青云。",

  /* —— 山 —— */
  "白日依山尽，黄河入海流。",
  "空山不见人，但闻人语响。",
  "远上寒山石径斜，白云生处有人家。",
  "会当凌绝顶，一览众山小。",
  "不识庐山真面目，只缘身在此山中。",
  "千山鸟飞绝，万径人踪灭。",
  "青山遮不住，毕竟东流去。",
  "山外青山楼外楼，西湖歌舞几时休。",
  "两岸青山相对出，孤帆一片日边来。",
  "相看两不厌，只有敬亭山。",
  "绿树村边合，青山郭外斜。",
  "山光悦鸟性，潭影空人心。",
  "采菊东篱下，悠然见南山。",
  "但使龙城飞将在，不教胡马度阴山。",
  "日暮苍山远，天寒白屋贫。",
  "待到山花烂漫时，她在丛中笑。",
  "山不在高，有仙则名。",

  /* —— 水 —— */
  "水光潋滟晴方好，山色空蒙雨亦奇。",
  "天门中断楚江开，碧水东流至此回。",
  "遥望洞庭山水翠，白银盘里一青螺。",
  "日出江花红胜火，春来江水绿如蓝。",
  "落霞与孤鹜齐飞，秋水共长天一色。",
  "白毛浮绿水，红掌拨清波。",
  "孤山寺北贾亭西，水面初平云脚低。",
  "问渠那得清如许，为有源头活水来。",
  "行到水穷处，坐看云起时。",

  /* —— 云 —— */
  "只在此山中，云深不知处。",
  "黄河远上白云间，一片孤城万仞山。",
  "黄鹤一去不复返，白云千载空悠悠。",
  "朝辞白帝彩云间，千里江陵一日还。",
  "不畏浮云遮望眼，自缘身在最高层。",
  "半亩方塘一鉴开，天光云影共徘徊。",
  "孤山寺北贾亭西，水面初平云脚低。",
  "众鸟高飞尽，孤云独去闲。",
  "千里黄云白日曛，北风吹雁雪纷纷。",
  "云想衣裳花想容，春风拂槛露华浓。",
  "明月出天山，苍茫云海间。",

  /* —— 雨 —— */
  "天街小雨润如酥，草色遥看近却无。",
  "清明时节雨纷纷，路上行人欲断魂。",
  "水光潋滟晴方好，山色空蒙雨亦奇。",
  "青箬笠，绿蓑衣，斜风细雨不须归。",
  "空山新雨后，天气晚来秋。",
  "渭城朝雨浥轻尘，客舍青青柳色新。",
  "黑云翻墨未遮山，白雨跳珠乱入船。",
  "南朝四百八十寺，多少楼台烟雨中。",
  "竹杖芒鞋轻胜马，谁怕？一蓑烟雨任平生。",
  "何当共剪西窗烛，却话巴山夜雨时。",
  "沾衣欲湿杏花雨，吹面不寒杨柳风。",
  "夜来风雨声，花落知多少。",
  "春潮带雨晚来急，野渡无人舟自横。",

  /* —— 天 —— */
  "天苍苍，野茫茫，风吹草低见牛羊。",
  "天似穹庐，笼盖四野。",
  "天门中断楚江开，碧水东流至此回。",
  "飞流直下三千尺，疑是银河落九天。",
  "天阶夜色凉如水，卧看牵牛织女星。",
  "海内存知己，天涯若比邻。",
  "莫愁前路无知己，天下谁人不识君。",
  "先天下之忧而忧，后天下之乐而乐。",
  "我劝天公重抖擞，不拘一格降人才。",
  "会挽雕弓如满月，西北望，射天狼。",
  "了却君王天下事，赢得生前身后名。",
  "月落乌啼霜满天，江枫渔火对愁眠。",
  "两个黄鹂鸣翠柳，一行白鹭上青天。",

  /* —— 人 —— */
  "人闲桂花落，夜静春山空。",
  "春去花还在，人来鸟不惊。",
  "但愿人长久，千里共婵娟。",
  "人间四月芳菲尽，山寺桃花始盛开。",
  "人面不知何处去，桃花依旧笑春风。",
  "人生自古谁无死，留取丹心照汗青。",
  "莫道不销魂，帘卷西风，人比黄花瘦。",
  "路人借问遥招手，怕得鱼惊不应人。",
  "深林人不知，明月来相照。",
  "空山不见人，但闻人语响。",
  "野旷天低树，江清月近人。",
  "人生得意须尽欢，莫使金樽空对月。",
  "竹外桃花三两枝，春江水暖鸭先知。",

  /* —— 日 —— */
  "白日依山尽，黄河入海流。",
  "日照香炉生紫烟，遥看瀑布挂前川。",
  "千门万户曈曈日，总把新桃换旧符。",
  "两岸青山相对出，孤帆一片日边来。",
  "日暮苍山远，天寒白屋贫。",
  "山中相送罢，日暮掩柴扉。",
  "白日放歌须纵酒，青春作伴好还乡。",
  "大漠孤烟直，长河落日圆。",
  "迟日江山丽，春风花草香。",
  "接天莲叶无穷碧，映日荷花别样红。",

  /* —— 江 —— */
  "孤舟蓑笠翁，独钓寒江雪。",
  "月落乌啼霜满天，江枫渔火对愁眠。",
  "黄师塔前江水东，春光懒困倚微风。",
  "朝辞白帝彩云间，千里江陵一日还。",
  "星垂平野阔，月涌大江流。",
  "无边落木萧萧下，不尽长江滚滚来。",
  "江南可采莲，莲叶何田田。",
  "孤帆远影碧空尽，唯见长江天际流。",
  "大江东去，浪淘尽，千古风流人物。",
  "问君能有几多愁，恰似一江春水向东流。",
  "野旷天低树，江清月近人。",
  "春江潮水连海平，海上明月共潮生。",
  "迟日江山丽，春风花草香。",

  /* —— 夜 —— */
  "夜来风雨声，花落知多少。",
  "姑苏城外寒山寺，夜半钟声到客船。",
  "可怜九月初三夜，露似真珠月似弓。",
  "人闲桂花落，夜静春山空。",
  "夜阑卧听风吹雨，铁马冰河入梦来。",
  "天阶夜色凉如水，卧看牵牛织女星。",
  "二十四桥明月夜，玉人何处教吹箫。",
  "忽如一夜春风来，千树万树梨花开。",
  "月黑雁飞高，单于夜遁逃。",
  "夜发清溪向三峡，思君不见下渝州。",
  "明月别枝惊鹊，清风半夜鸣蝉。",
  "何当共剪西窗烛，却话巴山夜雨时。",
  "春宵一刻值千金，花有清香月有阴。",
  "夜深知雪重，时闻折竹声。",
  "柴门闻犬吠，风雪夜归人。",

  /* —— 秋 —— */
  "春种一粒粟，秋收万颗子。",
  "解落三秋叶，能开二月花。",
  "空山新雨后，天气晚来秋。",
  "湖光秋月两相和，潭面无风镜未磨。",
  "银烛秋光冷画屏，轻罗小扇扑流萤。",
  "秋风萧瑟，洪波涌起。",
  "落霞与孤鹜齐飞，秋水共长天一色。",
  "峨眉山月半轮秋，影入平羌江水流。",
  "何当金络脑，快走踏清秋。",
  "常恐秋节至，焜黄华叶衰。",
  "窗含西岭千秋雪，门泊东吴万里船。",
  "洛阳城里见秋风，欲作家书意万重。",
  "自古逢秋悲寂寥，我言秋日胜春朝。",

  /* —— 白 —— */
  "白日依山尽，黄河入海流。",
  "白发三千丈，缘愁似个长。",
  "两个黄鹂鸣翠柳，一行白鹭上青天。",
  "白毛浮绿水，红掌拨清波。",
  "露从今夜白，月是故乡明。",
  "黄河远上白云间，一片孤城万仞山。",
  "朝辞白帝彩云间，千里江陵一日还。",
  "小时不识月，呼作白玉盘。",
  "黄鹤一去不复返，白云千载空悠悠。",
  "白雪却嫌春色晚，故穿庭树作飞花。",
  "北风卷地白草折，胡天八月即飞雪。",
  "梅子金黄杏子肥，麦花雪白菜花稀。",
  "日暮苍山远，天寒白屋贫。",
  "遥望洞庭山水翠，白银盘里一青螺。",

  /* —— 红 —— */
  "日出江花红胜火，春来江水绿如蓝。",
  "停车坐爱枫林晚，霜叶红于二月花。",
  "接天莲叶无穷碧，映日荷花别样红。",
  "等闲识得东风面，万紫千红总是春。",
  "白毛浮绿水，红掌拨清波。",
  "落红不是无情物，化作春泥更护花。",
  "红豆生南国，春来发几枝。",
  "春色满园关不住，一枝红杏出墙来。",
  "千里莺啼绿映红，水村山郭酒旗风。",
  "花谢花飞花满天，红消香断有谁怜。",
  "桃红复含宿雨，柳绿更带朝烟。",

  /* —— 明 —— */
  "举头望明月，低头思故乡。",
  "明月松间照，清泉石上流。",
  "海上生明月，天涯共此时。",
  "秦时明月汉时关，万里长征人未还。",
  "明月几时有，把酒问青天。",
  "野径云俱黑，江船火独明。",
  "山重水复疑无路，柳暗花明又一村。",
  "二十四桥明月夜，玉人何处教吹箫。",
  "明月别枝惊鹊，清风半夜鸣蝉。",
  "我寄愁心与明月，随君直到夜郎西。",
  "深林人不知，明月来相照。",
  "东风夜放花千树，更吹落，星如雨。",

  /* —— 雪 —— */
  "孤舟蓑笠翁，独钓寒江雪。",
  "千里黄云白日曛，北风吹雁雪纷纷。",
  "北风卷地白草折，胡天八月即飞雪。",
  "梅子金黄杏子肥，麦花雪白菜花稀。",
  "窗含西岭千秋雪，门泊东吴万里船。",
  "遥知不是雪，为有暗香来。",
  "白雪却嫌春色晚，故穿庭树作飞花。",
  "夜深知雪重，时闻折竹声。",
  "柴门闻犬吠，风雪夜归人。",
  "晚来天欲雪，能饮一杯无。",
  "五月天山雪，无花只有寒。",
  "山回路转不见君，雪上空留马行处。",
  "欲渡黄河冰塞川，将登太行雪满山。",

  /* —— 千 —— */
  "千山鸟飞绝，万径人踪灭。",
  "千门万户曈曈日，总把新桃换旧符。",
  "忽如一夜春风来，千树万树梨花开。",
  "黄四娘家花满蹊，千朵万朵压枝低。",
  "千里黄云白日曛，北风吹雁雪纷纷。",
  "千里莺啼绿映红，水村山郭酒旗风。",
  "窗含西岭千秋雪，门泊东吴万里船。",
  "飞流直下三千尺，疑是银河落九天。",
  "欲穷千里目，更上一层楼。",
  "桃花潭水深千尺，不及汪伦送我情。",
  "千磨万击还坚劲，任尔东西南北风。",
  "朝辞白帝彩云间，千里江陵一日还。",
  "三十功名尘与土，八千里路云和月。",
  "但愿人长久，千里共婵娟。",
  "两岸猿声啼不住，轻舟已过万重山。",
  "千锤万凿出深山，烈火焚烧若等闲。",
  "落红不是无情物，化作春泥更护花。",

  /* —— 心 —— */
  "谁言寸草心，报得三春晖。",
  "洛阳亲友如相问，一片冰心在玉壶。",
  "感时花溅泪，恨别鸟惊心。",
  "问君何能尔，心远地自偏。",
  "山光悦鸟性，潭影空人心。",
  "可怜身上衣正单，心忧炭贱愿天寒。",
  "剪不断，理还乱，是离愁，别是一般滋味在心头。",
  "何日归家洗客袍，银字笙调，心字香烧。",
  "我心匪石，不可转也。",
];

/* 去重（同一句可能在多个令字下出现过） */
HJV_POEM_LINES = HJV_POEM_LINES.filter(function (line, i, arr) { return arr.indexOf(line) === i; });

/* 补足提示用的高频字（提示最多 20 个字，不够时从这里补） */
var HJV_FILL_CHARS = "花月春风山水云天雨江秋夜红白明雪岁年光色清香寒暖长高远归客舟窗树柳梅竹酒诗书梦晨露烟波云乡思愁".split("");

/* 有效期 / 限流参数 */
var HJV_TASK_TTL_MS = 10 * 60 * 1000;     // 题目 10 分钟内有效
var HJV_PASS_TTL_MS = 10 * 60 * 1000;     // 通行证 10 分钟内有效
var HJV_MAX_TRIES = 8;                    // 同一题最多答错 8 次
var HJV_RATE_WINDOW_MS = 10 * 60 * 1000;  // 限流窗口 10 分钟
var HJV_RATE_MAX_TASK = 80;               // 每 IP 每窗口最多出题次数
var HJV_RATE_MAX_ANSWER = 200;            // 每 IP 每窗口最多交卷次数

/* =============================================================================
   2. 小工具
   ============================================================================= */

function hjvPick(list) { return list[Math.floor(Math.random() * list.length)]; }

function hjvShuffle(list) {
  const arr = list.slice();
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const t = arr[i]; arr[i] = arr[j]; arr[j] = t;
  }
  return arr;
}

function hjvRandomId(prefix) {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let hex = "";
  for (let i = 0; i < bytes.length; i++) hex += bytes[i].toString(16).padStart(2, "0");
  return prefix + hex;
}

/* 去掉标点、空格、换行，只留汉字（判卷用） */
function hjvNormalizePoem(text) {
  return String(text == null ? "" : text).replace(/[^\u3400-\u9fff]/g, "");
}

/* 全角数字转半角 */
function hjvNormalizeNumber(text) {
  return String(text == null ? "" : text)
    .replace(/[０-９]/g, (d) => String.fromCharCode(d.charCodeAt(0) - 0xfee0))
    .replace(/[^0-9.-]/g, "");
}

/* 取客户端 IP（Cloudflare 会带 CF-Connecting-IP） */
function hjvClientIp(request) {
  if (!request || !request.headers) return "0.0.0.0";
  return request.headers.get("CF-Connecting-IP") || request.headers.get("x-forwarded-for") || "0.0.0.0";
}

/* D1 绑定：优先 env.DB，找不到就自动挑一个带 prepare/batch 的绑定，绑定叫什么名字都行 */
function hjvDB(env) {
  if (!env) return null;
  if (env.DB && typeof env.DB.prepare === "function") return env.DB;
  const keys = Object.keys(env);
  for (let i = 0; i < keys.length; i++) {
    const v = env[keys[i]];
    if (v && typeof v.prepare === "function" && typeof v.batch === "function") return v;
  }
  return null;
}

/* 建表：第一次用到时建一次（正常情况下用控制台执行 verify-tables.sql 就够了，
   这里兜底是为了「忘了建表」时不至于直接报错） */
var hjvTablesReady = false;
async function hjvEnsureTables(db) {
  if (hjvTablesReady) return true;
  await db.batch([
    db.prepare("CREATE TABLE IF NOT EXISTS hj_verify_tasks (id TEXT PRIMARY KEY, mode TEXT NOT NULL, answer TEXT NOT NULL, meta TEXT, created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL, tries INTEGER NOT NULL DEFAULT 0, solved_at INTEGER)"),
    db.prepare("CREATE TABLE IF NOT EXISTS hj_verify_passes (id TEXT PRIMARY KEY, mode TEXT, created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL, used_at INTEGER, ip TEXT)"),
    db.prepare("CREATE TABLE IF NOT EXISTS hj_verify_rate (key TEXT PRIMARY KEY, count INTEGER NOT NULL DEFAULT 0, expires_at INTEGER NOT NULL)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_hj_verify_tasks_expires ON hj_verify_tasks (expires_at)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_hj_verify_passes_expires ON hj_verify_passes (expires_at)"),
  ]);
  hjvTablesReady = true;
  return true;
}

/* 顺手清理过期数据（按概率做，不必每次都清） */
async function hjvCleanup(db) {
  if (Math.random() > 0.1) return;
  const now = Date.now();
  try {
    await db.batch([
      db.prepare("DELETE FROM hj_verify_tasks WHERE expires_at < ?").bind(now - 24 * 3600 * 1000),
      db.prepare("DELETE FROM hj_verify_passes WHERE expires_at < ?").bind(now - 24 * 3600 * 1000),
      db.prepare("DELETE FROM hj_verify_rate WHERE expires_at < ?").bind(now),
    ]);
  } catch (e) { /* 清理失败不影响主流程 */ }
}

/* 限流：每 IP 每 10 分钟最多 N 次 */
async function hjvRateOk(db, ip, action, max) {
  const bucket = Math.floor(Date.now() / HJV_RATE_WINDOW_MS);
  const key = action + ":" + ip + ":" + bucket;
  await db.prepare(
    "INSERT INTO hj_verify_rate (key, count, expires_at) VALUES (?, 1, ?) " +
    "ON CONFLICT(key) DO UPDATE SET count = count + 1"
  ).bind(key, Date.now() + HJV_RATE_WINDOW_MS * 2).run();
  const row = await db.prepare("SELECT count FROM hj_verify_rate WHERE key = ?").bind(key).first();
  return !row || Number(row.count) <= max;
}

/* =============================================================================
   3. 出题
   ============================================================================= */

/* 狒科生：一个职业图标 + 三个职业名（含正确答案） */
function hjvMakeFf14() {
  const job = hjvPick(HJV_JOBS);
  const others = hjvShuffle(HJV_JOBS.filter((j) => j !== job)).slice(0, 2);
  return {
    answer: job,
    meta: JSON.stringify({ job: job }),
    options: hjvShuffle([job].concat(others)),
  };
}

/* 文科生：飞花令。题目只给令字，答案落在诗词库里 */
function hjvMakePoem() {
  const keyword = hjvPick(HJV_KEYWORDS);
  return { answer: keyword, meta: JSON.stringify({ keyword: keyword }) };
}

/* 理科生：算术题 */
function hjvMakeMath() {
  const kind = hjvPick(["+", "-", "×"]);
  let a = 0, b = 0, answer = 0;
  if (kind === "+") { a = 11 + Math.floor(Math.random() * 78); b = 11 + Math.floor(Math.random() * 78); answer = a + b; }
  else if (kind === "-") { a = 31 + Math.floor(Math.random() * 68); b = 11 + Math.floor(Math.random() * (a - 12)); answer = a - b; }
  else { a = 2 + Math.floor(Math.random() * 12); b = 2 + Math.floor(Math.random() * 12); answer = a * b; }
  return { answer: String(answer), meta: JSON.stringify({ question: a + " " + kind + " " + b }), question: a + " " + kind + " " + b };
}

/* 飞花令的提示：随机取一句含令字的诗句，把用到的字凑成 20 个（一定包含某一句的完整用字，能拼出来） */
function hjvPoemHint(keyword) {
  const pool = HJV_POEM_LINES.filter((line) => line.indexOf(keyword) >= 0);
  const line = pool.length ? hjvPick(pool) : "";
  const normalized = hjvNormalizePoem(line);
  const chars = [];
  for (const ch of normalized) if (chars.indexOf(ch) < 0) chars.push(ch);
  for (const ch of hjvShuffle(HJV_FILL_CHARS)) {
    if (chars.length >= 20) break;
    if (chars.indexOf(ch) < 0) chars.push(ch);
  }
  return { chars: hjvShuffle(chars).slice(0, 20), len: normalized.length };
}

/* 判卷：飞花令 */
function hjvCheckPoem(keyword, input) {
  const text = hjvNormalizePoem(input);
  if (text.length < 5) return { ok: false, error: "wrong" };        // 太短多半是乱按
  if (text.indexOf(keyword) < 0) return { ok: false, error: "wrong" };  // 没有令字
  for (let i = 0; i < HJV_POEM_LINES.length; i++) {
    const line = hjvNormalizePoem(HJV_POEM_LINES[i]);
    if (line.indexOf(keyword) >= 0 && line.indexOf(text) >= 0) return { ok: true };  // 是某句的连续片段
  }
  return { ok: false, error: "wrong" };
}

/* =============================================================================
   4. 对外接口
   ============================================================================= */

/* 处理验证相关的 action，返回普通对象（交给 Worker 包成 JSON）；
   不是本模块的 action 时返回 null */
async function hjVerifyHandle(env, body, request) {
  const action = body && body.action;
  if (action !== "get_verify_task" && action !== "verify_answer"
      && action !== "get_verify_hint" && action !== "verify_ping") return null;

  const db = hjvDB(env);
  if (!db) return { ok: false, error: "no_db" };
  await hjvEnsureTables(db);
  await hjvCleanup(db);

  const now = Date.now();

  /* —— 健康检查：部署完可以拿它确认模块和 D1 都通了 —— */
  if (action === "verify_ping") {
    return { ok: true, version: "huajie-verify-1", modes: ["ff14", "poem", "math"], iconMode: hjVerifyIconMode(env), poems: HJV_POEM_LINES.length, keywords: HJV_KEYWORDS.length };
  }

  const ip = hjvClientIp(request);

  /* —— 出题 —— */
  if (action === "get_verify_task") {
    const mode = body.mode;
    if (mode !== "ff14" && mode !== "poem" && mode !== "math") return { ok: false, error: "bad_mode" };
    if (!(await hjvRateOk(db, ip, "task", HJV_RATE_MAX_TASK))) return { ok: false, error: "rate_limited" };

    const made = mode === "ff14" ? hjvMakeFf14() : mode === "poem" ? hjvMakePoem() : hjvMakeMath();
    const id = hjvRandomId("v");
    await db.prepare(
      "INSERT INTO hj_verify_tasks (id, mode, answer, meta, created_at, expires_at, tries) VALUES (?, ?, ?, ?, ?, ?, 0)"
    ).bind(id, mode, made.answer, made.meta || "", now, now + HJV_TASK_TTL_MS).run();

    const out = { ok: true, id: id, mode: mode };
    if (mode === "ff14") {
      out.prompt = "请选出这个图标对应的职业";
      out.options = made.options;
      if (hjVerifyIconMode(env) === "inline") {
        out.iconData = await hjvIconDataUri(env, request, JSON.parse(made.meta).job);
      } else {
        out.icon = hjVerifyIconUrl(env, id, request);
      }
    } else if (mode === "poem") {
      out.keyword = made.answer;
      out.prompt = "请写一句含有「" + made.answer + "」字的诗词";
    } else {
      out.question = made.question;
      out.prompt = "请计算：" + made.question + " = ?";
    }
    return out;
  }

  /* —— 提示（文科生） —— */
  if (action === "get_verify_hint") {
    const row = await db.prepare("SELECT mode, answer, expires_at FROM hj_verify_tasks WHERE id = ?").bind(body.id).first();
    if (!row || row.mode !== "poem") return { ok: false, error: "not_found" };
    if (row.expires_at < now) return { ok: false, error: "expired" };
    if (!(await hjvRateOk(db, ip, "hint", HJV_RATE_MAX_ANSWER))) return { ok: false, error: "rate_limited" };
    const hint = hjvPoemHint(row.answer);
    return { ok: true, chars: hint.chars, len: hint.len };
  }

  /* —— 交卷 —— */
  if (action === "verify_answer") {
    if (!(await hjvRateOk(db, ip, "answer", HJV_RATE_MAX_ANSWER))) return { ok: false, error: "rate_limited" };
    const row = await db.prepare("SELECT id, mode, answer, expires_at, tries, solved_at FROM hj_verify_tasks WHERE id = ?")
      .bind(body.id).first();
    if (!row) return { ok: false, error: "not_found" };
    if (row.solved_at) return { ok: false, error: "not_found" };
    if (row.expires_at < now) return { ok: false, error: "expired" };
    if (Number(row.tries) >= HJV_MAX_TRIES) return { ok: false, error: "expired" };

    let verdict = { ok: false, error: "wrong" };
    if (row.mode === "ff14") verdict = { ok: String(body.answer || "") === row.answer };
    else if (row.mode === "math") verdict = { ok: hjvNormalizeNumber(body.answer) === row.answer };
    else if (row.mode === "poem") verdict = hjvCheckPoem(row.answer, body.answer);

    if (!verdict.ok) {
      await db.prepare("UPDATE hj_verify_tasks SET tries = tries + 1 WHERE id = ?").bind(row.id).run();
      return { ok: false, error: "wrong", left: Math.max(0, HJV_MAX_TRIES - Number(row.tries) - 1) };
    }

    /* 判对：作废题目，发一张一次性通行证 */
    const pass = hjvRandomId("p");
    await db.batch([
      db.prepare("UPDATE hj_verify_tasks SET solved_at = ? WHERE id = ?").bind(now, row.id),
      db.prepare("INSERT INTO hj_verify_passes (id, mode, created_at, expires_at, ip) VALUES (?, ?, ?, ?, ?)")
        .bind(pass, row.mode, now, now + HJV_PASS_TTL_MS, ip),
    ]);
    return { ok: true, pass: pass, mode: row.mode };
  }

  return null;
}

/* 消费一次性通行证：提交表单时调用。只能用一次，用过 / 过期 / 不存在都返回失败 */
async function hjVerifyConsume(env, pass) {
  if (!pass || typeof pass !== "string") return { ok: false, error: "captcha" };
  const db = hjvDB(env);
  if (!db) return { ok: false, error: "captcha" };
  await hjvEnsureTables(db);
  const row = await db.prepare("SELECT id, mode, expires_at, used_at FROM hj_verify_passes WHERE id = ?").bind(pass).first();
  if (!row) return { ok: false, error: "captcha" };
  if (row.used_at) return { ok: false, error: "captcha" };
  if (row.expires_at < Date.now()) return { ok: false, error: "captcha" };
  await db.prepare("UPDATE hj_verify_passes SET used_at = ? WHERE id = ?").bind(Date.now(), pass).run();
  return { ok: true, mode: row.mode };
}

/* 统一的凭证校验：body 里可能带 turnstile 的 token、旧版算术题的 math、新版手动验证的 verifyPass。
   原代码里校验 token / math 的地方，换成调用这个函数即可（返回 { ok:true } 或 { ok:false }） */
async function hjVerifyCheckProof(env, body) {
  if (!body) return { ok: false, error: "captcha" };
  if (body.verifyPass) return hjVerifyConsume(env, body.verifyPass);
  return { ok: true, error: "skip" };   // token / math 交给原有逻辑处理，这里不拦
}

/* =============================================================================
   5. 职业图标：由 Worker 代理，地址里只有题目 id，看不到职业名
   ============================================================================= */

/* 图标模式：proxy（默认，推荐）| inline（题目里直接带 dataURL，多花一点流量） */
function hjVerifyIconMode(env) {
  const mode = env && env.HJ_VERIFY_ICON_MODE;
  return mode === "inline" ? "inline" : "proxy";
}

function hjvSiteOrigin(env, request) {
  if (env && env.HJ_SITE_ORIGIN) return String(env.HJ_SITE_ORIGIN).replace(/\/+$/, "");
  if (typeof HJ_SITE_ORIGIN === "string" && HJ_SITE_ORIGIN) return HJ_SITE_ORIGIN.replace(/\/+$/, "");
  try { return new URL(request.url).origin; } catch (e) { return ""; }
}

function hjvIconFetchUrl(env, request, job) {
  return hjvSiteOrigin(env, request) + "/jobicon/" + encodeURIComponent(job) + ".png";
}

/* 出题时给出图标地址：proxy 用 Worker 自己的 ?jobicon=<题目 id>（推荐） */
function hjVerifyIconUrl(env, id, request) {
  let base = null;
  try { base = request && request.url ? new URL(request.url) : null; } catch (e) { base = null; }
  if (!base) return "?jobicon=" + encodeURIComponent(id);
  return new URL("?jobicon=" + encodeURIComponent(id), base.origin + base.pathname).href;
}

/* inline 模式：Worker 直接把 PNG 转成 dataURL 塞进题目里（不走第二次请求，但流量大一些） */
async function hjvIconDataUri(env, request, job) {
  const res = await fetch(hjvIconFetchUrl(env, request, job), { cf: { cacheTtl: 86400, cacheEverything: true } });
  if (!res || !res.ok) return null;
  const bytes = new Uint8Array(await res.arrayBuffer());
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return "data:image/png;base64," + btoa(binary);
}

/* GET /api?jobicon=<题目 id> → 返回对应的职业图标 PNG */
async function hjVerifyImage(env, request) {
  let url;
  try { url = new URL(request.url); } catch (e) { return null; }
  const id = url.searchParams.get("jobicon");
  if (!id) return null;

  const db = hjvDB(env);
  if (!db) return new Response("no db", { status: 503 });
  await hjvEnsureTables(db);

  const row = await db.prepare("SELECT mode, meta, expires_at FROM hj_verify_tasks WHERE id = ?").bind(id).first();
  if (!row || row.mode !== "ff14") return new Response("not found", { status: 404 });

  let job = "";
  try { job = JSON.parse(row.meta || "{}").job || ""; } catch (e) { job = ""; }
  if (!job) return new Response("not found", { status: 404 });

  const upstream = await fetch(hjvIconFetchUrl(env, request, job), {
    cf: { cacheTtl: 86400, cacheEverything: true, cacheKey: "hj-jobicon-" + job },
  });
  if (!upstream || !upstream.ok) return new Response("icon unavailable", { status: 502 });

  return new Response(upstream.body, {
    headers: {
      "content-type": "image/png",
      "cache-control": "public, max-age=86400, immutable",
      "access-control-allow-origin": "*",
    },
  });
}

/* 需要把本模块拆成独立文件 import 时，取消下面一行的注释，并在 Worker 顶部 import：
   import { hjVerifyHandle, hjVerifyImage, hjVerifyConsume, hjVerifyCheckProof } from "./worker-verify.js"; */
// export { hjVerifyHandle, hjVerifyImage, hjVerifyConsume, hjVerifyCheckProof };
