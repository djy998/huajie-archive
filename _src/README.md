# 花舞之街 · 网站源码

网站实际用的是仓库根目录下压缩过的文件；这里（`_src/`）是带注释的源码。
GitHub Pages 不会发布以下划线开头的文件夹，所以访客打开网站时看不到这些源码。

## 文件分工

| 文件 | 内容 |
| --- | --- |
| `config.js` | 网站内容：最新活动、往期活动、小型回顾、花街介绍图、日历标注、卡片底图地址。**平时改内容只改它** |
| `index.html` | 页面结构（开屏图、首页、各个视图、弹窗） |
| `style.css` | 全部样式，开头有目录 |
| `main.js` | 页面主程序：路由、首页与活动详情、特效、时间条与天气、点赞、闹铃、弹窗公告 |
| `ticket.js` | 访客购票页与购票须知 |
| `venue.js` | 场地使用登记表单 |
| `survey.js` | 活动问卷 |
| `verify.js` | 人机验证（Cloudflare Turnstile + 狒科生 / 文科生 / 理科生） |
| `admin.js` | 内部入口与管理页（含管理面板的页面结构），进入 `#internal` 时才加载 |
| `build.mjs` | 生成发布版 |
| `tools/make-brush-font.py` | 重新生成标题用的毛笔字 `assets/site/brush.woff2` |

脚本加载顺序：verify.js → config.js → main.js → ticket.js → venue.js → survey.js（admin.js 按需加载），
后面的文件会用到前面定义的函数和常量。

后端是 Cloudflare Worker（`worker.js`，不放在这个仓库里，改完在 Cloudflare 控制台粘贴部署），
挂在本站域名的 `/api/*`，数据在 D1，公告配图在 R2。

## 修改网站的步骤

1. 改 `_src/` 里的文件。
2. 发布新版本时，把 `_src/index.html` 里所有的 `20260929d` 换成新的日期（开头的 `HJ_VERSION` 一处 + 底部 `?v=` 几处），
   访客就会拿到新文件。
3. 生成发布版（需要 Node.js 18+）：
   ```
   cd _src
   npm install esbuild      # 只需第一次
   node build.mjs
   ```
   会覆盖根目录下的 index.html、style.css 和各个 .js。
4. 把 `_src/` 和根目录下变了的文件一起上传到 GitHub。

新活动名等标题里出现了新汉字时，可以跑一次 `python tools/make-brush-font.py` 更新毛笔字；
不跑也不影响使用，新字会用 Google 字体或系统字体显示。
