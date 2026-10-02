import { bankInfo, modelDetail, modelList } from './api/models'
import { chatCompletions } from './api/chat'
import { createResponse } from './api/responses'
import { legacyCompletions } from './api/completions'
import { consoleApi } from './api/console'
import { logsApi } from './api/logs'
import { tokensApi } from './api/tokens'
import { rankings } from './api/rankings'
import { authenticate } from './auth'
import { corsHeaders, errorResponse } from './http'
import type { Env } from './env'

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
    if (path === '/api/token' || path.startsWith('/api/token/')) return tokensApi(request, env)
    if (path.startsWith('/api/log')) return logsApi(request, env)
    if (path.startsWith('/api/')) return consoleApi(request)

    // /v1 需要 tokens 表里启用的密钥（env.API_KEY 为主密钥兜底）
    const token = await authenticate(request, env)
    if (!token) {
      return errorResponse(401, 'Incorrect API key provided.', 'invalid_request_error', 'invalid_api_key')
    }

    if (path === '/v1/models' && request.method === 'GET') return modelList()
    if (path.startsWith('/v1/models/') && request.method === 'GET') {
      return modelDetail(env, decodeURIComponent(path.slice('/v1/models/'.length)))
    }

    if (request.method === 'POST') {
      if (path === '/v1/chat/completions') return chatCompletions(request, env, ctx, token)
      if (path === '/v1/responses') return createResponse(request, env, ctx, token)
      if (path === '/v1/completions') return legacyCompletions(request, env, ctx, token)
    }

    return errorResponse(404, `Unknown request URL: ${request.method} ${url.pathname}`, 'invalid_request_error', 'unknown_url')
  },
}
