// 往 D1 的 usage 表灌一批预置用量，让排行榜四个周期都有内容。
//
//   node scripts/seed-usage.mjs [--dry-run]
//
// 脚本会**清空 usage 表**再写入，真实流量也会一起没了——它是预置数据的一次性命令，
// 不是增量追加。写入的时间范围按运行时刻倒推：小时级覆盖最近 48 小时，日级覆盖到
// 63 天前，周级从那里一直铺到两年前，正好铺满四个周期的当前窗口与它前一个等长窗口。
//
// 每次运行的结果由固定种子决定，只要运行时刻一样，写进去的数据就一样。

import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const DATABASE = 'fake-openai-usage'
const HOUR_MS = 3_600_000
const DAY_MS = 86_400_000
const WEEK_MS = 604_800_000
const BEIJING_OFFSET_MS = 8 * HOUR_MS
const WEEK_ANCHOR_MS = 4 * DAY_MS

const HOURLY_HOURS = 48
const DAILY_DAYS = 63
const WEEKLY_DAYS = 728
const STATEMENTS_PER_FILE = 500

const dryRun = process.argv.includes('--dry-run')

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '..')
const fingerprintPath = resolve(root, 'src/fingerprint/data/fingerprints.txt')
if (!existsSync(fingerprintPath)) throw new Error(`找不到指纹数据：${fingerprintPath}`)
const header = JSON.parse(readFileSync(fingerprintPath, 'utf8').split('\n')[0])
const modelIds = header.models.map((model) => model.id)

function createRng(seed) {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let value = state
    value = Math.imul(value ^ (value >>> 15), value | 1)
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61)
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296
  }
}

const rng = createRng(20261001)
const between = (min, max) => min + rng() * (max - min)
const jitter = (spread) => 1 - spread + rng() * spread * 2

/** 每个模型一周的字符量，跨几个数量级，让榜单有梯度。 */
const weeklyChars = new Map(
  modelIds.map((id, index) => {
    const rankBias = (index + 1) / modelIds.length
    return [id, Math.round(10 ** between(5.9, 8.7) * (1 - rankBias * 0.35))]
  })
)

/** 每条记录平均多少字符一个请求，用来把字符量折成请求数。 */
const charsPerRequest = new Map(modelIds.map((id) => [id, Math.round(between(240, 2200))]))

/** 北京时间的日内活跃度，白天高、凌晨低。 */
function diurnal(hour) {
  const peak = Math.exp(-((hour - 15) ** 2) / 32)
  const trough = Math.exp(-((hour - 4) ** 2) / 12)
  return 0.18 + 0.82 * peak - Math.min(0.12, trough * 0.12)
}

const now = Date.now()
const shiftedNow = now + BEIJING_OFFSET_MS
const hourStart = Math.floor(shiftedNow / HOUR_MS) * HOUR_MS
const dayStart = Math.floor(shiftedNow / DAY_MS) * DAY_MS
const weekStart = Math.floor((shiftedNow - WEEK_ANCHOR_MS) / WEEK_MS) * WEEK_MS + WEEK_ANCHOR_MS

const rows = []

// 小时级：最近 48 小时
for (let hour = 0; hour < HOURLY_HOURS; hour += 1) {
  const start = hourStart - hour * HOUR_MS
  const ts = start - BEIJING_OFFSET_MS
  const localHour = new Date(start).getUTCHours()
  for (const id of modelIds) {
    if (rng() > 0.34) continue
    const chars = Math.max(1, Math.round((weeklyChars.get(id) / (7 * 24)) * diurnal(localHour) * jitter(0.55)))
    rows.push([ts, id, Math.max(1, Math.round(chars / charsPerRequest.get(id))), chars])
  }
}

// 日级：最近 63 天（小时级那两天不重复写）
for (let day = 2; day < DAILY_DAYS; day += 1) {
  const ts = dayStart - day * DAY_MS - BEIJING_OFFSET_MS
  const weekday = new Date(ts + BEIJING_OFFSET_MS).getUTCDay()
  const weekend = weekday === 0 || weekday === 6 ? 0.72 : 1
  for (const id of modelIds) {
    if (rng() > 0.5) continue
    const chars = Math.max(1, Math.round((weeklyChars.get(id) / 7) * weekend * jitter(0.45)))
    rows.push([ts, id, Math.max(1, Math.round(chars / charsPerRequest.get(id))), chars])
  }
}

// 周级：日级覆盖不到的地方，从 63 天前一直铺到两年前
const firstWeek = DAILY_DAYS / 7
const lastWeek = Math.floor(WEEKLY_DAYS / 7)
for (let week = firstWeek; week <= lastWeek; week += 1) {
  const ts = weekStart - week * WEEK_MS - BEIJING_OFFSET_MS
  for (const id of modelIds) {
    if (rng() > 0.78) continue
    const drift = 0.55 + 0.45 * (1 - week / lastWeek)
    const chars = Math.max(1, Math.round(weeklyChars.get(id) * drift * jitter(0.3)))
    rows.push([ts, id, Math.max(1, Math.round(chars / charsPerRequest.get(id))), chars])
  }
}

const totalChars = rows.reduce((sum, row) => sum + row[3], 0)
const totalRequests = rows.reduce((sum, row) => sum + row[2], 0)
console.log(`模型 ${modelIds.length} 个，生成 ${rows.length} 行`)
console.log(`合计请求 ${totalRequests.toLocaleString()} 次，字符 ${totalChars.toLocaleString()}`)

if (dryRun) {
  console.log('--dry-run：没有写库')
  process.exit(0)
}

const statements = ['DELETE FROM usage;']
for (const [ts, model, requests, chars] of rows) {
  statements.push(`INSERT INTO usage (ts_ms, model, requests, chars) VALUES (${ts}, '${model}', ${requests}, ${chars});`)
}

const chunkDir = resolve('/tmp', `seed-usage-${Date.now()}`)
mkdirSync(chunkDir, { recursive: true })
let applied = 0
for (let offset = 0; offset < statements.length; offset += STATEMENTS_PER_FILE) {
  const chunk = statements.slice(offset, offset + STATEMENTS_PER_FILE)
  const file = resolve(chunkDir, `chunk-${offset / STATEMENTS_PER_FILE}.sql`)
  writeFileSync(file, `${chunk.join('\n')}\n`)
  execFileSync('wrangler', ['d1', 'execute', DATABASE, '--remote', `--file=${file}`], {
    cwd: root,
    stdio: ['ignore', 'ignore', 'inherit'],
    env: process.env,
  })
  applied += chunk.length
  console.log(`已写入 ${applied}/${statements.length} 条`)
}
rmSync(chunkDir, { recursive: true, force: true })
console.log('完成')
