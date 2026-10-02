// /v1 的密钥鉴权：key 必须是 tokens 表里启用且未过期的密钥。
// env.API_KEY 非空时作为主密钥兜底。
import type { Env } from './env'

export interface TokenAuth {
  key: string
  name: string
}

function extractKey(request: Request): string {
  const header = request.headers.get('authorization') ?? ''
  return header.replace(/^Bearer\s+/i, '').trim() || (request.headers.get('x-api-key') ?? '').trim()
}

export async function authenticate(request: Request, env: Env): Promise<TokenAuth | null> {
  const key = extractKey(request)
  if (!key) return null
  if (env.API_KEY && key === env.API_KEY) return { key, name: 'master' }
  const now = Math.floor(Date.now() / 1000)
  const row = await env.DB.prepare(
    'SELECT key, name FROM tokens WHERE key = ?1 AND status = 1 AND (expired_time = -1 OR expired_time > ?2)'
  )
    .bind(key, now)
    .first<{ key: string; name: string }>()
  return row ?? null
}
