-- 密钥鉴权与真实日志：usage 行挂上发起请求的 key，并存真实的提示/补全字符拆分。
ALTER TABLE usage ADD COLUMN token_key TEXT;
ALTER TABLE usage ADD COLUMN prompt_chars INTEGER;
ALTER TABLE usage ADD COLUMN completion_chars INTEGER;

CREATE INDEX IF NOT EXISTS idx_usage_token ON usage (token_key);
