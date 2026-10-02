// 控制台用的假接口。
//
// 站上没有管理后端。这里按路径回一份形状对得上的空数据，让控制台各页按正常的
// 空态渲染，而不是弹请求失败的提示。唯一真数据是 /api/rankings（在 index.ts 里
// 先处理）与 /v1/*。
import { errorResponse, jsonResponse } from '../http'

/** 这些前缀按分页列表回，字段名与 New API 的列表响应一致。 */
const LIST_PREFIXES = [
  '/api/channel',
  '/api/token',
  '/api/user',
  '/api/log',
  '/api/redemption',
  '/api/models',
  '/api/vendors',
  '/api/deployments',
  '/api/plugin/task',
  '/api/subscription',
  '/api/performance/logs',
  '/api/system-task',
  '/api/custom-oauth-provider',
  '/api/group',
]

const FAKE_USER = {
  id: 1,
  username: 'admin',
  display_name: 'admin',
  role: 100,
  status: 1,
  email: '',
  group: 'default',
  quota: 0,
  used_quota: 0,
  request_count: 0,
  aff_code: 'rollwood',
  aff_count: 0,
  aff_quota: 0,
  aff_history_quota: 0,
  github_id: '',
  discord_id: '',
  oidc_id: '',
  wechat_id: '',
  telegram_id: '',
  linux_do_id: '',
  has_password: true,
  sidebar_modules: '',
}

function listPayload() {
  return { items: [], data: [], total: 0, page: 1, page_size: 20 }
}

export function consoleApi(request: Request): Response {
  const path = new URL(request.url).pathname

  // 没有服务端会话可刷新。回 401，前端据此判定为未登录并跳登录页；
  // 若这里回 200，访客会被自动当成已登录，登录页就永远看不到了。
  if (path === '/api/user/auth/refresh' || path === '/api/user/auth/logout') {
    return errorResponse(401, 'Unauthorized', 'invalid_request_error', 'unauthorized')
  }

  if (path === '/api/status') {
    return jsonResponse({
      success: true,
      message: '',
      data: {
        version: 'v1.0.0',
        system_name: '滚木 API',
        logo: '',
        password_login_enabled: true,
        password_register_enabled: true,
        register_enabled: true,
        email_verification: false,
        turnstile_check: false,
        self_use_mode_enabled: false,
        display_in_currency: false,
        quota_per_unit: 500000,
        usd_exchange_rate: 7.3,
        demo_site_enabled: false,
        monthly_reset_enabled: false,
      },
    })
  }

  if (path === '/api/setup') {
    // 已初始化：根路由的 setup 检查据此放行。
    return jsonResponse({ success: true, message: '', data: { status: true } })
  }

  if (path === '/api/user/self' || path === '/api/user/self/') {
    return jsonResponse({ success: true, message: '', data: FAKE_USER })
  }

  if (path === '/api/user/dashboard' || path === '/api/data/self') {
    return jsonResponse({
      success: true,
      message: '',
      data: {
        quota: 0,
        used_quota: 0,
        request_count: 0,
        today_quota: 0,
        today_request_count: 0,
        today_prompt_tokens: 0,
        today_completion_tokens: 0,
      },
    })
  }

  if (LIST_PREFIXES.some((prefix) => path.startsWith(prefix))) {
    return jsonResponse({ success: true, message: '', data: listPayload() })
  }

  return jsonResponse({ success: true, message: '', data: {} })
}
