# fake-openai-api

一个冒充 OpenAI 接口的 Cloudflare Worker。

收到数值选择挑战时，它按请求体里的模型名从该模型的参考指纹里生成一串 1..355 的整数，让 [lm-detector](https://github.com/Ikaleio/lm-detector) 之类的检测器把响应认成那个模型；其余请求一律返回固定文本。

## 前端静态站

`web/` 是从 [New API](https://github.com/QuantumNous/new-api) 前端移植来的纯静态站点，站点名为「滚木 API」，首页标语是「你说的每一句话，都是滚木」。保留首页、模型价格表、关于与错误页，去掉了登录、控制台与排行榜；站点状态与模型定价来自 `web/src/static/` 的内置常量，不发后端请求。

```sh
cd web
bun install
bun run dev                 # 本地开发
bun run build               # 产物在 web/dist
bun run typecheck
```

`web/dist` 是纯静态文件，可放到任意静态托管。`web/public/_redirects` 提供 Cloudflare Pages 的 SPA 回退。

```sh
cd web
npx wrangler pages deploy dist --project-name=rollwood-api
```

## 接口

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/v1/models` | 模型列表，含全部可回放的指纹模型 |
| GET | `/v1/models/{id}` | 单个模型 |
| POST | `/v1/chat/completions` | Chat Completions，支持 SSE 流式 |
| POST | `/v1/responses` | Responses API，支持 SSE 流式 |
| POST | `/v1/completions` | 旧版补全 |
| GET | `/health` | 指纹库规模与来源哈希 |

## 行为

一次请求先判两件事：

1. **是不是数值选择挑战**：提示词里出现独立的 `355`，并且能取到要求的数量。检测器的默认挑战（中文，要求 292–332 个）、入库存档的固定挑战（英文，要求 218–333 个）都能识别。数量按措辞匹配（`for each of N positions`、`N 个 1 到 355`、`exactly N` 等），匹配不到时取范围标记之前的最后一个数字。
2. **模型名能不能解析到指纹**：先精确匹配，再按小写匹配，然后去掉厂商前缀、`-latest`、日期后缀重试，最后做前缀匹配。只有唯一命中才算成功；`deepseek` 这种指向多个型号的写法会落到兜底。

两件事都成立时，按该模型的参考序列生成提示词要求的整数个数，以 JSON 数组返回。否则返回固定文本：北京时间是星期四返回 `疯狂星期四V我50！`，其余日子返回 `今天不是星期四也要V我50！`。响应体与响应头都不区分这两种情况。

生成方式是按相对位置从该模型的多条参考序列里重新取值：挑战要求的数量与参考序列的长度并不相等，而检测器的位置分段特征按相对位置切四段，所以用 `(i + 0.5) / count` 映射到来源序列的下标即可在任意长度下留住原来的分布。每次请求随机挑两条参考序列混合，因此同一个模型每次得到的序列都不同。

请求体里带 `seed`（或加请求头 `x-fingerprint-seed`）可以复现同一串数字。

## 配置

`wrangler.jsonc` 的 `vars`：

| 变量 | 说明 |
| --- | --- |
| `API_KEY` | 非空时校验 `Authorization: Bearer` 与 `x-api-key` |
| `MODEL_ALIASES` | 额外别名的 JSON，如 `{"gpt-4o-latest":"gpt-4o"}` |
| `STREAM_PACING_MS` | 流式输出的帧间隔毫秒数。0 表示尽快下发；非 0 时输出看起来是在逐字生成，检测器也能报出解码速度 |

`wrangler.jsonc` 里的 `vars` 用于本地与简单部署。要放密钥就用 `wrangler secret put API_KEY`，别写进文件。

## 开发与部署

```sh
npm install
npm run dev          # 本地起服务
npm run typecheck    # 类型检查
npm run deploy       # 发布到 Cloudflare
```

线上地址 <https://ai.sohx.asia>，在 `wrangler.jsonc` 的 `routes` 里以 `custom_domain: true` 声明，证书与 DNS 由 Cloudflare 自动配置。声明自定义域名后 Wrangler 默认不再开通 workers.dev，因此没有备用地址；需要时加 `"workers_dev": true`。

用 lm-detector 检测：

```sh
curl https://ai.sohx.asia/health
npx lmfpd@latest -b https://ai.sohx.asia/v1 -k sk-anything -m gpt-4o
npx lmfpd@latest -b https://ai.sohx.asia/v1 -k sk-anything -m gpt-4o -a cc
```

## 指纹数据

`src/fingerprint/data/fingerprints.txt` 由 lm-detector 的参考批次生成，不手工维护：

```sh
node scripts/build-fingerprints.mjs [unified_reference.jsonl] [unified_bank.json]
```

默认从 `../lm-detector/data/` 读取。文件第 1 行是头部 JSON（字母表、模型顺序、每个模型各条序列的长度），其余是拼接后的数据，每个整数用两个字符表示。当前 53 个模型、1948 条序列、约 65 万个整数，打包后约 780 KiB（gzip）。

`source_sha256` 是参考批次的哈希，应与检测器产物的 `source_reference_sha256` 一致；两者不一致说明指纹库和检测器不是同一批数据。

## 限制

- 结果只在参考库的封闭集合里成立。参考库换版本，指纹文件要重新生成。
- 同源变体难以区分。`gpt-6-sol` 与 `gpt-6-sol-20260922` 是同一模型的两次采样，排名会来回摆动。
- 参考库里没有的模型名一律落到固定文本，不会编造指纹。

## 数据来源与许可

指纹数据取自 lm-detector 的参考库（MIT），生成脚本对该库只读。仓库里不含任何真实模型的权重或凭据。
