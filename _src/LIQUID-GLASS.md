# 液态玻璃效果设计方案

本站的「玻璃」分四层，各管一类东西，互不重叠。新加界面时先找到它属于哪一类，直接套用，不要另起一套。

| 层 | 用在 | 代码位置（`style.css`） | 变量前缀 |
| --- | --- | --- | --- |
| 窗口卡片与首页磁贴的透光边 | `.info-box`、`.gate-card`、`.admin-modal`、`.tile` 与日历 / 闹铃 / 吟游诗人等小组件 | 「液态玻璃边缘：窗口卡片与首页磁贴」 | `--lg-` |
| 凸起玻璃按钮 | 小按钮、选项、分段控件 | 设计变量 `--glass-up` / `--glass-on` / `--glass-sheen`，按下反馈在「18. 按下反馈」 | `--glass-` |
| 输入栏（带折射） | 卡片里的输入框、下拉框、文本域 | 「31. 液态玻璃」① | `--lq-` |
| 扁平框（淡玻璃） | 卡片里一块块放文字的框：介绍框、词卡、条目、提示框… | 「31. 液态玻璃」② | `--lq-pane-` |
| 真折射（动画「完整」时） | 扁平框、文本域、页头圆按钮、问卷选项 | 「31. 液态玻璃」③ + `main.js`「9b」 | `--lq-refract`、`--lq-rest` |

下面说的是后两层（第 31 节），也就是这次统一过的部分。

## 设计目标

1. **看起来是一块玻璃**：边缘有光（描边顶部、底部最亮，中间最柔），浮起来一点点（轻投影），里面一圈透光（扁平框整圈一样厚；输入栏下缘再多一点内阴影）。
2. **文字绝对清楚**：玻璃效果只加在边缘和底色上，框里的字号、颜色、对比度一律不动；大块的框不用 `backdrop-filter`。
3. **昼夜各一套，自动切换**：所有颜色都是变量，`body.day-mode` 里整套换掉，规则本身不写颜色。
4. **原有的状态色照旧**：卧底卡的暖色、出错的红色、强调的紫色…… 玻璃只是叠在上面，不吃掉它们。

## 共同的玻璃语言

| 部分 | 做法 | 夜晚 | 白天 |
| --- | --- | --- | --- |
| 描边 | 1px，竖直方向的对称渐变：顶部、底部最亮，中间最柔；渐变跨越大半个高度，所以和圆角弧线慢慢相交，圆角处不会出现斜的「断口」 | 白色 .30 → .17 → .30（`--lq-edge`） | 白 → 金 → 白（`--lq-edge`；扁平框用淡一档的 `--lq-pane-edge-base`） |
| 强调描边 | 同上，换颜色 | 紫（`--lq-edge-hi`） | 深金（`--lq-edge-hi`） |
| 金色描边 | 卧底、统计总览、比赛、大号令字 | 暖金 .60 → .36（`--lq-edge-gold`） | 白 → 深金（`--lq-edge-gold`） |
| 出错描边 | 校验失败、必答题没答、猜中范围 | 暖红（`--lq-edge-err`） | 白 → 砖红（`--lq-edge-err`） |
| 外投影 | 两层：贴身 1–2px + 散开 3–8px，强度约为按钮（`--glass-up-shadow`）的一半，所以框「浮起一点点」、仍明显低于按钮 | 深紫黑（`--lq-drop`） | 棕金（`--lq-drop`） |
| 底缘厚度 | `inset 0 -1px 2px` | `--lq-shade` | `--lq-shade` |
| 聚焦 | 不换描边（渐变不能过渡，一换就跳），只在外面加 3px 柔光：`--lq-ring` ← `--lq-focus-ring` | 淡紫 .15（以前 .30 在深底上太亮） | 琥珀 .30 |

## ① 输入栏：带折射的玻璃

- 选择器：`.gate-card`、`.about-form`、`.alarm-card` 里的 `input`（不含勾选框、单选、滑块、文件、取色）、`select`、`textarea`。
- 填充：`--lq-fill`（夜 `rgba(36,29,60,.74)`、白天 `rgba(246,227,187,.82)`），留一点透明，背景才折得动。
- 描边：`background-clip` 双层——`padding-box` 铺填充、`border-box` 铺描边渐变，边框本身是透明的 1px。下拉框在最上面再叠一层箭头（`--lq-arrow`）。
- 折射：`backdrop-filter: url(#lgf) blur(1.5px) contrast(1.2) brightness(1.05) saturate(1.1)`。`#lgf` 是 `index.html` 开头 `<svg id="lg-map">` 里的滤镜：一张 8 × 64 的位移贴图（`feImage`）按 `objectBoundingBox` 拉伸，`feDisplacementMap` 只在上下缘把背景往里「折」，中间不动，所以任何尺寸的栏都能用同一个滤镜，不需要 JS。
- 文本域例外：不用折射，只留 `blur(1.5px) saturate(1.1)`；描边用 `--lq-edge-convex`（顶边最亮、往下渐暗，底边不回亮），里面叠 `--lq-area-sheen`（上亮下暗）和上缘一道细高光 `--lq-area-hi`。文本域有好几行高，折射按栏高等比放大，上下缘会被拉出很宽的亮带、中间偏暗，看着像往里凹；改成「光从上面来」以后是凸起的玻璃。
- 兼容：Firefox 不支持 `backdrop-filter` 引用 SVG 滤镜，退化成「半透明、无模糊无折射」，底色与文字不受影响。

