import { useEffect, useState } from 'react'
import type { Session } from '../../../backend/shared/types'
import { useLocation } from 'react-router-dom'
import { api, errorText, loadSession } from './api'
import { Auth } from './Auth'
import { Workspace } from './Workspace'

export function App() {
  const location = useLocation()
  const [session, setSession] = useState<Session | null>()
  const [error, setError] = useState('')
  useEffect(() => {
    let cancelled = false
    loadSession().then(
      ({ session: current }) => {
        if (!cancelled) setSession(current)
      },
      (cause: unknown) => {
        if (!cancelled) setError(errorText(cause))
      },
    )
    return () => {
      cancelled = true
    }
  }, [])
  if (error)
    return (
      <main className="gate">
        <h1>Unable to open CloseSignal</h1>
        <p>{error}</p>
        <button className="primary" onClick={() => window.location.reload()}>
          Retry
        </button>
      </main>
    )
  if (session === undefined)
    return (
      <main className="gate" role="status">
        Loading CloseSignal…
      </main>
    )
  if (session === null || location.pathname === '/join')
    return <Auth key={location.pathname + location.hash} onSession={setSession} />
  return (
    <Workspace
      key={session.id}
      session={session}
      onSession={setSession}
      onLogout={async () => {
        await api('/logout', 'POST', {})
        setSession(null)
      }}
    />
  )
}
