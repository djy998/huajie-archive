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
| `sw.js` | 离线缓存 |
| `build.mjs` | 生成发布版 |
| `tools/` | 缩略图、标题字体子集 |

脚本顺序：boot → verify → config → main → ticket → venue → survey；admin、huayu、`assets/lib/exceljs.min.js` 按需加载。
字体自托管于 `assets/fonts/`，标题字为 `assets/site/brush.woff2`；艾欧泽亚文字字体在 `assets/fonts/eorzean/`，用 class `eorzean`（Augmented Neo-Eorzean）、`eorzean-classic`（Eorzea）、`hingashi`（Hingashi Extended）调用，未使用时不会下载。

后端为 Cloudflare Worker（不在本仓库），挂在本站 `/api/*`，数据在 D1，图片在 R2。

## 花语

- 一代：「听花语：」+ 草木字；二代：散文句式。写入用管理页选定的版本，读取时自动识别。
- 加解密在 Worker，密钥只存在 D1，网站不保存明文与花语。
- `zi.js`、`zi-data.json`、`v1.js`、`v2-*.js` 决定花语格式，改动会导致旧花语无法解读。需要新格式时新增一代并在 `huayu.js` 的 `ALGOS` 登记。
- 自测：`node huayu/selftest.mjs`

## 发布

1. 修改 `_src/` 中的文件。
2. 将 `index.html` 中所有 `?v=` 后的版本号统一换成新值（如 `20261015a`）。
3. 生成发布版（Node.js 18+）：`cd _src && npm install esbuild && node build.mjs`，同时生成 `activity/`、`previous/` 两个独立入口。
4. 上传 `_src/` 与根目录中有变化的文件。

新增图片后运行 `python tools/make-thumbs.py`；标题出现新字时运行 `python tools/make-brush-font.py`。

停用离线缓存：按 `sw.js` 开头的说明替换根目录的 `sw.js`。
