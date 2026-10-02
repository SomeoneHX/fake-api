import { asRecord, errorResponse, jsonResponse } from '../http'
import type { Env } from '../env'
import { createRng } from '../fingerprint/synthesize'
import type { TokenAuth } from '../auth'
import { recordUsage } from '../usage'
import { pacing, parseChatBody, roughTokens, seedFor } from './common'
import { invoke } from './invoke'
import { eventStream, frame, nowSeconds, randomId, slice } from './sse'

export async function chatCompletions(request: Request, env: Env, ctx: ExecutionContext, token: TokenAuth): Promise<Response> {
  let raw: unknown
  try {
    raw = await request.json()
  } catch {
    return errorResponse(400, 'We could not parse the JSON body of your request.', 'invalid_request_error')
  }
  const parsed = parseChatBody(raw)
  if ('error' in parsed) return parsed.error
  const { body, prompt, model } = parsed

  const seed = seedFor(request, body)
  const text = invoke(env, model, prompt, seed)
  recordUsage(env, ctx, request, { model, prompt, completion: text }, token)
  const id = randomId('chatcmpl-')
  const created = nowSeconds()
  const promptTokens = roughTokens(prompt)
  const completionTokens = roughTokens(text)
  const usage = { prompt_tokens: promptTokens, completion_tokens: completionTokens, total_tokens: promptTokens + completionTokens }

  if (body.stream === true) {
    const chunk = (delta: Record<string, unknown>, finishReason: string | null) => frame(null, {
      id, object: 'chat.completion.chunk', created, model, system_fingerprint: null,
      choices: [{ index: 0, delta, logprobs: null, finish_reason: finishReason }],
    })
    const frames = [chunk({ role: 'assistant', content: '' }, null)]
    for (const piece of slice(text, createRng(seed))) frames.push(chunk({ content: piece }, null))
    frames.push(chunk({}, 'stop'))
    if (asRecord(body.stream_options).include_usage === true) {
      frames.push(frame(null, { id, object: 'chat.completion.chunk', created, model, choices: [], usage }))
    }
    frames.push(frame(null, '[DONE]'))
    return eventStream(frames, pacing(env))
  }

  return jsonResponse({
    id,
    object: 'chat.completion',
    created,
    model,
    system_fingerprint: null,
    choices: [{ index: 0, message: { role: 'assistant', content: text, refusal: null }, logprobs: null, finish_reason: 'stop' }],
    usage,
  })
}
