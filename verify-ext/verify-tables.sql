-- =============================================================================
-- 花舞之街 · 薰风花语町 —— 人机验证扩展所需的 D1 表
-- -----------------------------------------------------------------------------
-- 用法（三选一，执行一次即可）：
--   ① Cloudflare 控制台 → Workers & Pages → D1 → 选中你的库 → Console：
--      把下面整段 SQL 粘进去执行。
--   ② 命令行： npx wrangler d1 execute <你的数据库名> --remote --file=./verify-tables.sql
--   ③ 什么都不做：新版 Worker 代码第一次收到验证请求时会自动建表（下面的语句与代码一致）。
-- 说明：这三张表只服务于人机验证，和原有的公告 / 购票 / 点赞表互不影响。
-- =============================================================================

-- 验证题目：出题时写入，答对或过期后作废；正确答案只存在这里，不下发到前端
CREATE TABLE IF NOT EXISTS hj_verify_tasks (
  id         TEXT PRIMARY KEY,   -- 题目 id（随机 32 位十六进制，前缀 v）
  mode       TEXT NOT NULL,      -- ff14 / poem / math
  answer     TEXT NOT NULL,      -- 正确答案：ff14 存职业名，poem 存令字，math 存算式结果
  meta       TEXT,               -- 附加信息：ff14 存 {"job":"绘灵法师"}，math 存 {"question":"37 + 46"}
  created_at INTEGER NOT NULL,   -- 出题时间（毫秒时间戳）
  expires_at INTEGER NOT NULL,   -- 过期时间（出题后 10 分钟）
  tries      INTEGER NOT NULL DEFAULT 0,  -- 已答错次数（同一题最多 8 次）
  solved_at  INTEGER             -- 答对时间；非空表示这题已经用掉
);

-- 一次性通行证：答对后发放，提交表单时消费；只能用一次
CREATE TABLE IF NOT EXISTS hj_verify_passes (
  id         TEXT PRIMARY KEY,   -- 通行证 id（随机 32 位十六进制，前缀 p）
  mode       TEXT,               -- 由哪种方式通过
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,   -- 通行证有效期（10 分钟）
  used_at    INTEGER,            -- 消费时间；非空表示已用过
  ip         TEXT                -- 领证的 IP（排查用）
);

-- 限流计数：每 IP 每 10 分钟最多出题 / 交卷若干次
CREATE TABLE IF NOT EXISTS hj_verify_rate (
  key        TEXT PRIMARY KEY,   -- 动作:IP:时间窗口
  count      INTEGER NOT NULL DEFAULT 0,
  expires_at INTEGER NOT NULL
);

-- 索引：清理过期数据、按 id 判断状态时更快
CREATE INDEX IF NOT EXISTS idx_hj_verify_tasks_expires  ON hj_verify_tasks (expires_at);
CREATE INDEX IF NOT EXISTS idx_hj_verify_passes_expires ON hj_verify_passes (expires_at);
CREATE INDEX IF NOT EXISTS idx_hj_verify_rate_expires   ON hj_verify_rate (expires_at);

-- 想确认建好了：SELECT name FROM sqlite_master WHERE name LIKE 'hj_verify%';
