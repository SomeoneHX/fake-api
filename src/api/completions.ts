import { asString, errorResponse, isRecord, jsonResponse } from '../http'
import type { Env } from '../env'
import { createRng } from '../fingerprint/synthesize'
import { invocationHeaders, pacing, roughTokens, seedFor } from './common'
import { invoke } from './invoke'
import { completionText } from './prompt'
import { eventStream, frame, nowSeconds, randomId, slice, withHeaders } from './sse'

/** 旧版 /v1/completions，只做最简形态。 */
export async function legacyCompletions(request: Request, env: Env): Promise<Response> {
  let raw: unknown
  try {
    raw = await request.json()
  } catch {
    return errorResponse(400, 'We could not parse the JSON body of your request.', 'invalid_request_error')
  }
  if (!isRecord(raw)) return errorResponse(400, 'We could not parse the JSON body of your request.', 'invalid_request_error')
  const model = asString(raw.model)
  if (!model) return errorResponse(400, 'you must provide a model parameter', 'invalid_request_error', 'missing_required_parameter')
  if (raw.prompt === undefined) return errorResponse(400, "Missing required parameter: 'prompt'.", 'invalid_request_error', 'missing_required_parameter')

  const prompt = completionText(raw)
  const seed = seedFor(request, raw)
  const invocation = invoke(env, model, prompt, seed)
  const id = randomId('cmpl-')
  const created = nowSeconds()
  const promptTokens = roughTokens(prompt)
  const completionTokens = roughTokens(invocation.text)
  const usage = { prompt_tokens: promptTokens, completion_tokens: completionTokens, total_tokens: promptTokens + completionTokens }
  const headers = invocationHeaders(invocation, model)

  if (raw.stream === true) {
    const chunk = (text: string, finishReason: string | null) => frame(null, {
      id, object: 'text_completion', created, model, choices: [{ text, index: 0, logprobs: null, finish_reason: finishReason }],
    })
    const frames = slice(invocation.text, createRng(seed)).map((piece) => chunk(piece, null))
    frames.push(chunk('', 'stop'))
    frames.push(frame(null, '[DONE]'))
    return withHeaders(eventStream(frames, pacing(env)), headers)
  }

  return jsonResponse({
    id,
    object: 'text_completion',
    created,
    model,
    choices: [{ text: invocation.text, index: 0, logprobs: null, finish_reason: 'stop' }],
    usage,
  }, { headers })
}
