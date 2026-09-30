import type { Env } from '../env'
import { resolveModel, type ModelPool } from '../fingerprint/store'

/** 从环境变量里读额外别名表，格式非法时忽略。 */
export function modelAliases(env: Env): Record<string, string> {
  if (!env.MODEL_ALIASES) return {}
  try {
    const parsed = JSON.parse(env.MODEL_ALIASES)
    return parsed && typeof parsed === 'object' ? parsed as Record<string, string> : {}
  } catch {
    return {}
  }
}

/** 把请求里的模型名解析成指纹库中的模型。 */
export function findModel(env: Env, name: string): ModelPool | null {
  try {
    return resolveModel(name, modelAliases(env))
  } catch {
    return null
  }
}
