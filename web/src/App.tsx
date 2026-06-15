import { useEffect } from 'react'
import { AddAppModal } from './components/AddAppModal'
import { AppPicker } from './components/AppPicker'
import { ArchiveDrawer } from './components/ArchiveDrawer'
import { Board } from './components/Board'
import { CardDrawer } from './components/CardDrawer'
import { CloneModal } from './components/CloneModal'
import { ConfirmModal } from './components/ConfirmModal'
import { ConnectModal } from './components/ConnectModal'
import { RepoChatDrawer } from './components/RepoChatDrawer'
import { StatsModal } from './components/StatsModal'
import { Toast } from './components/Toast'
import { TopBar } from './components/TopBar'
import { useStore } from './store/useStore'

export default function App() {
  const view = useStore((s) => s.view)
  const appId = useStore((s) => s.appId)
  const init = useStore((s) => s.init)
  const isBoard = view === 'board' && !!appId

  // Probe for a local agent on mount; switch to live data if reachable + paired.
  useEffect(() => {
    void init()
  }, [init])

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <TopBar />
      {isBoard ? <Board /> : <AppPicker />}
      <CardDrawer />
      <CloneModal />
      <ConnectModal />
      <AddAppModal />
      <ConfirmModal />
      <ArchiveDrawer />
      <StatsModal />
      <RepoChatDrawer />
      <Toast />
    </div>
  )
}
