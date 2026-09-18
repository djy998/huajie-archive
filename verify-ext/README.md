# 人机验证扩展（完整版）：Cloudflare + 狒科生 / 文科生 / 理科生

原来的验证只有「Cloudflare Turnstile + 算术题」。现在扩成**四种方式任选一种即可通过**：

| 按钮 | 玩法 | 说明 |
| --- | --- | --- |
| **Cloudflare** | Turnstile 组件 | 默认方式；国内打不开时（脚本出错 / 6 秒超时）自动切到手动验证 |
| **狒科生** | 看职业图标选职业（三选一） | 图标取自仓库 `jobicon/`，与文件名一一对应；**手动验证里的默认项** |
| **文科生** | 飞花令 | 给一个常用汉字，写一句含这个字的诗词；有「提示」按钮，给 20 个字让你拼 |
| **理科生** | 算术题 | 20 以内加减法 / 九九乘法表 |

- 三种手动方式**并排显示**，与 Cloudflare 一起共四个按钮，**完成任意一种就通过**。
- Cloudflare 仍是默认；国内加载不出来的访客会自动落到手动验证，并**记住 6 小时**（不会每次都先等它转圈）。
- 题目由 Worker 出、Worker 判，**正确答案不下发到前端**；答对发一张**一次性通行证**（10 分钟内有效、只能用一次）。

---

## 一、这次交付的文件

```
huajie-verify-update/
├── 先读我-改动步骤.txt        ← 4 步速查
├── README.md                  ← 本文件
├── changes.patch              ← 网页改动的 git 补丁（index.html / style.css / verify.js）
├── index.html                 ← 覆盖仓库根目录同名文件
├── style.css                  ← 覆盖仓库根目录同名文件
├── verify.js                  ← 新增到仓库根目录
└── verify-ext/
    ├── worker.js              ← 【完整 Worker】整份替换 Cloudflare 上的旧 worker.js
    ├── worker-changes.diff    ← 与旧 worker.js 的差异（想核对时看这个，只是参考）
    ├── poem-bank.json         ← 飞花令题库（提示库 + 判定扩展库）
    ├── inline-poem-bank.py    ← 改完题库跑它，重新生成 worker.js 里的题库块
    ├── selftest.js            ← 本地自测：node verify-ext/selftest.js
    └── apply-index-patch.py / apply-css-patch.py   ← 网页改动的补丁脚本（归档用，不必执行）
```

> ⚠️ **部署顺序：先 Worker，后网页。**
> 新前端会调用新接口（`get_verify_task` 等），老 Worker 不认识就会提示「后端还是旧版本」；
> 反过来先更新 Worker 则完全无感（老前端照常跑）。

---

## 二、第 1 步：替换 Worker（整份复制粘贴）

Cloudflare 控制台 → **Workers & Pages → 选中你的 Worker → 编辑代码**：

1. 全选旧代码删除；
2. 把 `verify-ext/worker.js` 的**全部内容**粘进去（Ctrl+A → Ctrl+V，注意不要漏掉最后一行 `};`）；
3. 点 **Deploy**。

**要额外配置什么吗？**

- 环境变量、机密、绑定**都不用动**：D1 还是原来的绑定，Turnstile 的 sitekey / secret 不变，R2 不变。
- 手动验证的加密密钥复用了 `LOGIN_GUARD_SECRET`（没设置时退回 `PASSWORD_C`）——**不需要新增机密**。
- 唯一可选的新变量：`HJ_SITE_ORIGIN`。狒科生的职业图标由 Worker 从站点目录 `jobicon/` 取回，
  默认站点已写死为 `https://swayingsussurrusstreet.dpdns.org`；换域名时才需要加这个普通变量。
- 完全不需要建新表：题目和通行证都是「加密暗号」，一次性记账借用现有的 `rate_limits` 表。

> 换掉 `LOGIN_GUARD_SECRET` / `PASSWORD_C` 会让**已发出的题目与通行证立刻失效**（访客重新答一题即可），不影响其它功能。

