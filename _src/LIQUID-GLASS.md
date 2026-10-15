# 液态玻璃效果设计方案

本站的「玻璃」分四层，各管一类东西，互不重叠。新加界面时先找到它属于哪一类，直接套用，不要另起一套。

| 层 | 用在 | 代码位置（`style.css`） | 变量前缀 |
| --- | --- | --- | --- |
| 窗口卡片与首页磁贴的透光边 | `.info-box`、`.gate-card`、`.admin-modal`、`.tile` 与日历 / 闹铃 / 吟游诗人等小组件 | 「液态玻璃边缘：窗口卡片与首页磁贴」 | `--lg-` |
| 凸起玻璃按钮 | 小按钮、选项、分段控件 | 设计变量 `--glass-up` / `--glass-on` / `--glass-sheen`，按下反馈在「18. 按下反馈」 | `--glass-` |
| 输入栏（带折射） | 卡片里的输入框、下拉框、文本域 | 「31. 液态玻璃」① | `--lq-` |
| 扁平框（淡玻璃） | 卡片里一块块放文字的框：介绍框、词卡、条目、提示框… | 「31. 液态玻璃」② | `--lq-pane-` |

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
- 兼容：Firefox 不支持 `backdrop-filter` 引用 SVG 滤镜，退化成「半透明、无模糊无折射」，底色与文字不受影响。

## ② 扁平框：淡玻璃

- 不改原来的底色（`background-color`），只加：
  - **光泽**：`background-image: var(--lq-pane-sheen)`，很淡、只是上面比下面稍亮一点。夜晚是薰衣草白（.05 → .02），白天是白色（.24 → .10）。底色本身就是渐变的框（`.pz-contest`、`.gm-kw-big`、`.gm-bomb-stage`）不加这层，保留自己的底色。
  - **描边**：整圈几乎同一个亮度（夜晚白 .24 / .20 / .22，白天整圈同一个金色），不像输入栏那样上下缘明显更亮 —— 大块的框上，上下发白、到四角和左右两边一下子变暗，看起来像断开。状态色也各有一套同样平的（`--lq-pane-edge-gold` / `-hi` / `-err`）。画在 `::before` 上，`mask` 抠出 1px 的边框，跟着圆角走；`inset: -1px` 对齐到 border box（absolute 的 `inset: 0` 是相对 padding box 的，会内缩 1px 和边框错开）。框自己的边框改成 1px 透明，原来是虚线、没有边框的也一样，所以大小统一。
  - **投影 + 透光**：`box-shadow: var(--lq-drop), var(--lq-pane-glow)`；`--lq-pane-glow` 是整圈均匀的厚度：贴着描边里面一道极淡的 1px（夜 .035、白天 .30）+ 向内 12px 的柔光（夜 .06、白天 .32）。四边、四角一样厚，没有只在上缘的光带，也不加只在下缘的内阴影。
- **不用 `backdrop-filter`**：以前这类框也套了 `url(#lgf) blur(1.5px)`。滤镜的位移按框的尺寸等比放大，大框的背景被拉扯得很厉害，再加上模糊，整块看起来都是虚的；滚动时每帧还要重算。现在去掉以后，框里的字和框外一样清楚。
- **状态描边**：在元素上设 `--lq-pane-edge`（金色 / 强调 / 出错）；`::before` 用 `var(--lq-pane-edge, var(--lq-pane-edge-base))`。每个框自己先把 `--lq-pane-edge` 设成 `initial`，状态色只给自己，不会传给里面嵌套的框。
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
| `.ta-guide-preview`、`.ticket-table-wrap` | 有滚动条，`::before` 会跟着内容一起滚走 |
| `.venue-note` | 左边 3px 的强调竖条是它的样式，套描边会和竖条打架 |
| `.guide-actions` | 购票须知底部的操作栏，是一条带上边线的底栏，不是框 |
| `.site-popup-image`、`.info-gallery-grid img` | 图片框 |
| `.bard-tip`、`.pz-chip`、`.pz-tool` | 浮在画面上的提示 / 拼图工具，底色要压住下面的图 |
| 舞台演奏（`.hjs-*`） | 全屏游戏界面，固定夜间配色，有自己的一套玻璃（`--glass-up`、`.hjs-card`） |
| 仙人微彩台面（`.vc-game`） | 还原游戏窗口：半透明黑色遮罩，不是玻璃 |

## 给新框加上玻璃

1. 框本身照常写底色（半透明）和圆角，边框可以不写。
2. 把类名加进第 31 节②的两份名单：「描边与投影」和「光泽」（底色是渐变的只加第一份）。
3. 需要状态色时，在状态类上设 `--lq-pane-edge: var(--lq-pane-edge-gold)`（或 `-hi`、`-err`），写在名单后面，选择器前面同样加 `:is(body, body.day-mode)`。
4. 框有 `overflow: hidden` 时，补一条 `::before { inset: 0; }`（向外扩的 1px 会被裁掉）。
5. 框原来就有 `::before` 的，先把它挪到 `::after` 或里面的元素上。
6. 框有自己的 `box-shadow`（外圈、内圈）时，写成「原来的 + `var(--lq-drop), var(--lq-pane-glow)`」一条，放在名单后面。

## 变量命名的坑

第 31 节以前用的是 `--lg-*`，和「窗口卡片与首页磁贴」那节同名：两节都定义了 `--lg-edge`，一个是 `box-shadow` 列表、一个是渐变，写在后面的渐变把前面的盖掉了，首页磁贴的 `box-shadow: …, var(--lg-edge)` 因此整条无效，磁贴的透光描边一直没显示。现在第 31 节统一改成 `--lq-*`，磁贴恢复。以后新加变量先搜一下有没有重名。
