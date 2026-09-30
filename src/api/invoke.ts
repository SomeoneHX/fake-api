import type { Env } from '../env'
import { probeCount } from '../fingerprint/challenge'
import { createRng, randomSeed, synthesize } from '../fingerprint/synthesize'
import { findModel } from './bank'

export interface Invocation {
  mode: 'fingerprint' | 'fallback'
  /** 命中的指纹模型 id。 */
  fingerprint: string | null
  /** 挑战提示词要求的整数个数。 */
  count: number | null
  text: string
}

function fallbackText(env: Env): string {
  return env.FALLBACK_TEXT || '这是一个演示用的 OpenAI 兼容接口。除数值选择任务外，所有请求都会返回这段固定文本。'
}

/**
 * 请求是数值选择任务、且模型名能在指纹库里解析出来时，返回按该模型指纹生成的整数序列；
 * 其余情况返回固定文本。
 */
export function invoke(env: Env, model: string, text: string, seed: number | null): Invocation {
  const count = probeCount(text)
  if (count !== null) {
    const matched = findModel(env, model)
    if (matched) {
      const numbers = synthesize(matched, count, createRng(seed ?? randomSeed()))
      return { mode: 'fingerprint', fingerprint: matched.id, count, text: JSON.stringify(numbers) }
    }
  }
  return { mode: 'fallback', fingerprint: null, count, text: fallbackText(env) }
}
