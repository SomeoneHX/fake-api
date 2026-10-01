// 用量记录。一次请求写一行，chars 是提示与回复的字符数合计。
import type { Env } from './env'

/** 提示与回复的字符数合计，排行榜把它当作 token 量。 */
export function usageChars(prompt: string, completion: string): number {
  return prompt.length + completion.length
}

/** 异步落库，失败不影响接口本身。 */
export function recordUsage(env: Env, ctx: ExecutionContext, model: string, chars: number): void {
  ctx.waitUntil(
    env.DB.prepare('INSERT INTO usage (ts_ms, model, requests, chars) VALUES (?, ?, 1, ?)')
      .bind(Date.now(), model, chars)
      .run()
      .then(() => undefined)
      .catch(() => undefined)
  )
}
