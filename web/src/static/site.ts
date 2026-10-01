/** 站点标识。 */
export const SITE_NAME = '滚木 API'
export const SITE_TAGLINE = '你说的每一句话，都是滚木'

export interface SystemStatus {
  success?: boolean
  message?: string
  data?: Record<string, unknown>
  [key: string]: unknown
}

/**
 * `/api/status` 的替身。
 *
 * HeaderNavModules 决定顶栏出现哪些入口：home 与 about 打开，
 * console、rankings、docs 关闭。
 */
export const SITE_STATUS: SystemStatus = {
  version: 'v1.0.0',
  system_name: SITE_NAME,
  logo: '',
  docs_link: '',
  footer_html: '',
  price: 1,
  usd_exchange_rate: 7.3,
  display_in_currency: false,
  quota_display_type: 'USD',
  quota_per_unit: 500000,
  custom_currency_symbol: '',
  custom_currency_exchange_rate: 1,
  demo_site_enabled: false,
  display_token_stat_enabled: false,
  HeaderNavModules: {
    home: true,
    console: false,
    playground: true,
    pricing: { enabled: true, requireAuth: false },
    rankings: { enabled: true, requireAuth: false },
    docs: false,
    about: true,
  },
}
