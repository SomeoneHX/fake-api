import { asRecord, asString, errorResponse, isRecord, jsonResponse } from '../http'
import type { Env } from '../env'
import { createRng } from '../fingerprint/synthesize'
import type { TokenAuth } from '../auth'
import { recordUsage } from '../usage'
import { pacing, roughTokens, seedFor } from './common'
import { invoke } from './invoke'
import { responsesText } from './prompt'
import { eventStream, frame, nowSeconds, randomId, slice } from './sse'

function outputText(text: string): unknown[] {
  return [{
    type: 'message',
    id: randomId('msg_'),
    status: 'completed',
    role: 'assistant',
    content: [{ type: 'output_text', text, annotations: [] }],
  }]
}

function payload(model: string, id: string, created: number, text: string, usage: Record<string, unknown>): Record<string, unknown> {
  return {
    id,
    object: 'response',
    created_at: created,
    status: 'completed',
    background: false,
    error: null,
    incomplete_details: null,
    instructions: null,
    max_output_tokens: null,
    model,
    output: outputText(text),
    output_text: text,
    parallel_tool_calls: true,
    previous_response_id: null,
    prompt_cache_key: null,
    reasoning: { effort: null, summary: null },
    safety_identifier: null,
    service_tier: 'default',
    store: false,
    temperature: 1,
    text: { format: { type: 'text' } },
    tool_choice: 'auto',
    tools: [],
    top_logprobs: 0,
    top_p: 1,
    truncation: 'disabled',
    usage,
    user: null,
    metadata: {},
  }
}

export async function createResponse(request: Request, env: Env, ctx: ExecutionContext, token: TokenAuth): Promise<Response> {
  let raw: unknown
  try {
    raw = await request.json()
  } catch {
    return errorResponse(400, 'We could not parse the JSON body of your request.', 'invalid_request_error')
  }
  if (!isRecord(raw)) return errorResponse(400, 'We could not parse the JSON body of your request.', 'invalid_request_error')
  const model = asString(raw.model)
  if (!model) return errorResponse(400, 'Missing required parameter: model.', 'invalid_request_error', 'missing_required_parameter')
  if (raw.input === undefined || raw.input === null) {
    return errorResponse(400, "Missing required parameter: 'input'.", 'invalid_request_error', 'missing_required_parameter')
  }

  const prompt = responsesText(raw)
  const seed = seedFor(request, raw)
  const text = invoke(env, model, prompt, seed)
  recordUsage(env, ctx, request, { model, prompt, completion: text }, token)
  const id = randomId('resp_')
  const created = nowSeconds()
  const inputTokens = roughTokens(prompt)
  const outputTokens = roughTokens(text)
  const usage = {
    input_tokens: inputTokens,
    input_tokens_details: { cached_tokens: 0 },
    output_tokens: outputTokens,
    output_tokens_details: { reasoning_tokens: 0 },
    total_tokens: inputTokens + outputTokens,
  }
  const body = payload(model, id, created, text, usage)

  if (raw.stream === true) {
    let sequence = 0
    const events: string[] = []
    const push = (type: string, extra: Record<string, unknown> = {}) => {
      events.push(frame(type, { type, sequence_number: sequence++, ...extra }))
    }
    const item = asRecord((body.output as unknown[])[0])
    const part = asRecord((item.content as unknown[])[0])

    push('response.created', { response: { ...body, status: 'in_progress', output: [], output_text: '', usage: null } })
    push('response.in_progress', { response: { ...body, status: 'in_progress', output: [], output_text: '', usage: null } })
    push('response.output_item.added', { output_index: 0, item: { ...item, status: 'in_progress', content: [] } })
    push('response.content_part.added', { item_id: item.id, output_index: 0, content_index: 0, part: { ...part, text: '' } })
    for (const piece of slice(text, createRng(seed))) {
      push('response.output_text.delta', { item_id: item.id, output_index: 0, content_index: 0, delta: piece, logprobs: [] })
    }
    push('response.output_text.done', { item_id: item.id, output_index: 0, content_index: 0, text, logprobs: [] })
    push('response.content_part.done', { item_id: item.id, output_index: 0, content_index: 0, part })
    push('response.output_item.done', { output_index: 0, item })
    push('response.completed', { response: body })

    return eventStream(events, pacing(env))
  }

  return jsonResponse(body)
}
