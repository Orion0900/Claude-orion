/** Apple touch devices, where sharing a file together with a title can drop "Save Video" from the share sheet. */
function isAppleTouch(): boolean {
  return /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.userAgent.includes('Macintosh') && navigator.maxTouchPoints > 1)
}

function download(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  a.rel = 'noopener'
  a.style.display = 'none'
  document.body.appendChild(a)
  a.click()
  a.remove()
  // Long enough for the browser to start reading it; revoking at once can cancel the download in Safari.
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
}

/**
 * Hands the finished video to the iOS share sheet (Save Video to Photos,
 * TikTok, Instagram, AirDrop…) via navigator.share({ files }), or downloads it
 * where files can't be shared. Call it straight from a tap — Safari only
 * opens the share sheet with a fresh user gesture, so not after awaiting
 * the export. 'cancelled' when the person closes the sheet.
 */
export async function shareOrDownload(blob: Blob, fileName: string, title?: string): Promise<'shared' | 'downloaded' | 'cancelled'> {
  const type = blob.type || (fileName.toLowerCase().endsWith('.webm') ? 'video/webm' : 'video/mp4')
  const file = new File([blob], fileName, { type })
  const data: ShareData = { files: [file] }
  if (title && !isAppleTouch()) data.title = title
  if (typeof navigator !== 'undefined' && navigator.canShare?.(data) && navigator.share) {
    try {
      await navigator.share(data)
      return 'shared'
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') return 'cancelled'
      // NotAllowedError (the gesture expired) or a share target failing: fall back to a download.
    }
  }
  download(file, fileName)
  return 'downloaded'
}
