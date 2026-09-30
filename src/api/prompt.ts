import { asArray, asRecord, asString } from '../http'

/** content 可以是字符串，也可以是若干文本片段。 */
function contentText(content: unknown): string {
  if (typeof content === 'string') return content
  return asArray(content).map((part) => {
    const item = asRecord(part)
    return asString(item.text) || asString(item.input_text) || asString(item.output_text)
  }).filter(Boolean).join('\n')
}

/** Chat Completions 的 messages。 */
export function chatText(body: Record<string, unknown>): string {
  return asArray(body.messages).map((message) => {
    const item = asRecord(message)
    return contentText(item.content)
  }).filter(Boolean).join('\n')
}

/** Responses 的 input，可以是字符串，也可以是消息条目数组。 */
export function responsesText(body: Record<string, unknown>): string {
  const input = body.input
  if (typeof input === 'string') return [asString(body.instructions), input].filter(Boolean).join('\n')
  const parts = asArray(input).map((entry) => {
    if (typeof entry === 'string') return entry
    const item = asRecord(entry)
    return contentText(item.content) || asString(item.text)
  })
  return [asString(body.instructions), ...parts].filter(Boolean).join('\n')
}

/** 旧版 Completions 的 prompt。 */
export function completionText(body: Record<string, unknown>): string {
  const prompt = body.prompt
  if (typeof prompt === 'string') return prompt
  return asArray(prompt).map((item) => (typeof item === 'string' ? item : contentText(asRecord(item).content))).join('\n')
}

/** 请求体里显式指定的随机种子，用于复现同一批数字。 */
export function requestSeed(body: Record<string, unknown>): number | null {
  for (const key of ['seed', 'fingerprint_seed', 'fingerprintSeed']) {
    const value = body[key]
    if (typeof value === 'number' && Number.isFinite(value)) return Math.trunc(value)
    if (typeof value === 'string' && /^\d+$/.test(value)) return Number(value)
  }
  return null
}

export function headerSeed(request: Request): number | null {
  const value = request.headers.get('x-fingerprint-seed')
  return value && /^\d+$/.test(value) ? Number(value) : null
}
