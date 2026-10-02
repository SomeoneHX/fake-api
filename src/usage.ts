// 用量记录。一次请求写一行，chars 是提示与回复的字符数合计，prompt 留一份请求内容。
import type { Env } from './env'
import type { TokenAuth } from './auth'

/** prompt 与 user_agent 的截断长度，避免超长请求把行撑爆。 */
const PROMPT_LIMIT = 2000
const USER_AGENT_LIMIT = 200

export interface UsageEntry {
  model: string
  prompt: string
  completion: string
}

/** 异步落库，失败不影响接口本身。 */
export function recordUsage(
  env: Env,
  ctx: ExecutionContext,
  request: Request,
  entry: UsageEntry,
  token: TokenAuth | null
): void {
  const now = Date.now()
  ctx.waitUntil(
    (async () => {
      await env.DB.prepare(
        `INSERT INTO usage (ts_ms, model, requests, chars, prompt, user_agent, token_key, prompt_chars, completion_chars)
         VALUES (?, ?, 1, ?, ?, ?, ?, ?, ?)`
      )
        .bind(
          now,
          entry.model,
          entry.prompt.length + entry.completion.length,
          entry.prompt.slice(0, PROMPT_LIMIT),
          (request.headers.get('user-agent') ?? '').slice(0, USER_AGENT_LIMIT),
          token?.key ?? null,
          entry.prompt.length,
          entry.completion.length
        )
        .run()
      if (token) {
        await env.DB.prepare('UPDATE tokens SET accessed_time = ?1 WHERE key = ?2')
          .bind(Math.floor(now / 1000), token.key)
          .run()
      }
    })().catch(() => undefined)
  )
}