## ② 扁平框：淡玻璃

- 不改原来的底色（`background-color`），只加：
  - **光泽**：`background-image: var(--lq-pane-sheen)`，很淡、只是上面比下面稍亮一点。夜晚是薰衣草白（.05 → .02），白天是白色（.24 → .10）。底色本身就是渐变的框（`.pz-contest`、`.gm-kw-big`、`.gm-bomb-stage`）不加这层，保留自己的底色。
  - **描边**：1px 的真边框，整圈同一个颜色（夜晚白色 .20，白天淡金 .72；状态色 `--lq-pane-edge-gold` / `-hi` / `-err` 也都是纯色）。浏览器画圆角边框时四边和四角的抗锯齿一致，粗细看起来一样。以前用 `::before` + `mask` 抠出一圈渐变描边，上下缘发白、四角变暗，后来又贴着它加了一道 1px 的内线，直边上两条并成 2px、圆角处两条弧线对不齐，看起来「边比角厚」，所以改成了现在这样。
  - **投影 + 立体感**：`box-shadow: var(--lq-pane-lift), var(--lq-pane-glow)`。`--lq-pane-lift` 是比输入栏略重的两层投影；`--lq-pane-glow` 有四层：上缘一道细高光 `inset 0 1px 0`（偏移出来的，到圆角自然收细，所以不会「边比角厚」）、下缘一道很淡的反光 `inset 0 -1px 0`、下缘里面一点内阴影当厚度 `inset 0 -7px 10px -8px`、整圈均匀的柔光 `inset 0 0 14px`。不要再加用 spread 撑出来的整圈细线（`inset 0 0 0 1px`）：它和边框在直边上并成 2px、在圆角处又对不齐，看着就是边比角厚。
- **不用 `backdrop-filter`**：以前这类框也套了 `url(#lgf) blur(1.5px)`。滤镜的位移按框的尺寸等比放大，大框的背景被拉扯得很厉害，再加上模糊，整块看起来都是虚的；滚动时每帧还要重算。现在去掉以后，框里的字和框外一样清楚。
- **状态描边**：在元素上设 `--lq-pane-edge`（金色 / 强调 / 出错）；边框颜色用 `var(--lq-pane-edge, var(--lq-pane-edge-base))`。每个框自己先把 `--lq-pane-edge` 设成 `initial`，状态色只给自己，不会传给里面嵌套的框。
- **卧底的保密**：「遮住」身份时（`.gm-spy-players.is-hidden`），卧底玩家卡的描边改回普通的，避免金边露馅（以前的版本这里会漏）。
- **原有外圈**：平票候选的 2px 外圈、大号令字的内圈，和玻璃投影写在同一条 `box-shadow` 里，两者都在。

### 名单

在 `style.css` 第 31 节②：

- 网站说明：`.about-list`（介绍框）、`.about-share-text`（分享文字）、`.fb-item`（反馈列表）
- 通用：`.empty-note`（空状态）、`.shop-item`（活动详情的店家一览）
- 购票：`.ticket-stock`、`.ticket-result-list`、`.ticket-lookup-item`、`.tas-item`；购票须知 `.guide-price`、`.guide-way`
- 闹铃：`.alarm-item`
- 场地登记：`.venue-edit`
- 活动问卷：`.survey-draft-note`、`.survey-q.is-card`；统计 `.sv-overview`、`.sv-stat`、`.sv-texts li`
- 购票管理：`.ta-group`、`.ta-round`
- 花语：`.huayu-result`
- 舞台演奏统计：`.st-perf-row ul`
- 花街拼图：`.pz-resume`、`.pz-contest`、`.pz-rec-list li`、`.pz-code`
- 小游戏助手：`.gm-macro`（规则宏）、`.gm-say`（播报 / 主持词）、`.gm-hint`、`.gm-answer`、`.gm-spy-card`（平民词 / 卧底词）、`.gm-spy-p`（玩家卡）、`.gm-chip`（范围小签）、`.gm-kw-big`（大号令字）、`.gm-bomb-stage`（数字炸弹舞台）
- 人机验证：`.vc-rules`（仙人微彩规则说明）