---

## 三、第 2 步：更新网页文件

| 动作 | 文件 |
| --- | --- |
| 新增到仓库根目录 | `verify.js` |
| 覆盖仓库根目录同名文件 | `index.html`、`style.css` |

用 git 的话（推荐）：

```bash
git apply --stat changes.patch   # 先看会改哪些文件
git apply changes.patch
git add -A && git commit -m "人机验证扩展：Cloudflare + 狒科生/文科生/理科生"
git push
```

不想用 git 就直接在 GitHub 仓库页面 **Add file → Upload files** 传这三个文件。
推送后浏览器**硬刷新**（Ctrl+F5）一次即可（`style.css?v=44` 已带版本号，一般不用手动清缓存）。

---

## 四、第 3 步：验收

1. **后端自检**（把域名换成你的）：

   ```bash
   curl -s -X POST https://swayingsussurrusstreet.dpdns.org/api/ \
        -H 'Content-Type: application/json' -d '{"action":"verify_ping"}'
   ```

   期望（这串说明新 Worker 已经生效）：

   ```json
   {"ok":true,"version":"2026-09-18d","modes":["ff14","poem","math"],
    "jobs":23,"poems":618,"hint_chars":20,"strict":false,
    "site_origin":"https://swayingsussurrusstreet.dpdns.org","db":true}
   ```

   `poems` 是判定库句子数（现在 618；旧版本的题库只有 184 句）；
   `db:true` 表示 D1 绑定正常。浏览器直接打开 `<Worker 地址>/ping` 也能看到版本和三种模式。

2. **网页**：点「花街介绍」→ 会先试 Cloudflare；想看降级效果就在 DevTools 里切 **Offline**，
   6 秒内没出来会自动切「狒科生」并说明原因 → 选出图标对应的职业 → 弹窗打开。

3. **四种方式各点一遍**：按钮并排；「文科生」点提示会给出 20 个字，点头一个字就填进输入框；
   「理科生」是算术题。任一通过即可。

4. **购票**：填表 → 完成任意一种验证 → 提交 → 「登记成功」；同一张凭证重复提交应被拒绝（一次性）。

5. **回归**：公告板、点赞、天气、日历不受影响（本次只动验证相关代码 + 新增一节）。

6. **本地自测**（可选，装好 Node 18+ 后）：

   ```bash
   node verify-ext/selftest.js       # 完整 worker.js 的端到端自测（1251 项）
   ```

---

## 五、飞花令题库（怎么加句子）

题库在 `verify-ext/poem-bank.json`，分两层：

| 层 | 内容 | 用途 |
| --- | --- | --- |
| `common` | 中小学必背篇目（每句都含对应令字） | 出**提示**、挑**令字**，也参与判定 |
| `extra` | 高中 / 大学 / 偏门诗词 | **只参与判定**，不会出现在提示里 |

判定顺序（服务端）：

1. 必须含令字、长度 5~40 个汉字、不能夹字母数字；
2. 命中题库（常用 + 扩展，写上下两句也算命中）→ **通过**；
3. 题库没有 → **宽松判定**：像一句诗词（不是口水话、不是同一字重复）就放行，
   只有「不含令字 / 太短 / 夹字母数字 / 口水话」才打回，打回时会写明原因（前端显示在提示行里）。

> 之所以默认宽松：会背诗的人写一句冷门诗不该被拦。想改成「只认题库」，把 `worker.js` 里
> `HJV_POEM_STRICT` 改成 `true` 即可（那样冷门诗会被拒，可能招来投诉，一般不建议）。

令字表（`HJV_KEYWORDS`，只用最常见最简单的 20 个字，不要随便改）：
**春 花 月 风 山 水 云 雨 天 人 日 江 夜 秋 白 红 明 雪 千 心**

**加句子 / 改句子：**

