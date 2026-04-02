import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { authApi } from '../api/client'
import { KeyRound, CheckCircle, XCircle, Eye, EyeOff } from 'lucide-react'

export default function ResetPasswordPage() {
  const { token } = useParams<{ token: string }>()
  const navigate = useNavigate()

  const [status, setStatus] = useState<'loading' | 'valid' | 'invalid' | 'success'>('loading')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!token) { setStatus('invalid'); return }
    authApi.validateResetToken(token)
      .then(() => setStatus('valid'))
      .catch(() => setStatus('invalid'))
  }, [token])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (password.length < 8) {
      setError('Passwort muss mindestens 8 Zeichen lang sein.')
      return
    }
    if (password !== confirmPassword) {
      setError('Passwörter stimmen nicht überein.')
      return
    }
    setSubmitting(true)
    try {
      await authApi.resetPassword(token!, password)
      setStatus('success')
      setTimeout(() => navigate('/login'), 2500)
    } catch {
      setError('Der Link ist ungültig oder abgelaufen.')
      setSubmitting(false)
    }
  }

  if (status === 'loading') {
    return (
      <div style={pageStyle}>
        <div style={{ width: 32, height: 32, border: '3px solid #e5e7eb', borderTopColor: '#111827', borderRadius: '50%', animation: 'spin 0.6s linear infinite' }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
      </div>
    )
  }

  if (status === 'invalid') {
    return (
      <div style={pageStyle}>
        <div style={cardStyle}>
          <XCircle size={40} color="#ef4444" />
          <h1 style={headingStyle}>Link ungültig oder abgelaufen</h1>
          <p style={subStyle}>Dieser Passwort-Reset-Link ist nicht mehr gültig. Bitte wende dich an einen Administrator.</p>
          <button onClick={() => navigate('/login')} style={btnPrimary}>Zur Anmeldung</button>
        </div>
      </div>
    )
  }

  if (status === 'success') {
    return (
      <div style={pageStyle}>
        <div style={cardStyle}>
          <CheckCircle size={40} color="#16a34a" />
          <h1 style={headingStyle}>Passwort geändert</h1>
          <p style={subStyle}>Dein Passwort wurde erfolgreich zurückgesetzt. Du wirst zur Anmeldung weitergeleitet…</p>
        </div>
      </div>
    )
  }

  return (
    <div style={pageStyle}>
      <div style={cardStyle}>
        <div style={{ width: 52, height: 52, borderRadius: '50%', background: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <KeyRound size={24} color="#475569" />
        </div>
        <h1 style={headingStyle}>Neues Passwort festlegen</h1>
        <p style={subStyle}>Gib ein neues Passwort für dein Konto ein.</p>

        <form onSubmit={handleSubmit} style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 12, marginTop: 4 }}>
          <div style={{ position: 'relative' }}>
            <input
              type={showPassword ? 'text' : 'password'}
              placeholder="Neues Passwort (min. 8 Zeichen)"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              style={inputStyle}
              autoFocus
            />
            <button type="button" onClick={() => setShowPassword(v => !v)} style={eyeBtn}>
              {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>

          <div style={{ position: 'relative' }}>
            <input
              type={showConfirm ? 'text' : 'password'}
              placeholder="Passwort bestätigen"
              value={confirmPassword}
              onChange={e => setConfirmPassword(e.target.value)}
              required
              style={inputStyle}
            />
            <button type="button" onClick={() => setShowConfirm(v => !v)} style={eyeBtn}>
              {showConfirm ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>

          {error && (
            <p style={{ fontSize: 13, color: '#ef4444', margin: 0, textAlign: 'center' }}>{error}</p>
          )}

          <button type="submit" disabled={submitting} style={{ ...btnPrimary, width: '100%', marginTop: 4 }}>
            {submitting ? 'Wird gespeichert…' : 'Passwort speichern'}
          </button>
        </form>
      </div>
    </div>
  )
}

const pageStyle: React.CSSProperties = {
  minHeight: '100vh',
  background: '#f9fafb',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 20,
  fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', system-ui, sans-serif",
}

const cardStyle: React.CSSProperties = {
  background: '#fff',
  borderRadius: 18,
  boxShadow: '0 4px 24px rgba(0,0,0,0.08)',
  padding: 28,
  width: '100%',
  maxWidth: 400,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: 12,
}

const headingStyle: React.CSSProperties = {
  fontSize: 18,
  fontWeight: 700,
  color: '#111827',
  margin: '4px 0 0',
  textAlign: 'center',
}

const subStyle: React.CSSProperties = {
  fontSize: 13,
  color: '#6b7280',
  margin: '0 0 4px',
  textAlign: 'center',
  lineHeight: 1.5,
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '10px 40px 10px 14px',
  borderRadius: 10,
  border: '1.5px solid #e5e7eb',
  fontSize: 14,
  color: '#111827',
  outline: 'none',
  boxSizing: 'border-box',
  background: '#fff',
}

const eyeBtn: React.CSSProperties = {
  position: 'absolute',
  right: 10,
  top: '50%',
  transform: 'translateY(-50%)',
  background: 'none',
  border: 'none',
  cursor: 'pointer',
  color: '#9ca3af',
  display: 'flex',
  alignItems: 'center',
}

const btnPrimary: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 8,
  padding: '10px 20px',
  background: '#111827',
  color: '#fff',
  border: 'none',
  borderRadius: 10,
  fontSize: 14,
  fontWeight: 600,
  cursor: 'pointer',
}
