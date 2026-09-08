import type { Health, Job } from './types'

const BASE_KEY = 'podbrief:apiBase'

/**
 * Where the API lives. Empty means "same origin", which is the case when the
 * server serves the built app. Set it when the app is hosted elsewhere.
 */
export function getApiBase(): string {
  try {
    return (localStorage.getItem(BASE_KEY) ?? '').replace(/\/+$/, '')
  } catch {
    return ''
  }
}

export function setApiBase(url: string) {
  try {
    localStorage.setItem(BASE_KEY, url.trim().replace(/\/+$/, ''))
  } catch {
    /* private mode */
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${getApiBase()}${path}`, {
    ...init,
    headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) },
  })
  if (res.status === 204) return undefined as T
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error((body as { error?: string }).error ?? `Request failed (${res.status})`)
  return body as T
}

export const api = {
  health: () => request<Health>('/api/health'),
  listJobs: () => request<Job[]>('/api/jobs'),
  getJob: (id: string) => request<Job>(`/api/jobs/${id}`),
  createJob: (url: string) => request<Job>('/api/jobs', { method: 'POST', body: JSON.stringify({ url }) }),
  provideSource: (id: string, source: { feedUrl?: string; audioUrl?: string }) =>
    request<Job>(`/api/jobs/${id}/source`, { method: 'POST', body: JSON.stringify(source) }),
  deleteJob: (id: string) => request<void>(`/api/jobs/${id}`, { method: 'DELETE' }),
}
