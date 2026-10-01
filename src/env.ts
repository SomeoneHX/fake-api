export interface Env {
  /** 用量流水库，排行榜的数据来源。 */
  DB: D1Database
  /** 非空时校验 Authorization: Bearer。 */
  API_KEY?: string
  /** 额外模型别名的 JSON，例如 {"gpt-4o-latest":"gpt-4o"}。 */
  MODEL_ALIASES?: string
  /** 流式输出的帧间隔毫秒数，0 表示不额外等待。 */
  STREAM_PACING_MS?: string
}
