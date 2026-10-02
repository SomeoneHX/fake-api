/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
import { API_ENDPOINTS, DEFAULT_GROUP } from './constants'
import { getPlaygroundHeaders } from './lib/playground-key'
import type {
  ChatCompletionRequest,
  ChatCompletionResponse,
  ModelOption,
  GroupOption,
} from './types'

/**
 * Send chat completion request (non-streaming)
 */
export async function sendChatCompletion(
  payload: ChatCompletionRequest,
  signal?: AbortSignal
): Promise<ChatCompletionResponse> {
  const headers = await getPlaygroundHeaders()
  const res = await fetch(API_ENDPOINTS.CHAT_COMPLETIONS, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
    signal,
  })
  return (await res.json()) as ChatCompletionResponse
}

/**
 * Get the models the backend serves
 */
export async function getUserModels(): Promise<ModelOption[]> {
  const headers = await getPlaygroundHeaders()
  const res = await fetch(API_ENDPOINTS.MODELS, { headers })
  if (!res.ok) {
    return []
  }
  const data = (await res.json()) as { data?: unknown }

  const models = data?.data
  if (!Array.isArray(models)) {
    return []
  }

  return models
    .map((model: { id?: unknown }) => model?.id)
    .filter((id: unknown): id is string => typeof id === 'string' && id !== '')
    .map((id: string) => ({ label: id, value: id }))
}

/**
 * Get user groups
 */
export async function getUserGroups(): Promise<GroupOption[]> {
  return [{ label: DEFAULT_GROUP, value: DEFAULT_GROUP, ratio: 1 }]
}
