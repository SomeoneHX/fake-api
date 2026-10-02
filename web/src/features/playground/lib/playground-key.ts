// 游乐场的调用密钥：/v1 需要真实 key，这里自动解析或静默创建一把。
const CACHE_KEY = 'playground-token-key'

interface TokenItem {
  key?: string
}

interface TokenListResponse {
  success: boolean
  data?: { items?: TokenItem[] }
}

interface TokenCreateResponse {
  success: boolean
  data?: { key?: string }
}

export function clearCachedPlaygroundKey(): void {
  try {
    localStorage.removeItem(CACHE_KEY)
  } catch {
    // localStorage 不可用时忽略
  }
}

/** 当前账号的第一把可用 key；没有就创建一把名为 playground 的。 */
export async function ensurePlaygroundKey(): Promise<string> {
  let key = ''
  try {
    key = localStorage.getItem(CACHE_KEY) ?? ''
  } catch {
    key = ''
  }
  if (key) return key

  const listRes = (await fetch('/api/token/?p=1&size=1', {
    headers: { 'content-type': 'application/json' },
  }).then((r) => r.json())) as TokenListResponse
  key = listRes.data?.items?.[0]?.key ?? ''

  if (!key) {
    const createRes = (await fetch('/api/token/', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: 'playground',
        remain_quota: 500000,
        expired_time: -1,
        unlimited_quota: true,
        model_limits_enabled: false,
        model_limits: '',
        allow_ips: '',
        group: 'default',
        auto_groups: [],
        cross_group_retry: false,
      }),
    }).then((r) => r.json())) as TokenCreateResponse
    key = createRes.data?.key ?? ''
  }

  if (key) {
    try {
      localStorage.setItem(CACHE_KEY, key)
    } catch {
      // localStorage 不可用时忽略
    }
  }
  return key
}

export async function getPlaygroundHeaders(): Promise<Record<string, string>> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  const key = await ensurePlaygroundKey()
  if (key) headers.Authorization = `Bearer ${key}`
  return headers
}
