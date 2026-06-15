import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { TeamApp } from './team/TeamApp'
import './styles/global.css'

// `#team` opens the multi-developer (control-plane) board; everything else is the
// existing local-agent app. Kept separate so local mode is untouched.
const teamMode = typeof location !== 'undefined' && location.hash.replace('#', '').startsWith('team')

createRoot(document.getElementById('root')!).render(<StrictMode>{teamMode ? <TeamApp /> : <App />}</StrictMode>)
