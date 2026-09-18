页面级自测（需要一次 jsdom）
--------------------------
  cd verify-ext/tests
  npm i jsdom          # 只需装一次
  node ui-test.js      # verify.js 的界面：四种方式、自动降级、提示拼字……（36 项）
  node e2e-test.js     # 真 verify.js ⇄ 真 worker.js 打通（18 项）
  node page-test.js    # 真 index.html + 真 worker.js 全流程（26 项）

后端自测不需要 jsdom，直接在仓库根目录跑：
  node verify-ext/selftest.js        # 1255 项

这三个脚本都只在本地跑：会起一个静态站 + 真 Worker（内存版 D1），
用 jsdom 打开真实 index.html，模拟「Cloudflare 被墙」的国内访客走完验证与购票，
不需要联网、不需要 Cloudflare 账号。
