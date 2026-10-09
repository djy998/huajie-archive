(()=>{const it="hj_games_tab",O="hj_games_macro_",lt="hj_games_poem_mode",q="hj_games_spy_kind",rt="hj_games_bomb_players",ct="hj_games_spy_players",M=[{id:"bomb",label:"数字炸弹"},{id:"poem",label:"飞花令"},{id:"spy",label:"谁是卧底"}],P={bomb:{label:"数字炸弹",text:`/p 【数字炸弹】游戏规则：<wait.2>
/p 首先使用【/dice】指令roll点，数字最大的人做庄家。<wait.2>
/p 庄家在一个范围内（比如1~10000）定一个数字作为炸弹，由客人决定从谁开始，大家依次猜，逐步缩小范围。<wait.2>
/p 最后猜中的人就爆炸啦需要接受真心话或者大冒险的惩罚哦<wait.2>
/p 努力挣扎着不被炸到吧（笑）`},poemEasy:{label:"飞花令 · 简单版",text:`/y【飞花令（简单版本）】游戏规则 <wait.2>
/y 先给大家来个简单版本的试试吧！ <wait.2>
/y 古代的飞花令是古代的行酒令之一，因唐代诗人韩翃的名诗《寒食》中有“春城无处不飞花”一句，故名“飞花令”。<wait.2>
/y 在古代需要大家作诗 放到现在则需要大家背诗~ <wait.2>
/y 大家执行Roll点 【/dice】 通过大小决定顺序并且由最大的人从以下字中选择一个字设置关键词 <wait.2>
/y 春江花月夜，秋山风雨天。夏日湖水岸，冬朝海云关。南窗柳色暖，北庭鸟声寒。西楼人心愁，东家酒梦残。<wait.2>
/y 再次提醒 在上述话中只需要选择一个当关键词就好 <wait.2>
/y 举个例子 关键词是花 则接下来的诗句均要带花 例如“夜来风雨声，花落知多少。”“感时花溅泪，恨别鸟惊心。”  <wait.2>
/y 当有人接不出来 或者出错皆不可算过关哦 需要进行真心话大冒险的惩罚  <wait.2>
/y 提示 这边对关键字在诗句的位置没有限定，只要诗句含有这个字或者这个字的意象即可 <wait.2>
/y 那 要试试看吗？还是说直接进入困难版本的呢？ <wait.2>`},poemHard:{label:"飞花令 · 困难版",text:`/y【飞花令（困难版本）】游戏规则 <wait.2>
/y 这是困难版本的哦！ <wait.2>
/y 与简单的不同 在这边 每个人关键词的位置与大家的发言顺序有关 <wait.2>
/y 继续拿“花”举例，比如说，第一个发言人的第一句的第一字要是带有“花”的，如“花近高楼伤客心”。第二人要跟上第二字带“花”的诗句，如“落花时节又逢君”。第三人可接“春江花朝秋月夜”，“花”在第三字位置上。以此类推 <wait.2>
/y 当有人接不出来 或者出错皆不可算过关哦 需要进行真心话大冒险的惩罚 <wait.2>
/y 让我看看大家的语文都是谁教的吧！<wait.2>`},spy:{label:"谁是卧底",text:`/p 【谁是卧底】游戏规则：<wait.2>
/p 首先使用【/random】指令roll点，数字最大的人则为主持人。<wait.2>
/p 主持人想出一对相近的词语，比如【龙骑士】和【机工士】。<wait.2>
/p 然后使用私聊频道把其中一个词发给1~2个【卧底】（根据玩家人数调整），另一个词发给其他的【平民】。<wait.3>
/p 每人每轮只能说一句话描述自己拿到的词语（不能直接说出那个词语）。<wait.2>
/p 既不能让卧底发现，也要给同伴以暗示。<wait.2>
/p 每轮描述完毕，所有人投票选出怀疑是卧底的那个人，得票数最多的人出局；平票时得票最多的几人再各描述一次，大家在这几人中再次投票。<wait.3>
/p 若最后仅剩三人（包含卧底），则卧底获胜；反之，则平民获胜。<wait.2>
/p 一起来找出卧底吧！`}},Ht=`张若虚|春江花月夜|春江潮水连海平 海上明月共潮生 何处春江无月明 江流宛转绕芳甸 月照花林皆似霰 江天一色无纤尘 皎皎空中孤月轮 江畔何人初见月 江月何年初照人 人生代代无穷已 江月年年望相似 不知江月待何人 但见长江送流水 白云一片去悠悠 青枫浦上不胜愁 谁家今夜扁舟子 何处相思明月楼 可怜楼上月徘徊 应照离人妆镜台 愿逐月华流照君 鱼龙潜跃水成文 昨夜闲潭梦落花 可怜春半不还家 江水流春去欲尽 江潭落月复西斜 斜月沉沉藏海雾 不知乘月几人归 落月摇情满江树
李白|静夜思|床前明月光 举头望明月
李白|早发白帝城|朝辞白帝彩云间 千里江陵一日还 两岸猿声啼不住 轻舟已过万重山
李白|黄鹤楼送孟浩然之广陵|故人西辞黄鹤楼 烟花三月下扬州 唯见长江天际流
李白|望庐山瀑布|日照香炉生紫烟 疑是银河落九天
李白|赠汪伦|忽闻岸上踏歌声 桃花潭水深千尺
李白|望天门山|天门中断楚江开 碧水东流至此回 两岸青山相对出 孤帆一片日边来
李白|峨眉山月歌|峨眉山月半轮秋 影入平羌江水流 夜发清溪向三峡
李白|独坐敬亭山|众鸟高飞尽 孤云独去闲 只有敬亭山
李白|月下独酌|花间一壶酒 举杯邀明月 对影成三人
李白|将进酒|人生得意须尽欢 莫使金樽空对月 天生我材必有用 与尔同销万古愁
李白|行路难|长风破浪会有时 直挂云帆济沧海 将登太行雪满山 忽复乘舟梦日边
李白|闻王昌龄左迁龙标遥有此寄|杨花落尽子规啼 我寄愁心与明月
李白|子夜吴歌·秋歌|长安一片月 万户捣衣声 秋风吹不尽 总是玉关情
李白|子夜吴歌·夏歌|镜湖三百里 菡萏发荷花 五月西施采 人看隘若耶
李白|古朗月行|小时不识月
李白|关山月|明月出天山 苍茫云海间 长风几万里 吹度玉门关
李白|送友人|青山横北郭 白水绕东城 浮云游子意 落日故人情
李白|渡荆门送别|山随平野尽 江入大荒流 月下飞天镜 云生结海楼 仍怜故乡水
李白|夜宿山寺|危楼高百尺 不敢高声语 恐惊天上人
李白|清平调|云想衣裳花想容 春风拂槛露华浓 若非群玉山头见 会向瑶台月下逢 名花倾国两相欢 解释春风无限恨 沉香亭北倚阑干
李白|登金陵凤凰台|吴宫花草埋幽径 三山半落青天外 二水中分白鹭洲 总为浮云能蔽日 长安不见使人愁
李白|宣州谢朓楼饯别校书叔云|长风万里送秋雁 人生在世不称意 明朝散发弄扁舟 抽刀断水水更流 举杯消愁愁更愁
李白|梦游天姥吟留别|海客谈瀛洲 越人语天姥 天姥连天向天横 我欲因之梦吴越 一夜飞度镜湖月 湖月照我影 半壁见海日 空中闻天鸡
李白|蜀道难|西当太白有鸟道 但见悲鸟号古木 又闻子规啼夜月
李白|秋浦歌|缘愁似个长 何处得秋霜
李白|宫中行乐词|柳色黄金嫩 梨花白雪香
李白|陪族叔刑部侍郎晔及中书贾舍人至游洞庭|洞庭西望楚江分 水尽南天不见云 日落长沙秋色远 南湖秋水夜无烟 耐可乘流直上天 且就洞庭赊月色 将船买酒白云边
李白|送贺宾客归越|镜湖流水漾清波
李白|菩萨蛮|平林漠漠烟如织 寒山一带伤心碧 暝色入高楼 有人楼上愁
杜甫|春望|国破山河在 城春草木深 感时花溅泪 恨别鸟惊心 烽火连三月 家书抵万金
杜甫|春夜喜雨|好雨知时节 当春乃发生 随风潜入夜 润物细无声 野径云俱黑 江船火独明 花重锦官城
杜甫|绝句|两个黄鹂鸣翠柳 一行白鹭上青天 窗含西岭千秋雪 门泊东吴万里船
杜甫|绝句二首|迟日江山丽 春风花草香 沙暖睡鸳鸯 江碧鸟逾白 山青花欲燃 今春看又过 何日是归年
杜甫|望岳|一览众山小 荡胸生曾云 决眦入归鸟
杜甫|登高|风急天高猿啸哀 渚清沙白鸟飞回 不尽长江滚滚来 万里悲秋常作客 潦倒新停浊酒杯
杜甫|江南逢李龟年|正是江南好风景 落花时节又逢君
杜甫|江畔独步寻花|黄四娘家花满蹊
杜甫|闻官军收河南河北|剑外忽传收蓟北 白日放歌须纵酒 青春作伴好还乡 却看妻子愁何在
杜甫|茅屋为秋风所破歌|八月秋高风怒号 风雨不动安如山 雨脚如麻未断绝 长夜沾湿何由彻 俄顷风定云墨色 秋天漠漠向昏黑
杜甫|蜀相|映阶碧草自春色
杜甫|旅夜书怀|月涌大江流 细草微风岸 危樯独夜舟 天地一沙鸥
杜甫|登岳阳楼|昔闻洞庭水 今上岳阳楼 吴楚东南坼 乾坤日夜浮 戎马关山北
杜甫|月夜忆舍弟|露从今夜白 月是故乡明 戍鼓断人行 边秋一雁声 无家问死生
杜甫|月夜|今夜鄜州月 香雾云鬟湿 清辉玉臂寒
杜甫|自京赴奉先县咏怀五百字|朱门酒肉臭
杜甫|赠卫八处士|人生不相见 夜雨剪春韭 明日隔山岳
杜甫|咏怀古迹|群山万壑赴荆门 画图省识春风面 环佩空归夜月魂
杜甫|登楼|花近高楼伤客心 锦江春色来天地 玉垒浮云变古今 北极朝廷终不改 西山寇盗莫相侵 日暮聊为梁甫吟
杜甫|秋兴八首|巫山巫峡气萧森 江间波浪兼天涌 塞上风云接地阴 丛菊两开他日泪 孤舟一系故园心 寒衣处处催刀尺
杜甫|阁夜|天涯霜雪霁寒宵 五更鼓角声悲壮
杜甫|江汉|江汉思归客 片云天共远 永夜月同孤 落日心犹壮 秋风病欲苏
杜甫|客至|舍南舍北皆春水 但见群鸥日日来 花径不曾缘客扫 樽酒家贫只旧醅
杜甫|曲江二首|一片花飞减却春 风飘万点正愁人 江上小堂巢翡翠 朝回日日典春衣 每日江头尽醉归 酒债寻常行处有 人生七十古来稀 穿花蛱蝶深深见 点水蜻蜓款款飞
杜甫|哀江头|少陵野老吞声哭 春日潜行曲江曲 江头宫殿锁千门 细柳新蒲为谁绿 人生有情泪沾臆 江水江花岂终极
杜甫|丽人行|三月三日天气新 长安水边多丽人
杜甫|兵车行|天阴雨湿声啾啾
杜甫|梦李白|故人入我梦 落月满屋梁 犹疑照颜色 水深波浪阔 浮云终日行 斯人独憔悴
杜甫|发潭州|夜醉长沙酒 晓行湘水春 岸花飞送客 樯燕语留人
杜甫|江村|清江一曲抱村流 长夏江村事事幽
杜甫|小至|天时人事日相催 冬至阳生春又来
王维|九月九日忆山东兄弟|遍插茱萸少一人
王维|送元二使安西|渭城朝雨浥轻尘 客舍青青柳色新 劝君更尽一杯酒 西出阳关无故人
王维|鹿柴|空山不见人 但闻人语响
王维|竹里馆|深林人不知 明月来相照
王维|相思|红豆生南国 春来发几枝
王维|山居秋暝|空山新雨后 天气晚来秋 明月松间照 随意春芳歇
王维|鸟鸣涧|人闲桂花落 夜静春山空 月出惊山鸟 时鸣春涧中
王维|使至塞上|长河落日圆 归雁入胡天 萧关逢候骑
王维|终南别业|中岁颇好道 晚家南山陲 行到水穷处 坐看云起时
王维|终南山|太乙近天都 连山接海隅 白云回望合 欲投人处宿 隔水问樵夫
王维|汉江临泛|江流天地外 山色有无中 襄阳好风日 留醉与山翁
王维|辛夷坞|木末芙蓉花 山中发红萼 涧户寂无人
王维|山中送别|山中相送罢 日暮掩柴扉 春草明年绿
王维|杂诗|来日绮窗前 寒梅著花未
王维|观猎|风劲角弓鸣 千里暮云平
王维|山中|天寒红叶稀 山路元无雨 空翠湿人衣
王维|辋川闲居赠裴秀才迪|寒山转苍翠 秋水日潺湲 临风听暮蝉 渡头余落日
王维|积雨辋川庄作|积雨空林烟火迟 蒸藜炊黍饷东菑 漠漠水田飞白鹭 阴阴夏木啭黄鹂
王维|青溪|声喧乱石中 色静深松里
孟浩然|春晓|春眠不觉晓 处处闻啼鸟 夜来风雨声 花落知多少
孟浩然|宿建德江|日暮客愁新 野旷天低树 江清月近人
孟浩然|过故人庄|故人具鸡黍 邀我至田家 青山郭外斜 把酒话桑麻 待到重阳日 还来就菊花
孟浩然|望洞庭湖赠张丞相|八月湖水平 气蒸云梦泽
孟浩然|夏日南亭怀辛大|山光忽西落 池月渐东上 荷风送香气
孟浩然|岁暮归南山|北阙休上书 南山归敝庐
孟浩然|与诸子登岘山|人事有代谢 江山留胜迹 水落鱼梁浅 天寒梦泽深
孟浩然|宿业师山房期丁大不至|夕阳度西岭 松月生夜凉 风泉满清听
孟浩然|早寒江上有怀|木落雁南度 北风江上寒 我家襄水曲 遥隔楚云端 孤帆天际看 平海夕漫漫
王之涣|登鹳雀楼|白日依山尽 黄河入海流 更上一层楼
王之涣|凉州词|黄河远上白云间 一片孤城万仞山 羌笛何须怨杨柳 春风不度玉门关
王昌龄|出塞|秦时明月汉时关 万里长征人未还 不教胡马度阴山
王昌龄|芙蓉楼送辛渐|寒雨连江夜入吴 平明送客楚山孤 一片冰心在玉壶
王昌龄|从军行|烽火城西百尺楼 黄昏独坐海风秋 更吹羌笛关山月 无那金闺万里愁 琵琶起舞换新声 总是关山旧别情 撩乱边愁听不尽 高高秋月照长城 青海长云暗雪山 孤城遥望玉门关 不破楼兰终不还 大漠风尘日色昏 前军夜战洮河北
王昌龄|闺怨|闺中少妇不知愁 春日凝妆上翠楼 忽见陌头杨柳色
王昌龄|采莲曲|荷叶罗裙一色裁 闻歌始觉有人来
岑参|白雪歌送武判官归京|北风卷地白草折 胡天八月即飞雪 忽如一夜春风来 千树万树梨花开 狐裘不暖锦衾薄 瀚海阑干百丈冰 愁云惨淡万里凝 中军置酒饮归客 风掣红旗冻不翻 轮台东门送君去 去时雪满天山路 山回路转不见君
岑参|逢入京使|故园东望路漫漫
岑参|碛中作|走马西来欲到天 辞家见月两回圆 今夜不知何处宿 平沙万里绝人烟
岑参|山房春事|梁园日暮乱飞鸦 极目萧条三两家 庭树不知人去尽 春来还发旧时花
白居易|赋得古原草送别|春风吹又生
白居易|忆江南|日出江花红胜火 春来江水绿如蓝 能不忆江南 风景旧曾谙 山寺月中寻桂子
白居易|大林寺桃花|人间四月芳菲尽 山寺桃花始盛开 长恨春归无觅处
白居易|钱塘湖春行|孤山寺北贾亭西 水面初平云脚低 几处早莺争暖树 谁家新燕啄春泥 乱花渐欲迷人眼 最爱湖东行不足
白居易|暮江吟|一道残阳铺水中 半江瑟瑟半江红 可怜九月初三夜 露似真珠月似弓
白居易|问刘十九|绿蚁新醅酒 晚来天欲雪
白居易|琵琶行|浔阳江头夜送客 枫叶荻花秋瑟瑟 主人下马客在船 举酒欲饮无管弦 别时茫茫江浸月 忽闻水上琵琶声 主人忘归客不发 转轴拨弦三两声 大弦嘈嘈如急雨 间关莺语花底滑 别有幽愁暗恨生 此时无声胜有声 银瓶乍破水浆迸 东船西舫悄无言 唯见江心秋月白 家在虾蟆陵下住 秋月春风等闲度 暮去朝来颜色故 商人重利轻别离 去来江口守空船 绕船月明江水寒 夜深忽梦少年事 梦啼妆泪红阑干 同是天涯沦落人 春江花朝秋月夜 往往取酒还独倾 江州司马青衫湿
白居易|长恨歌|汉皇重色思倾国 杨家有女初长成 养在深闺人未识 天生丽质难自弃 一朝选在君王侧 六宫粉黛无颜色 春寒赐浴华清池 温泉水滑洗凝脂 云鬓花颜金步摇 芙蓉帐暖度春宵 春宵苦短日高起 从此君王不早朝 春从春游夜专夜 后宫佳丽三千人 金屋妆成娇侍夜 玉楼宴罢醉和春 遂令天下父母心 骊宫高处入青云 仙乐风飘处处闻 尽日君王看不足 千乘万骑西南行 花钿委地无人收 黄埃散漫风萧索 云栈萦纡登剑阁 峨嵋山下少人行 旌旗无光日色薄 蜀江水碧蜀山青 圣主朝朝暮暮情 行宫见月伤心色 夜雨闻铃肠断声 天旋日转回龙驭 太液芙蓉未央柳 芙蓉如面柳如眉 春风桃李花开日 秋雨梧桐叶落时 西宫南内多秋草 迟迟钟鼓初长夜 耿耿星河欲曙天 翡翠衾寒谁与共 魂魄不曾来入梦 忽闻海上有仙山 山在虚无缥缈间 楼阁玲珑五云起 中有一人字太真 雪肤花貌参差是 云鬓半偏新睡觉 梨花一枝春带雨 蓬莱宫中日月长 回头下望人寰处 但教心似金钿坚 天上人间会相见 七月七日长生殿 夜半无人私语时 在天愿作比翼鸟 天长地久有时尽
白居易|卖炭翁|心忧炭贱愿天寒 夜来城外一尺雪 牛困人饥日已高 市南门外泥中歇 满面尘灰烟火色
白居易|早冬|十月江南天气好 可怜冬景似春华 日暖初干漠漠沙
白居易|邯郸冬至夜思家|邯郸驿里逢冬至 想得家中夜深坐 还应说着远行人
白居易|夜雪|复见窗户明 夜深知雪重 时闻折竹声
白居易|观刈麦|夜来南风起 背灼炎天光 但惜夏日长
白居易|春题湖上|湖上春来似画图 乱峰围绕水平铺 松排山面千重翠 月点波心一颗珠 一半勾留是此湖
杨万里|小池|泉眼无声惜细流 树阴照水爱晴柔
杨万里|晓出净慈寺送林子方|毕竟西湖六月中 风光不与四时同 接天莲叶无穷碧 映日荷花别样红
杨万里|宿新市徐公店|树头花落未成阴 飞入菜花无处寻
苏轼|饮湖上初晴后雨|水光潋滟晴方好 山色空蒙雨亦奇 欲把西湖比西子
苏轼|题西林壁|不识庐山真面目 只缘身在此山中
苏轼|惠崇春江晚景|竹外桃花三两枝 春江水暖鸭先知
苏轼|赠刘景文|荷尽已无擎雨盖 菊残犹有傲霜枝
苏轼|水调歌头|明月几时有 把酒问青天 高处不胜寒 何似在人间 人有悲欢离合 月有阴晴圆缺 但愿人长久
苏轼|念奴娇·赤壁怀古|大江东去 千古风流人物 故垒西边 惊涛拍岸 江山如画 人生如梦 一尊还酹江月
苏轼|江城子·乙卯正月二十日夜记梦|夜来幽梦忽还乡
苏轼|江城子·密州出猎|会挽雕弓如满月
苏轼|定风波|莫听穿林打叶声 一蓑烟雨任平生 料峭春风吹酒醒 山头斜照却相迎 也无风雨也无晴
苏轼|蝶恋花·春景|花褪残红青杏小 绿水人家绕 枝上柳绵吹又少 天涯何处无芳草 墙里秋千墙外道 墙里佳人笑 笑渐不闻声渐悄
苏轼|六月二十七日望湖楼醉书|黑云翻墨未遮山 白雨跳珠乱入船 卷地风来忽吹散 望湖楼下水如天
苏轼|海棠|东风袅袅泛崇光 香雾空蒙月转廊 只恐夜深花睡去
苏轼|浣溪沙|人间有味是清欢
苏轼|定风波·南海归赠王定国侍人寓娘|此心安处是吾乡
苏轼|正月二十日与潘郭二生出郊寻春|东风未肯入东门 人似秋鸿来有信 事如春梦了无痕
苏轼|临江仙·夜归临皋|夜饮东坡醒复醉 家童鼻息已雷鸣 倚杖听江声 夜阑风静縠纹平 江海寄余生
苏轼|卜算子·黄州定慧院寓居作|缺月挂疏桐 漏断人初静 谁见幽人独往来 拣尽寒枝不肯栖
苏轼|春宵|春宵一刻值千金 花有清香月有阴 歌管楼台声细细 秋千院落夜沉沉
苏轼|惠州一绝|罗浮山下四时春 日啖荔枝三百颗 不辞长作岭南人
刘禹锡|秋词|自古逢秋悲寂寥 我言秋日胜春朝 晴空一鹤排云上
刘禹锡|望洞庭|湖光秋月两相和 潭面无风镜未磨 遥望洞庭山水翠
刘禹锡|乌衣巷|朱雀桥边野草花 飞入寻常百姓家
刘禹锡|陋室铭|山不在高 水不在深 草色入帘青
刘禹锡|竹枝词|杨柳青青江水平 闻郎江上踏歌声 东边日出西边雨
刘禹锡|酬乐天扬州初逢席上见赠|巴山楚水凄凉地 到乡翻似烂柯人 病树前头万木春 今日听君歌一曲 暂凭杯酒长精神
刘禹锡|石头城|山围故国周遭在 淮水东边旧时月 夜深还过女墙来
刘禹锡|赏牡丹|庭前芍药妖无格 唯有牡丹真国色 花开时节动京城
刘禹锡|再游玄都观|百亩庭中半是苔 桃花净尽菜花开
刘禹锡|浪淘沙|浪淘风簸自天涯 同到牵牛织女家
张志和|渔歌子|西塞山前白鹭飞 桃花流水鳜鱼肥 斜风细雨不须归
杜牧|山行|远上寒山石径斜 白云生处有人家 霜叶红于二月花
杜牧|江南春|水村山郭酒旗风 南朝四百八十寺 多少楼台烟雨中
杜牧|清明|清明时节雨纷纷 路上行人欲断魂 借问酒家何处有 牧童遥指杏花村
杜牧|泊秦淮|烟笼寒水月笼沙 夜泊秦淮近酒家 隔江犹唱后庭花
杜牧|秋夕|银烛秋光冷画屏 天阶夜色凉如水
杜牧|赤壁|自将磨洗认前朝 东风不与周郎便 铜雀春深锁二乔
杜牧|过华清宫|山顶千门次第开 无人知是荔枝来
杜牧|寄扬州韩绰判官|青山隐隐水迢迢 秋尽江南草未凋 二十四桥明月夜 玉人何处教吹箫
杜牧|遣怀|落魄江湖载酒行 十年一觉扬州梦 赢得青楼薄幸名
杜牧|赠别|豆蔻梢头二月初 春风十里扬州路 蜡烛有心还惜别 替人垂泪到天明
杜牧|题乌江亭|胜败兵家事不期 江东子弟多才俊
杜牧|登乐游原|长空澹澹孤鸟没 看取汉家何事业 五陵无树起秋风
杜牧|金谷园|流水无情草自春 日暮东风怨啼鸟 落花犹似坠楼人
杜牧|念昔游|李白题诗水西寺 古木回岩楼阁风 红白花开山雨中
李商隐|夜雨寄北|巴山夜雨涨秋池 何当共剪西窗烛 却话巴山夜雨时
李商隐|无题·相见时难别亦难|东风无力百花残 春蚕到死丝方尽 晓镜但愁云鬓改 夜吟应觉月光寒 蓬山此去无多路 青鸟殷勤为探看
李商隐|无题·昨夜星辰昨夜风|昨夜星辰昨夜风 画楼西畔桂堂东 心有灵犀一点通 隔座送钩春酒暖
李商隐|无题·来是空言去绝踪|月斜楼上五更钟 梦为远别啼难唤 刘郎已恨蓬山远 更隔蓬山一万重
李商隐|无题·飒飒东风细雨来|飒飒东风细雨来 春心莫共花争发
李商隐|无题·何处哀筝随急管|樱花永巷垂杨岸 东家老女嫁不售 白日当天三月半 清明暖后同墙看
李商隐|锦瑟|庄生晓梦迷蝴蝶 望帝春心托杜鹃 沧海月明珠有泪 蓝田日暖玉生烟
李商隐|嫦娥|云母屏风烛影深 碧海青天夜夜心
李商隐|贾生|可怜夜半虚前席
李商隐|宿骆氏亭寄怀崔雍崔衮|竹坞无尘水槛清 秋阴不散霜飞晚 留得枯荷听雨声
李商隐|晚晴|春去夏犹清 天意怜幽草 人间重晚晴 微注小窗明 越鸟巢干后
李商隐|安定城楼|永忆江湖归白发 欲回天地入扁舟
李清照|如梦令|昨夜雨疏风骤 浓睡不消残酒 试问卷帘人 却道海棠依旧 常记溪亭日暮 误入藕花深处
李清照|声声慢|乍暖还寒时候 三杯两盏淡酒 怎敌他晚来风急 守着窗儿 梧桐更兼细雨 怎一个愁字了得
李清照|一剪梅|红藕香残玉簟秋 云中谁寄锦书来 月满西楼 花自飘零水自流 两处闲愁 却上心头
李清照|武陵春|风住尘香花已尽 日晚倦梳头 物是人非事事休 闻说双溪春尚好 载不动许多愁
李清照|夏日绝句|生当作人杰 不肯过江东
李清照|醉花阴|薄雾浓云愁永昼 半夜凉初透 东篱把酒黄昏后 帘卷西风 人比黄花瘦
李清照|渔家傲|天接云涛连晓雾 仿佛梦魂归帝所 我报路长嗟日暮 学诗谩有惊人句 九万里风鹏正举 蓬舟吹取三山去
李清照|怨王孙|水光山色与人亲
柳永|雨霖铃|寒蝉凄切 骤雨初歇 暮霭沉沉楚天阔 更那堪冷落清秋节 今宵酒醒何处 晓风残月 便纵有千种风情 更与何人说
柳永|蝶恋花|伫倚危楼风细细 望极春愁 黯黯生天际 草色烟光残照里 为伊消得人憔悴
柳永|望海潮|东南形胜 烟柳画桥 风帘翠幕 参差十万人家 重湖叠巘清嘉 有三秋桂子 十里荷花 菱歌泛夜
辛弃疾|西江月·夜行黄沙道中|明月别枝惊鹊 清风半夜鸣蝉 稻花香里说丰年 听取蛙声一片 七八个星天外 两三点雨山前
辛弃疾|青玉案·元夕|东风夜放花千树 凤箫声动 一夜鱼龙舞 蛾儿雪柳黄金缕 那人却在
辛弃疾|破阵子·为陈同甫赋壮词以寄之|梦回吹角连营 五十弦翻塞外声 沙场秋点兵 了却君王天下事
辛弃疾|丑奴儿·书博山道中壁|少年不识愁滋味 爱上层楼 为赋新词强说愁 而今识尽愁滋味 却道天凉好个秋
辛弃疾|永遇乐·京口北固亭怀古|千古江山 雨打风吹去 人道寄奴曾住
辛弃疾|菩萨蛮·书江西造口壁|郁孤台下清江水 中间多少行人泪 西北望长安 可怜无数山 青山遮不住 毕竟东流去 江晚正愁余 山深闻鹧鸪
辛弃疾|清平乐·村居|白发谁家翁媪 大儿锄豆溪东
辛弃疾|贺新郎|我见青山多妩媚
辛弃疾|水龙吟·登建康赏心亭|楚天千里清秋 水随天去秋无际 落日楼头 断鸿声里 江南游子
辛弃疾|南乡子·登京口北固亭有怀|满眼风光北固楼 不尽长江滚滚流 坐断东南战未休 天下英雄谁敌手
李煜|虞美人|春花秋月何时了 小楼昨夜又东风 故国不堪回首月明中 问君能有几多愁 恰似一江春水向东流
李煜|相见欢·无言独上西楼|无言独上西楼 月如钩 寂寞梧桐深院锁清秋 是离愁 别是一般滋味在心头
李煜|相见欢·林花谢了春红|林花谢了春红 无奈朝来寒雨晚来风 自是人生长恨水长东
李煜|浪淘沙令|帘外雨潺潺 春意阑珊 罗衾不耐五更寒 梦里不知身是客 无限江山 流水落花春去也 天上人间
范仲淹|渔家傲·秋思|塞下秋来风景异 四面边声连角起 长烟落日孤城闭 浊酒一杯家万里 人不寐
范仲淹|苏幕遮·怀旧|碧云天 秋色连波 波上寒烟翠 山映斜阳天接水 夜夜除非 好梦留人睡 明月楼高休独倚 酒入愁肠
晏殊|浣溪沙|一曲新词酒一杯 去年天气旧亭台 夕阳西下几时回 无可奈何花落去
晏殊|蝶恋花|槛菊愁烟兰泣露 罗幕轻寒 明月不谙离恨苦 昨夜西风凋碧树 独上高楼 望尽天涯路 山长水阔知何处
晏殊|寓意|梨花院落溶溶月 柳絮池塘淡淡风
欧阳修|蝶恋花|庭院深深深几许 杨柳堆烟 楼高不见章台路 雨横风狂三月暮 无计留春住 泪眼问花花不语 乱红飞过秋千去
欧阳修|生查子·元夕|去年元夜时 花市灯如昼 月上柳梢头 人约黄昏后 月与灯依旧 不见去年人 泪湿春衫袖
欧阳修|玉楼春|人生自是有情痴 此恨不关风与月 直须看尽洛城花 始共春风容易别
欧阳修|采桑子|轻舟短棹西湖好 群芳过后西湖好
秦观|鹊桥仙|纤云弄巧 金风玉露一相逢 便胜却人间无数 柔情似水 佳期如梦 又岂在朝朝暮暮
秦观|踏莎行·郴州旅舍|雾失楼台 月迷津渡 可堪孤馆闭春寒 杜鹃声里斜阳暮 郴江幸自绕郴山
秦观|满庭芳|山抹微云 天连衰草
秦观|浣溪沙|漠漠轻寒上小楼 晓阴无赖似穷秋 自在飞花轻似梦 无边丝雨细如愁
秦观|三月晦日偶题|夏木阴阴正可人
陆游|游山西村|莫笑农家腊酒浑 山重水复疑无路 柳暗花明又一村 箫鼓追随春社近 衣冠简朴古风存 从今若许闲乘月 拄杖无时夜叩门
陆游|示儿|王师北定中原日 家祭无忘告乃翁
陆游|十一月四日风雨大作|夜阑卧听风吹雨 铁马冰河入梦来
陆游|临安春雨初霁|小楼一夜听春雨 深巷明朝卖杏花 晴窗细乳戏分茶
陆游|钗头凤|黄縢酒 满城春色宫墙柳 东风恶 一怀愁绪 春如旧 人空瘦 桃花落 山盟虽在
陆游|卜算子·咏梅|已是黄昏独自愁 更著风和雨 无意苦争春
陆游|书愤|中原北望气如山 楼船夜雪瓜洲渡 铁马秋风大散关
陆游|秋夜将晓出篱门迎凉有感|三万里河东入海 五千仞岳上摩天 南望王师又一年
陆游|诉衷情|心在天山
贺知章|回乡偶书|少小离家老大回 离别家乡岁月多 近来人事半消磨 唯有门前镜湖水 春风不改旧时波
贺知章|咏柳|二月春风似剪刀
王翰|凉州词|葡萄美酒夜光杯 古来征战几人回
张继|枫桥夜泊|月落乌啼霜满天 江枫渔火对愁眠 姑苏城外寒山寺 夜半钟声到客船
柳宗元|江雪|千山鸟飞绝 万径人踪灭 独钓寒江雪
柳宗元|渔翁|渔翁夜傍西岩宿 烟销日出不见人 欸乃一声山水绿 回看天际下中流 岩上无心云相逐
柳宗元|登柳州城楼寄漳汀封连四州|城上高楼接大荒 海天愁思正茫茫 惊风乱飐芙蓉水 密雨斜侵薜荔墙 江流曲似九回肠
骆宾王|咏鹅|曲项向天歌 白毛浮绿水
韦应物|滁州西涧|春潮带雨晚来急 野渡无人舟自横
陈子昂|登幽州台歌|前不见古人 念天地之悠悠
孟郊|游子吟|谁言寸草心 报得三春晖
孟郊|登科后|春风得意马蹄疾 一日看尽长安花
韩愈|早春呈水部张十八员外|天街小雨润如酥 草色遥看近却无 最是一年春好处 绝胜烟柳满皇都
韩愈|左迁至蓝关示侄孙湘|一封朝奏九重天 云横秦岭家何在 雪拥蓝关马不前 好收吾骨瘴江边
韩愈|晚春|草树知春不久归 杨花榆荚无才思 惟解漫天作雪飞
李贺|雁门太守行|黑云压城城欲摧 甲光向日金鳞开 角声满天秋色里 塞上燕脂凝夜紫 半卷红旗临易水 霜重鼓寒声不起
李贺|马诗|燕山月似钩 快走踏清秋
李贺|金铜仙人辞汉歌|天若有情天亦老
李贺|李凭箜篌引|昆山玉碎凤凰叫 石破天惊逗秋雨
李贺|致酒行|雄鸡一声天下白 少年心事当拏云
韩翃|寒食|春城无处不飞花 寒食东风御柳斜 日暮汉宫传蜡烛 轻烟散入五侯家
高适|别董大|千里黄云白日曛 北风吹雁雪纷纷 莫愁前路无知己 天下谁人不识君
高适|塞上听吹笛|雪净胡天牧马还 月明羌笛戍楼间 借问梅花何处落 风吹一夜满关山
张籍|秋思|洛阳城里见秋风 欲作家书意万重 行人临发又开封
崔颢|长干行|君家何处住
崔颢|黄鹤楼|昔人已乘黄鹤去 此地空余黄鹤楼 白云千载空悠悠 日暮乡关何处是 烟波江上使人愁
王湾|次北固山下|客路青山外 行舟绿水前 潮平两岸阔 风正一帆悬 海日生残夜 江春入旧年
王勃|送杜少府之任蜀州|风烟望五津 同是宦游人 海内存知己 天涯若比邻
王勃|滕王阁序|秋水共长天一色
王勃|滕王阁诗|滕王高阁临江渚 画栋朝飞南浦云 珠帘暮卷西山雨 闲云潭影日悠悠 物换星移几度秋 槛外长江空自流
王勃|山中|长江悲已滞 况属高风晚 山山黄叶飞
崔护|题都城南庄|去年今日此门中 人面桃花相映红 人面不知何处去 桃花依旧笑春风
叶绍翁|游园不值|春色满园关不住
朱熹|春日|胜日寻芳泗水滨 等闲识得东风面 万紫千红总是春
朱熹|观书有感|天光云影共徘徊 为有源头活水来 昨夜江边春水生 此日中流自在行
王安石|泊船瓜洲|京口瓜洲一水间 钟山只隔数重山 春风又绿江南岸 明月何时照我还
王安石|元日|爆竹声中一岁除 春风送暖入屠苏 千门万户曈曈日
王安石|梅花|凌寒独自开
王安石|登飞来峰|飞来山上千寻塔 闻说鸡鸣见日升 不畏浮云遮望眼
王安石|书湖阴先生壁|花木成畦手自栽 一水护田将绿绕 两山排闼送青来
王安石|夜直|金炉香烬漏声残 剪剪轻风阵阵寒 春色恼人眠不得 月移花影上栏干
曾几|三衢道中|梅子黄时日日晴 小溪泛尽却山行 添得黄鹂四五声
赵师秀|约客|黄梅时节家家雨 有约不来过夜半 闲敲棋子落灯花
范成大|四时田园杂兴|昼出耘田夜绩麻 村庄儿女各当家 麦花雪白菜花稀 日长篱落无人过
林升|题临安邸|山外青山楼外楼 西湖歌舞几时休 暖风熏得游人醉
黄庭坚|寄黄几复|桃李春风一杯酒 江湖夜雨十年灯
宋祁|玉楼春|东城渐觉风光好 绿杨烟外晓寒轻 红杏枝头春意闹
李重元|忆王孙·春词|柳外楼高空断魂 杜宇声声不忍闻 雨打梨花深闭门
龚自珍|己亥杂诗|九州生气恃风雷 我劝天公重抖擞 不拘一格降人才 浩荡离愁白日斜 吟鞭东指即天涯 化作春泥更护花
郑燮|竹石|咬定青山不放松 任尔东西南北风
于谦|石灰吟|千锤万凿出深山 要留清白在人间
文天祥|过零丁洋|山河破碎风飘絮 身世浮沉雨打萍 人生自古谁无死 留取丹心照汗青
王冕|墨梅|我家洗砚池头树 朵朵花开淡墨痕 不要人夸好颜色
马致远|天净沙·秋思|小桥流水人家 古道西风瘦马 夕阳西下 断肠人在天涯
张养浩|山坡羊·潼关怀古|山河表里潼关路
纳兰性德|木兰花令·拟古决绝词柬友|人生若只如初见 何事秋风悲画扇 等闲变却故人心 却道故人心易变
纳兰性德|长相思|山一程 水一程 身向榆关那畔行 夜深千帐灯 风一更 聒碎乡心梦不成 故园无此声
纳兰性德|浣溪沙|谁念西风独自凉 被酒莫惊春睡重
陶渊明|饮酒|结庐在人境 心远地自偏 采菊东篱下 悠然见南山 山气日夕佳 飞鸟相与还
陶渊明|归园田居|性本爱丘山 羁鸟恋旧林 榆柳荫后檐 暧暧远人村 种豆南山下 带月荷锄归
陶渊明|读山海经|孟夏草木长
陶渊明|四时|春水满四泽 夏云多奇峰 秋月扬明辉 冬岭秀孤松
谢灵运|游赤石进帆海|首夏犹清和
曹操|短歌行|对酒当歌 人生几何 月明星稀 乌鹊南飞 山不厌高 海不厌深 天下归心
曹操|观沧海|东临碣石 以观沧海 水何澹澹 山岛竦峙 秋风萧瑟 日月之行
刘邦|大风歌|大风起兮云飞扬
荆轲|易水歌|风萧萧兮易水寒
诗经|关雎|关关雎鸠
诗经|蒹葭|所谓伊人 在水一方
诗经|采薇|杨柳依依 雨雪霏霏
诗经|子衿|悠悠我心
诗经|采葛|一日不见 如三秋兮
诗经|七月|七月流火
古诗十九首|迢迢牵牛星|盈盈一水间
古诗十九首|行行重行行|胡马依北风 越鸟巢南枝 浮云蔽白日 思君令人老
古诗十九首|明月何皎皎|明月何皎皎
古诗十九首|孟冬寒气至|孟冬寒气至 北风何惨栗
汉乐府|长歌行|朝露待日晞 阳春布德泽 常恐秋节至 百川东到海 何时复西归
汉乐府|江南|江南可采莲 鱼戏莲叶东 鱼戏莲叶西 鱼戏莲叶南 鱼戏莲叶北
汉乐府|上邪|山无陵 江水为竭 冬雷震震 夏雨雪 天地合
汉乐府|孔雀东南飞|孔雀东南飞 东西植松柏
北朝民歌|敕勒歌|阴山下 天似穹庐 天苍苍 风吹草低见牛羊
北朝民歌|木兰诗|东市买骏马 西市买鞍鞯 南市买辔头 北市买长鞭 关山度若飞 寒光照铁衣 当窗理云鬓 对镜帖花黄 开我东阁门 坐我西阁床
贾岛|题李凝幽居|鸟宿池边树 僧敲月下门
金昌绪|春怨|啼时惊妾梦 不得到辽西
杜荀鹤|春宫怨|风暖鸟声碎 日高花影重
刘方平|月夜|更深月色半人家 北斗阑干南斗斜 今夜偏知春气暖 虫声新透绿窗纱
刘方平|春怨|纱窗日落渐黄昏 金屋无人见泪痕 寂寞空庭春欲晚 梨花满地不开门
王建|十五夜望月寄杜郎中|中庭地白树栖鸦 冷露无声湿桂花 今夜月明人尽望 不知秋思落谁家
元稹|闻乐天授江州司马|残灯无焰影幢幢 此夕闻君谪九江 暗风吹雨入寒窗
罗隐|自遣|多愁多恨亦悠悠 今朝有酒今朝醉 明日愁来明日愁
韦庄|菩萨蛮|人人尽说江南好 游人只合江南老
高骈|山亭夏日|绿树阴浓夏日长 楼台倒影入池塘 水晶帘动微风起
唐文宗|夏日联句|我爱夏日长
慧开|颂|春有百花秋有月 夏有凉风冬有雪 若无闲事挂心头 便是人间好时节
佚名|画|远看山有色 近听水无声 春去花还在 人来鸟不惊`,mt=["春江花月夜","秋山风雨天","夏日湖水岸","冬朝海云关","南窗柳色暖","北庭鸟声寒","西楼人心愁","东家酒梦残"],Y=7,dt=10,Nt="春风花月山水云天江夜秋白红明雪千人心日星辰光影香色声情露霜舟楼台烟波草木林泉石径归去来客愁乡梦醉酒杯歌长短高远清寒暖新旧时年人家国城池门关塞孤野晚晓晨昏朝暮恨思忆泪笑欢",F="風风雲云紅红綠绿藍蓝黃黄聲声來来時时見见開开歸归與与無无萬万裏里裡里為为東东陽阳陰阴誰谁盡尽邊边處处過过還还這这個个們们麼么於于後后從从對对頭头樓楼葉叶樹树語语詩诗詞词書书畫画夢梦覺觉獨独燈灯飛飞鳥鸟馬马魚鱼龍龙鳳凤鶴鹤鴻鸿蟬蝉鶯莺鵲鹊鴉鸦雞鸡鴨鸭國国門门關关牆墙閣阁臺台園园簾帘帳帐愛爱戀恋憶忆記记識识視视聞闻聽听說说問问淚泪歡欢樂乐熱热涼凉溫温節节歲岁霧雾煙烟電电蒼苍賦赋經经傳传劍剑賞赏賢贤聖圣舊旧點点蕭萧簫箫鏡镜鑑鉴隨随雖虽隻只雙双幾几幹干纖纤豔艳艷艳麗丽羅罗織织線线約约結结絕绝鄉乡鄰邻詠咏誦诵讀读慶庆獻献禮礼禪禅緣缘塵尘築筑蓋盖滿满灑洒濕湿斷断續续殘残壓压歷历飲饮飽饱餓饿軍军戰战敵敌將将師师義义讓让認认論论該该謝谢訪访許许誤误調调課课談谈貴贵賤贱質质貨货財财貧贫賽赛車车輪轮輕轻載载島岛嶼屿巖岩嶺岭峯峰峽峡灘滩灣湾濤涛湧涌沒没瀉泻澗涧淵渊濱滨爐炉燒烧燭烛爛烂爭争擊击掃扫飄飘驅驱驚惊驟骤馳驰騎骑驛驿鳴鸣叢丛絲丝鮮鲜豐丰曉晓晝昼暉晖曖暧圍围圖图墻墙徑径觀观規规覽览觸触詳详謹谨贊赞窓窗牕窗濺溅惱恼閒闲閑闲靜静臨临憐怜隱隐宮宫銀银寶宝盞盏濃浓淺浅漁渔鷺鹭帶带潛潜遠远遙遥寧宁爾尔長长興兴亂乱戲戏華华漢汉際际蘭兰嬌娇薺荠蓮莲楊杨嘆叹歎叹號号細细紛纷縷缕繞绕綿绵終终給给總总縱纵繡绣陣阵陸陆閉闭間间闌阑闊阔鬢鬓髮发發发麥麦齊齐兒儿親亲請请費费買买賣卖農农運运進进遲迟選选釣钓鐘钟錦锦鐵铁雜杂難难靈灵韻韵響响頃顷須须顏颜願愿顧顾餘余館馆鷗鸥沈沉",gt=[["job","职业"],["skill","技能"],["mech","副本机制"],["place","地点"],["duty","副本"],["primal","蛮神与龙"],["npc","人物"],["race","种族部族"],["mob","生物"],["ride","坐骑宠物"],["misc","道具玩法"]],It=`job|防护职业|骑士 战士 暗黑骑士 绝枪战士
job|治疗职业|白魔法师 学者 占星术士 贤者
job|进攻职业|武僧 龙骑士 忍者 武士 钐镰客 蝰蛇剑士 吟游诗人 机工士 舞者 黑魔法师 召唤师 赤魔法师 绘灵法师 青魔法师
job|基础职业|剑术师 斧术师 幻术师 格斗家 枪术师 弓箭手 咒术师 秘术师 双剑师
job|能工巧匠|刻木匠 锻铁匠 铸甲匠 雕金匠 制革匠 裁衣匠 炼金术士 烹调师
job|大地使者|采矿工 园艺工 捕鱼人
skill|职能技能|即刻咏唱 沉稳咏唱 醒梦 昏乱 营救 康复 铁壁 雪仇 挑衅 退避 插言 下踢 亲疏自行 内丹 浴血 真北 牵制 扫腿 伤头
skill|咏唱|即刻咏唱 沉稳咏唱 三连咏唱
skill|防护无敌|神圣领域 死斗 行尸走肉 超火流星
skill|团队增益|战斗连祷 战斗之声 技巧舞步 占卜 连环计 鼓励 灼热之光 义结金兰 神秘环
skill|治疗技能|庇护所 野战治疗阵 地星 坚角清汁 节制 礼仪之铃 展开战术 整体论 天赐祝福 输血
skill|占星卡|太阳神之衡 放浪神之箭 战争神之枪 建筑神之塔 世界树之干 河流神之瓶 王冠之领主 王冠之贵妇
skill|诗人战歌|放浪神的小步舞曲 军神的赞美歌 贤者的叙事谣 光明神的最终乐章
skill|舞者技能|标准舞步 技巧舞步 治疗之华尔兹 防守之桑巴 进攻之探戈 扇舞·序 扇舞·破 扇舞·急
skill|忍术|火遁 雷遁 冰遁 风遁 土遁 水遁
skill|召唤物|朝日小仙女 夕月小仙女 宝石兽 后式自走人偶
mech|副本机制|分摊 点名 死刑 钢铁 月环 踩塔 背对 陨石 击退 连线
mech|状态效果|受伤加重 魔法易伤 衰弱 眩晕 沉默 止步 加速 减速 麻痹 睡眠
mech|队伍规模|轻锐小队 满编小队 大国防联军
place|主城|利姆萨·罗敏萨 乌尔达哈 格里达尼亚 伊修加德 黄金港 水晶都 游末邦 旧萨雷安 拉札罕 图莱尤拉
place|住宅区|海雾村 薰衣草苗圃 高脚孤丘 白银乡 穹顶皓天
place|地区|拉诺西亚 黑衣森林 萨纳兰 库尔札斯 摩杜纳 阿巴拉提亚
place|苍天地图|库尔札斯西部高地 龙堡参天高地 龙堡内陆低地 翻云雾海 阿巴拉提亚云海 魔大陆阿济兹拉
place|红莲地图|基拉巴尼亚边区 基拉巴尼亚山区 基拉巴尼亚湖区 红玉海 延夏 太阳神草原
place|暗影地图|雷克兰德 珂露西亚岛 安穆·艾兰 伊尔美格 拉凯提卡大森林 黑风海
place|晓月地图|迷津 萨维奈岛 加雷马 叹息海 厄尔庇斯 天外天垓
place|金曦地图|奥阔帕恰山 克扎玛乌卡湿地 亚克特尔树海 夏劳尼荒野 遗产之地 活着的记忆
duty|四人副本|沙斯塔夏溶洞 铜铃铜山 托托·拉克千狱 静语庄园 天狼星灯塔 石卫塔 泽梅尔要塞 魔科学研究所 帝国白山堡 斯卡拉遗迹 岩燕庙
duty|大型任务|巴哈姆特 亚历山大 欧米茄 伊甸 万魔殿
duty|团队任务|古代人迷宫 魔航船虚无方舟 禁忌城邦玛哈 影之国 复制工厂废墟 人偶军事基地 希望之炮台：塔
primal|初代蛮神|伊弗利特 泰坦 迦楼罗 利维亚桑 拉姆 希瓦 莫古力贤王 奥丁
primal|四圣兽|朱雀 玄武 青龙 白虎
primal|三斗神|萨菲洛特 索菲娅 祖尔宛
primal|东方蛮神|须佐之男 吉祥天女 神龙 月读
primal|神兵|究极神兵 红宝石神兵 绿宝石神兵 钻石神兵
primal|四天王|斯凯米留尼 凯纳槽 巴尔巴莉西亚 卢比坎特
primal|龙族|尼德霍格 赫拉斯瓦尔格 巴哈姆特 提亚马特 维德弗尼尔
npc|拂晓|敏菲利亚 雅·修特拉 桑克瑞德 帕帕力莫 于里昂热 阿尔菲诺 阿莉塞 塔塔露 古·拉哈·提亚 可露儿 埃斯蒂尼安
npc|伊修加德|奥尔什方 艾默里克 阿图瓦雷尔 埃马内兰 福尔唐伯爵 露琪亚 泽菲兰 托尔丹七世
npc|帝国|芝诺斯 瓦厉斯 盖乌斯 尼禄 莉维亚 里塔提恩 索鲁斯
npc|古代人|爱梅特赛尔克 拉哈布雷亚 艾里迪布斯 希斯拉德 维涅斯 赫尔墨斯
npc|东方|飞燕 豪雪 夕雾 莉瑟
npc|金曦|乌克·拉玛特 柯纳 佐拉加 古鲁加加 巴库加加 埃伦维尔
npc|三国领袖|梅尔维布 娜娜莫 嘉恩·艾·神纳 劳班
npc|希尔迪布兰德|希尔迪布兰德 娜修·玛卡拉卡 戈德伯特 朱莉安
npc|十二神|阿泽玛 梅茵菲娜 哈罗妮 纳尔札尔 诺菲卡 比尔格 拉尔戈 阿尔基克 妮美雅
race|种族|人族 精灵族 拉拉菲尔族 猫魅族 鲁加族 敖龙族 硌狮族 维埃拉族
race|部族|妖精族 鱼人族 鸟人族 蜥蜴人族 骨颌族 瓦努族 哥布林 甲人族 鲶鱼精 阿难陀族 兔兔族 狼人族
mob|吉祥物|陆行鸟 莫古力 仙人刺 宝石兽 爆弹怪
mob|魔物|魔界花 爆弹怪 奇美拉 拉米亚 美甲兽 塔罗斯 独眼巨人 狮鹫 拟态宝箱怪 食罪灵 软糊怪 巨魔 硕山羊 座狼 塞壬
mob|元精|土元精 雷元精 冰元精 火元精 风元精 水元精
mob|恶名精英|克尔 布弗鲁 颇胝迦 阿姆斯特朗 狭缝 厄菲翁尼厄斯 伽洛克 尤兰 胡睹 斯图希
ride|坐骑|魔法飞窗 飞行座椅 精金龟 河马车 爆弹吊椅 气垫船 巨鲶鱼神轿 帝王仙人刺 青磷气球 犀蜥 黑天马 天阳马
ride|宠物|猫小胖 豆豆柴 大大柴 小异亚 小巨魔 朱孔雀 迷你亚历山大 皇家贝希摩斯宝宝
misc|货币|金币 金碟币 军票 神典石
misc|道具|幻想药 爆发药 魔晶石 巨匠药酒
misc|玩法|九宫幻卡 多玛方城战 出海垂钓 无人岛 纷争前线 水晶冲突 寻宝 时尚品鉴 幻巧拼图 天书奇谈 冒险者分队 雇员探险 金碟游乐场 重建伊修加德
misc|社交|部队 通讯贝 新人频道 队员招募 喊话 定型文
misc|时装|东方美姬套装 领主套装 山间少女套装 街头套装
misc|狩猎|狩猎车 排点 抢开 农怪 定ET 恶名精英`,T=(t,e)=>t+Math.floor(Math.random()*(e-t+1));function K(t){const e=[...t];for(let s=e.length-1;s>0;s--){const n=T(0,s);[e[s],e[n]]=[e[n],e[s]]}return e}const Gt=t=>/[㐀-鿿豈-﫿]/.test(t),a=(t,e)=>t.querySelector(e),qt=["","一","二","三","四","五","六","七","八","九","十"],y=t=>qt[t]||String(t);function R(t){const e=/^\s*(\/[a-z0-9]+)(?=[\s【])/i.exec(ut(t));return e?e[1]+" ":""}const ut=t=>storage.get(O+t)??P[t].text,d={built:!1,tab:"bomb",root:null},D=t=>`
    <div class="gm-macro" data-macro-slot="${t}">
      <div class="gm-macro-head">
        <button type="button" class="gm-macro-toggle" aria-expanded="false"><span class="gm-macro-title"></span><span class="gm-caret" aria-hidden="true"></span></button>
        <span class="gm-macro-meta"></span>
        <button type="button" class="gm-mini gm-macro-copy">复制宏</button>
      </div>
      <div class="gm-macro-body" hidden>
        <textarea class="gm-macro-text" rows="7" spellcheck="false"></textarea>
        <div class="gm-macro-foot">
          <span class="gm-macro-note">改动自动保存在本机</span>
          <button type="button" class="gm-mini gm-macro-reset">恢复默认</button>
        </div>
      </div>
    </div>`;function X(t,e){const s=a(t,".gm-macro-text"),n=a(t,".gm-macro-body"),o=a(t,".gm-macro-toggle"),i=()=>{const g=e(),u=s.value.split(`
`).filter(b=>b.trim()).length;a(t,".gm-macro-title").textContent=`规则宏 · ${P[g].label.replace(/^飞花令 · /,"")}`;const p=a(t,".gm-macro-meta");p.textContent=u>15?`${u} 行，超过 15 行放不进一个宏`:`${u} 行`,p.classList.toggle("is-over",u>15),a(t,".gm-macro-reset").disabled=s.value===P[g].text},m=()=>{s.value=ut(e()),s.setAttribute("aria-label",`${P[e()].label}规则宏`),i()};return o.addEventListener("click",()=>{n.hidden=!n.hidden,o.setAttribute("aria-expanded",String(!n.hidden)),t.classList.toggle("is-open",!n.hidden)}),s.addEventListener("input",()=>{const g=e();s.value===P[g].text?storage.remove(O+g):storage.set(O+g,s.value),i()}),a(t,".gm-macro-copy").addEventListener("click",()=>{copyText(s.value,`已复制${P[e()].label}规则宏`,"复制失败，请展开后手动复制")}),a(t,".gm-macro-reset").addEventListener("click",()=>{storage.remove(O+e()),m(),showToast("已恢复默认内容")}),m(),m}const z=(t,e,{copy:s=!0,placeholder:n=""}={})=>`
    <div class="gm-say" id="${t}">
      <div class="gm-say-head">
        <span class="gm-say-title">${e}</span>
        <span class="gm-macro-meta"></span>
        ${s?`<button type="button" class="gm-mini gm-say-copy">复制${e}</button>`:""}
      </div>
      <textarea class="gm-macro-text gm-say-text" rows="2" spellcheck="false" aria-label="${e}" placeholder="${n}"></textarea>
    </div>`;function V(t,e){const s=a(t,".gm-say-text");let n=null;const o=()=>{s.offsetParent&&(s.style.height="auto",s.style.height=`${Math.min(s.scrollHeight+2,320)}px`)};(d.says||=[]).push(o);const i=()=>{const g=s.value.split(`
`).filter(b=>b.trim()).length;o();const u=a(t,".gm-macro-meta");u.textContent=g>15?`${g} 行，超过 15 行放不进一个宏`:g?`${g} 行 · 可直接修改`:"",u.classList.toggle("is-over",g>15);const p=a(t,".gm-say-copy");p&&(p.disabled=!s.value.trim())};s.addEventListener("input",i);const m=()=>s.value.trim()?copyText(s.value,`已复制${e}，粘贴到游戏聊天栏`,"复制失败，请手动复制"):showToast(`还没有${e}`);return a(t,".gm-say-copy")?.addEventListener("click",m),i(),{set(g,u=!1){!u&&g===n||(n=g,s.value=g,i())},copy:m,get:()=>s.value}}const ye=999999999,pt=14,B=5,c={lo:1,hi:1e3,lo0:1,hi0:1e3,bomb:0,guesses:[],over:!1,peek:!1,players:4,turn:1},bt=99,Yt=()=>`
    ${D("bomb")}
    <div class="gm-setup">
      <div class="gm-setup-range">
        <label class="gm-label" for="gmBombMin">范围</label>
        <input id="gmBombMin" class="gm-num" type="text" inputmode="numeric" maxlength="9" value="1" aria-label="范围下限">
        <span class="gm-tilde">～</span>
        <input id="gmBombMax" class="gm-num" type="text" inputmode="numeric" maxlength="9" value="1000" aria-label="范围上限">
      </div>
      <div class="gm-setup-bomb">
        <span class="gm-label">炸弹</span>
        <div class="alarm-seg gm-seg" role="radiogroup" aria-label="炸弹怎么定">
          <label class="is-active"><input type="radio" name="gmBombMode" value="rand" checked>随机</label>
          <label><input type="radio" name="gmBombMode" value="set">指定</label>
        </div>
        <input id="gmBombSet" class="gm-num" type="text" inputmode="numeric" maxlength="9" placeholder="炸弹" aria-label="指定炸弹数字" hidden>
      </div>
      <div class="gm-setup-players">
        <label class="gm-label" for="gmBombPlayers">玩家</label>
        <input id="gmBombPlayers" class="gm-num gm-num-s" type="text" inputmode="numeric" maxlength="2" value="4" aria-label="玩家人数">
        <span class="gm-label">人</span>
      </div>
      <button type="button" class="gm-btn" id="gmBombStart">开局</button>
    </div>
    <div class="gm-bomb-stage" id="gmBombStage">
      <svg class="gm-bomb-svg" viewBox="0 0 120 112" aria-hidden="true">
        <path class="gm-fuse-track" d="M78 30 C 86 18, 98 26, 100 15 S 107 3, 114 6" pathLength="100"/>
        <path class="gm-fuse" d="M78 30 C 86 18, 98 26, 100 15 S 107 3, 114 6" pathLength="100"/>
        <rect class="gm-bomb-cap" x="67" y="27" width="17" height="12" rx="3" transform="rotate(38 75.5 33)"/>
        <circle class="gm-bomb-body" cx="54" cy="70" r="36"/>
        <path class="gm-bomb-shine" d="M34 60 a 22 22 0 0 1 16 -16"/>
        <g class="gm-spark"><circle r="4.5"/><path d="M0 -10 L2 -2 L10 0 L2 2 L0 10 L-2 2 L-10 0 L-2 -2 Z"/></g>
      </svg>
      <div class="gm-bomb-range" id="gmBombRange" aria-live="polite"><span class="gm-lo"></span><span class="gm-sep">～</span><span class="gm-hi"></span></div>
      <p class="gm-bomb-tip" id="gmBombTip"></p>
      <div class="gm-boom" aria-hidden="true">
        <span class="gm-boom-flash"></span>
        <svg class="gm-boom-burst" viewBox="-50 -50 100 100">
          <polygon class="gm-burst-1" points="${U(16,49,27,0)}"/>
          <polygon class="gm-burst-2" points="${U(14,37,21,11)}"/>
          <polygon class="gm-burst-3" points="${U(12,24,14,5)}"/>
          <circle class="gm-burst-4" r="9"/>
        </svg>
        ${Array.from({length:pt},(t,e)=>`<i style="--a:${Math.round(e*360/pt+e%2*9)}deg;--d:${e%3===0?46:e%3===1?38:30}vmin"></i>`).join("")}
      </div>
    </div>
    <div class="gm-turn" id="gmBombTurnBox">
      <button type="button" class="gm-pos-step" data-turn="-1" aria-label="上一位玩家">‹</button>
      <span class="gm-turn-text">当前玩家：<b id="gmBombTurn">1号</b></span>
      <button type="button" class="gm-pos-step" data-turn="1" aria-label="下一位玩家">›</button>
    </div>
    <div class="gm-row gm-row-tight">
      <input id="gmBombGuess" type="text" inputmode="numeric" maxlength="9" autocomplete="off" placeholder="输入猜的数字" aria-label="猜的数字">
      <button type="button" class="gm-btn gm-btn-main" id="gmBombGo">猜</button>
    </div>
    <p class="gm-msg" id="gmBombMsg" hidden></p>
    <div class="gm-chips" id="gmBombHist" aria-label="每次猜完的范围"></div>
    <div class="gm-actions">
      <button type="button" class="gm-mini" id="gmBombUndo">撤销一步</button>
      <button type="button" class="gm-mini" id="gmBombPeek" aria-pressed="false">偷看炸弹</button>
      <button type="button" class="gm-mini" id="gmBombCopy">复制播报</button>
    </div>
    ${z("gmBombSay","播报",{copy:!1})}`;function U(t,e,s,n){const o=[];for(let i=0;i<t*2;i++){const m=i%2?s:e*(1-i*7%5*.045),g=i/(t*2)*Math.PI*2+n*Math.PI/180;o.push(`${(Math.cos(g)*m).toFixed(1)},${(Math.sin(g)*m).toFixed(1)}`)}return o.join(" ")}const S=t=>{const e=String(t??"").normalize("NFKC").replace(/[\s,，]/g,"");return/^\d{1,9}$/.test(e)?Number(e):null};function yt(){const t=d.root,e=S(a(t,"#gmBombMin").value),s=S(a(t,"#gmBombMax").value),n=a(t,"#gmBombMsg");if(e===null||s===null)return setMsg(n,"范围请填整数");if(s<=e)return setMsg(n,"上限要比下限大");let o;if(a(t,"input[name=gmBombMode]:checked").value==="set"){if(o=S(a(t,"#gmBombSet").value),o===null||o<e||o>s)return setMsg(n,`指定的炸弹要在 ${e} 到 ${s} 之间（含两端）`)}else o=T(e,s);Object.assign(c,{lo:e,hi:s,lo0:e,hi0:s,bomb:o,guesses:[],over:!1,peek:!1,turn:1}),a(t,"#gmBombStage").classList.remove("is-boom","is-boomed"),d.root.closest(".games-card")?.classList.remove("is-shaking"),a(t,"#gmBombGuess").value="",setMsg(n,""),h()}const W=()=>!c.over&&c.hi-c.lo+1<=B;function ht(){const t=c.hi0-c.lo0+1,e=c.hi-c.lo+1;return t<=B||e<=B?1:clamp(1-Math.log(e-B+1)/Math.log(t-B+1),0,1)}function h(){const t=d.root,e=a(t,"#gmBombStage"),s=c.over?1:ht();e.style.setProperty("--heat",s.toFixed(3)),e.style.setProperty("--heat-pct",`${Math.round(s*100)}%`),e.classList.toggle("is-hot",!c.over&&s>=.6),e.classList.toggle("is-tense",W()),a(t,".gm-lo").textContent=c.lo,a(t,".gm-hi").textContent=c.hi,vt(),Ft(s),a(t,"#gmBombTip").textContent=c.over?`炸弹就是 ${c.bomb}！第 ${c.guesses.length} 次猜中`:`炸弹在范围里（含两端）· 已猜 ${c.guesses.length} 次`,a(t,"#gmBombHist").innerHTML=c.guesses.map((o,i)=>o.hit?`<span class="gm-chip is-hit" title="第 ${i+1} 次：${o.n} 就是炸弹">${o.n}</span>`:o.miss?`<span class="gm-chip is-miss" title="第 ${i+1} 次：${o.n} 不是炸弹">${o.n}</span>`:`<span class="gm-chip" title="第 ${i+1} 次猜 ${o.n}">${o.range[0]}～${o.range[1]}</span>`).join(""),a(t,"#gmBombUndo").disabled=!c.guesses.length;const n=a(t,"#gmBombPeek");n.textContent=c.peek||c.over?`炸弹：${c.bomb}`:"偷看炸弹",n.setAttribute("aria-pressed",String(c.peek)),n.disabled=c.over,a(t,"#gmBombGo").disabled=c.over,a(t,"#gmBombGuess").disabled=c.over,a(t,"#gmBombTurn").textContent=`${c.turn}号`,t.querySelectorAll("[data-turn]").forEach(o=>{o.disabled=c.over}),d.bombSay?.set(Xt())}function vt(){const t=d.root,e=a(t,"#gmBombRange"),s=a(t,"#gmBombStage").clientWidth-28;if(s<=0)return;const n=c.over?1:ht(),o=String(c.lo).length+String(c.hi).length,i=s/(o*.6+1.7),m=W()?i:Math.min(30+80*Math.pow(n,1.4),i*.85);e.style.fontSize=`${Math.round(Math.max(22,m))}px`}function Ft(t){const e=d.root,s=a(e,".gm-fuse"),n=c.over?0:6+94*(1-t);s.style.strokeDasharray=`${n} 100`;const o=a(e,".gm-spark");o.style.visibility=c.over?"hidden":"";try{const i=s.getPointAtLength(s.getTotalLength()*n/100);o.setAttribute("transform",`translate(${i.x.toFixed(1)} ${i.y.toFixed(1)})`)}catch{}}function ft(){const t=d.root;if(c.over)return;const e=a(t,"#gmBombGuess"),s=a(t,"#gmBombMsg"),n=S(e.value);if(n===null)return k(e,s,"请输入整数");if(n<c.lo||n>c.hi)return k(e,s,`要猜 ${c.lo} 到 ${c.hi} 之间的数（含两端）`);if(e.value="",n===c.bomb){c.guesses.push({n,hit:!0,turn:c.turn}),c.over=!0,setMsg(s,`${n} 就是炸弹，${c.turn}号中招，惩罚时间到～`),h(),Dt();return}const o=W(),i={lo:c.lo,hi:c.hi};n<c.bomb?c.lo=n:c.hi=n,c.guesses.push({n,...i,range:[c.lo,c.hi],miss:o,turn:c.turn}),c.turn=c.turn%c.players+1,setMsg(s,o?`${n}不是炸弹！`:`${n} 没炸！范围缩到 ${c.lo} ～ ${c.hi}`),h(),e.focus({preventScroll:!0})}function Kt(){const t=c.guesses.pop();t&&(t.turn&&(c.turn=t.turn),t.hit?(c.over=!1,a(d.root,"#gmBombStage").classList.remove("is-boom","is-boomed")):(c.lo=t.lo,c.hi=t.hi),setMsg(a(d.root,"#gmBombMsg"),`已撤销 ${t.n}`),h())}function Dt(){const t=a(d.root,"#gmBombStage");t.classList.remove("is-boom","is-boomed"),t.offsetWidth,t.classList.add("is-boom");const e=d.root.closest(".games-card");!prefersReducedMotion()&&e&&(e.classList.remove("is-shaking"),e.offsetWidth,e.classList.add("is-shaking"),setTimeout(()=>e.classList.remove("is-shaking"),700)),setTimeout(()=>{c.over&&t.classList.add("is-boomed")},1100)}function Xt(){const t=R("bomb")+"【数字炸弹】",e=c.guesses[c.guesses.length-1];return c.over?`${t}砰！炸弹就是 ${c.bomb}～`:e?.miss?`${t}${e.n}不是炸弹！`:`${t}现在的范围：${c.lo}～${c.hi}`}function zt(){d.bombSay.copy()}function k(t,e,s){setMsg(e,s),t.classList.remove("is-wrong"),t.offsetWidth,t.classList.add("is-wrong"),t.focus({preventScroll:!0})}function Vt(t){X(a(t,"[data-macro-slot=bomb]"),()=>"bomb"),d.bombSay=V(a(t,"#gmBombSay"),"播报");const e=a(t,"#gmBombSet");t.querySelectorAll("input[name=gmBombMode]").forEach(o=>o.addEventListener("change",()=>{t.querySelectorAll(".gm-seg label").forEach(i=>i.classList.toggle("is-active",i.contains(a(t,"input[name=gmBombMode]:checked")))),e.hidden=o.value!=="set"||!o.checked,e.hidden||e.focus()})),a(t,"#gmBombStart").addEventListener("click",yt),t.querySelectorAll("#gmBombMin, #gmBombMax, #gmBombSet").forEach(o=>o.addEventListener("keydown",i=>{i.key==="Enter"&&yt()})),a(t,"#gmBombGo").addEventListener("click",ft);const s=a(t,"#gmBombPlayers"),n=Number(storage.get(rt));Number.isInteger(n)&&n>=1&&n<=bt&&(c.players=n),s.value=c.players,s.addEventListener("input",()=>{const o=S(s.value);o===null||o<1||o>bt||(c.players=o,storage.set(rt,o),c.turn>o&&(c.turn=1),h())}),s.addEventListener("blur",()=>{s.value=c.players}),a(t,"#gmBombTurnBox").addEventListener("click",o=>{const i=o.target.closest("[data-turn]");!i||c.over||(c.turn=(c.turn-1+Number(i.dataset.turn)+c.players)%c.players+1,h())}),a(t,"#gmBombGuess").addEventListener("keydown",o=>{o.key==="Enter"&&ft()}),a(t,"#gmBombGuess").addEventListener("animationend",o=>o.target.classList.remove("is-wrong")),a(t,"#gmBombUndo").addEventListener("click",Kt),a(t,"#gmBombPeek").addEventListener("click",()=>{c.peek=!c.peek,h()}),a(t,"#gmBombCopy").addEventListener("click",zt),c.bomb=T(c.lo,c.hi),h()}const $t=new Map;for(let t=0;t+1<F.length;t+=2)$t.set(F[t],F[t+1]);const St=t=>Array.from(String(t??""),e=>$t.get(e)||e).filter(Gt).join(""),wt=[],j=new Map,H=new Map;function kt(t,e){for(const s of t.split(`
`)){const[n,o,i]=s.split("|");if(i)for(const m of i.trim().split(/\s+/)){if(j.has(m))continue;const g={text:m,author:n,title:o,tier:e};wt.push(g),j.set(m,g)}}H.clear()}kt(Ht,0);const Lt=t=>t.text.length>=4&&t.text.length<=9;function J(t,e=0){const s=t+e;return H.has(s)||H.set(s,wt.filter(n=>e?n.text[e-1]===t:n.text.includes(t))),H.get(s)}const Mt=(t,e=0)=>J(t,e).filter(Lt),Pt=t=>Array.from({length:Y},(e,s)=>s+1).filter(e=>!J(t,e).some(Lt)),Ut=mt.join(""),r={strict:!1,kw:"",pos:1,said:new Set,shown:new Set,cur:null,hintOn:!1,answerOn:!1},Wt=()=>`
    <div class="alarm-seg gm-seg gm-poem-mode" role="radiogroup" aria-label="飞花令玩法">
      <label><input type="radio" name="gmPoemMode" value="free">任意字序<small>简单版</small></label>
      <label><input type="radio" name="gmPoemMode" value="strict">严格字序<small>困难版</small></label>
    </div>
    ${D("poem")}
    <div class="gm-board" id="gmPoemBoard" role="group" aria-label="令字">
      ${mt.map((t,e)=>`<span class="gm-board-phrase">${[...t].map(s=>`<button type="button" class="gm-kw-btn" data-kw="${s}">${s}</button>`).join("")}<i aria-hidden="true">${e%2?"。":"，"}</i></span>`).join("")}
    </div>
    <div class="gm-board-tools">
      <button type="button" class="gm-mini" id="gmPoemRand">随机令字</button>
      <label class="gm-custom"><span>自定</span><input id="gmPoemCustom" type="text" maxlength="4" autocomplete="off" spellcheck="false" placeholder="字" aria-label="自定令字"></label>
    </div>
    <div class="gm-kw-now">
      <span class="gm-kw-big" id="gmPoemKw"></span>
      <div class="gm-kw-side">
        <div class="gm-pos" id="gmPoemPos">
          <button type="button" class="gm-pos-step" data-step="-1" aria-label="上一位">‹</button>
          <span class="gm-pos-text" id="gmPoemPosText"></span>
          <button type="button" class="gm-pos-step" data-step="1" aria-label="下一位">›</button>
        </div>
        <p class="gm-kw-info" id="gmPoemInfo"></p>
      </div>
    </div>
    <div class="gm-row">
      <input id="gmPoemInput" type="text" maxlength="40" autocomplete="off" spellcheck="false" placeholder="输入发言人的诗句" aria-label="要核对的诗句">
      <button type="button" class="gm-btn gm-btn-main" id="gmPoemCheck">核对</button>
    </div>
    <p class="gm-msg" id="gmPoemMsg" hidden></p>
    <div class="gm-confirm" id="gmPoemConfirm" hidden>
      <button type="button" class="gm-mini gm-btn-main" id="gmPoemYes">确认过关</button>
      <button type="button" class="gm-mini" id="gmPoemNo">不算</button>
    </div>
    <div class="gm-actions">
      <button type="button" class="gm-mini" id="gmPoemHint">提示</button>
      <button type="button" class="gm-mini" id="gmPoemAnswer">答案</button>
      <button type="button" class="gm-mini" id="gmPoemNext">下一位</button>
    </div>
    <div class="gm-hint" id="gmPoemHintBox" hidden></div>
    <div class="gm-answer" id="gmPoemAnswerBox" hidden></div>
    ${z("gmPoemSay","主持词")}
    <p class="gm-foot" id="gmPoemFoot"></p>`;function xt(){return Mt(r.kw,r.strict?r.pos:0)}function Et(){const t=xt();if(!t.length)return null;const e=t.filter(m=>!r.said.has(m.text)&&!r.shown.has(m.text)&&m!==r.cur),s=t.filter(m=>!r.said.has(m.text)&&m!==r.cur),n=e.length?e:s.length?s:t,o=n.filter(m=>m.tier===0),i=n.filter(m=>m.text.length===5||m.text.length===7);return randomItem(o.length?o:i.length?i:n)}const v=()=>R(r.strict?"poemHard":"poemEasy")||"/y ",A=()=>r.strict?`${v()}<t>轮到你接下句啦，只要是“${r.kw}”在第${y(r.pos)}位的诗句就行！`:`${v()}<t>轮到你接下句啦，只要是包含“${r.kw}”的诗句就行！`,f=(...t)=>d.poemSay?.set(t.join(`
`),!0);function Bt(t){const e=r.strict?r.pos:t.text.indexOf(r.kw)+1;f(`${v()}遇到困难了嘛，给个提示哦~在“${t.hint.join("、")}”这些字中拼出一句就行~`,`${v()}诗句是${y(t.text.length)}个字，"${r.kw}"是第${y(e)}个字~`)}function Z(t){w(null),r.kw=t,r.pos=1,r.said.clear(),r.shown.clear(),_(),setMsg(a(d.root,"#gmPoemMsg"),""),a(d.root,"#gmPoemInput").value="",x(),f(A())}function w(t){r.pending=t,a(d.root,"#gmPoemConfirm").hidden=!t,a(d.root,"#gmPoemMsg").classList.toggle("is-ask",!!t)}function _(){r.cur=null,r.hintOn=!1,r.answerOn=!1}function At(){const t=[...Ut].filter(e=>(r.strict?!Pt(e).length:J(e).length>=5)&&e!==r.kw);Z(randomItem(t))}function Q(t){w(null),r.pos=(t-1+Y)%Y+1,_(),x(),f(A())}const _t=t=>`第${y(t)}位 · 令字在第${y(t)}字`;function x(){const t=d.root,e=r.kw;a(t,"#gmPoemKw").textContent=e,t.querySelectorAll(".gm-poem-mode label").forEach(o=>o.classList.toggle("is-active",a(o,"input").checked)),t.querySelectorAll(".gm-kw-btn").forEach(o=>{const i=r.strict?Pt(o.dataset.kw):[];o.classList.toggle("is-on",o.dataset.kw===e),o.classList.toggle("is-partial",i.length>0),o.title=i.length?`严格字序下第 ${i.join("、")} 字暂无收录`:`题库里有 ${Mt(o.dataset.kw).length} 句`}),a(t,"#gmPoemPos").hidden=!r.strict,a(t,"#gmPoemPosText").textContent=_t(r.pos);const s=xt().length,n=r.strict?`「${e}」在第${y(r.pos)}字的`:`含「${e}」的`;a(t,"#gmPoemInfo").textContent=s?`题库里有 ${s} 句${n}诗词`:`题库里暂时没有${n}诗词，提示和答案用不了，可以只用核对`,a(t,"#gmPoemInfo").classList.toggle("is-empty",!s),a(t,"#gmPoemHint").disabled=!s,a(t,"#gmPoemAnswer").disabled=!s,a(t,"#gmPoemFoot").textContent=r.said.size?`本局已核对通过 ${r.said.size} 句，重复的会提醒`:"",tt()}function tt(){const t=d.root,e=a(t,"#gmPoemHintBox"),s=a(t,"#gmPoemAnswerBox"),n=r.cur;if(e.hidden=!(r.hintOn&&n),s.hidden=!(r.answerOn&&n),!!n){if(r.hintOn){Jt(n);const o=r.strict?`，「${r.kw}」在第${y(r.pos)}个`:"";e.innerHTML=`<p class="gm-hint-note">从下面这些字里拼一句（共 ${n.text.length} 个字${o}，点字可以填进输入框）：</p><div class="gm-hint-chars">${n.hint.map(i=>`<button type="button" class="gm-char" data-ch="${escapeHtml(i)}">${escapeHtml(i)}</button>`).join("")}</div>`}if(r.answerOn){const o=[...n.text].map((i,m)=>i===r.kw&&(!r.strict||m===r.pos-1)?`<b>${escapeHtml(i)}</b>`:escapeHtml(i)).join("");s.innerHTML=`<p class="gm-answer-line">${o}</p><p class="gm-answer-src">—— ${escapeHtml(n.author)}《${escapeHtml(n.title)}》</p><div class="gm-answer-btns"><button type="button" class="gm-mini" data-act="swap">换一句</button><button type="button" class="gm-mini" data-act="copy">复制</button></div>`}}}function Jt(t){if(!t.hint){const s=[...new Set(t.text)].slice(0,dt),n=[...new Set(Nt)].filter(o=>!s.includes(o));for(;s.length<dt&&n.length;)s.push(n.splice(T(0,n.length-1),1)[0]);t.hint=K(s)}return t.hint}function Ct(t){r.cur||(r.cur=Et()),r.cur&&(r.shown.add(r.cur.text),t==="hint"?r.hintOn=!0:r.answerOn=!0,tt(),t==="hint"&&Bt(r.cur))}function Zt(){const t=Et();if(!t||t===r.cur)return showToast("这一位题库里只有这一句");r.cur=t,r.shown.add(t.text),tt(),r.hintOn&&Bt(t)}function Qt(t){const e=[];for(const s of String(t).split(/[\s,，.。!！?？;；:：、"“”'‘’《》〈〉「」『』()（）·…—\-]+/)){const n=St(s);n&&((n.length===10||n.length===14)&&!j.has(n)?e.push(n.slice(0,n.length/2),n.slice(n.length/2)):e.push(n))}return e}function Ot(){const t=d.root,e=a(t,"#gmPoemInput"),s=a(t,"#gmPoemMsg"),n=e.value,o=r.kw;if(s.classList.remove("is-ok"),w(null),/[A-Za-z0-9]/.test(n))return k(e,s,"只能填汉字和标点");const i=Qt(n);if(!i.length)return k(e,s,"先输入发言人的诗句");const m=i.filter(p=>p.includes(o));if(!m.length)return f(`${v()}这句里好像没有“${o}”字呢，要不换一句？`),k(e,s,`这句里没有「${o}」字${r.strict?"":"（用的是「"+o+"」的意象的话，请主持人判断）"}`);if(m.some(p=>r.said.has(p)))return f(`${v()}这句前面已经有人说过啦，要不换一句？`),k(e,s,"这句本局已经有人说过了");let g=m[0];if(r.strict){const p=m.find(b=>b[r.pos-1]===o);if(!p){const b=[...m[0]].map((at,C)=>at===o?y(C+1):"").filter(Boolean);return f(`${v()}这一位的“${o}”要在第${y(r.pos)}个字哦，要不换一句？`),k(e,s,`这一位「${o}」要在第${y(r.pos)}个字，这句在第${b.join("、")}个字`)}g=p}const u=i.map(p=>j.get(p)).find(p=>p&&p.text.includes(o)&&(!r.strict||p.text[r.pos-1]===o));if(!u){w(g),setMsg(s,"请主持人确认是否是诗句");return}Tt(u.text,`出自${u.author}《${u.title}》`,`${v()}接上啦！这句诗词出自${u.author}的《${u.title}》`)}function Tt(t,e,s){const n=d.root,o=a(n,"#gmPoemInput"),i=a(n,"#gmPoemMsg");if(r.said.add(t),o.value="",r.strict){const m=r.pos;Q(r.pos+1),setMsg(i,`✓ 第${y(m)}位过关，${e}。轮到${_t(r.pos)}`)}else r.cur?.text===t&&_(),x(),setMsg(i,`✓ 过关，${e}`);f(s,A()),i.classList.add("is-ok"),o.focus({preventScroll:!0})}function te(t){w(null),r.strict=t,storage.set(lt,t?"strict":"free"),d.root.querySelectorAll("input[name=gmPoemMode]").forEach(e=>{e.checked=e.value==="strict"===t}),d.reloadPoemMacro?.(),r.pos=1,_(),setMsg(a(d.root,"#gmPoemMsg"),""),x(),f(A())}function ee(t){d.reloadPoemMacro=X(a(t,"[data-macro-slot=poem]"),()=>r.strict?"poemHard":"poemEasy"),d.poemSay=V(a(t,"#gmPoemSay"),"主持词"),t.querySelectorAll("input[name=gmPoemMode]").forEach(o=>o.addEventListener("change",()=>te(o.value==="strict"))),a(t,"#gmPoemBoard").addEventListener("click",o=>{const i=o.target.closest(".gm-kw-btn");i&&Z(i.dataset.kw)}),a(t,"#gmPoemRand").addEventListener("click",At);const e=a(t,"#gmPoemCustom"),s=()=>{const o=[...St(e.value)][0];o&&(e.value="",Z(o))};e.addEventListener("keydown",o=>{o.key==="Enter"&&!o.isComposing&&s()}),e.addEventListener("change",s),a(t,"#gmPoemPos").addEventListener("click",o=>{const i=o.target.closest("[data-step]");i&&(setMsg(a(t,"#gmPoemMsg"),""),Q(r.pos+Number(i.dataset.step)))}),a(t,"#gmPoemNext").addEventListener("click",()=>{if(setMsg(a(t,"#gmPoemMsg"),""),r.strict)return Q(r.pos+1);w(null),_(),x(),f(A())}),a(t,"#gmPoemCheck").addEventListener("click",Ot),a(t,"#gmPoemYes").addEventListener("click",()=>{const o=r.pending;o&&(w(null),Tt(o,"主持人确认是诗句",`${v()}接上啦！`))}),a(t,"#gmPoemNo").addEventListener("click",()=>{w(null),setMsg(a(t,"#gmPoemMsg"),"主持人判定不是诗句，不算过关"),f(`${v()}好像第一次听说这句诗句呢，要不换一句？`)});const n=a(t,"#gmPoemInput");n.addEventListener("keydown",o=>{o.key==="Enter"&&!o.isComposing&&Ot()}),n.addEventListener("animationend",()=>n.classList.remove("is-wrong")),a(t,"#gmPoemHint").addEventListener("click",()=>Ct("hint")),a(t,"#gmPoemAnswer").addEventListener("click",()=>Ct("answer")),a(t,"#gmPoemHintBox").addEventListener("click",o=>{const i=o.target.closest(".gm-char");i&&(n.value+=i.dataset.ch,n.focus({preventScroll:!0}))}),a(t,"#gmPoemAnswerBox").addEventListener("click",o=>{const i=o.target.closest("[data-act]");!i||!r.cur||(i.dataset.act==="swap"?Zt():copyText(`${R(r.strict?"poemHard":"poemEasy")}${r.cur.text}——${r.cur.author}《${r.cur.title}》`,"已复制","复制失败"))}),r.strict=storage.get(lt)==="strict",t.querySelectorAll("input[name=gmPoemMode]").forEach(o=>{o.checked=o.value==="strict"===r.strict}),d.reloadPoemMacro(),At()}const se=It.split(`
`).map(t=>{const[e,s,n]=t.split("|");return{kind:e,name:s,words:n.trim().split(/\s+/)}}),l={kind:"",civ:"",spy:"",group:null,hidden:!1,recent:[],players:6,spies:2,spiesSet:!1,roles:[],alive:[],outAt:[],round:1,phase:"setup",cands:null,votes:[],tally:null},oe=40,et=4,st=30,Rt=t=>t<=5?1:2,ne=()=>`
    ${D("spy")}
    <div class="gm-spy-kind">
      <label class="gm-label" for="gmSpyKind">词语类型</label>
      <select id="gmSpyKind">
        <option value="">全部类型</option>
        ${gt.map(([t,e])=>`<option value="${t}">${e}</option>`).join("")}
      </select>
    </div>
    <div class="gm-spy-cards" id="gmSpyCards">
      <div class="gm-spy-card is-civ">
        <span class="gm-spy-role">平民词</span>
        <span class="gm-spy-word" id="gmSpyCiv"></span>
        <button type="button" class="gm-mini" data-copy="civ">复制</button>
      </div>
      <div class="gm-spy-card is-spy">
        <span class="gm-spy-role">卧底词</span>
        <span class="gm-spy-word" id="gmSpySpy"></span>
        <button type="button" class="gm-mini" data-copy="spy">复制</button>
      </div>
    </div>
    <div class="gm-actions">
      <button type="button" class="gm-btn gm-btn-main" id="gmSpyNext">换一组词</button>
      <button type="button" class="gm-mini" id="gmSpySwap">交换</button>
      <button type="button" class="gm-mini" id="gmSpyHide" aria-pressed="false">遮住</button>
    </div>
    <div class="gm-setup gm-spy-setup">
      <div class="gm-setup-players">
        <label class="gm-label" for="gmSpyPlayers">玩家</label>
        <input id="gmSpyPlayers" class="gm-num gm-num-s" type="text" inputmode="numeric" maxlength="2" aria-label="玩家人数">
        <span class="gm-label">人</span>
      </div>
      <div class="gm-setup-players">
        <label class="gm-label" for="gmSpySpies">卧底</label>
        <input id="gmSpySpies" class="gm-num gm-num-s" type="text" inputmode="numeric" maxlength="2" aria-label="卧底人数">
        <span class="gm-label">人</span>
      </div>
      <button type="button" class="gm-btn" id="gmSpyDeal">分配身份</button>
    </div>
    <p class="gm-msg" id="gmSpyMsg" hidden></p>
    <p class="gm-spy-status" id="gmSpyStatus" hidden></p>
    <div class="gm-spy-players" id="gmSpyList"></div>
    <div class="gm-actions" id="gmSpyRound" hidden>
      <button type="button" class="gm-btn gm-btn-main" id="gmSpyVoteStart">描述完毕，开始投票</button>
      <button type="button" class="gm-btn gm-btn-main" id="gmSpyVoteGo">确认投票</button>
    </div>
    ${z("gmSpySay","主持词",{placeholder:"分配身份后，这里会按游戏进度给出主持词"})}
    <p class="gm-foot">分配身份后，把每位玩家的词私聊发给 ta（卧底发卧底词）。每轮描述完投票，得票最多的出局；平票的几人再描述一次，只在这几人里重投。剩三人（含卧底）时卧底获胜，卧底全部出局则平民获胜。</p>`;function ae(t){let e=Math.random()*t.reduce((s,n)=>s+Math.sqrt(n.words.length),0);return t.find(s=>(e-=Math.sqrt(s.words.length))<0)||t[t.length-1]}function ot(){const t=se.filter(e=>!l.kind||e.kind===l.kind);for(let e=0;e<30;e++){const s=ae(t),[n,o]=K(s.words),i=[n,o].sort().join("|");if(!(l.recent.includes(i)&&e<29)){l.recent=[i,...l.recent].slice(0,oe),Object.assign(l,{civ:n,spy:o,group:s});break}}L(!0)}const E=()=>R("spy")||"/p ",N=(...t)=>d.spySay?.set(t.join(`
`),!0),I=t=>l.roles[t]?"卧底":"平民",G=()=>l.roles.map((t,e)=>e).filter(t=>l.alive[t]),ie=t=>(l.cands||G()).filter(e=>e!==t&&l.alive[e]);function jt(){const t=d.root,e=a(t,"#gmSpyMsg"),s=S(a(t,"#gmSpyPlayers").value),n=S(a(t,"#gmSpySpies").value);if(e.classList.remove("is-ok"),s===null||s<et||s>st)return setMsg(e,`玩家人数请填 ${et}～${st}（剩三人时游戏就结束了）`);if(n===null||n<1)return setMsg(e,"卧底至少 1 人");if(n>=s)return setMsg(e,"卧底人数要比玩家人数少");l.players=s,l.spies=n,storage.set(ct,s);const o=new Set(K(Array.from({length:s},(i,m)=>m)).slice(0,n));Object.assign(l,{roles:Array.from({length:s},(i,m)=>o.has(m)),alive:Array(s).fill(!0),outAt:Array(s).fill(0),round:1,phase:"describe",cands:null,votes:Array(s).fill(""),tally:null}),setMsg(e,""),L(!1),N(`${E()}现在进入第${l.round}轮描述~`)}function le(){l.phase==="describe"&&(Object.assign(l,{phase:"vote",cands:null,votes:Array(l.players).fill(""),tally:null}),L(!1),N(`${E()}经过了${l.round}轮的描述，现在大家投票选出怀疑是卧底的那个人吧~`))}function re(){if(l.phase!=="vote")return;const t=a(d.root,"#gmSpyMsg"),e=Array(l.players).fill(0);G().forEach(p=>{const b=l.votes[p];b!==""&&l.alive[b]&&(e[b]+=1)});const s=Math.max(...e);if(t.classList.remove("is-ok"),!s)return setMsg(t,"还没有人投票：在每位玩家下面选好投给谁，再点「确认投票」");setMsg(t,""),l.tally=e;const n=e.map((p,b)=>p===s?b:-1).filter(p=>p>=0);if(n.length>1){Object.assign(l,{cands:n,votes:Array(l.players).fill("")}),L(!1),N(`${E()}看起来有${n.length}名玩家都得到最多的票数呢，现在需要你们轮流再进行一轮描述，然后大家在这几人的范围内再次投票哦~`);return}const o=n[0];l.alive[o]=!1,l.outAt[o]=l.round;const i=[`${E()}<t>看来是本轮被怀疑最多的玩家，虽然很不舍但是只能淘汰啦！ta的身份是${I(o)}。`],m=G(),u=m.filter(p=>l.roles[p]).length?m.length<=3?"卧底":"":"平民";u?(Object.assign(l,{phase:"over",cands:null,winner:u}),i.push(`${E()}游戏结束啦，恭喜${u}身份获胜！本轮的平民词是${l.civ}，卧底词是${l.spy}！`)):(Object.assign(l,{phase:"describe",cands:null,round:l.round+1}),i.push(`${E()}现在进入第${l.round}轮描述~`)),L(!1),N(...i),setMsg(t,u?`${o+1}号出局（${I(o)}），${u}获胜！`:`${o+1}号出局（${I(o)}）`),t.classList.add("is-ok")}function L(t){const e=d.root;a(e,"#gmSpyCiv").textContent=l.civ,a(e,"#gmSpySpy").textContent=l.spy;const s=a(e,"#gmSpyCards");s.classList.toggle("is-hidden",l.hidden);const n=a(e,"#gmSpyHide");n.textContent=l.hidden?"显示":"遮住",n.setAttribute("aria-pressed",String(l.hidden)),t&&!prefersReducedMotion()&&(s.classList.remove("is-flip"),s.offsetWidth,s.classList.add("is-flip")),ce()}function ce(){const t=d.root,e=l.phase!=="setup",s=a(t,"#gmSpyStatus"),n=G();s.hidden=!e,s.textContent=e?l.phase==="over"?`游戏结束 · ${l.winner}获胜 · 共 ${l.round} 轮`:`第 ${l.round} 轮 · ${l.phase==="describe"?"描述中":l.cands?`平票重投（${l.cands.map(i=>`${i+1}号`).join("、")}）`:"投票中"} · 剩 ${n.length} 人（卧底 ${n.filter(i=>l.roles[i]).length} 人）`:"";const o=l.phase==="vote";a(t,"#gmSpyList").classList.toggle("is-hidden",l.hidden),a(t,"#gmSpyList").innerHTML=e?l.roles.map((i,m)=>{const g=!l.alive[m],u=i?l.spy:l.civ,p=l.tally&&l.tally[m]?`<span class="gm-spy-p-votes">${l.tally[m]} 票</span>`:"",b=o&&!g?`<select class="gm-spy-vote" data-vote="${m}" aria-label="${m+1}号投给谁"><option value="">投给…</option>${ie(m).map(C=>`<option value="${C}"${l.votes[m]===C?" selected":""}>${C+1}号</option>`).join("")}</select>`:"",at=o&&l.cands&&l.cands.includes(m)?" is-cand":"";return`<div class="gm-spy-p${i?" is-spy":""}${g?" is-out":""}${at}"><div class="gm-spy-p-head"><b>${m+1}号</b><span class="gm-spy-p-role">${I(m)}</span>${p}</div><span class="gm-spy-p-word">${escapeHtml(u)}</span>`+(g?`<span class="gm-spy-p-out">第${y(l.outAt[m])}轮出局</span>`:`<button type="button" class="gm-mini" data-copy-p="${m}">复制词</button>`)+b+"</div>"}).join(""):"",a(t,"#gmSpyRound").hidden=!e||l.phase==="over",a(t,"#gmSpyVoteStart").hidden=l.phase!=="describe",a(t,"#gmSpyVoteGo").hidden=l.phase!=="vote",a(t,"#gmSpyDeal").textContent=e?"重新分配身份":"分配身份"}function me(t){X(a(t,"[data-macro-slot=spy]"),()=>"spy"),d.spySay=V(a(t,"#gmSpySay"),"主持词");const e=a(t,"#gmSpyKind"),s=storage.get(q);gt.some(([g])=>g===s)&&(l.kind=s),e.value=l.kind,e.addEventListener("change",()=>{l.kind=e.value,l.kind?storage.set(q,l.kind):storage.remove(q),ot()}),a(t,"#gmSpyNext").addEventListener("click",ot),a(t,"#gmSpySwap").addEventListener("click",()=>{[l.civ,l.spy]=[l.spy,l.civ],L(!0)}),a(t,"#gmSpyHide").addEventListener("click",()=>{l.hidden=!l.hidden,L(!1)}),a(t,"#gmSpyCards").addEventListener("click",g=>{const u=g.target.closest("[data-copy]");if(!u)return;if(l.hidden)return showToast("先点「显示」再复制");const p=u.dataset.copy==="civ"?l.civ:l.spy;copyText(p,`已复制${u.dataset.copy==="civ"?"平民":"卧底"}词「${p}」`,"复制失败")}),a(t,"#gmSpyCards").addEventListener("animationend",g=>g.currentTarget.classList.remove("is-flip"));const n=a(t,"#gmSpyPlayers"),o=a(t,"#gmSpySpies"),i=Number(storage.get(ct));Number.isInteger(i)&&i>=et&&i<=st&&(l.players=i),l.spies=Rt(l.players),n.value=l.players,o.value=l.spies,n.addEventListener("input",()=>{const g=S(n.value);g===null||l.spiesSet||(o.value=Rt(g))}),o.addEventListener("input",()=>{l.spiesSet=o.value.trim()!==""}),[n,o].forEach(g=>g.addEventListener("keydown",u=>{u.key==="Enter"&&jt()})),a(t,"#gmSpyDeal").addEventListener("click",jt),a(t,"#gmSpyVoteStart").addEventListener("click",le),a(t,"#gmSpyVoteGo").addEventListener("click",re);const m=a(t,"#gmSpyList");m.addEventListener("change",g=>{const u=g.target.closest("[data-vote]");u&&(l.votes[Number(u.dataset.vote)]=u.value===""?"":Number(u.value))}),m.addEventListener("click",g=>{const u=g.target.closest("[data-copy-p]");if(!u)return;if(l.hidden)return showToast("先点「显示」再复制");const p=Number(u.dataset.copyP),b=l.roles[p]?l.spy:l.civ;copyText(b,`已复制${p+1}号的词「${b}」`,"复制失败")}),ot()}function nt(t){d.tab=M.some(e=>e.id===t)?t:"bomb",storage.set(it,d.tab),d.root.querySelectorAll(".gm-tab").forEach(e=>{const s=e.dataset.tab===d.tab;e.classList.toggle("is-active",s),e.setAttribute("aria-selected",String(s)),e.tabIndex=s?0:-1}),d.root.querySelectorAll(".gm-panel").forEach(e=>{e.hidden=e.dataset.game!==d.tab}),d.says?.forEach(e=>e()),d.tab==="bomb"&&requestAnimationFrame(()=>h())}function de(){if(d.built)return;const t=$("gamesRoot");d.root=t,t.innerHTML=`
      <div class="gm-tabs" role="tablist" aria-label="小游戏">
        ${M.map(s=>`<button type="button" class="tab-btn gm-tab" role="tab" id="gmTab-${s.id}" aria-controls="gmPanel-${s.id}" data-tab="${s.id}">${s.label}</button>`).join("")}
      </div>
      <section class="gm-panel" id="gmPanel-bomb" data-game="bomb" role="tabpanel" aria-labelledby="gmTab-bomb" hidden>${Yt()}</section>
      <section class="gm-panel" id="gmPanel-poem" data-game="poem" role="tabpanel" aria-labelledby="gmTab-poem" hidden>${Wt()}</section>
      <section class="gm-panel" id="gmPanel-spy" data-game="spy" role="tabpanel" aria-labelledby="gmTab-spy" hidden>${ne()}</section>`,d.built=!0;const e=a(t,".gm-tabs");e.addEventListener("click",s=>{const n=s.target.closest(".gm-tab");n&&nt(n.dataset.tab)}),e.addEventListener("keydown",s=>{const n={ArrowRight:1,ArrowLeft:-1}[s.key];if(!n)return;const o=M.findIndex(m=>m.id===d.tab),i=M[(o+n+M.length)%M.length].id;nt(i),$(`gmTab-${i}`).focus()}),[["bomb",Vt],["poem",ee],["spy",me]].forEach(([s,n])=>{try{n($(`gmPanel-${s}`))}catch(o){console.error(o)}}),typeof ResizeObserver=="function"&&(new ResizeObserver(()=>vt()).observe($("gmBombStage")),new ResizeObserver(()=>d.says?.forEach(s=>s())).observe(t)),nt(storage.get(it))}function ge(){d.extraLoading||(d.extraLoading=loadLateScript("games-poems.js",()=>typeof window.HJGamesPoems=="string",{load:"corner"}).then(()=>{kt(window.HJGamesPoems,1),r.kw&&x()},()=>{d.extraLoading=null}))}function ue(){de(),requestAnimationFrame(()=>d.says?.forEach(t=>t())),ge(),d.tab==="bomb"&&requestAnimationFrame(()=>h())}function pe(){$("gamesOverlay").hidden=!0}window.HJGames={open:ue,close:pe}})();
