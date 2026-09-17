#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""把 style.css 里的「算术题验证」样式换成「人机验证（Cloudflare + 三种手动验证）」样式。
   幂等：重复执行会提示已经是新版。"""
import io, sys

P = "style.css"
s = io.open(P, encoding="utf-8").read()
orig = s

if ".verify-tabs" in s:
    print("style.css 已经是新版，无需修改")
    sys.exit(0)

# ---------------------------------------------------------------- 1. 验证卡片
old = """/* 人机验证卡片 */
.captcha-card { position: relative; }
#turnstileWidget { display: flex; justify-content: center; margin: 14px 0; }"""
new = """/* 人机验证卡片（四种验证方式的界面由 verify.js 生成，样式见第 11 节末） */
.captcha-card { position: relative; }
.verify-host { margin: 14px 0 4px; }"""
assert old in s, "找不到 .captcha-card / #turnstileWidget"
s = s.replace(old, new, 1)

# ---------------------------------------------------------------- 2. 购票表单里的验证
old = ".ticket-captcha { display: flex; justify-content: center; min-height: 65px; margin: 6px 0 16px; }"
new = ".ticket-verify { margin: 6px 0 16px; }"
assert old in s, "找不到 .ticket-captcha"
s = s.replace(old, new, 1)

# ---------------------------------------------------------------- 3. 替换旧的算术题样式块
start = s.index("/* 算术题验证（Turnstile 加载不了时的备用方案） */")
end_marker = "body.day-mode .gate-card button#ticketCaptchaSwitch { color: var(--day-brown-soft); background: none; border: 0; box-shadow: none; }"
end = s.index(end_marker) + len(end_marker)