```bash
# 1) 编辑 verify-ext/poem-bank.json（直接往里加句子就行，标点随意）
# 2) 校验（会检查每句是否含自己那组的令字、长度、重复等）
python3 verify-ext/inline-poem-bank.py --check
# 3) 生成到 worker.js（改题库块，其它代码不动）
python3 verify-ext/inline-poem-bank.py
# 4) 把 verify-ext/worker.js 重新整份粘回 Cloudflare，Deploy
```

也可以直接手改 `worker.js` 里 `/* HJV_BANK_START */` 与 `/* HJV_BANK_END */` 之间的两行数组，
但**下次跑脚本会覆盖**，建议走上面 4 步。

**换职业图标**：把图片放进仓库 `jobicon/`（文件名 = 职业名），
再把 `worker.js` 里的 `HJV_JOBS` 改成同一批名字即可（两边名字必须一模一样）。

---

## 六、想调参数

改 `verify-ext/worker.js` 顶部这几个常量，然后重新 Deploy：

| 常量 | 默认 | 作用 |
| --- | --- | --- |
| `HJV_TASK_TTL_MS` | 10 分钟 | 一道题的有效期 |
| `HJV_PASS_TTL_MS` | 10 分钟 | 通行证有效期（一次性） |
| `HJV_HINT_CHARS` | 20 | 提示给多少个字 |
| `HJV_POEM_MIN` / `HJV_POEM_MAX` | 5 / 40 | 判定时的字数范围（标点不算） |
| `HJV_POEM_STRICT` | `false` | `true` = 只认题库里的句子 |
| `HJV_DEFAULT_ORIGIN` | 本站域名 | 职业图标从哪个站点取（也可用变量 `HJ_SITE_ORIGIN`） |
| `HJV_KEYWORDS` / `HJV_JOBS` | 20 令字 / 23 职业 | 出题范围 |

限流（在 `RATE_LIMITS` 里）：出题 60 次 / 分钟、提示 40 次 / 分钟、交卷 40 次 / 分钟；
前端自己的节奏是 6 秒等不到 Cloudflare 就切手动验证（`verify.js` 的 `turnstileWaitMs`），
页面免验证窗口 5 分钟（`index.html` 的 `CAPTCHA_GRACE_MS`）。

---

## 七、回滚

- **Worker**：把旧 `worker.js` 粘回去 Deploy 即可（`worker-changes.diff` 就是差异）。
- **网页**：`git revert` 那次提交；或换回旧的 `index.html` / `style.css` 并删掉 `verify.js`。
- **数据**：没有新增表；`rate_limits` 里会多出 `verify_task_used` / `verify_pass_used` 两类短命记录，
  过期后会被自动清理，想立刻清干净可以执行：
  ```sql
  DELETE FROM rate_limits WHERE action IN ('verify_task_used','verify_pass_used');
  ```

---

## 八、这次 worker.js 具体改了什么

| 位置 | 改动 |
| --- | --- |
| 头部注释 | 说明新增的三种手动验证、`HJ_SITE_ORIGIN` 变量 |
| `WORKER_VERSION` | `2026-09-18c` → `2026-09-18d` |
| `WORKER_FEATURES` | 增加 `"manual-verify"` |
| `RATE_LIMITS` | 增加 `get_verify_task`（60/分）、`get_verify_hint`（40/分）、`verify_answer`（40/分） |
| `verifyHuman()` | 增加 `body.verifyPass` 分支（手动验证通行证），原算术题与 Turnstile 逻辑不变 |
| 新增一整节 | 「手动人机验证」：题库、AES-GCM 暗号、出题 / 判卷 / 提示 / 通行证、职业图标取回 |
| `handlers` | 增加 `get_verify_task` / `get_verify_hint` / `verify_answer` / `verify_ping` |
| `GET /ping` | 增加 `manual_verify`（模式、职业数、题库规模、提示字数） |

原有接口（公告、点赞、购票、管理员、`get_math_challenge`、`verify_turnstile`、`/image/`）**全部保持不变**，
老页面缓存也能继续用。
