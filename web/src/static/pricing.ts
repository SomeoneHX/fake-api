import type { PricingData, PricingModel } from '@/features/pricing/types'

/**
 * `/api/pricing` 的替身。
 *
 * 价格按 new-api 的倍率口径书写：输入价（USD / 百万 token）= model_ratio × 2，
 * 输出价 = 输入价 × completion_ratio。quota_type 为 1 的模型按次计费，
 * 用 model_price 表示每次的美元价。
 */

const GROUPS = ['default', 'vip', 'svip']

const TEXT_ENDPOINTS = ['openai', 'openai-response', 'anthropic', 'gemini']

type ModelSeed = {
  name: string
  vendor: number
  ratio: number
  completion: number
  contextLength: number
  tags?: string
  capabilities?: string[]
  endpoints?: string[]
  modelPrice?: number
}

const SEEDS: ModelSeed[] = [
  { name: 'gpt-5', vendor: 1, ratio: 0.625, completion: 8, contextLength: 400000, tags: '旗舰,推理', capabilities: ['reasoning', 'tools', 'vision', 'structured_output'] },
  { name: 'gpt-5-mini', vendor: 1, ratio: 0.125, completion: 8, contextLength: 400000, tags: '轻量,推理', capabilities: ['reasoning', 'tools', 'vision'] },
  { name: 'gpt-4o', vendor: 1, ratio: 1.25, completion: 4, contextLength: 128000, tags: '通用,多模态', capabilities: ['tools', 'vision', 'streaming'] },
  { name: 'gpt-4o-mini', vendor: 1, ratio: 0.075, completion: 4, contextLength: 128000, tags: '轻量,多模态', capabilities: ['tools', 'vision', 'streaming'] },
  { name: 'gpt-4.1', vendor: 1, ratio: 1, completion: 4, contextLength: 1047576, tags: '通用,长文本', capabilities: ['tools', 'vision', 'caching'] },
  { name: 'gpt-4.1-mini', vendor: 1, ratio: 0.2, completion: 4, contextLength: 1047576, tags: '轻量,长文本', capabilities: ['tools', 'vision', 'caching'] },
  { name: 'o3', vendor: 1, ratio: 1, completion: 4, contextLength: 200000, tags: '推理', capabilities: ['reasoning', 'tools', 'vision'] },
  { name: 'o4-mini', vendor: 1, ratio: 0.55, completion: 4, contextLength: 200000, tags: '推理,轻量', capabilities: ['reasoning', 'tools', 'vision'] },
  { name: 'text-embedding-3-large', vendor: 1, ratio: 0.065, completion: 1, contextLength: 8191, tags: '向量', capabilities: ['embeddings'], endpoints: ['embeddings'] },
  { name: 'text-embedding-3-small', vendor: 1, ratio: 0.01, completion: 1, contextLength: 8191, tags: '向量', capabilities: ['embeddings'], endpoints: ['embeddings'] },

  { name: 'claude-opus-4', vendor: 2, ratio: 7.5, completion: 5, contextLength: 200000, tags: '旗舰', capabilities: ['reasoning', 'tools', 'vision', 'caching'] },
  { name: 'claude-sonnet-4', vendor: 2, ratio: 1.5, completion: 5, contextLength: 200000, tags: '通用,编程', capabilities: ['reasoning', 'tools', 'vision', 'caching'] },
  { name: 'claude-3-7-sonnet', vendor: 2, ratio: 1.5, completion: 5, contextLength: 200000, tags: '编程', capabilities: ['reasoning', 'tools', 'vision'] },
  { name: 'claude-3-5-haiku', vendor: 2, ratio: 0.4, completion: 5, contextLength: 200000, tags: '轻量', capabilities: ['tools', 'vision'] },

  { name: 'gemini-2.5-pro', vendor: 3, ratio: 0.625, completion: 8, contextLength: 1048576, tags: '旗舰,长文本', capabilities: ['reasoning', 'tools', 'vision'] },
  { name: 'gemini-2.5-flash', vendor: 3, ratio: 0.15, completion: 8.33, contextLength: 1048576, tags: '轻量,长文本', capabilities: ['reasoning', 'tools', 'vision'] },
  { name: 'gemini-2.0-flash', vendor: 3, ratio: 0.05, completion: 4, contextLength: 1048576, tags: '轻量', capabilities: ['tools', 'vision'] },

  { name: 'deepseek-chat', vendor: 4, ratio: 0.135, completion: 4.07, contextLength: 128000, tags: '国产,编程', capabilities: ['tools', 'caching'] },
  { name: 'deepseek-reasoner', vendor: 4, ratio: 0.275, completion: 4, contextLength: 128000, tags: '国产,推理', capabilities: ['reasoning', 'caching'] },

  { name: 'qwen-max', vendor: 5, ratio: 0.8, completion: 4, contextLength: 32768, tags: '国产,旗舰', capabilities: ['tools', 'streaming'] },
  { name: 'qwen-plus', vendor: 5, ratio: 0.2, completion: 3, contextLength: 131072, tags: '国产,通用', capabilities: ['tools', 'streaming'] },
  { name: 'qwen-turbo', vendor: 5, ratio: 0.025, completion: 4, contextLength: 131072, tags: '国产,轻量', capabilities: ['tools', 'streaming'] },

  { name: 'glm-4-plus', vendor: 6, ratio: 0.35, completion: 1, contextLength: 131072, tags: '国产,通用', capabilities: ['tools', 'streaming'] },
  { name: 'glm-4-air', vendor: 6, ratio: 0.05, completion: 1, contextLength: 131072, tags: '国产,轻量', capabilities: ['tools', 'streaming'] },

  { name: 'kimi-k2', vendor: 7, ratio: 0.3, completion: 4.17, contextLength: 262144, tags: '国产,编程', capabilities: ['tools', 'reasoning'] },
  { name: 'moonshot-v1-128k', vendor: 7, ratio: 0.6, completion: 1, contextLength: 131072, tags: '国产,长文本', capabilities: ['tools', 'streaming'] },

  { name: 'doubao-pro-32k', vendor: 8, ratio: 0.055, completion: 2.5, contextLength: 32768, tags: '国产,通用', capabilities: ['tools', 'streaming'] },
  { name: 'doubao-lite-32k', vendor: 8, ratio: 0.02, completion: 2, contextLength: 32768, tags: '国产,轻量', capabilities: ['tools', 'streaming'] },

  { name: 'grok-4', vendor: 9, ratio: 1.5, completion: 5, contextLength: 256000, tags: '旗舰,推理', capabilities: ['reasoning', 'tools', 'vision'] },
  { name: 'grok-3-mini', vendor: 9, ratio: 0.15, completion: 1.67, contextLength: 131072, tags: '轻量', capabilities: ['reasoning', 'tools'] },

  { name: 'mistral-large-latest', vendor: 10, ratio: 1, completion: 3, contextLength: 131072, tags: '通用', capabilities: ['tools', 'streaming'] },

  { name: 'llama-3.3-70b', vendor: 11, ratio: 0.3, completion: 1.17, contextLength: 131072, tags: '开源', capabilities: ['tools', 'streaming'] },

  { name: 'dall-e-3', vendor: 1, ratio: 0, completion: 0, contextLength: 0, tags: '图像', capabilities: [], endpoints: ['image-generation'], modelPrice: 0.04 },
  { name: 'gpt-image-1', vendor: 1, ratio: 0, completion: 0, contextLength: 0, tags: '图像', capabilities: [], endpoints: ['image-generation'], modelPrice: 0.02 },
  { name: 'whisper-1', vendor: 1, ratio: 0, completion: 0, contextLength: 0, tags: '语音', capabilities: [], endpoints: ['openai'], modelPrice: 0.006 },
]

