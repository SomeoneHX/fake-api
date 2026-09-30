import { asArray, asString, errorResponse, isRecord } from '../http'
import { randomSeed } from '../fingerprint/synthesize'
import type { Env } from '../env'
import { chatText, headerSeed, requestSeed } from './prompt'

/** 粗略的 token 估算：数字每三位一个，其余每四个字符一个。 */
export function roughTokens(text: string): number {
  const digits = (text.match(/[0-9]+/g) ?? []).reduce((total, run) => total + Math.ceil(run.length / 3), 0)
  return Math.max(1, digits + Math.ceil(text.replace(/[0-9]+/g, '').length / 4))
}

/** 流式输出的帧间隔；未配置或非法时为 0。 */
export function pacing(env: Env): number {
  const value = Number(env.STREAM_PACING_MS)
  return Number.isFinite(value) && value > 0 ? Math.min(value, 1000) : 0
}

/** 复现用的种子：请求体优先，其次请求头，最后随机。 */
export function seedFor(request: Request, body: Record<string, unknown>): number {
  return requestSeed(body) ?? headerSeed(request) ?? randomSeed()
}

export function parseChatBody(raw: unknown): { body: Record<string, unknown>; prompt: string; model: string } | { error: Response } {
  if (!isRecord(raw)) return { error: errorResponse(400, 'We could not parse the JSON body of your request.', 'invalid_request_error') }
  const model = asString(raw.model)
  if (!model) return { error: errorResponse(400, 'you must provide a model parameter', 'invalid_request_error', 'missing_required_parameter') }
  if (!asArray(raw.messages).length) return { error: errorResponse(400, "Missing required parameter: 'messages'.", 'invalid_request_error', 'missing_required_parameter') }
  return { body: raw, prompt: chatText(raw), model }
}
