import { useEffect, useState } from 'react'
import { AddAppModal } from './components/AddAppModal'
import { AppPicker } from './components/AppPicker'
import { ArchiveDrawer } from './components/ArchiveDrawer'
import { Board } from './components/Board'
import { CardDrawer } from './components/CardDrawer'
import { CloneModal } from './components/CloneModal'
import { ConfirmModal } from './components/ConfirmModal'
import { ConnectModal } from './components/ConnectModal'
import { CreateAppWizard } from './components/CreateAppWizard'
import { RepoChatDrawer } from './components/RepoChatDrawer'
import { StatsModal } from './components/StatsModal'
import { TeamApp } from './team/TeamApp'
import { Toast } from './components/Toast'
import { TopBar } from './components/TopBar'
import { useStore } from './store/useStore'

export default function App() {
  const view = useStore((s) => s.view)
  const appId = useStore((s) => s.appId)
  const init = useStore((s) => s.init)
  const isBoard = view === 'board' && !!appId
  // Solo (your machine) vs Team (shared server). Solo is the default and is the
  // original single-developer app, completely unchanged.
  const [mode, setMode] = useState<'solo' | 'team'>(() => {
    try {
      return localStorage.getItem('dispatch.mode') === 'team' ? 'team' : 'solo'
    } catch {
      return 'solo'
    }
  })
  const changeMode = (m: 'solo' | 'team') => {
    setMode(m)
    try {
      localStorage.setItem('dispatch.mode', m)
    } catch {
      /* ignore */
    }
  }

  // Probe for a local agent on mount; switch to live data if reachable + paired.
  useEffect(() => {
    void init()
  }, [init])

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <TopBar mode={mode} onModeChange={changeMode} />
      {mode === 'team' ? (
        <TeamApp />
      ) : (
        <>
          {isBoard ? <Board /> : <AppPicker />}
          <CardDrawer />
          <CloneModal />
          <ConnectModal />
          <AddAppModal />
          <ConfirmModal />
          <ArchiveDrawer />
          <StatsModal />
          <RepoChatDrawer />
          <CreateAppWizard />
        </>
      )}
      <Toast />
    </div>
  )
}
