// 按相对位置从参考序列里重新取值，拼出所要求长度的整数序列。
//
// 参考库的参考回答长度在 184..333 之间，而检测挑战要求的数量在 292..332 之间，
// 两者并不相等；位置分段特征按相对位置切四段，所以用 (i+0.5)/count 映射到来源序列的下标，
// 就能在任意长度下留住原来的位置结构。
import type { ModelPool } from './store'

/** 每次生成混合的来源序列条数。 */
const MIX_WIDTH = 2

export function randomSeed(): number {
  return crypto.getRandomValues(new Uint32Array(1))[0]
}

/** mulberry32：给定种子可复现。 */
export function createRng(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let value = state
    value = Math.imul(value ^ (value >>> 15), value | 1)
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61)
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296
  }
}

function pickSources(pool: ModelPool, rng: () => number): Uint16Array[] {
  const total = pool.offsets.length - 1
  const width = Math.min(MIX_WIDTH, total)
  const order = Array.from({ length: total }, (_, index) => index)
  for (let i = 0; i < width; i += 1) {
    const j = i + Math.floor(rng() * (total - i))
    const swap = order[i]
    order[i] = order[j]
    order[j] = swap
  }
  return order.slice(0, width).map((index) => pool.data.subarray(pool.offsets[index], pool.offsets[index + 1]))
}

export function synthesize(pool: ModelPool, count: number, rng: () => number): number[] {
  const sources = pickSources(pool, rng)
  if (!sources.length) throw new Error(`${pool.id} 没有可用的参考序列`)
  const output = new Array<number>(count)
  for (let i = 0; i < count; i += 1) {
    const source = sources[Math.floor(rng() * sources.length) % sources.length]
    const index = Math.min(source.length - 1, Math.floor(((i + 0.5) / count) * source.length))
    output[i] = source[index]
  }
  return output
}
