import { asString, errorResponse, isRecord, jsonResponse } from '../http'
import type { Env } from '../env'
import { createRng } from '../fingerprint/synthesize'
import type { TokenAuth } from '../auth'
import { recordUsage } from '../usage'
import { pacing, roughTokens, seedFor } from './common'
import { invoke } from './invoke'
import { completionText } from './prompt'
import { eventStream, frame, nowSeconds, randomId, slice } from './sse'

/** 旧版 /v1/completions，只做最简形态。 */
export async function legacyCompletions(request: Request, env: Env, ctx: ExecutionContext, token: TokenAuth | null): Promise<Response> {
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
  const text = invoke(env, model, prompt, seed)
  recordUsage(env, ctx, request, { model, prompt, completion: text }, token)
  const id = randomId('cmpl-')
  const created = nowSeconds()
  const promptTokens = roughTokens(prompt)
  const completionTokens = roughTokens(text)
  const usage = { prompt_tokens: promptTokens, completion_tokens: completionTokens, total_tokens: promptTokens + completionTokens }

  if (raw.stream === true) {
    const chunk = (piece: string, finishReason: string | null) => frame(null, {
      id, object: 'text_completion', created, model, choices: [{ text: piece, index: 0, logprobs: null, finish_reason: finishReason }],
    })
    const frames = slice(text, createRng(seed)).map((piece) => chunk(piece, null))
    frames.push(chunk('', 'stop'))
    frames.push(frame(null, '[DONE]'))
    return eventStream(frames, pacing(env))
  }

  return jsonResponse({
    id,
    object: 'text_completion',
    created,
    model,
    choices: [{ text, index: 0, logprobs: null, finish_reason: 'stop' }],
    usage,
  })
}
