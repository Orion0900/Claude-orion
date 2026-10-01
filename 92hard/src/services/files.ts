/**
 * Handing a file to the person. On an iPhone the share sheet is the way out
 * (Save to Files, AirDrop, Mail); everywhere else it downloads.
 */
export async function saveFile(name: string, text: string, type = 'application/json'): Promise<void> {
  const file = new File([text], name, { type })
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: name })
      return
    } catch (error) {
      // Dismissing the sheet is a choice, not a failure.
      if (error instanceof DOMException && error.name === 'AbortError') return
    }
  }
  const url = URL.createObjectURL(file)
  const link = document.createElement('a')
  link.href = url
  link.download = name
  document.body.append(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}
