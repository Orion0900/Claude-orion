import { useEffect } from 'react'
import { useRoute } from './router'
import { SettingsProvider, useSettings } from './store/settings'
import { CompareScreen } from './ui/screens/Compare'
import { History } from './ui/screens/History'
import { Home } from './ui/screens/Home'
import { NewAnalysis } from './ui/screens/NewAnalysis'
import { ProfileFlow } from './ui/screens/ProfileFlow'
import { Report } from './ui/screens/Report'
import { Review } from './ui/screens/Review'
import { About, Settings } from './ui/screens/Settings'
import { Welcome } from './ui/screens/Welcome'

function Screens() {
  const route = useRoute()
  const [settings] = useSettings()
  const key = JSON.stringify(route)

  // A new screen starts at the top (a report section link scrolls itself).
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [key])

  if (!settings.onboarded && route.name !== 'about') return <Welcome />
  switch (route.name) {
    case 'welcome':
      return <Welcome />
    case 'new':
    case 'camera':
      return <NewAnalysis />
    case 'review':
      return <Review key={route.id} id={route.id} />
    case 'report':
      return <Report key={route.id} id={route.id} section={route.section} />
    case 'profile':
      return <ProfileFlow key={route.id} id={route.id} />
    case 'history':
      return <History />
    case 'compare':
      return <CompareScreen a={route.a} b={route.b} />
    case 'settings':
      return <Settings />
    case 'about':
      return <About />
    default:
      return <Home />
  }
}

export default function App() {
  return (
    <SettingsProvider>
      <Screens />
    </SettingsProvider>
  )
}
