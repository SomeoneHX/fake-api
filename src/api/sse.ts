import { corsHeaders } from '../http'

export const SSE_HEADERS: Record<string, string> = {
  'content-type': 'text/event-stream; charset=utf-8',
  'cache-control': 'no-cache, no-transform',
  'x-accel-buffering': 'no',
}

export function frame(name: string | null, payload: unknown): string {
  const data = typeof payload === 'string' ? payload : JSON.stringify(payload)
  return name ? `event: ${name}\ndata: ${data}\n\n` : `data: ${data}\n\n`
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * 按 pull 逐帧下发，客户端会看到分片到达而不是一次性整包。
 * pacingMs 大于 0 时每帧之间加延迟，让流式输出看起来是在逐字生成。
 */
export function eventStream(frames: string[], pacingMs = 0): Response {
  const encoder = new TextEncoder()
  let cursor = 0
  const body = new ReadableStream<Uint8Array>({
    async pull(controller) {
      if (cursor >= frames.length) {
        controller.close()
        return
      }
      if (pacingMs > 0 && cursor > 0) await sleep(pacingMs)
      controller.enqueue(encoder.encode(frames[cursor]))
      cursor += 1
    },
  })
  return new Response(body, { headers: { ...SSE_HEADERS, ...corsHeaders() } })
}

/** 给流式响应补上标记头。 */
export function withHeaders(response: Response, headers: Record<string, string>): Response {
  for (const [key, value] of Object.entries(headers)) response.headers.set(key, value)
  return response
}

/** 把一段文本切成大小不一的小块，模拟模型逐 token 输出。 */
export function slice(text: string, rng: () => number, minimum = 18, spread = 48): string[] {
  const pieces: string[] = []
  let cursor = 0
  while (cursor < text.length) {
    const size = minimum + Math.floor(rng() * spread)
    pieces.push(text.slice(cursor, cursor + size))
    cursor += size
  }
  return pieces.length ? pieces : ['']
}

export function randomId(prefix: string): string {
  const bytes = crypto.getRandomValues(new Uint8Array(12))
  let hex = ''
  for (const byte of bytes) hex += byte.toString(16).padStart(2, '0')
  return `${prefix}${hex}`
}

export function nowSeconds(): number {
  return Math.floor(Date.now() / 1000)
}
