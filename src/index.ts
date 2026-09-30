import { bankInfo, modelDetail, modelList } from './api/models'
import { chatCompletions } from './api/chat'
import { createResponse } from './api/responses'
import { legacyCompletions } from './api/completions'
import { listModels } from './fingerprint/store'
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

const LANDING = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>fake-openai-api</title>
<style>
  :root { color-scheme: light; }
  body { margin: 0; padding: 40px 20px; font: 15px/1.6 -apple-system, "Segoe UI", "PingFang SC", sans-serif; background: #f6f7f9; color: #1f2328; }
  main { max-width: 760px; margin: 0 auto; }
  h1 { font-size: 22px; margin: 0 0 6px; }
  p.lead { margin: 0 0 24px; color: #59636e; }
  section { background: #fff; border: 1px solid #d8dee4; border-radius: 10px; padding: 18px 20px; margin-bottom: 16px; }
  h2 { font-size: 15px; margin: 0 0 12px; color: #1f2328; }
  code { background: #f0f2f5; border-radius: 4px; padding: 1px 5px; font-size: 13px; }
  table { width: 100%; border-collapse: collapse; font-size: 14px; }
  td, th { text-align: left; padding: 6px 8px; border-bottom: 1px solid #eaeef2; vertical-align: top; }
  th { color: #59636e; font-weight: 500; }
  .tag { display: inline-block; background: #eef2ff; color: #3b48c9; border-radius: 4px; padding: 0 6px; font-size: 12px; margin-right: 6px; }
  ul { margin: 0; padding-left: 18px; columns: 3; font-size: 13px; }
  li { margin-bottom: 2px; }
</style>
</head>
<body>
<main>
  <h1>fake-openai-api</h1>
  <p class="lead">一个冒充 OpenAI 的 Cloudflare Worker。收到数值选择任务时按请求的模型名回放 lm-detector 的参考指纹，其余请求返回固定文本。</p>
  <section>
    <h2>接口</h2>
    <table>
      <tr><th>方法</th><th>路径</th><th>说明</th></tr>
      <tr><td>GET</td><td><code>/v1/models</code></td><td>模型列表</td></tr>
      <tr><td>GET</td><td><code>/v1/models/{id}</code></td><td>单个模型</td></tr>
      <tr><td>POST</td><td><code>/v1/chat/completions</code></td><td>支持 SSE 流式</td></tr>
      <tr><td>POST</td><td><code>/v1/responses</code></td><td>支持 SSE 流式</td></tr>
      <tr><td>POST</td><td><code>/v1/completions</code></td><td>旧版补全</td></tr>
      <tr><td>GET</td><td><code>/health</code></td><td>指纹库信息</td></tr>
    </table>
  </section>
  <section>
    <h2>参考指纹</h2>
    <p><span class="tag">__MODELS__ 个模型</span><span class="tag">__SEQUENCES__ 条序列</span><span class="tag">__NUMBERS__ 个整数</span></p>
    <p style="font-size:13px;color:#59636e;margin:0">来源 reference sha256 <code>__SHA__</code></p>
  </section>
  <section>
    <h2>可用模型名</h2>
    <ul>__LIST__</ul>
  </section>
  <section>
    <h2>复现</h2>
    <p style="margin:0;font-size:13px;color:#59636e">在请求体里带 <code>seed</code>，或加请求头 <code>x-fingerprint-seed</code>，同一模型同一数量会得到同一串数字。响应头 <code>x-fake-api-mode</code> 说明本次是 <code>fingerprint</code> 还是 <code>fallback</code>。</p>
  </section>
</main>
</body>
</html>`

function landing(): Response {
  const info = bankInfo()
  const html = LANDING
    .replace('__MODELS__', String(info.models))
    .replace('__SEQUENCES__', String(info.sequences))
    .replace('__NUMBERS__', String(info.numbers))
    .replace('__SHA__', info.reference_sha256)
    .replace('__LIST__', listModels().map((model) => `<li>${model.id}</li>`).join(''))
  return new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8', ...corsHeaders() } })
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)
    const path = normalise(url.pathname)

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders() })
    }

    if (path === '/' && request.method === 'GET') return landing()
    if (path === '/health') {
      return new Response(JSON.stringify({ ok: true, ...bankInfo() }), {
        headers: { 'content-type': 'application/json; charset=utf-8', ...corsHeaders() },
      })
    }

    if (!authorized(request, env)) {
      return errorResponse(401, 'Incorrect API key provided.', 'invalid_request_error', 'invalid_api_key')
    }

    if (path === '/v1/models' && request.method === 'GET') return modelList()
    if (path.startsWith('/v1/models/') && request.method === 'GET') {
      return modelDetail(env, decodeURIComponent(path.slice('/v1/models/'.length)))
    }

    if (request.method === 'POST') {
      if (path === '/v1/chat/completions') return chatCompletions(request, env)
      if (path === '/v1/responses') return createResponse(request, env)
      if (path === '/v1/completions') return legacyCompletions(request, env)
    }

    return errorResponse(404, `Unknown request URL: ${request.method} ${url.pathname}`, 'invalid_request_error', 'unknown_url')
  },
}
