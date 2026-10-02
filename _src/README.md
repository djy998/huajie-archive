# 花舞之街 · 网站源码

结构与设计取舍见 `ARCHITECTURE.md`，常见改动的做法见 `EXTENDING.md`。

`_src/` 为源码，仓库根目录为 `build.mjs` 压缩后的发布版。GitHub Pages 不发布以下划线开头的目录。

## 文件

| 文件 | 内容 |
| --- | --- |
| `config.js` | 站点内容：最新活动、往期活动、小型回顾、相册、日历标注、图片地址 |
| `index.html` | 页面结构与内容安全策略（CSP） |
| `boot.js` | 启动：样式表、动画档位、开屏、`window.HJ` |
| `style.css` | 样式 |
| `main.js` | 主程序：路由、首页与活动详情、特效、时间条、点赞、闹铃、日历、公告、花语弹窗、离线缓存 |
| `ticket.js` / `venue.js` / `survey.js` | 购票、场地使用登记、活动问卷 |
| `verify.js` | 人机验证：Turnstile 与三种手动验证 |
| `admin.js` | 内部入口与管理页，进入 `#internal` 时加载 |
| `huayu.js`、`huayu/` | 花语，打开时加载 |
| `puzzle.js` | 花街拼图（「更多」里的百宝箱），打开时加载 |
| `bard.js` | 吟游诗人模拟器（「更多」里的竖琴），打开时加载 |
| `sw.js` | 离线缓存 |
| `build.mjs` | 生成发布版 |
| `tools/` | 缩略图、标题字体子集 |

脚本顺序：boot → verify → config → main → ticket → venue → survey；admin、huayu、puzzle、bard、`assets/lib/exceljs.min.js` 按需加载。
字体自托管于 `assets/fonts/`，标题字为 `assets/site/brush.woff2`（现有标题用字，开屏预加载）与 `brush-ext-*.woff2`（常用字切片，用到才下载）；艾欧泽亚文字字体在 `assets/fonts/eorzean/`，用 class `eorzean`（Augmented Neo-Eorzean）、`eorzean-classic`（Eorzea）、`hingashi`（Hingashi Extended）调用，未使用时不会下载。

后端为 Cloudflare Worker（不在本仓库），挂在本站 `/api/*`，数据在 D1，图片在 R2。

## 花语

- 一代：「听花语：」+ 草木字；二代：散文句式。写入用管理页选定的版本，读取时自动识别。
- 加解密在 Worker，密钥只存在 D1，网站不保存明文与花语。
- `zi.js`、`zi-data.json`、`v1.js`、`v2-*.js` 决定花语格式，改动会导致旧花语无法解读。需要新格式时新增一代并在 `huayu.js` 的 `ALGOS` 登记。
- 自测：`node huayu/selftest.mjs`

## 花街拼图

- 原图取 `config.js` 的 `INFO_GALLERY`；难度与限时在 `puzzle.js` 开头的 `DIFFS`：鱼信 36 块 / 鱼丽 60 块 / 光风院霁月 128 块（块数固定，按图片宽高比挑行列），限时 7 / 15 / 35 分钟。改块数要同时改 Worker 的 `PUZZLE_PIECES`。
- 中断继续：管理页「花街拼图」开关，默认关闭。开启时进度存在访客本机 `hj_puzzle_save`；关闭时关掉拼图即放弃本局（× 要点两次）。
- 限时模式鱼丽及以上通关时，调用 `huayu_seal`（`v: 1, purpose: "puzzle"`）用一代花语生成通关码，去掉「听花语：」前缀。管理页「花语加密」或访客花语工具粘贴通关码即可解读。
- 大赛拼图：管理页设置名称、时段、难度、图片（裁剪后走公告配图上传，存 R2）。时段内拼图首页出现入口，正计时；开局时 Worker 发开局凭证，通关后访客填写游戏 ID，`puzzle_contest_submit` 按服务器时间核对耗时并记入 `puzzle_records`，再生成一代通关码。更换图片或难度算新一届（`contest_rev`）。
- 网格提示：拼图区画虚线拼块格子，打开时拼块放到正确格子附近会吸附过去。大赛里「显示原图 / 仅显示边框图块 / 网格提示」是否可用由管理页勾选（`puzzle_contest_tools` 按位存，默认全开）。
- 原图 / 仅显示边框图块 / 网格提示每局默认关闭；本局用过哪些写进通关码（「辅助功能」一行）和大赛记录（`aids`）。
- Worker 接口：`puzzle_state`、`puzzle_contest_start`、`puzzle_contest_submit`、`puzzle_admin_get` / `_set` / `_records` / `_void`；`get_site_state` 带 `puzzle`。

## 吟游诗人模拟器

- 玩法参考 [blossom](https://github.com/alexbainter/blossom)（MIT）：开始演奏后点页面任意位置，高度决定音高（大调五声音阶，三个八度），左右决定声像。每个音隔 7~12 秒回响一次、逐渐变弱，最多循环最近 15 个音。再点按钮或按 Esc 结束。
- 乐器表在 `bard.js` 开头的 `INSTRUMENTS`：弦乐 8 种、管乐 10 种，音域参考游戏内乐器演奏（`low` 为最低音的 MIDI 编号）。音色全部用 Web Audio 合成，不下载采样；`gain` 已按实测响度校准，新增或改动音色后要重新比对音量。
- 回响中的音保留自己的音色，演奏中换音色可以叠出合奏。演奏时背景音乐暂停，结束后恢复；站内静音时不能开始。
- 只用到本机：选的音色存 `hj_bard_inst`，小组件位置存 `hj_bard_xy`（拖标题栏移动，双击复位）。

## 全站开关

- 管理页「分享功能开关」里的「全站开关」。关闭后除 `#internal` 外只显示背景与「网站正在维护中……」。
- Worker 接口：`get_maintenance`、`set_maintenance`，`get_site_state` 带 `maintenance`。前端在本机记一份（`hj_maint`），下次进站由 `boot.js` 立即套用。
- 只是前端遮挡，接口本身不受影响。

## 发布

1. 修改 `_src/` 中的文件。
2. 将 `index.html` 中所有 `?v=` 后的版本号统一换成新值（如 `20261015a`）。
3. 生成发布版（Node.js 18+）：`cd _src && npm install esbuild && node build.mjs`，同时生成 `activity/`、`previous/` 两个独立入口。
4. 上传 `_src/` 与根目录中有变化的文件。

新增图片后运行 `python tools/make-thumbs.py`；标题字体已含约 2900 个常用字，标题用到生僻字时再运行 `python tools/make-brush-font.py`（会重写 `style.css` 开头的 @font-face）。

停用离线缓存：按 `sw.js` 开头的说明替换根目录的 `sw.js`。
