// 密钥页的真实增删改查，数据落 D1。
// key 只用于控制台的展示与复制，不参与 /v1 的鉴权。
import { errorResponse, jsonResponse } from '../http'
import type { Env } from '../env'

const ok = (data: unknown) => jsonResponse({ success: true, message: '', data })

const listShape = (items: unknown, total: number, page: number, page_size: number) =>
  jsonResponse({ success: true, message: '', data: { items, total, page, page_size } })

interface TokenRow {
  id: number
  key: string
  name: string
  status: number
  created_time: number
  accessed_time: number
  used_quota: number
  remain_quota: number
  unlimited_quota: number
  expired_time: number
}

/** 前端的 ApiKey 走 zod 校验，字段名与默认值要和这份对齐。 */
function toApiKey(row: TokenRow) {
  return {
    id: row.id,
    name: row.name,
    key: row.key,
    status: row.status,
    remain_quota: row.remain_quota,
    used_quota: row.used_quota,
    unlimited_quota: row.unlimited_quota === 1,
    expired_time: row.expired_time,
    created_time: row.created_time,
    accessed_time: row.accessed_time,
    group: 'default',
    auto_groups: null,
    cross_group_retry: false,
    model_limits_enabled: false,
    model_limits: '',
    allow_ips: '',
  }
}

async function readJson(request: Request): Promise<Record<string, unknown>> {
  try {
    return (await request.json()) as Record<string, unknown>
  } catch {
    return {}
  }
}

/** 48 位随机串，页面展示时由前端自己加 sk- 前缀。 */
function generateKey(): string {
  const alphabet =
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
  const bytes = crypto.getRandomValues(new Uint8Array(48))
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('')
}

function int(value: unknown, fallback: number): number {
  const n = Number(value)
  return Number.isFinite(n) ? Math.floor(n) : fallback
}

