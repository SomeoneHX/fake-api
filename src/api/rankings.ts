// GET /api/rankings?period=today|week|month|year
//
// 把 usage 表里的字符数按模型、按时间桶汇总成排行榜快照。形状与 New API 的
// /api/rankings 一致，前端那一套组件直接用。
import type { Env } from '../env'
import { listModels } from '../fingerprint/store'
import { errorResponse, jsonResponse } from '../http'

const HOUR_MS = 3_600_000
const DAY_MS = 86_400_000
const WEEK_MS = 604_800_000

/** 北京时间比 UTC 早 8 小时，没有夏令时；分桶与轴标签都按它算。 */
const BEIJING_OFFSET_MS = 8 * HOUR_MS
/** 1970-01-01 是星期四，往前挪 4 天让周桶落在星期一。 */
const WEEK_ANCHOR_MS = 4 * DAY_MS

const PERIODS = {
  today: { bucketMs: HOUR_MS, buckets: 24 },
  week: { bucketMs: WEEK_MS, buckets: 8 },
  month: { bucketMs: DAY_MS, buckets: 30 },
  year: { bucketMs: WEEK_MS, buckets: 52 },
} as const

type RankingPeriod = keyof typeof PERIODS

/** 指纹数据里的 family → 定价页的厂商名 + lobe 图标名。 */
const VENDORS: Record<string, { name: string; icon: string }> = {
  claude: { name: 'Anthropic', icon: 'Claude' },
  deepseek: { name: 'DeepSeek', icon: 'DeepSeek' },
  gemini: { name: 'Google', icon: 'Gemini' },
  glm: { name: '智谱 AI', icon: 'Zhipu' },
  gpt: { name: 'OpenAI', icon: 'OpenAI' },
  grok: { name: 'xAI', icon: 'XAI' },
  hunyuan: { name: '腾讯混元', icon: 'Hunyuan' },
  kimi: { name: 'Moonshot', icon: 'Kimi' },
  mimo: { name: '小米', icon: 'XiaomiMiMo' },
  muse: { name: 'Muse', icon: 'Muse' },
  qwen: { name: '阿里云百炼', icon: 'Qwen' },
  step: { name: '阶跃星辰', icon: 'Stepfun' },
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function pad(value: number): string {
  return String(value).padStart(2, '0')
}

/** 桶序号对应的起点（已带北京时间偏移）。 */
function bucketStart(shifted: number, bucketMs: number): number {
  if (bucketMs === WEEK_MS) {
    return Math.floor((shifted - WEEK_ANCHOR_MS) / WEEK_MS) * WEEK_MS + WEEK_ANCHOR_MS
  }
  return Math.floor(shifted / bucketMs) * bucketMs
}

/** 起点 → 排序用的 ts 与坐标轴标签。 */
function stamp(shifted: number, period: RankingPeriod): { ts: string; label: string } {
  const date = new Date(shifted)
  const y = date.getUTCFullYear()
  const m = date.getUTCMonth()
  const d = date.getUTCDate()
  if (period === 'today') {
    const h = date.getUTCHours()
    return { ts: `${y}-${pad(m + 1)}-${pad(d)}T${pad(h)}:00`, label: `${pad(h)}:00` }
  }
  return { ts: `${y}-${pad(m + 1)}-${pad(d)}`, label: `${MONTHS[m]} ${d}` }
}

function growth(current: number, previous: number): number {
  if (previous > 0) return ((current - previous) / previous) * 100
  return current > 0 ? 100 : 0
}

export async function rankings(request: Request, env: Env): Promise<Response> {
  const requested = new URL(request.url).searchParams.get('period') ?? 'week'
  if (!Object.hasOwn(PERIODS, requested)) {
    return errorResponse(400, `Unknown period: ${requested}`, 'invalid_request_error', 'invalid_period')
  }
  const period = requested as RankingPeriod
  const { bucketMs, buckets } = PERIODS[period]

  const now = Date.now()
  const lastStart = bucketStart(now + BEIJING_OFFSET_MS, bucketMs)
  const firstStart = lastStart - (buckets - 1) * bucketMs
  const previousStart = firstStart - buckets * bucketMs

  const { results } = await env.DB.prepare('SELECT ts_ms, model, chars FROM usage WHERE ts_ms >= ? AND ts_ms <= ?')
    .bind(previousStart - BEIJING_OFFSET_MS, now)
    .all<{ ts_ms: number; model: string; chars: number }>()

  const current = new Map<string, number>()
  const previous = new Map<string, number>()
  const perBucket = new Map<number, Map<string, number>>()

  for (const row of results ?? []) {
    const chars = Number(row.chars) || 0
    if (chars <= 0) continue
    const start = bucketStart(Number(row.ts_ms) + BEIJING_OFFSET_MS, bucketMs)
    if (start < firstStart) {
      previous.set(row.model, (previous.get(row.model) ?? 0) + chars)
      continue
    }
    const index = Math.round((start - firstStart) / bucketMs)
    if (index < 0 || index >= buckets) continue
    current.set(row.model, (current.get(row.model) ?? 0) + chars)
    const slot = perBucket.get(index) ?? new Map<string, number>()
    slot.set(row.model, (slot.get(row.model) ?? 0) + chars)
    perBucket.set(index, slot)
  }

  const meta = new Map(listModels().map((model) => [model.id, model]))
  const vendorCache = new Map<string, { name: string; icon: string }>()
  const vendorOf = (id: string) => {
    const cached = vendorCache.get(id)
    if (cached) return cached
    const model = meta.get(id)
    const fallback = model?.family_name || model?.family || 'Others'
    const vendor = VENDORS[model?.family ?? ''] ?? { name: fallback, icon: fallback }
    vendorCache.set(id, vendor)
    return vendor
  }

  const ranked = [...current.entries()]
    .filter(([, chars]) => chars > 0)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
  const totalCurrent = ranked.reduce((sum, [, chars]) => sum + chars, 0)

  const previousRank = new Map(
    [...previous.entries()]
      .filter(([, chars]) => chars > 0)
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([id], index) => [id, index + 1] as const)
  )

  const models = ranked.map(([id, chars], index) => ({
    rank: index + 1,
    previous_rank: previousRank.get(id),
    model_name: id,
    vendor: vendorOf(id).name,
    vendor_icon: vendorOf(id).icon,
    category: 'all',
    total_tokens: chars,
    share: totalCurrent > 0 ? chars / totalCurrent : 0,
    growth_pct: growth(chars, previous.get(id) ?? 0),
  }))

  const vendorTotals = new Map<string, { chars: number; models: number; topModel: string; icon: string }>()
  for (const [id, chars] of ranked) {
    const vendor = vendorOf(id)
    const entry = vendorTotals.get(vendor.name) ?? { chars: 0, models: 0, topModel: id, icon: vendor.icon }
    entry.chars += chars
    entry.models += 1
    vendorTotals.set(vendor.name, entry)
  }
  const vendorPrevious = new Map<string, number>()
  for (const [id, chars] of previous) {
    if (chars <= 0) continue
    const name = vendorOf(id).name
    vendorPrevious.set(name, (vendorPrevious.get(name) ?? 0) + chars)
  }

  const vendors = [...vendorTotals.entries()]
    .sort((a, b) => b[1].chars - a[1].chars || a[0].localeCompare(b[0]))
    .map(([name, entry], index) => ({
      rank: index + 1,
      vendor: name,
      vendor_icon: entry.icon,
      total_tokens: entry.chars,
      share: totalCurrent > 0 ? entry.chars / totalCurrent : 0,
      growth_pct: growth(entry.chars, vendorPrevious.get(name) ?? 0),
      models_count: entry.models,
      top_model: entry.topModel,
    }))

  const moved = models
    .map((row) => ({ row, delta: (row.previous_rank ?? row.rank) - row.rank }))
    .filter((entry) => entry.row.previous_rank !== undefined)
  const toMover = ({ row, delta }: { row: (typeof models)[number]; delta: number }) => ({
    model_name: row.model_name,
    vendor: row.vendor,
    vendor_icon: row.vendor_icon,
    rank_delta: delta,
    current_rank: row.rank,
    growth_pct: row.growth_pct,
  })

  const points: { ts: string; label: string; model: string; vendor: string; tokens: number }[] = []
  const sharePoints: { ts: string; label: string; vendor: string; share: number; tokens: number }[] = []
  for (let index = 0; index < buckets; index += 1) {
    const slot = perBucket.get(index)
    if (!slot) continue
    const { ts, label } = stamp(firstStart + index * bucketMs, period)
    const byVendor = new Map<string, number>()
    let bucketTotal = 0
    for (const [id, chars] of slot) {
      const name = vendorOf(id).name
      points.push({ ts, label, model: id, vendor: name, tokens: chars })
      byVendor.set(name, (byVendor.get(name) ?? 0) + chars)
      bucketTotal += chars
    }
    if (bucketTotal <= 0) continue
    for (const [name, chars] of byVendor) {
      sharePoints.push({ ts, label, vendor: name, share: chars / bucketTotal, tokens: chars })
    }
  }

  return jsonResponse({
    success: true,
    data: {
      models,
      vendors,
      top_movers: moved
        .filter((entry) => entry.delta > 0)
        .sort((a, b) => b.delta - a.delta || a.row.rank - b.row.rank)
        .slice(0, 5)
        .map(toMover),
      top_droppers: moved
        .filter((entry) => entry.delta < 0)
        .sort((a, b) => a.delta - b.delta || a.row.rank - b.row.rank)
        .slice(0, 5)
        .map(toMover),
      models_history: {
        points,
        models: ranked.map(([id, chars]) => ({ name: id, vendor: vendorOf(id).name, total: chars })),
        buckets,
      },
      vendor_share_history: {
        points: sharePoints,
        vendors: vendors.map((row) => ({ name: row.vendor, total: row.total_tokens, share: row.share })),
        buckets,
      },
    },
  })
}
