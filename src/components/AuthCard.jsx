import { useMemo, useState } from 'react'
import { createUserWithEmailAndPassword, signInWithEmailAndPassword } from 'firebase/auth'
import { auth, firebaseInitError } from '../firebase.js'

function friendlyError(err) {
  const msg = err instanceof Error ? err.message : String(err)
  if (msg.includes('auth/invalid-email')) return 'Please enter a valid email address.'
  if (msg.includes('auth/missing-password')) return 'Please enter a password.'
  if (msg.includes('auth/weak-password')) return 'Password is too weak. Use at least 6 characters.'
  if (msg.includes('auth/email-already-in-use')) return 'That email is already registered. Try logging in.'
  if (msg.includes('auth/invalid-credential') || msg.includes('auth/wrong-password')) return 'Incorrect email or password.'
  if (msg.includes('auth/user-not-found')) return 'No account found for that email. Try registering.'
  return msg
}

export function AuthCard() {
  const [mode, setMode] = useState('register') // 'register' | 'login'
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const canSubmit = useMemo(() => {
    if (firebaseInitError || !auth) return false
    if (!email.trim() || !password) return false
    return true
  }, [email, password, mode])

  const submit = async (e) => {
    e.preventDefault()
    setError('')
    if (firebaseInitError || !auth) {
      setError(firebaseInitError || 'Firebase is not configured.')
      return
    }
    setBusy(true)
    try {
      if (mode === 'register') {
        await createUserWithEmailAndPassword(auth, email.trim(), password)
      } else {
        await signInWithEmailAndPassword(auth, email.trim(), password)
      }
    } catch (err) {
      setError(friendlyError(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="card authCard">
      <div className="cardTitle">Register to vote</div>
      <p className="authBlurb">
        Sign up with your email and password. If you sign up, you are considered <strong>registered</strong>.
      </p>

      {firebaseInitError ? (
        <div className="authInfo">
          <div style={{ fontWeight: 750, marginBottom: 6 }}>Firebase setup required (not a bug)</div>
          <div>{firebaseInitError}</div>
          <div style={{ marginTop: 8, color: 'var(--muted)' }}>
            Create <code>.env.local</code> using <code>env.example</code>, then restart <code>npm run dev</code>.
          </div>
        </div>
      ) : null}

      <div className="authTabs" role="tablist" aria-label="Authentication mode">
        <button
          type="button"
          className={`authTab ${mode === 'register' ? 'active' : ''}`}
          onClick={() => setMode('register')}
        >
          Register
        </button>
        <button type="button" className={`authTab ${mode === 'login' ? 'active' : ''}`} onClick={() => setMode('login')}>
          Log in
        </button>
      </div>

      <form onSubmit={submit}>
        <label className="field">
          <div className="label">Email (username)</div>
          <input
            className="input"
            type="email"
            value={email}
            placeholder="you@example.com"
            autoComplete="email"
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>

        <label className="field">
          <div className="label">Password</div>
          <input
            className="input"
            type="password"
            value={password}
            placeholder="••••••••"
            autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>

        {error ? <div className="authError">{error}</div> : null}

        <button className="authSubmit" type="submit" disabled={!canSubmit || busy}>
          {busy ? 'Working…' : mode === 'register' ? 'Register to vote' : 'Log in'}
        </button>

        <div className="authHint">
          {mode === 'register' ? (
            <span>
              Already registered?{' '}
              <button type="button" className="authLink" onClick={() => setMode('login')}>
                Log in
              </button>
            </span>
          ) : (
            <span>
              Need an account?{' '}
              <button type="button" className="authLink" onClick={() => setMode('register')}>
                Register
              </button>
            </span>
          )}
        </div>
      </form>
    </section>
  )
}


