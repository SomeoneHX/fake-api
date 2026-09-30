import type { Env } from '../env'
import { probeCount } from '../fingerprint/challenge'
import { createRng, randomSeed, synthesize } from '../fingerprint/synthesize'
import { findModel } from './bank'

const THURSDAY_REPLY = '疯狂星期四V我50！'
const OTHER_DAY_REPLY = '今天不是星期四也要V我50！'

/** 按北京时间算星期几，UTC+8 没有夏令时。 */
function fallbackText(): string {
  return new Date(Date.now() + 8 * 60 * 60 * 1000).getUTCDay() === 4 ? THURSDAY_REPLY : OTHER_DAY_REPLY
}

/**
 * 请求是数值选择任务、且模型名能在指纹库里解析出来时，返回按该模型指纹生成的整数序列；
 * 其余情况返回固定文本。
 */
export function invoke(env: Env, model: string, text: string, seed: number | null): string {
  const count = probeCount(text)
  if (count !== null) {
    const matched = findModel(env, model)
    if (matched) return JSON.stringify(synthesize(matched, count, createRng(seed ?? randomSeed())))
  }
  return fallbackText()
}
