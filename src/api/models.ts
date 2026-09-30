import { errorResponse, jsonResponse } from '../http'
import { listModels, sourceSha256 } from '../fingerprint/store'
import { findModel } from './bank'
import type { Env } from '../env'

/** 列表接口使用的固定创建时间，2026-01-01T00:00:00Z。 */
const CREATED = 1767225600

function entry(model: { id: string; family: string }) {
  return { id: model.id, object: 'model', created: CREATED, owned_by: model.family }
}

export function modelList(): Response {
  return jsonResponse({ object: 'list', data: listModels().map(entry) })
}

export function modelDetail(env: Env, id: string): Response {
  const pool = findModel(env, id)
  const found = pool && listModels().find((model) => model.id === pool.id)
  if (!found) {
    return errorResponse(404, `The model '${id}' does not exist`, 'invalid_request_error', 'model_not_found')
  }
  return jsonResponse(entry(found))
}

export function bankInfo(): { models: number; sequences: number; numbers: number; reference_sha256: string } {
  const models = listModels()
  return {
    models: models.length,
    sequences: models.reduce((total, model) => total + model.sequences, 0),
    numbers: models.reduce((total, model) => total + model.numbers, 0),
    reference_sha256: sourceSha256(),
  }
}
