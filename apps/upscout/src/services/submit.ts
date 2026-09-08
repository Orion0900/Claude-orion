/**
 * Actually sending an application.
 *
 * Upwork has no public endpoint that submits a proposal, and a page in your
 * browser can't drive upwork.com on your behalf. So there are exactly two
 * honest ways to send, and the app supports both rather than pretending:
 *
 * - **Manual** (the default). The letter goes to your clipboard and the job's
 *   apply page opens. You paste, set your terms and press submit. On a phone
 *   that's about four seconds per job, and everything before it — finding,
 *   ranking, writing — was already done for you.
 * - **Bridge.** If you run something that can submit for you, put its URL in
 *   settings and queued applications are POSTed to it. The contract is one
 *   JSON object per application, documented in docs/connector.md.
 *
 * Whichever route, the record only says "submitted" when something confirmed
 * it. An application the app couldn't verify stays queued, because a proposal
 * you think went out and didn't is worse than one you know is waiting.
 */
import type { Application, AutoApplySettings } from '../lib/types'
import { HttpError, requestJson } from './http'

export class NotConfiguredError extends Error {
  constructor() {
    super('No submit URL configured — sending is manual.')
    this.name = 'NotConfiguredError'
  }
}

export interface SubmitResponse {
  ok?: boolean
  status?: string
  error?: string
  /** Where the proposal landed, when the bridge knows. */
  url?: string
}

/**
 * Sends one application through the configured bridge. Throws
 * `NotConfiguredError` when there isn't one, which the caller treats as
 * "hand it to the person" rather than as a failure.
 */
export async function submitApplication(
  application: Application,
  settings: AutoApplySettings,
  signal?: AbortSignal,
): Promise<Application> {
  const endpoint = settings.submitUrl.trim()
  if (!endpoint) throw new NotConfiguredError()

  try {
    const response = await requestJson<SubmitResponse>(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(settings.submitToken ? { Authorization: `Bearer ${settings.submitToken}` } : {}),
      },
      body: JSON.stringify({
        jobId: application.jobId,
        jobUrl: application.jobUrl,
        jobTitle: application.jobTitle,
        coverLetter: application.letter,
        connects: application.connects,
      }),
      // A submission is not safe to repeat: a retry could post the proposal twice.
      retries: 0,
      signal,
    })

    if (response.ok === false || response.error) {
      return { ...application, status: 'failed', reason: response.error ?? 'The bridge refused it' }
    }
    return { ...application, status: 'submitted', submittedAt: new Date().toISOString(), reason: undefined }
  } catch (error) {
    const reason = error instanceof HttpError ? error.message : error instanceof Error ? error.message : String(error)
    return { ...application, status: 'failed', reason }
  }
}

/** The apply page for a posting, or the posting itself if the URL is odd. */
export function applyUrl(jobUrl: string): string {
  const match = /upwork\.com\/jobs\/(~[0-9a-z]+)/i.exec(jobUrl)
  return match ? `https://www.upwork.com/nx/proposals/job/${match[1]}/apply/` : jobUrl
}

/**
 * Clipboard, with the old-fashioned fallback: iOS only allows the async
 * clipboard API from inside a user gesture, and denies it outright in some
 * embedded browsers.
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    // Fall through to the textarea route.
  }
  try {
    const area = document.createElement('textarea')
    area.value = text
    area.setAttribute('readonly', '')
    area.style.position = 'fixed'
    area.style.opacity = '0'
    document.body.appendChild(area)
    area.select()
    const copied = document.execCommand('copy')
    document.body.removeChild(area)
    return copied
  } catch {
    return false
  }
}
