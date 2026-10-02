import type { AiDebug, GameCommand, PlayerView, RoutePreview } from '../contracts/game'

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`/api${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...options?.headers },
  })
  if (!response.ok) {
    const body: unknown = await response.json().catch(() => null)
    const detail = body && typeof body === 'object' && 'detail' in body ? body.detail : null
    throw new Error(typeof detail === 'string' ? detail : `请求失败 (${response.status})`)
  }
  return (await response.json()) as T
}

export const gameApi = {
  getView: () => request<PlayerView>('/view'),
  previewRoute: (unitId: string, targetId: string) => request<RoutePreview>(`/route-preview?${new URLSearchParams({ unitId, targetId })}`),
  submitCommand: (command: GameCommand) =>
    request<PlayerView>('/commands', { method: 'POST', body: JSON.stringify(command) }),
  advanceDay: () => request<PlayerView>('/day', { method: 'POST' }),
  save: () => request<{ saved: boolean }>('/save', { method: 'POST' }),
  load: () => request<PlayerView>('/load', { method: 'POST' }),
  reset: () => request<PlayerView>('/reset', { method: 'POST' }),
  async getAiDebug(): Promise<AiDebug | null> {
    const response = await fetch('/api/debug/ai')
    return response.ok ? (await response.json()) as AiDebug : null
  },
}
