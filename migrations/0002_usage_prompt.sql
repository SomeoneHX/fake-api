-- 记下请求内容，便于回看别人发了什么。
ALTER TABLE usage ADD COLUMN prompt TEXT;
ALTER TABLE usage ADD COLUMN user_agent TEXT;