const MODELS: PricingModel[] = SEEDS.map((seed, index) => {
  const requestBilled = seed.modelPrice !== undefined
  return {
    id: index + 1,
    model_name: seed.name,
    vendor_id: seed.vendor,
    quota_type: requestBilled ? 1 : 0,
    model_ratio: seed.ratio,
    completion_ratio: seed.completion,
    model_price: seed.modelPrice,
    enable_groups: [...GROUPS],
    tags: seed.tags,
    supported_endpoint_types: seed.endpoints ?? [...TEXT_ENDPOINTS],
    context_length: seed.contextLength || undefined,
    capabilities: seed.capabilities as PricingModel['capabilities'],
    input_modalities: ['text'],
    output_modalities: ['text'],
  }
})

export const SITE_PRICING: PricingData = {
  success: true,
  data: MODELS,
  vendors: [
    { id: 1, name: 'OpenAI', description: 'GPT 与 o 系列' },
    { id: 2, name: 'Anthropic', description: 'Claude 系列' },
    { id: 3, name: 'Google', description: 'Gemini 系列' },
    { id: 4, name: 'DeepSeek', description: 'DeepSeek 系列' },
    { id: 5, name: '阿里云百炼', description: '通义千问系列' },
    { id: 6, name: '智谱 AI', description: 'GLM 系列' },
    { id: 7, name: 'Moonshot', description: 'Kimi 系列' },
    { id: 8, name: '火山方舟', description: '豆包系列' },
    { id: 9, name: 'xAI', description: 'Grok 系列' },
    { id: 10, name: 'Mistral', description: 'Mistral 系列' },
    { id: 11, name: 'Meta', description: 'Llama 系列' },
  ],
  group_ratio: { default: 1, vip: 0.8, svip: 0.6 },
  usable_group: {
    default: { desc: '默认分组', ratio: 1 },
    vip: { desc: 'VIP 分组', ratio: 0.8 },
    svip: { desc: 'SVIP 分组', ratio: 0.6 },
  },
  supported_endpoint: {
    openai: 'Chat',
    'openai-response': 'Response',
    anthropic: 'Anthropic',
    gemini: 'Gemini',
    embeddings: 'Embeddings',
    'image-generation': 'Image',
  },
  auto_groups: ['auto'],
}
