import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'
import { inviteApi } from '../api/client'
import { MapPin, Calendar, Users, LogIn, CheckCircle, XCircle } from 'lucide-react'

function formatDateRange(start?: string, end?: string) {
  if (!start && !end) return null
  const fmt = (d: string) => new Date(d).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
  if (start && end) return `${fmt(start)} – ${fmt(end)}`
  if (start) return fmt(start)
  return null
}

export default function JoinTripPage() {
  const { token } = useParams<{ token: string }>()
  const navigate = useNavigate()
  const { isAuthenticated, isLoading: authLoading } = useAuthStore()

  const [trip, setTrip] = useState<any>(null)
  const [notFound, setNotFound] = useState(false)
  const [joining, setJoining] = useState(false)
  const [joined, setJoined] = useState(false)
  const [tripId, setTripId] = useState<number | null>(null)

  useEffect(() => {
    if (!token) return
    inviteApi.previewJoin(token)
      .then(d => setTrip(d.trip))
      .catch(() => setNotFound(true))
  }, [token])

  const handleJoin = async () => {
    if (!token) return
    setJoining(true)
    try {
      const d = await inviteApi.joinTrip(token)
      setTripId(d.trip_id)
      setJoined(true)
      setTimeout(() => navigate(`/trips/${d.trip_id}`), 1800)
    } catch {
      setJoining(false)
    }
  }

  const handleLoginRedirect = () => {
    // Pre-set German as default language for the login/register page
    // if no language preference exists yet
    if (!localStorage.getItem('app_language')) {
      localStorage.setItem('app_language', 'de')
    }
    navigate(`/login?next=/join/${token}&joinToken=${token}`)
  }

  // After login: automatically attempt to join
  useEffect(() => {
    if (!isAuthenticated || !token || joined || !trip) return
    const params = new URLSearchParams(window.location.search)
    if (params.get('autojoin') === '1') {
      handleJoin()
    }
  }, [isAuthenticated, trip])

  // ── Loading / auth resolving ──────────────────────────────────────────────
  if (authLoading || (!trip && !notFound)) {
    return (
      <div style={pageStyle}>
        <div style={{ width: 32, height: 32, border: '3px solid #e5e7eb', borderTopColor: '#111827', borderRadius: '50%', animation: 'spin 0.6s linear infinite' }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
      </div>
    )
  }

  if (notFound) {
    return (
      <div style={pageStyle}>
        <div style={cardStyle}>
          <XCircle size={40} color="#ef4444" />
          <h1 style={headingStyle}>Link ungültig oder widerrufen</h1>
          <p style={subStyle}>Dieser Einladungslink ist nicht mehr gültig.</p>
          <button onClick={() => navigate('/')} style={btnPrimary}>Zur Startseite</button>
        </div>
      </div>
    )
  }

  if (joined) {
    return (
      <div style={pageStyle}>
        <div style={cardStyle}>
          <CheckCircle size={40} color="#16a34a" />
          <h1 style={headingStyle}>Willkommen bei der Reise!</h1>
          <p style={subStyle}>Du wirst weitergeleitet…</p>
        </div>
      </div>
    )
  }

  return (
    <div style={pageStyle}>
      <div style={cardStyle}>
        {/* Cover image */}
        {trip.cover_image && (
          <div style={{ width: '100%', height: 160, borderRadius: 12, overflow: 'hidden', marginBottom: 4 }}>
            <img
              src={`/uploads/covers/${trip.cover_image}`}
              alt=""
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            />
          </div>
        )}

        {/* Trip info */}
        <div style={{ textAlign: 'center', padding: '4px 0 8px' }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>
            Einladung zur Reise
          </div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: '#111827', margin: '0 0 8px' }}>{trip.title}</h1>

          {trip.description && (
            <p style={{ fontSize: 13, color: '#6b7280', margin: '0 0 10px', lineHeight: 1.5 }}>{trip.description}</p>
          )}

          <div style={{ display: 'flex', justifyContent: 'center', flexWrap: 'wrap', gap: 10 }}>
            {formatDateRange(trip.start_date, trip.end_date) && (
              <div style={badgeStyle}>
                <Calendar size={12} />
                {formatDateRange(trip.start_date, trip.end_date)}
              </div>
            )}
          </div>
        </div>

        <div style={{ width: '100%', borderTop: '1px solid #f3f4f6', margin: '8px 0' }} />

        {/* Action */}
        {isAuthenticated ? (
          <button onClick={handleJoin} disabled={joining} style={{ ...btnPrimary, width: '100%' }}>
            <Users size={15} />
            {joining ? 'Trete bei…' : 'Dieser Reise beitreten'}
          </button>
        ) : (
          <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 10 }}>
            <p style={{ fontSize: 12, color: '#6b7280', textAlign: 'center', margin: 0 }}>
              Melde dich an, um der Reise beizutreten.
            </p>
            <button onClick={handleLoginRedirect} style={{ ...btnPrimary, width: '100%' }}>
              <LogIn size={15} />
              Anmelden / Registrieren
            </button>
          </div>
        )}
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
  maxWidth: 420,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: 14,
}

const headingStyle: React.CSSProperties = {
  fontSize: 18,
  fontWeight: 700,
  color: '#111827',
  margin: '8px 0 0',
  textAlign: 'center',
}

const subStyle: React.CSSProperties = {
  fontSize: 13,
  color: '#6b7280',
  margin: '4px 0 0',
  textAlign: 'center',
}

const btnPrimary: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 8,
  padding: '11px 20px',
  borderRadius: 10,
  border: 'none',
  background: '#111827',
  color: '#fff',
  fontSize: 14,
  fontWeight: 600,
  cursor: 'pointer',
  fontFamily: 'inherit',
  transition: 'opacity 0.15s',
}

const badgeStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 5,
  fontSize: 12,
  color: '#374151',
  background: '#f3f4f6',
  padding: '4px 10px',
  borderRadius: 20,
}
