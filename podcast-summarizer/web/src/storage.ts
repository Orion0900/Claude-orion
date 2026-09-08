/**
 * Finished summaries are kept on the device so they open instantly and read
 * offline. The server remains the source of truth; this is a mirror.
 */
import type { Job } from './types'

const KEY = 'podbrief:jobs'
const MAX = 60

function read(): Job[] {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? (JSON.parse(raw) as Job[]) : []
  } catch {
    return []
  }
}

function write(jobs: Job[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(jobs.slice(0, MAX)))
  } catch {
    /* quota or private mode: the server still has it */
  }
}

export const savedJobs = {
  all: (): Job[] => read().sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
  get: (id: string): Job | undefined => read().find((j) => j.id === id),
  put(job: Job) {
    if (job.stage !== 'done' || !job.summary) return
    write([job, ...read().filter((j) => j.id !== job.id)])
  },
  remove(id: string) {
    write(read().filter((j) => j.id !== id))
  },
}
