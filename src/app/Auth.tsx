import { ArrowRight, BarChart3, Layers3, ShieldCheck, TrendingUp } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import type { Session } from '../../../backend/shared/types'
import { api, errorText } from './api'

export function Brand() {
  return (
    <span className="brand">
      <span className="brand-icon">
        <TrendingUp size={20} strokeWidth={2.5} />
      </span>
      CloseSignal<span className="brand-dot">.</span>
    </span>
  )
}

type Join = { email: string; role: string; workspace: string }
export function Auth({ onSession }: { onSession: (session: Session) => void }) {
  const location = useLocation()
  const navigate = useNavigate()
  const joining = location.pathname === '/join'
  const registering = location.pathname === '/register'
  const token = new URLSearchParams(location.hash.slice(1)).get('invite') || ''
  const [preview, setPreview] = useState<Join>()
  const [previewError, setPreviewError] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!joining || !token) return
    let cancelled = false
    api<Join>('/invites/preview', 'POST', { token }).then(
      (value) => {
        if (!cancelled) setPreview(value)
      },
      (cause: unknown) => {
        if (!cancelled) setPreviewError(errorText(cause))
      },
    )
    return () => {
      cancelled = true
    }
  }, [joining, token])

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const values = Object.fromEntries(new FormData(event.currentTarget))
    if ((registering || joining) && values.password !== values.confirm) {
      setError('Passwords do not match.')
      return
    }
    setBusy(true)
    setError('')
    try {
      const path = joining ? '/invites/accept' : registering ? '/register' : '/login'
      const { session } = await api<{ session: Session }>(
        path,
        'POST',
        joining ? { ...values, token } : values,
      )
      onSession(session)
      navigate('/', { replace: true })
    } catch (cause) {
      setError(errorText(cause))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="auth">
      <aside className="auth-hero">
        <Brand />
        <div className="auth-pitch">
          <div className="auth-symbol">
            <BarChart3 size={47} />
          </div>
          <h1>
            See where your
            <br />
            sales stand.
          </h1>
          <p>
            Review your pipeline, track your targets, and get answers from the deals your team
            records.
          </p>
          <div className="auth-features">
            <span>
              <Layers3 size={17} /> One sales workspace
            </span>
            <span>
              <ShieldCheck size={17} /> Role-based access
            </span>
          </div>
        </div>
      </aside>
      <main className="auth-main">
        <div className="auth-card">
          <div className="mobile-auth-brand">
            <Brand />
          </div>
          <h2>
            {joining ? 'Join a workspace' : registering ? 'Create your workspace' : 'Sign in'}
          </h2>
          <p className="muted">
            {joining
              ? preview
                ? `You’re joining ${preview.workspace} as ${preview.role}.`
                : 'Accept your workspace invitation.'
              : registering
                ? 'Your account will be the workspace owner.'
                : 'Open your CloseSignal sales workspace.'}
          </p>
          {joining && (!token || previewError) && (
            <p className="notice error" role="alert">
              {previewError || 'Open the invitation link shared by your workspace administrator.'}
            </p>
          )}
          {joining && token && !preview && !previewError && (
            <p role="status">Checking invitation…</p>
          )}
          {(!joining || preview) && (
            <form
              key={location.pathname + token}
              className="form-stack"
              onSubmit={(event) => void submit(event)}
            >
              {(registering || joining) && (
                <label>
                  Full name
                  <input name="name" autoComplete="name" required minLength={2} maxLength={100} />
                </label>
              )}
              {registering && (
                <label>
                  Workspace name
                  <input
                    name="workspace"
                    autoComplete="organization"
                    required
                    minLength={2}
                    maxLength={100}
                  />
                </label>
              )}
              <label>
                Work email
                <input
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  defaultValue={preview?.email}
                  readOnly={joining}
                />
              </label>
              {registering && (
                <label>
                  Currency
                  <select name="currency" defaultValue="INR">
                    {['INR', 'USD', 'EUR', 'GBP', 'AED', 'CAD', 'AUD', 'SGD'].map((currency) => (
                      <option key={currency}>{currency}</option>
                    ))}
                  </select>
                </label>
              )}
              <label>
                Password
                <input
                  name="password"
                  type="password"
                  autoComplete={registering || joining ? 'new-password' : 'current-password'}
                  required
                  minLength={registering || joining ? 12 : undefined}
                  maxLength={128}
                />
              </label>
              {(registering || joining) && (
                <label>
                  Confirm password
                  <input
                    name="confirm"
                    type="password"
                    autoComplete="new-password"
                    minLength={12}
                    maxLength={128}
                    required
                  />
                  <small>Use at least 12 characters.</small>
                </label>
              )}
              {error && (
                <p className="notice error" role="alert">
                  {error}
                </p>
              )}
              <button className="primary" disabled={busy}>
                {busy
                  ? 'Please wait…'
                  : joining
                    ? 'Join workspace'
                    : registering
                      ? 'Create workspace'
                      : 'Sign in'}
                <ArrowRight size={17} />
              </button>
            </form>
          )}
          <p className="auth-switch">
            {registering || joining ? (
              <>
                Already have an account? <Link to="/login">Sign in</Link>
              </>
            ) : (
              <>
                Need a new workspace? <Link to="/register">Create one</Link>
              </>
            )}
          </p>
        </div>
      </main>
    </div>
  )
}
