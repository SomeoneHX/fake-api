import { bankInfo, modelDetail, modelList } from './api/models'
import { chatCompletions } from './api/chat'
import { createResponse } from './api/responses'
import { legacyCompletions } from './api/completions'
import { rankings } from './api/rankings'
import { asString, corsHeaders, errorResponse } from './http'
import type { Env } from './env'

function authorized(request: Request, env: Env): boolean {
  const expected = asString(env.API_KEY)
  if (!expected) return true
  const header = request.headers.get('authorization') ?? ''
  const bearer = header.replace(/^Bearer\s+/i, '')
  return bearer === expected || request.headers.get('x-api-key') === expected
}

function normalise(pathname: string): string {
  let path = pathname.replace(/\/+$/, '')
  while (path.startsWith('/v1/v1/')) path = path.slice(3)
  return path || '/'
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url)
    const path = normalise(url.pathname)

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders() })
    }

    if (path === '/health') {
      return new Response(JSON.stringify({ ok: true, ...bankInfo() }), {
        headers: { 'content-type': 'application/json; charset=utf-8', ...corsHeaders() },
      })
    }

    // 网页直接读，和 /health 一样放在鉴权之前
    if (path === '/api/rankings' && request.method === 'GET') return rankings(request, env)

    if (!authorized(request, env)) {
      return errorResponse(401, 'Incorrect API key provided.', 'invalid_request_error', 'invalid_api_key')
    }

    if (path === '/v1/models' && request.method === 'GET') return modelList()
    if (path.startsWith('/v1/models/') && request.method === 'GET') {
      return modelDetail(env, decodeURIComponent(path.slice('/v1/models/'.length)))
    }

    if (request.method === 'POST') {
      if (path === '/v1/chat/completions') return chatCompletions(request, env, ctx)
      if (path === '/v1/responses') return createResponse(request, env, ctx)
      if (path === '/v1/completions') return legacyCompletions(request, env, ctx)
    }

    return errorResponse(404, `Unknown request URL: ${request.method} ${url.pathname}`, 'invalid_request_error', 'unknown_url')
  },
}
