// 使用日志：读 usage 表，按 New API 的日志接口形状返回。
// /api/log/self（普通用户）与 /api/log（管理员）同数据——站上只有一个账号。
import { jsonResponse } from '../http'
import type { Env } from '../env'

const ok = (data: unknown) => jsonResponse({ success: true, message: '', data })

interface UsageRow {
  id: number
  ts_ms: number
  model: string
  chars: number
  prompt_chars: number | null
  completion_chars: number | null
  token_key: string | null
  token_name: string | null
}

/** 旧数据没有字符拆分，整体算补全；新数据是写入时的真实拆分。 */
function toLog(row: UsageRow) {
  return {
    id: row.id,
    user_id: 2,
    created_at: Math.floor(row.ts_ms / 1000),
    type: 2,
    content: '',
    username: 'user',
    token_name: row.token_name ?? '',
    model_name: row.model,
    quota: 0,
    prompt_tokens: row.prompt_chars ?? 0,
    completion_tokens: row.completion_chars ?? row.chars,
    use_time: 0,
    is_stream: true,
    channel: 1,
    channel_name: 'rollwood',
    token_id: 0,
    group: 'default',
    ip: '',
    other: '',
    request_id: '',
    upstream_request_id: '',
  }
}

export async function logsApi(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url)
  const path = url.pathname.replace(/\/+$/, '')
  const isStat = path.endsWith('/stat')
  const page = Math.max(1, Number(url.searchParams.get('p')) || 1)
  const size = Math.min(100, Math.max(1, Number(url.searchParams.get('page_size')) || 20))
  const model = (url.searchParams.get('model_name') ?? '').trim()

  const conditions: string[] = []
  const binds: (string | number)[] = []
  if (model) {
    conditions.push('u.model LIKE ?1')
    binds.push(`%${model}%`)
  }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''

  if (isStat) {
    const minuteAgo = Date.now() - 60_000
    const stats = await env.DB.prepare(
      `SELECT COALESCE(SUM(requests), 0) AS rpm, COALESCE(SUM(chars), 0) AS tpm
       FROM usage WHERE ts_ms > ?1`
    )
      .bind(minuteAgo)
      .first<{ rpm: number; tpm: number }>()
    return ok({ quota: 0, rpm: stats?.rpm ?? 0, tpm: stats?.tpm ?? 0 })
  }

  const total =
    (
      await env.DB.prepare(`SELECT COUNT(*) AS c FROM usage u ${where}`)
        .bind(...binds)
        .first<{ c: number }>()
    )?.c ?? 0
  const { results } = await env.DB.prepare(
    `SELECT u.id, u.ts_ms, u.model, u.chars, u.prompt_chars, u.completion_chars, u.token_key, t.name AS token_name
     FROM usage u LEFT JOIN tokens t ON t.key = u.token_key
     ${where}
     ORDER BY u.ts_ms DESC LIMIT ?${binds.length + 1} OFFSET ?${binds.length + 2}`
  )
    .bind(...binds, size, (page - 1) * size)
    .all<UsageRow>()
  return jsonResponse({
    success: true,
    message: '',
    data: { items: results.map(toLog), total, page, page_size: size },
  })
}
