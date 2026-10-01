-- 用量流水。实时写入时一条对应一次请求；预置数据里一条代表若干次请求。
-- chars 是提示与回复的字符数合计，排行榜把它当作 token 量。
CREATE TABLE IF NOT EXISTS usage (
  id INTEGER PRIMARY KEY,
  ts_ms INTEGER NOT NULL,
  model TEXT NOT NULL,
  requests INTEGER NOT NULL,
  chars INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_usage_ts_model ON usage (ts_ms, model);
