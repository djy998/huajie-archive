这个文件夹只是给站长下载「打包好的文件包」用的，下载完可以随时删掉整个 download 文件夹。

huajie-verify-update.zip —— 人机验证扩展的全部文件（20 个），解压后结构：

  huajie-verify-update/
  ├── 先读我-改动步骤.txt            ← 3 步速查
  ├── README.md                      ← 详细说明（题库、参数、回滚）
  ├── 1-覆盖仓库里的同名文件/
  │   ├── index.html                 ← 覆盖仓库根目录的同名文件
  │   └── style.css                  ← 覆盖仓库根目录的同名文件
  ├── 2-新增到仓库根目录/
  │   └── verify.js                  ← 新文件，传到仓库根目录
  ├── 3-整段替换-Worker代码/
  │   └── worker.js                  ← Cloudflare 控制台里整段替换（先做这步）
  └── 9-参考-平时不用管/
      ├── poem-bank.json             飞花令题库（改句子用）
      ├── inline-poem-bank.py        改完题库重新生成 worker.js 的题库块
      ├── selftest.js                本地自测：node selftest.js（1255 项）
      ├── tests/                     页面级自测（npm i jsdom）
      └── worker-changes.diff        新旧 worker.js 差异，仅供核对

部署顺序：先换 Worker，再更新网页（新前端会调新接口）。
验收：POST {"action":"verify_ping"} 返回 "version":"2026-09-18d"、"poems":618。