export async function tokensApi(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url)
  const path = url.pathname.replace(/\/+$/, '')
  const method = request.method

  if (path === '/api/token' && method === 'GET') {
    const page = Math.max(1, int(url.searchParams.get('p'), 1))
    const size = Math.min(100, Math.max(1, int(url.searchParams.get('size'), 10)))
    const total =
      (await env.DB.prepare('SELECT COUNT(*) AS c FROM tokens').first<{ c: number }>())?.c ?? 0
    const { results } = await env.DB.prepare(
      'SELECT * FROM tokens ORDER BY id DESC LIMIT ?1 OFFSET ?2'
    )
      .bind(size, (page - 1) * size)
      .all<TokenRow>()
    return listShape(results.map(toApiKey), total, page, size)
  }

  if (path === '/api/token' && method === 'POST') {
    const body = await readJson(request)
    const now = Math.floor(Date.now() / 1000)
    const row: TokenRow = {
      id: 0,
      key: generateKey(),
      name: String(body.name ?? '').slice(0, 100) || '未命名密钥',
      status: 1,
      created_time: now,
      accessed_time: now,
      used_quota: 0,
      remain_quota: int(body.remain_quota, 500000),
      unlimited_quota: body.unlimited_quota === undefined ? 1 : (body.unlimited_quota ? 1 : 0),
      expired_time: int(body.expired_time, -1),
    }
    const result = await env.DB.prepare(
      `INSERT INTO tokens (key, name, status, created_time, accessed_time, used_quota, remain_quota, unlimited_quota, expired_time)
       VALUES (?1, ?2, ?3, ?4, ?4, 0, ?5, ?6, ?7)`
    )
      .bind(row.key, row.name, row.status, now, row.remain_quota, row.unlimited_quota, row.expired_time)
      .run()
    row.id = result.meta.last_row_id
    return ok(toApiKey(row))
  }

  if (path === '/api/token' && method === 'PUT') {
    const body = await readJson(request)
    const id = int(body.id, 0)
    if (!id) return errorResponse(400, 'missing token id', 'console_error', '')
    if (url.searchParams.get('status_only') === 'true') {
      await env.DB.prepare('UPDATE tokens SET status = ?1 WHERE id = ?2')
        .bind(int(body.status, 1), id)
        .run()
    } else {
      await env.DB.prepare(
        'UPDATE tokens SET name = ?1, remain_quota = ?2, unlimited_quota = ?3, expired_time = ?4 WHERE id = ?5'
      )
        .bind(
          String(body.name ?? '').slice(0, 100) || '未命名密钥',
          int(body.remain_quota, 500000),
          body.unlimited_quota ? 1 : 0,
          int(body.expired_time, -1),
          id
        )
        .run()
    }
    const row = await env.DB.prepare('SELECT * FROM tokens WHERE id = ?1')
      .bind(id)
      .first<TokenRow>()
    return row ? ok(toApiKey(row)) : errorResponse(404, 'token not found', 'console_error', '')
  }

  if (path === '/api/token/search' && method === 'GET') {
    const keyword = (url.searchParams.get('keyword') ?? '').trim()
    const token = (url.searchParams.get('token') ?? '').trim()
    const page = Math.max(1, int(url.searchParams.get('p'), 1))
    const size = Math.min(100, Math.max(1, int(url.searchParams.get('size'), 10)))
    const clauses: string[] = []
    const binds: (string | number)[] = []
    if (keyword) {
      clauses.push('name LIKE ?1')
      binds.push(`%${keyword}%`)
    }
    if (token) {
      clauses.push(`key LIKE ?${binds.length + 1}`)
      binds.push(`%${token}%`)
    }
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : ''
    const total =
      (
        await env.DB.prepare(`SELECT COUNT(*) AS c FROM tokens ${where}`)
          .bind(...binds)
          .first<{ c: number }>()
      )?.c ?? 0
    const { results } = await env.DB.prepare(
      `SELECT * FROM tokens ${where} ORDER BY id DESC LIMIT ?${binds.length + 1} OFFSET ?${binds.length + 2}`
    )
      .bind(...binds, size, (page - 1) * size)
      .all<TokenRow>()
    return listShape(results.map(toApiKey), total, page, size)
  }

  if (path === '/api/token/auto-groups' && method === 'GET') {
    return ok({ groups: ['default'], max_count: 0 })
  }

  if (path === '/api/token/batch' && method === 'POST') {
    const body = await readJson(request)
    const ids = Array.isArray(body.ids) ? body.ids.map((v) => int(v, 0)).filter(Boolean) : []
    if (!ids.length) return ok(0)
    const placeholders = ids.map((_, i) => `?${i + 1}`).join(', ')
    const result = await env.DB.prepare(`DELETE FROM tokens WHERE id IN (${placeholders})`)
      .bind(...ids)
      .run()
    return ok(result.meta.changes)
  }

  if (path === '/api/token/batch/keys' && method === 'POST') {
    const body = await readJson(request)
    const ids = Array.isArray(body.ids) ? body.ids.map((v) => int(v, 0)).filter(Boolean) : []
    if (!ids.length) return ok({ keys: {} })
    const placeholders = ids.map((_, i) => `?${i + 1}`).join(', ')
    const { results } = await env.DB.prepare(`SELECT id, key FROM tokens WHERE id IN (${placeholders})`)
      .bind(...ids)
      .all<{ id: number; key: string }>()
    const keys: Record<number, string> = {}
    for (const r of results) keys[r.id] = r.key
    return ok({ keys })
  }

  const single = /^\/api\/token\/(\d+)$/.exec(path)
  if (single) {
    const id = Number(single[1])
    if (method === 'GET') {
      const row = await env.DB.prepare('SELECT * FROM tokens WHERE id = ?1').bind(id).first<TokenRow>()
      return row ? ok(toApiKey(row)) : errorResponse(404, 'token not found', 'console_error', '')
    }
    if (method === 'DELETE') {
      await env.DB.prepare('DELETE FROM tokens WHERE id = ?1').bind(id).run()
      return ok(true)
    }
  }

  const keyOf = /^\/api\/token\/(\d+)\/key$/.exec(path)
  if (keyOf && method === 'POST') {
    const row = await env.DB.prepare('SELECT key FROM tokens WHERE id = ?1')
      .bind(Number(keyOf[1]))
      .first<{ key: string }>()
    return row ? ok({ key: row.key }) : errorResponse(404, 'token not found', 'console_error', '')
  }

  return errorResponse(404, `Unknown token endpoint: ${method} ${path}`, 'console_error', '')
}
