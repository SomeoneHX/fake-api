// 假的登录态。
//
// 站上没有账号体系，登录页只走个过场：提交时把这份会话写进 localStorage，
// 之后路由守卫、请求头、顶部用户菜单都从它取值。清掉它就等于退出登录。
import { ROLE } from '@/lib/roles'
import { SITE_STATUS } from '@/static/site'
import type { AuthBundle } from '@/stores/auth-store'

const STORAGE_KEY = 'rollwood-fake-session'
/** 一年，够长到不用反复登录。 */
const SESSION_TTL_SECONDS = 365 * 24 * 60 * 60

/** 假账号的 uid。 */
const FAKE_USER_ID = 2
/** 余额，按站点配的额度单价换算成 quota。 */
const FAKE_BALANCE_USD = 1000

export function createFakeBundle(username = 'user'): AuthBundle {
  const now = Math.floor(Date.now() / 1000)
  const expires = now + SESSION_TTL_SECONDS
  return {
    access_token: 'fake-access-token',
    token_type: 'Bearer',
    access_expires_at: expires,
    user: {
      id: FAKE_USER_ID,
      username,
      display_name: username,
      role: ROLE.USER,
      status: 1,
      group: 'default',
      quota: FAKE_BALANCE_USD * (SITE_STATUS.quota_per_unit || 500000),
      used_quota: 0,
      request_count: 0,
      aff_code: 'rollwood',
      aff_count: 0,
      has_password: true,
    },
    session: {
      sid: 'fake-session',
      current: true,
      login_method: 'password',
      ip: '127.0.0.1',
      user_agent: globalThis.navigator?.userAgent ?? '',
      created_at: now,
      last_active_at: now,
      expires_at: expires,
    },
  }
}

export function readFakeSession(): AuthBundle | null {
  try {
    const raw = globalThis.localStorage?.getItem(STORAGE_KEY)
    if (!raw) return null
    const bundle = JSON.parse(raw) as AuthBundle
    if (!bundle?.user || !bundle.access_token) return null
    if (bundle.access_expires_at <= Math.floor(Date.now() / 1000)) return null
    return bundle
  } catch {
    return null
  }
}

export function writeFakeSession(bundle: AuthBundle): void {
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(bundle))
  } catch {
    // 隐私模式下写不进去也不影响本次会话
  }
}

export function clearFakeSession(): void {
  try {
    globalThis.localStorage?.removeItem(STORAGE_KEY)
  } catch {
    // 同上
  }
}
