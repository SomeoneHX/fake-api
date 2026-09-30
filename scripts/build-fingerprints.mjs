// 从 lm-detector 的参考批次里抽出每个模型的整数序列，打包成 Worker 可导入的单个文本文件。
//
//   node scripts/build-fingerprints.mjs [unified_reference.jsonl] [unified_bank.json]
//
// 输出 src/fingerprint/data/fingerprints.txt：
//   第 1 行是头部 JSON（字母表、模型顺序、每个模型各条序列的长度）
//   其余行是拼接后的数据块，每 200 个字符换行；字母表不含空白，读取时去掉换行即可。
// 每个整数用字母表里的两个字符表示（1..355 落在 12 bit 内）。

import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
const VALUE_MIN = 1
const VALUE_MAX = 355
const MIN_SEQUENCE = 80
const WRAP = 200

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '..')
const referencePath = resolve(process.argv[2] ?? resolve(root, '../lm-detector/data/unified_reference.jsonl'))
const bankPath = resolve(process.argv[3] ?? resolve(root, '../lm-detector/data/unified_bank.json'))

// 与 shared/fingerprint-core.js 的 parseNumbers 一致：取最长的一段 1..355 整数，字母打断序列。
function parseNumbers(text) {
  const runs = []
  let current = []
  let previousEnd = 0
  for (const match of String(text).matchAll(/\d+/g)) {
    const separator = String(text).slice(previousEnd, match.index)
    const value = Number(match[0])
    if (current.length && /\p{L}/u.test(separator)) {
      runs.push(current)
      current = []
    }
    if (value >= VALUE_MIN && value <= VALUE_MAX) current.push(value)
    previousEnd = match.index + match[0].length
  }
  if (current.length) runs.push(current)
  return runs.reduce((best, run) => (run.length > best.length ? run : best), [])
}

if (!existsSync(referencePath)) throw new Error(`找不到参考批次：${referencePath}`)

const raw = readFileSync(referencePath)
const pools = new Map()
for (const line of raw.toString('utf8').split('\n')) {
  if (!line.trim()) continue
  const batch = JSON.parse(line)
  const id = batch.model?.id
  if (!id) continue
  for (const sample of batch.samples ?? []) {
    const numbers = parseNumbers(sample.text)
    if (numbers.length < MIN_SEQUENCE) continue
    if (!pools.has(id)) pools.set(id, [])
    pools.get(id).push(numbers)
  }
}

const order = []
const metadata = new Map()
if (existsSync(bankPath)) {
  const bank = JSON.parse(readFileSync(bankPath, 'utf8'))
  for (const model of bank.models) {
    if (!pools.has(model.id)) continue
    order.push(model.id)
    metadata.set(model.id, { family: model.family ?? 'other', family_name: model.family_name ?? '其他' })
  }
}
for (const id of pools.keys()) if (!order.includes(id)) order.push(id)
order.sort((a, b) => (pools.get(b).length - pools.get(a).length) || a.localeCompare(b))

const models = []
const chunks = []
for (const id of order) {
  const sequences = pools.get(id)
  const lengths = sequences.map((sequence) => sequence.length)
  chunks.push(sequences.flat().map((value) => {
    const index = value - VALUE_MIN
    return ALPHABET[index >> 6] + ALPHABET[index & 63]
  }).join(''))
  const meta = metadata.get(id) ?? { family: 'other', family_name: '其他' }
  models.push({ id, family: meta.family, family_name: meta.family_name, lengths })
}

const blob = chunks.join('')
const header = {
  version: 1,
  alphabet: ALPHABET,
  range: [VALUE_MIN, VALUE_MAX],
  source: referencePath,
  source_sha256: createHash('sha256').update(raw).digest('hex'),
  models,
}
const wrapped = blob.match(new RegExp(`.{1,${WRAP}}`, 'g')) ?? []
const output = `${JSON.stringify(header)}\n${wrapped.join('\n')}\n`

const target = resolve(root, 'src/fingerprint/data/fingerprints.txt')
mkdirSync(dirname(target), { recursive: true })
writeFileSync(target, output)

const numbers = models.reduce((total, model) => total + model.lengths.reduce((sum, n) => sum + n, 0), 0)
console.log(`模型 ${models.length} 个，序列 ${models.reduce((total, m) => total + m.lengths.length, 0)} 条，整数 ${numbers} 个`)
console.log(`写出 ${target}（${(Buffer.byteLength(output) / 1048576).toFixed(2)} MiB）`)