new_block = """/* =============================================================================
   人机验证：Cloudflare Turnstile + 三种手动验证（狒科生 / 文科生 / 理科生）
   结构与文案由 verify.js 生成；同一套样式在验证弹窗和购票表单里共用
   ============================================================================= */
.verify-host { margin: 14px 0 4px; }
.verify-host[hidden] { display: none; }

/* 四种方式并排的按钮：Cloudflare / 狒科生 / 文科生 / 理科生 */
.verify-tabs { display: flex; justify-content: center; flex-wrap: wrap; gap: 8px; margin-bottom: 14px; }
.verify-host button.verify-tab {
  padding: 7px 15px;
  font-size: .82rem;
  font-weight: 600;
  color: var(--text-soft);
  background: rgba(255,255,255,.05);
  border: 1px solid var(--line);
  border-radius: 999px;
  box-shadow: none;
  -webkit-backdrop-filter: none;
  backdrop-filter: none;
}
.verify-host button.verify-tab:hover { color: var(--cream); border-color: var(--accent); transform: translateY(-1px); }
.verify-host button.verify-tab.is-on {
  color: var(--accent-ink);
  background:
    linear-gradient(168deg, rgba(255,255,255,.3) 0%, rgba(255,255,255,.09) 42%, rgba(0,0,0,.03) 76%, rgba(0,0,0,.09) 100%),
    var(--accent);
  border-color: rgba(255,255,255,.3);
  box-shadow: 0 3px 9px rgba(10,7,22,.22), inset 0 1px 0 rgba(255,255,255,.34);
}

/* 状态提示：出题中 / 答错 / 组件加载失败… */
.verify-tip { margin: 0 0 12px; font-size: .85rem; line-height: 1.6; color: var(--text-mute); text-align: center; }
.verify-tip[hidden] { display: none; }
.verify-tip.is-error { color: #e08e84; }

.verify-body { min-height: 72px; }
.verify-cf { display: flex; align-items: center; justify-content: center; min-height: 65px; }
.verify-q { margin-bottom: 12px; font-size: .95rem; line-height: 1.7; color: var(--text-soft); text-align: center; }
.verify-key { margin: 0 2px; font-size: 1.15rem; color: var(--lantern-soft); }
.verify-sub { display: block; margin-top: 4px; font-size: .78rem; color: var(--text-mute); }
.verify-expr { margin: 0 4px; font-size: 1.35rem; letter-spacing: .06em; color: var(--lantern-soft); }

/* 狒科生：一个职业图标 + 三个职业名 */
.verify-job { display: flex; justify-content: center; margin: 2px 0 12px; }
.verify-job-icon {
  width: 72px; height: 72px;
  border-radius: 18px;
  background: rgba(255,255,255,.06);
  border: 1px solid var(--line);
  box-shadow: 0 6px 16px rgba(8,6,18,.28), inset 0 1px 0 rgba(255,255,255,.14);
}
.verify-job-fallback { font-size: .82rem; color: var(--text-mute); }
.verify-options { display: flex; justify-content: center; flex-wrap: wrap; gap: 8px; }
.verify-host button.verify-opt { min-width: 104px; padding: 9px 18px; font-size: .88rem; }

/* 文科生 / 理科生：输入框 + 确认 */
.verify-row { display: flex; justify-content: center; align-items: center; flex-wrap: wrap; gap: 8px; }
.verify-host input.verify-input {
  flex: 1 1 180px;
  width: auto;
  max-width: 280px;
  margin: 0;
  font-size: .9rem;
  text-align: center;
}
.verify-host button.verify-ok { padding: 10px 20px; }

/* 文科生的提示：20 个字，点一下填进输入框 */
.verify-hint-wrap { margin-top: 12px; text-align: center; }
.verify-hint-note { margin: 10px 0 0; font-size: .78rem; color: var(--text-mute); }
.verify-hint-chars { display: flex; justify-content: center; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
.verify-host button.verify-char {
  width: 34px; height: 34px;
  padding: 0;
  font-size: .95rem;
  font-weight: 500;
  color: var(--cream);
  background: rgba(255,255,255,.06);
  border: 1px solid var(--line);
  border-radius: 10px;
  box-shadow: none;
}
.verify-host button.verify-char:hover { color: var(--accent-ink); background: var(--accent); border-color: transparent; }

/* 小按钮：换一题 / 提示 */
.verify-actions { margin-top: 12px; text-align: center; }
.verify-host button.verify-mini {
  padding: 5px 12px;
  font-size: .78rem;
  font-weight: 400;
  color: var(--text-mute);
  background: none;
  border: 1px dashed var(--line);
  box-shadow: none;
  -webkit-backdrop-filter: none;
  backdrop-filter: none;
}
.verify-host button.verify-mini:hover { color: var(--text-soft); border-color: var(--accent); transform: none; }

/* 白天模式 */
body.day-mode .verify-tip { color: var(--day-brown-soft); }
body.day-mode .verify-tip.is-error { color: #a83a2e; }
body.day-mode .verify-q { color: var(--day-text); }
body.day-mode .verify-key,
body.day-mode .verify-expr { color: var(--day-brown); }
body.day-mode .verify-sub,
body.day-mode .verify-hint-note,
body.day-mode .verify-job-fallback { color: var(--day-brown-soft); }
body.day-mode .verify-host button.verify-tab { color: var(--day-brown-soft); background: rgba(255,251,238,.4); border-color: #c98f3a; }
body.day-mode .verify-host button.verify-tab.is-on { color: #fff6e0; background: #8a5a1c; border-color: #8a5a1c; }
body.day-mode .verify-host button.verify-char { color: var(--day-ink); background: rgba(255,251,238,.5); border-color: #c98f3a; }
body.day-mode .verify-host button.verify-char:hover { color: #fff6e0; background: #8a5a1c; border-color: #8a5a1c; }
body.day-mode .verify-host button.verify-mini { color: var(--day-brown-soft); border-color: #c98f3a; }
body.day-mode .verify-host input.verify-input { text-align: center; }
body.day-mode .verify-job-icon { background: rgba(255,251,238,.5); border-color: #c98f3a; }

/* 窄屏：按钮换行、输入框占满一行 */
@media (max-width: 560px) {
  .verify-tabs { gap: 6px; }
  .verify-host button.verify-tab { padding: 6px 11px; font-size: .76rem; }
  .verify-options { gap: 6px; }
  .verify-host button.verify-opt { flex: 1 1 100%; }
  .verify-host input.verify-input { max-width: none; }
}"""

s = s[:start] + new_block + s[end:]
io.open(P, "w", encoding="utf-8").write(s)

# ---------------------------------------------------------------- 检查
bad = [k for k in ["#turnstileWidget", ".captcha-switch", ".math-captcha", ".math-q", ".math-expr",
                   ".math-row", ".math-input", ".math-refresh", ".math-ok", ".math-status",
                   "ticketCaptchaSwitch", "captchaSwitch"] if k in s]
print("字节数：%d → %d" % (len(orig), len(s)))
print("残留旧样式：", bad if bad else "无")
sys.exit(1 if bad else 0)
