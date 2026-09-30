// 参考序列库：加载打包好的指纹数据，按模型名解析出可用的整数序列。
import packedText from './data/fingerprints.txt'

export interface FingerprintModel {
  id: string
  family: string
  family_name: string
  sequences: number
  numbers: number
}

/** 一个模型的全部参考序列，连续存放在 data 里，按 offsets 切分。 */
export interface ModelPool {
  id: string
  family: string
  family_name: string
  data: Uint16Array
  offsets: Int32Array
}

interface Header {
  version: number
  alphabet: string
  range: [number, number]
  source: string
  source_sha256: string
  models: { id: string; family: string; family_name: string; lengths: number[] }[]
}

interface Store {
  pools: ModelPool[]
  header: Header
}

let store: Store | null = null

function decode(): Store {
  const separator = packedText.indexOf('\n')
  const header = JSON.parse(packedText.slice(0, separator)) as Header
  if (header.version !== 1) throw new Error(`不支持的指纹数据版本：${header.version}`)
  const blob = packedText.slice(separator).replace(/\s+/g, '')

  const lookup = new Uint8Array(128)
  for (let i = 0; i < header.alphabet.length; i += 1) lookup[header.alphabet.charCodeAt(i)] = i

  const pools: ModelPool[] = []
  let cursor = 0
  for (const model of header.models) {
    const total = model.lengths.reduce((sum, length) => sum + length, 0)
    const data = new Uint16Array(total)
    const offsets = new Int32Array(model.lengths.length + 1)
    let at = 0
    for (let i = 0; i < model.lengths.length; i += 1) {
      offsets[i] = at
      at += model.lengths[i]
    }
    offsets[model.lengths.length] = at
    for (let i = 0; i < total; i += 1) {
      const high = lookup[blob.charCodeAt(cursor++)]
      const low = lookup[blob.charCodeAt(cursor++)]
      data[i] = (high << 6) + low + header.range[0]
    }
    pools.push({ id: model.id, family: model.family, family_name: model.family_name, data, offsets })
  }
  return { pools, header }
}

function ready(): Store {
  if (!store) store = decode()
  return store
}

export function sourceSha256(): string {
  return ready().header.source_sha256
}

export function listModels(): FingerprintModel[] {
  return ready().pools.map((pool) => ({
    id: pool.id,
    family: pool.family,
    family_name: pool.family_name,
    sequences: pool.offsets.length - 1,
    numbers: pool.data.length,
  }))
}

/**
 * 按模型名找到唯一的指纹模型：先试原名、去厂商前缀、去日期或 -latest 后缀，
 * 再试前缀匹配（取最长的那个）。指向多个型号的名字返回 null。
 */
function candidates(id: string): ModelPool[] {
  const all = ready().pools
  const needle = id.trim().toLowerCase()
  if (!needle) return []

  const stripped = needle.replace(/^[^/]+\//, '')
  const variants = new Set([
    needle,
    stripped,
    stripped.replace(/-\d{4}-\d{2}-\d{2}$/, ''),
    stripped.replace(/-\d{8}$/, ''),
    stripped.replace(/-latest$/, ''),
  ])

  for (const variant of variants) {
    const exact = all.filter((pool) => pool.id.toLowerCase() === variant)
    if (exact.length === 1) return exact
  }
  for (const variant of variants) {
    const prefixed = all.filter((pool) => pool.id.toLowerCase().startsWith(`${variant}-`) || variant.startsWith(`${pool.id.toLowerCase()}-`))
    const longest = prefixed.reduce((best, pool) => (pool.id.length > (best?.id.length ?? 0) ? pool : best), undefined as ModelPool | undefined)
    const tied = prefixed.filter((pool) => pool.id.length === longest?.id.length)
    if (tied.length === 1) return tied
  }
  return []
}

export function resolveModel(id: string, aliases: Record<string, string> = {}): ModelPool | null {
  const query = aliases[id] ?? aliases[id.trim().toLowerCase()] ?? id
  const found = candidates(query)
  return found.length === 1 ? found[0] : null
}
