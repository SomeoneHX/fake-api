import type { PricingData, PricingModel } from '@/features/pricing/types'

/**
 * `/api/pricing` 的替身。
 *
 * 模型清单与 Worker 的 `/v1/models` 一致：53 个模型，按 id 字典序排列。
 * 价格一律为 0——输入价（USD / 百万 token）= model_ratio × 2，输出价再乘 completion_ratio。
 */

const GROUPS = ['default', 'vip', 'svip']

/** Worker 只实现 OpenAI 形状的接口，所以只有这两种端点。 */
const TEXT_ENDPOINTS = ['openai', 'openai-response']

const VENDORS = [
  { id: 1, name: 'Anthropic', description: 'Claude 系列' },
  { id: 2, name: 'DeepSeek', description: 'DeepSeek 系列' },
  { id: 3, name: 'Google', description: 'Gemini 系列' },
  { id: 4, name: '智谱 AI', description: 'GLM 系列' },
  { id: 5, name: 'OpenAI', description: 'GPT 系列' },
  { id: 6, name: 'xAI', description: 'Grok 系列' },
  { id: 7, name: '腾讯混元', description: 'Hunyuan 系列' },
  { id: 8, name: 'Moonshot', description: 'Kimi 系列' },
  { id: 9, name: '小米', description: 'MiMo 系列' },
  { id: 10, name: 'Muse', description: 'Muse 系列' },
  { id: 11, name: '阿里云百炼', description: 'Qwen 系列' },
  { id: 12, name: '阶跃星辰', description: 'Step 系列' },
]

/** 模型名前缀 → 厂商 id。 */
const VENDOR_PREFIXES: [string, number][] = [
  ['claude', 1],
  ['deepseek', 2],
  ['gemini', 3],
  ['glm', 4],
  ['gpt', 5],
  ['grok', 6],
  ['hy', 7],
  ['kimi', 8],
  ['mimo', 9],
  ['muse', 10],
  ['qwen', 11],
  ['step', 12],
]

const MODEL_NAMES = [
  'claude-opus-5',
  'claude-fable-5.1',
  'claude-fable-5',
  'claude-haiku-4-5-20251001',
  'claude-opus-4-6',
  'claude-opus-4-7',
  'claude-opus-4-8',
  'claude-opus-5-5',
  'claude-sonnet-4-6',
  'claude-sonnet-5',
  'claude-sonnet-5.5',

  'deepseek-v3.2',
  'deepseek-v4-flash',
  'deepseek-v4-flash-0731',
  'deepseek-v4-pro',
  'deepseek-v4-pro-0813',
  'deepseek-v4.1-flash',

  'gemini-2.5-pro',
  'gemini-3.1-pro-preview',
  'gemini-3.5-flash',
  'gemini-3.6-flash',
  'gemini-3.7-flash',
  'gemini-3.8-flash',

  'glm-5.2',
  'glm-5.3',
  'glm-5.3-flash',
  'glm-5.3-flashx',

  'gpt-4o',
  'gpt-5.4',
  'gpt-5.5',
  'gpt-5.6-luna',
  'gpt-5.6-sol',
  'gpt-5.6-terra',
  'gpt-6-astra',
  'gpt-6-luna',
  'gpt-6-sol',
  'gpt-6-sol-20260922',

  'grok-4.5',
  'grok-4.6',
  'grok-4.7',

  'hy4-preview',

  'kimi-k2.8-preview',
  'kimi-k3',

  'mimo-v2.5',
  'mimo-v2.5-pro',
  'mimo-v2.6-flash',
  'mimo-v2.6-pro',

  'muse-spark-1.2',
  'muse-spark-1.3',
  'muse-spark-1.3-contributor',

  'qwen3.8-27b',
  'qwen3.8-max-0902',

  'step-5-preview',
]

function vendorOf(name: string): number {
  const hit = VENDOR_PREFIXES.find(([prefix]) => name.startsWith(prefix))
  return hit ? hit[1] : 0
}

const MODELS: PricingModel[] = MODEL_NAMES.map((name, index) => ({
  id: index + 1,
  model_name: name,
  vendor_id: vendorOf(name),
  quota_type: 0,
  model_ratio: 0,
  completion_ratio: 0,
  enable_groups: [...GROUPS],
  supported_endpoint_types: [...TEXT_ENDPOINTS],
  input_modalities: ['text'],
  output_modalities: ['text'],
}))

export const SITE_PRICING: PricingData = {
  success: true,
  data: MODELS,
  vendors: VENDORS,
  group_ratio: { default: 1, vip: 0.8, svip: 0.6 },
  usable_group: {
    default: { desc: '默认分组', ratio: 1 },
    vip: { desc: 'VIP 分组', ratio: 0.8 },
    svip: { desc: 'SVIP 分组', ratio: 0.6 },
  },
  supported_endpoint: {
    openai: 'Chat',
    'openai-response': 'Response',
  },
  auto_groups: ['auto'],
}
