// 控制台用的假接口。
//
// 站上没有管理后端。这里按路径回一份形状对得上的空数据，让控制台各页按正常的
// 空态渲染，而不是弹请求失败的提示。形状以 New API 后端的返回为准：列表接口回
// 分页结构，其余接口各自回数组、对象或字符串——前端会直接对 data 调 .map /
// .forEach / .some，形状错了整页会掉进错误边界。
//
// 唯一真数据是 /api/rankings（在 index.ts 里先处理）与 /v1/*。
import { errorResponse, jsonResponse } from '../http'

const ok = (data: unknown) => jsonResponse({ success: true, message: '', data })

/** 分页列表：New API 的列表接口把 items/total/page/page_size 放在 data 里。 */
const list = () =>
  jsonResponse({
    success: true,
    message: '',
    data: { items: [], data: [], total: 0, page: 1, page_size: 20, type_counts: {} },
  })

/** 这些前缀按分页列表回。 */
const LIST_PREFIXES = [
  '/api/channel',
  '/api/token',
  '/api/log',
  '/api/user',
  '/api/redemption',
  '/api/models',
  '/api/vendors',
  '/api/deployments',
  '/api/performance/logs',
  '/api/group',
  '/api/prefill_group',
  '/api/audit',
  '/api/system-task',
]

/** 这些接口的 data 是字符串（公告、协议正文），前端会直接 .trim()。 */
const TEXT_PATHS = ['/api/notice', '/api/user-agreement', '/api/privacy-policy']

const FAKE_USER = {
  id: 2,
  username: 'user',
  display_name: 'user',
  role: 1,
  status: 1,
  email: '',
  group: 'default',
  quota: 500000000,
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

export function consoleApi(request: Request): Response {
  const path = new URL(request.url).pathname

  // 没有服务端会话可刷新。回 401，前端据此判定为未登录并跳登录页；
  // 若这里回 200，访客会被自动当成已登录，登录页就永远看不到了。
  if (path === '/api/user/auth/refresh' || path === '/api/user/auth/logout') {
    return errorResponse(401, 'Unauthorized', 'invalid_request_error', 'unauthorized')
  }

  if (TEXT_PATHS.includes(path)) return ok('')
  // 邀请码是一段字符串，前端拿它当 code 用。
  if (path === '/api/user/aff') return ok('')

  if (path === '/api/status') {
    return ok({
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
    })
  }

  // 已初始化：根路由的 setup 检查据此放行。
  if (path === '/api/setup') return ok({ status: true })

  if (path === '/api/user/self' || path === '/api/user/self/') return ok(FAKE_USER)

  if (path === '/api/user/self/groups') return ok({})
  if (path === '/api/user/models') return ok([])
  if (path === '/api/user/sessions') return ok([])
  if (path === '/api/user/passkey') return ok({ enabled: false, last_used_at: null })
  if (path === '/api/user/2fa/status') return ok({ enabled: false })
  if (path === '/api/user/token/status') {
    return ok({ exists: false, token_ref: '', created_at: null, last_used_at: null, last_used_ip: '' })
  }
  if (path === '/api/user/topup/info') return ok({})

  // 选项接口的 data 是 {key, value} 数组，设置页据此填表单；
  // 空数组会让各表单退到默认值。
  if (path === '/api/option/' || path === '/api/option') return ok([])

  // 模型定价配置：entries 是模型清单，options 是被改过的选项。这三个计费键
  // 前端会直接取值当字符串用，缺了会算到 undefined 上。
  if (path === '/api/option/model_pricing') {
    return ok({
      entries: [],
      options: {
        'billing_setting.billing_mode': '{}',
        'billing_setting.billing_expr': '{}',
        'billing_setting.plugin_billing_expr': '{}',
        'tool_price_setting.prices': '{}',
      },
      empty_version: '',
    })
  }

  // 请求策略：表单直接按下标取这几个键，缺了会算出 NaN 让校验不通过。
  if (path === '/api/option/request_policy') {
    return ok({
      options: {
        RetryTimes: '0',
        AutomaticRetryStatusCodes:
          '100-199,300-399,401-407,409-499,500-503,505-523,525-599',
        'channel_affinity_setting.enabled': 'false',
        'channel_affinity_setting.session_mode': '',
        'channel_affinity_setting.switch_on_success': 'false',
        'channel_affinity_setting.keep_on_channel_disabled': 'false',
        'channel_affinity_setting.max_entries': '0',
        'channel_affinity_setting.default_ttl_seconds': '0',
        'channel_affinity_setting.rules': '[]',
      },
    })
  }

  if (path === '/api/group/' || path === '/api/group') return ok([])
  if (path === '/api/uptime/status') return ok([])

  if (path === '/api/log/stat' || path === '/api/log/self/stat') {
    return ok({ quota: 0, rpm: 0, tpm: 0 })
  }

  if (path === '/api/channel/ops') {
    return ok({
      retry_times: 0,
      request_policy: { automatic_disable: false, source: 'global' },
    })
  }
  if (path === '/api/channel/default_base_urls') return ok({})

  if (path === '/api/authz/catalog') return ok({ resources: [], roles: [] })

  if (path === '/api/plugin/task') return ok([])
  if (path === '/api/plugin/task/marketplace/sources') return ok([])
  if (path === '/api/task_plugin_options') return ok([])

  if (
    path === '/api/subscription/plans' ||
    path === '/api/subscription/admin/plans' ||
    path === '/api/subscription/self'
  ) {
    return ok([])
  }

  if (path === '/api/system-info/instances') return ok([])
  if (path === '/api/system-info/stale-instances') return ok({ deleted_count: 0 })

  if (path === '/api/system-task/list') {
    return jsonResponse({ success: true, message: '', data: [], total: 0 })
  }
  if (path === '/api/system-task/current') return ok(null)

  if (path.startsWith('/api/data')) return ok([])

  if (path === '/api/performance/stats') return ok({})
  if (path === '/api/performance/disk_cache') return ok({})

  if (LIST_PREFIXES.some((prefix) => path.startsWith(prefix))) return list()

  // 其余未知路径按数组回：控制台读到的 data 以数组居多，空数组能让 .map /
  // .forEach 正常走完，属性访问也只会得到 undefined。
  return ok([])
}