### 刻意不加的

| 元素 | 原因 |
| --- | --- |
| `.ta-guide-preview`、`.ticket-table-wrap` | 管理页的预览框和表格外框，暂时没放进名单（现在描边是真边框，加进去也没问题） |
| `.venue-note` | 左边 3px 的强调竖条是它的样式，套描边会和竖条打架 |
| `.guide-actions` | 购票须知底部的操作栏，是一条带上边线的底栏，不是框 |
| `.site-popup-image`、`.info-gallery-grid img` | 图片框 |
| `.bard-tip`、`.pz-chip`、`.pz-tool` | 浮在画面上的提示 / 拼图工具，底色要压住下面的图 |
| 舞台演奏（`.hjs-*`） | 全屏游戏界面，固定夜间配色，有自己的一套玻璃（`--glass-up`、`.hjs-card`） |
| 仙人微彩台面（`.vc-game`） | 还原游戏窗口：半透明黑色遮罩，不是玻璃 |

## ③ 动画「完整」时的真折射

照 `liquid-glass-button` 演示的做法：按**每个元素的实际尺寸和圆角**单独生成一张位移贴图，交给 SVG `feDisplacementMap`，用 `backdrop-filter: url(#…)` 引用。代码在 `main.js`「9b. 液态玻璃折射」，样式在 `style.css` 第 31 节③。

- **范围**：第 31 节②名单里的扁平框、卡片里的文本域，加上页头的圆按钮（昼夜、动画、音量、时间条、「更多」及其里面的按钮）、问卷 / 场地登记的选项（`.venue-choice`、`.survey-scale-opt span`）。单行输入框仍用 ① 的公用滤镜 `#lgf`。
- **只折边缘**：位移只在贴边 `LQ.bevel` = 10 像素内（小按钮最多到半径），方向是朝里的法线（由圆角矩形的距离场算出），最多吸进 `LQ.push` = 6 像素，用 smoothstep 过渡；中间完全不动。和 `#lgf` 不同，这是按像素算的，框再大折射带也一样宽，所以大框不会发虚。
- **折射后面接的**（`--lq-rest`）：框和选项是 `blur(.6px) saturate(1.15) brightness(1.06)`，字下面的背景基本清楚；页头圆按钮原来是 9px 毛玻璃，这里减到 `blur(4px)`，不然折出来的画面又被糊平。
- **什么时候开**：只在动画「完整」（`body.fx-hover-enabled`）时；「轻量」「关闭」以及 Firefox（`backdrop-filter` 不认 SVG 滤镜）用 ①② 的静态玻璃。切换档位时 `syncFxToggle` 调 `lqSync`，关掉时把滤镜、观察器全部撤掉。
- **性能**：同尺寸、同圆角的元素共用一个滤镜（一排选项、一列玩家卡只生成一张）；贴图最大 320 × 320，按元素拉伸；尺寸由 `ResizeObserver` 盯着（弹窗打开、内容展开、窗口缩放），新出现的元素由 `MutationObserver` 去抖 160 ms 后扫描；滤镜超过 160 个时清掉没人用的。舞台演奏盖住页面时（`body.hjs-covered`）不扫描。尺寸用 `offsetWidth / offsetHeight`，不受弹窗缩放动画影响。
- **给新元素加折射**：把选择器加进 `main.js` 的 `LQ_TARGETS`；要换折射后面的模糊程度，在元素上设 `--lq-rest`。

## 给新框加上玻璃

1. 框本身照常写底色（半透明）和圆角，边框可以不写。
2. 把类名加进第 31 节②的两份名单：「描边与投影」和「光泽」（底色是渐变的只加第一份）。
3. 需要状态色时，在状态类上设 `--lq-pane-edge: var(--lq-pane-edge-gold)`（或 `-hi`、`-err`），写在名单后面，选择器前面同样加 `:is(body, body.day-mode)`。
4. 框有 `overflow: hidden`、有滚动条都没关系，描边是边框本身。
5. 框原来写了 `border-color` 的状态（如选中、出错），改成在状态类上设 `--lq-pane-edge`，不然会被名单里的 `border` 盖掉。
6. 框有自己的 `box-shadow`（外圈、内圈）时，写成「原来的 + `var(--lq-drop), var(--lq-pane-glow)`」一条，放在名单后面。

## 变量命名的坑

第 31 节以前用的是 `--lg-*`，和「窗口卡片与首页磁贴」那节同名：两节都定义了 `--lg-edge`，一个是 `box-shadow` 列表、一个是渐变，写在后面的渐变把前面的盖掉了，首页磁贴的 `box-shadow: …, var(--lg-edge)` 因此整条无效，磁贴的透光描边一直没显示。现在第 31 节统一改成 `--lq-*`，磁贴恢复。以后新加变量先搜一下有没有重名。
