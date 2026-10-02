/**
 * Which screen is up. There are only a handful, so this is a plain state
 * machine rather than a router; the browser's back gesture is mapped onto it
 * with history entries so swiping back on iPhone does the expected thing.
 */
import { useCallback, useEffect, useState } from 'react'
import { Editor } from './components/Editor'
import { Home } from './components/Home'
import { ImportScreen } from './components/ImportScreen'
import { Recorder } from './components/Recorder'
import { SettingsScreen } from './components/SettingsScreen'
import { loadSettings, saveSettings, type AppSettings } from './services/settings'

type Route =
  | { name: 'home' }
  | { name: 'import'; file: Blob; fileName: string }
  | { name: 'editor'; id: string }
  | { name: 'record' }
  | { name: 'settings'; from: Route }

export default function App() {
  const [route, setRoute] = useState<Route>({ name: 'home' })
  const [settings, setSettings] = useState<AppSettings>(loadSettings)

  const go = useCallback((next: Route, push = true) => {
    setRoute(next)
    if (push && next.name !== 'home' && next.name !== 'import') {
      try {
        history.pushState({ cutline: next.name }, '')
      } catch {
        // History is a nicety; the buttons work without it.
      }
    }
  }, [])

  // The back gesture returns to the project list from anywhere but an import.
  useEffect(() => {
    const onPop = () => setRoute((r) => (r.name === 'settings' ? r.from : r.name === 'import' ? r : { name: 'home' }))
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  const back = useCallback(() => {
    if (history.state?.cutline) history.back()
    else setRoute((r) => (r.name === 'settings' ? r.from : { name: 'home' }))
  }, [])

  const changeSettings = useCallback((next: AppSettings) => {
    setSettings(next)
    saveSettings(next)
  }, [])

  const openEditor = useCallback((id: string) => go({ name: 'editor', id }), [go])

  switch (route.name) {
    case 'home':
      return (
        <Home
          onOpen={openEditor}
          onImport={(file) => go({ name: 'import', file, fileName: file.name })}
          onRecord={() => go({ name: 'record' })}
          onSettings={() => go({ name: 'settings', from: route })}
        />
      )
    case 'import':
      return (
        <ImportScreen
          file={route.file}
          fileName={route.fileName}
          settings={settings}
          onDone={openEditor}
          onCancel={() => setRoute({ name: 'home' })}
        />
      )
    case 'editor':
      return (
        <Editor
          key={route.id}
          id={route.id}
          settings={settings}
          onBack={back}
          onOpenSettings={() => go({ name: 'settings', from: route })}
        />
      )
    case 'record':
      return (
        <Recorder
          onClose={back}
          onUse={(blob, fileName) => setRoute({ name: 'import', file: blob, fileName })}
        />
      )
    case 'settings':
      return <SettingsScreen settings={settings} onChange={changeSettings} onBack={back} />
  }
}
