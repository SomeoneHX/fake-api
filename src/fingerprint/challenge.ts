// lm-detector 的挑战提示词要求模型逐项写出固定数量的 1..355 整数。
// 这里从提示词里认出这个任务，并取出它要求的数量。
//
// 判据有两步：提示词里出现独立的 355（取值范围的上界），以及能找到一个合理的数量。
// 数量先按常见措辞匹配；匹配不到时取范围标记之前的最后一个数字。
// 中文、日文、韩文模板都把数量写在范围之后，靠量词（个 / 個 / 개）认出来。

const STANDALONE_355 = /(?:^|\D)355(?!\d)/

const COUNT_PATTERNS: RegExp[] = [
  /for each of\s+(\d{1,4})/i,
  /(?:exactly|precisely)\s+(\d{1,4})/i,
  /(\d{1,4})\s*个\s*(?=1\s*(?:到|至|[-~—－])\s*355|整数|数字|取值|位置|闭区间)/,
  /(\d{1,4})\s*(?:positions|integers|numbers|values|items|choices)/i,
  /(?:共|合计|总计)\s*(?:给出|输出|写出|选择|生成|提供)?\s*(\d{1,4})\s*个/,
  /(\d{1,4})\s*[个個개]/,
]

const MIN_COUNT = 40
const MAX_COUNT = 4000

function valid(value: number): boolean {
  return Number.isInteger(value) && value !== 1 && value !== 355 && value >= MIN_COUNT && value <= MAX_COUNT
}

/** 取范围标记之前的最后一个可用数字。 */
function trailingCount(before: string): number | null {
  let found: number | null = null
  for (const match of before.matchAll(/\d{1,4}/g)) {
    const value = Number(match[0])
    if (valid(value)) found = value
  }
  return found
}

/** 提示词要求的整数个数；不是数值选择任务时返回 null。 */
export function probeCount(text: string): number | null {
  const marker = STANDALONE_355.exec(text)
  if (!marker) return null
  for (const pattern of COUNT_PATTERNS) {
    for (const match of text.matchAll(new RegExp(pattern, 'gi'))) {
      const value = Number(match[1])
      if (valid(value)) return value
    }
  }
  return trailingCount(text.slice(0, marker.index))
}
