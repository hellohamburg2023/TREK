import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { MapContainer, TileLayer, Marker, Tooltip, useMap } from 'react-leaflet'
import L from 'leaflet'
import { useTranslation, SUPPORTED_LANGUAGES } from '../i18n'
import { useSettingsStore } from '../store/settingsStore'
import { shareApi } from '../api/client'
import { getCategoryIcon } from '../components/shared/categoryIcons'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { Clock, MapPin, FileText, Train, Plane, Bus, Car, Ship, Ticket, Hotel, Map, Luggage, Wallet, MessageCircle, Receipt, Monitor, Utensils, Users, BarChart3, Check } from 'lucide-react'

const TRANSPORT_TYPES = new Set(['flight', 'train', 'bus', 'car', 'cruise'])

const TRANSPORT_ICONS: Record<string, any> = { flight: Plane, train: Train, bus: Bus, car: Car, cruise: Ship }

const ALL_TYPE_ICONS: Record<string, any> = {
  flight: Plane, train: Train, bus: Bus, car: Car, cruise: Ship,
  hotel: Hotel, restaurant: Utensils, event: Ticket, tour: Users, other: FileText,
}

const TYPE_COLORS: Record<string, string> = {
  flight: '#3b82f6', hotel: '#8b5cf6', restaurant: '#ef4444', train: '#06b6d4',
  car: '#6b7280', cruise: '#0ea5e9', event: '#f59e0b', tour: '#10b981', other: '#6b7280',
}

function createMarkerIcon(place: any) {
  const cat = place.category
  const color = cat?.color || '#6366f1'
  const CatIcon = getCategoryIcon(cat?.icon)
  const iconSvg = renderToStaticMarkup(createElement(CatIcon, { size: 14, strokeWidth: 2, color: 'white' }))
  return L.divIcon({
    className: '',
    iconSize: [28, 28],
    iconAnchor: [14, 14],
    html: `<div style="width:28px;height:28px;border-radius:50%;background:${color};display:flex;align-items:center;justify-content:center;box-shadow:0 2px 6px rgba(0,0,0,0.3);border:2px solid white;">${iconSvg}</div>`,
  })
}

function FitBoundsToPlaces({ places }: { places: any[] }) {
  const map = useMap()
  useEffect(() => {
    if (places.length === 0) return
    const bounds = L.latLngBounds(places.map(p => [p.lat, p.lng]))
    map.fitBounds(bounds, { padding: [40, 40], maxZoom: 14 })
  }, [places, map])
  return null
}

export default function SharedTripPage() {
  const { token } = useParams<{ token: string }>()
  const { t, locale } = useTranslation()
  const [data, setData] = useState<any>(null)
  const [error, setError] = useState(false)
  const [selectedDay, setSelectedDay] = useState<number | null>(null)
  const [showPastDays, setShowPastDays] = useState(false)
  const [activeTab, setActiveTab] = useState('')
  const { updateSetting } = useSettingsStore()
  const [showLangPicker, setShowLangPicker] = useState(false)

  // Force system/device theme on this public page
  useEffect(() => {
    const applyDark = (isDark: boolean) => {
      document.documentElement.classList.toggle('dark', isDark)
      const meta = document.querySelector('meta[name="theme-color"]')
      if (meta) meta.setAttribute('content', isDark ? '#09090b' : '#ffffff')
    }
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    applyDark(mq.matches)
    const handler = (e: MediaQueryListEvent) => applyDark(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])

  useEffect(() => {
    if (!token) return
    let cancelled = false
    shareApi.getSharedTrip(token)
      .then(d => { if (!cancelled) setData(d) })
      .catch(() => { if (!cancelled) setError(true) })
    return () => { cancelled = true }
  }, [token])

  useEffect(() => {
    if (!data || activeTab) return
    const perms = data.permissions
    if (perms?.share_map !== false) setActiveTab('plan')
    else if (perms?.share_bookings) setActiveTab('bookings')
    else if (perms?.share_packing) setActiveTab('packing')
    else if (perms?.share_budget) setActiveTab('budget')
    else if (perms?.share_kosten) setActiveTab('kosten')
    else if (perms?.share_collab) setActiveTab('collab')
  }, [data, activeTab])

  if (error) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: '#f3f4f6' }}>
      <div style={{ textAlign: 'center', padding: 40 }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>🔒</div>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: '#111827' }}>{t('share.expiredTitle')}</h1>
        <p style={{ color: '#6b7280', marginTop: 8 }}>{t('share.expiredHint')}</p>
      </div>
    </div>
  )

  if (!data) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: '#f3f4f6' }}>
      <div style={{ width: 32, height: 32, border: '3px solid #e5e7eb', borderTopColor: '#111827', borderRadius: '50%', animation: 'spin 0.6s linear infinite' }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )

  const { trip, days, assignments, dayNotes, places, reservations, accommodations, packing, budget, categories, permissions, collab, kosten } = data
  const sortedDays = [...(days || [])].sort((a: any, b: any) => a.day_number - b.day_number)

  // Check if any content is shared at all
  const hasAnyContent = permissions && (
    permissions.share_map !== false ||
    permissions.share_bookings ||
    permissions.share_packing ||
    permissions.share_budget ||
    permissions.share_kosten ||
    permissions.share_collab
  )

  // Compute kosten balances and simplified debts client-side
  const kostenData = (() => {
    if (!kosten) return null
    const expenses: any[] = kosten.expenses || []
    const shares: any[] = kosten.shares || []
    const users: any[] = kosten.users || []
    type Person = { user_id: any; user_name: string; name: string; paid: number; owed: number }
    const personMap: Record<string, Person> = {}
    const getKey = (uid: any, uname: string) => uid != null ? `u:${uid}` : `c:${uname}`
    const getOrCreate = (uid: any, uname: string): Person => {
      const key = getKey(uid, uname)
      if (!personMap[key]) {
        const name = uid != null ? (users.find((u: any) => u.id === uid)?.username || `User ${uid}`) : uname
        personMap[key] = { user_id: uid, user_name: uname, name, paid: 0, owed: 0 }
      }
      return personMap[key]
    }
    for (const exp of expenses) {
      const rate = exp.exchange_rate || 1
      const amountBase = (parseFloat(exp.amount) || 0) * rate
      const payer = getOrCreate(exp.paid_by, exp.paid_by_name || '')
      payer.paid += amountBase
      const expShares = shares.filter((s: any) => s.expense_id === exp.id)
      if (expShares.length === 0) { payer.owed += amountBase; continue }
      for (const s of expShares) {
        const p2 = getOrCreate(s.user_id, s.user_name || '')
        let shareAmt: number
        if (exp.split_type === 'unequal_percent') shareAmt = amountBase * ((s.share_value || 0) / 100)
        else if (exp.split_type === 'unequal_amount') shareAmt = (s.share_value || 0) * rate
        else shareAmt = amountBase / expShares.length
        p2.owed += shareAmt
      }
    }
    const balances = Object.values(personMap).map(p => ({ ...p, balance: p.paid - p.owed }))
    const debtors = balances.filter(b => b.balance < -0.005).map(b => ({ name: b.name, amount: -b.balance })).sort((a, b) => b.amount - a.amount)
    const creditors = balances.filter(b => b.balance > 0.005).map(b => ({ name: b.name, amount: b.balance })).sort((a, b) => b.amount - a.amount)
    const debts: { fromName: string; toName: string; amount: number }[] = []
    while (debtors.length > 0 && creditors.length > 0) {
      const d = debtors[0], c = creditors[0]
      const amt = Math.min(d.amount, c.amount)
      if (amt > 0.005) debts.push({ fromName: d.name, toName: c.name, amount: amt })
      d.amount -= amt; c.amount -= amt
      if (d.amount < 0.005) debtors.shift()
      if (c.amount < 0.005) creditors.shift()
    }
    return { expenses, shares, users, balances, debts }
  })()

  // Map places
  const mapPlaces = selectedDay
    ? (assignments[String(selectedDay)] || []).map((a: any) => a.place).filter((p: any) => p?.lat && p?.lng)
    : (places || []).filter((p: any) => p?.lat && p?.lng)

  const center = mapPlaces.length > 0 ? [mapPlaces[0].lat, mapPlaces[0].lng] : [48.85, 2.35]

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-secondary, #f3f4f6)', fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', system-ui, sans-serif" }}>
      {/* Header */}
      <div style={{ background: 'linear-gradient(135deg, #000 0%, #0f172a 50%, #1e293b 100%)', color: 'white', padding: '32px 20px 28px', textAlign: 'center', position: 'relative', overflow: 'hidden' }}>
        {/* Cover image background */}
        {trip.cover_image && (
          <div style={{ position: 'absolute', inset: 0, backgroundImage: `url(${trip.cover_image.startsWith('http') ? trip.cover_image : trip.cover_image.startsWith('/') ? trip.cover_image : '/uploads/' + trip.cover_image})`, backgroundSize: 'cover', backgroundPosition: 'center', opacity: 0.15 }} />
        )}
        {/* Background decoration */}
        <div style={{ position: 'absolute', top: -60, right: -60, width: 200, height: 200, borderRadius: '50%', background: 'rgba(255,255,255,0.03)' }} />
        <div style={{ position: 'absolute', bottom: -40, left: -40, width: 150, height: 150, borderRadius: '50%', background: 'rgba(255,255,255,0.02)' }} />

        {/* Logo */}
        <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 44, height: 44, borderRadius: 12, background: 'rgba(255,255,255,0.08)', backdropFilter: 'blur(8px)', marginBottom: 12, border: '1px solid rgba(255,255,255,0.1)' }}>
          <img src="/icons/icon-white.svg" alt="TREK" width="26" height="26" />
        </div>

        <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: 3, textTransform: 'uppercase', opacity: 0.35, marginBottom: 12 }}>Öffentliche Darstellung zur Trip-Planung</div>

        <h1 style={{ margin: '0 0 4px', fontSize: 26, fontWeight: 700, letterSpacing: -0.5 }}>{trip.title}</h1>

        {trip.description && (
          <div style={{ fontSize: 13, opacity: 0.5, maxWidth: 400, margin: '0 auto', lineHeight: 1.5 }}>{trip.description}</div>
        )}

        {(trip.start_date || trip.end_date) && (
          <div style={{ marginTop: 10, display: 'inline-flex', alignItems: 'center', gap: 8, padding: '6px 14px', borderRadius: 20, background: 'rgba(255,255,255,0.08)', backdropFilter: 'blur(4px)', border: '1px solid rgba(255,255,255,0.08)' }}>
            <span style={{ fontSize: 12, fontWeight: 500, opacity: 0.8 }}>
              {[trip.start_date, trip.end_date].filter(Boolean).map((d: string) => new Date(d + 'T00:00:00').toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' })).join(' — ')}
            </span>
            {days?.length > 0 && <span style={{ fontSize: 11, opacity: 0.4 }}>·</span>}
            {days?.length > 0 && <span style={{ fontSize: 11, opacity: 0.5 }}>{t('share.daysCount', { count: days.length })}</span>}
          </div>
        )}

        <div style={{ marginTop: 12, fontSize: 9, fontWeight: 500, letterSpacing: 1.5, textTransform: 'uppercase', opacity: 0.25 }}>{t('share.readOnly')}</div>

        {/* Language picker + theme indicator - top right */}
        <div style={{ position: 'absolute', top: 12, right: 12, zIndex: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
          <div title="Gerätestandard (System-Design)" style={{
            width: 32, height: 32, borderRadius: 20, border: '1px solid rgba(255,255,255,0.15)',
            background: 'rgba(255,255,255,0.1)', backdropFilter: 'blur(8px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Monitor size={14} color="rgba(255,255,255,0.7)" />
          </div>
          <button onClick={() => setShowLangPicker(v => !v)} style={{
            padding: '5px 12px', borderRadius: 20, border: '1px solid rgba(255,255,255,0.15)',
            background: 'rgba(255,255,255,0.1)', backdropFilter: 'blur(8px)',
            color: 'rgba(255,255,255,0.7)', fontSize: 11, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit',
          }}>
            {SUPPORTED_LANGUAGES.find(l => l.value === (locale?.split('-')[0] || 'en'))?.label || 'Language'}
          </button>
          {showLangPicker && (
            <div style={{ position: 'absolute', top: '100%', right: 0, marginTop: 6, background: 'white', borderRadius: 10, boxShadow: '0 4px 16px rgba(0,0,0,0.2)', padding: 4, zIndex: 50, minWidth: 150 }}>
              {SUPPORTED_LANGUAGES.map(lang => (
                <button key={lang.value} onClick={() => { updateSetting('language', lang.value); setShowLangPicker(false) }}
                  style={{ display: 'block', width: '100%', padding: '6px 12px', border: 'none', background: 'none', textAlign: 'left', cursor: 'pointer', fontSize: 12, color: '#374151', borderRadius: 6, fontFamily: 'inherit' }}
                  onMouseEnter={e => (e.currentTarget.style.background = '#f3f4f6')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'none')}
                >{lang.label}</button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div style={{ maxWidth: 900, margin: '0 auto', padding: '20px 16px' }}>
        {/* No content shared */}
        {!hasAnyContent && (
          <div style={{ textAlign: 'center', padding: '60px 20px', color: '#6b7280' }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>🔐</div>
            <div style={{ fontSize: 15, fontWeight: 600, color: '#374151', marginBottom: 6 }}>{t('share.nothingShared') || 'Nothing to show'}</div>
            <div style={{ fontSize: 13 }}>{t('share.nothingSharedHint') || 'The owner has not shared any content with this link.'}</div>
          </div>
        )}
        {/* Tabs */}
        {hasAnyContent && <div style={{ display: 'flex', gap: 6, marginBottom: 20, overflowX: 'auto', padding: '2px 0' }}>
          {[
            ...(permissions?.share_map !== false ? [{ id: 'plan', label: t('share.permMap'), Icon: Map }] : []),
            ...(permissions?.share_bookings ? [{ id: 'bookings', label: t('share.permBookings'), Icon: Ticket }] : []),
            ...(permissions?.share_packing ? [{ id: 'packing', label: t('share.permPacking'), Icon: Luggage }] : []),
            ...(permissions?.share_budget ? [{ id: 'budget', label: t('share.permBudget'), Icon: Wallet }] : []),
            ...(permissions?.share_kosten ? [{ id: 'kosten', label: t('share.permKosten'), Icon: Receipt }] : []),
            ...(permissions?.share_collab ? [{ id: 'collab', label: t('share.permCollab'), Icon: MessageCircle }] : []),
          ].map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)} style={{
              padding: '8px 18px', borderRadius: 12, border: '1.5px solid', cursor: 'pointer',
              fontSize: 12, fontWeight: 600, fontFamily: 'inherit', transition: 'all 0.15s', whiteSpace: 'nowrap',
              display: 'flex', alignItems: 'center', gap: 6,
              background: activeTab === tab.id ? '#111827' : 'var(--bg-card, white)',
              borderColor: activeTab === tab.id ? '#111827' : 'var(--border-faint, #e5e7eb)',
              color: activeTab === tab.id ? 'white' : '#6b7280',
              boxShadow: activeTab === tab.id ? '0 2px 8px rgba(0,0,0,0.15)' : '0 1px 3px rgba(0,0,0,0.04)',
            }}><tab.Icon size={13} /><span className="hidden sm:inline">{tab.label}</span></button>
          ))}
        </div>}

        {/* Map */}
        {activeTab === 'plan' && permissions?.share_map !== false && (<>
          <div style={{ borderRadius: 16, overflow: 'hidden', height: 300, marginBottom: 20, boxShadow: '0 2px 12px rgba(0,0,0,0.08)' }}>
            <MapContainer center={center as [number, number]} zoom={11} zoomControl={false} style={{ width: '100%', height: '100%' }}>
              <TileLayer url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png" />
              <FitBoundsToPlaces places={mapPlaces} />
              {mapPlaces.map((p: any) => (
                <Marker key={p.id} position={[p.lat, p.lng]} icon={createMarkerIcon(p)}>
                  <Tooltip>{p.name}</Tooltip>
                </Marker>
              ))}
            </MapContainer>
          </div>

          {/* Day Plan */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {(() => {
              const todayMs = new Date().setHours(0, 0, 0, 0)
              const isDayPast = (d: any) => d.date && new Date(d.date).setHours(0, 0, 0, 0) < todayMs
              const pastCount = sortedDays.filter(isDayPast).length
              let pastHeaderRendered = false
              const elements: any[] = []

              sortedDays.forEach((day: any, di: number) => {
                const isPast = isDayPast(day)
                const isToday = day.date && new Date(day.date).setHours(0, 0, 0, 0) === todayMs

                // Insert past days collapse header before first past day
                if (isPast && !pastHeaderRendered) {
                  pastHeaderRendered = true
                  elements.push(
                    <button key="past-header" onClick={() => setShowPastDays(v => !v)} style={{
                      display: 'flex', alignItems: 'center', gap: 8, width: '100%', textAlign: 'left',
                      padding: '8px 14px', borderRadius: 10, border: '1px dashed #d1d5db',
                      background: 'transparent', cursor: 'pointer', fontFamily: 'inherit', color: '#6b7280', fontSize: 11, fontWeight: 600,
                    }}>
                      <span style={{ fontSize: 14, lineHeight: 1 }}>{showPastDays ? '▾' : '▸'}</span>
                      {t('planner.pastDays')} ({pastCount})
                    </button>
                  )
                }

                // Skip past days when collapsed
                if (isPast && !showPastDays) return

                const da = assignments[String(day.id)] || []
                const notes = (dayNotes[String(day.id)] || [])
                const dayTransport = (reservations || []).filter((r: any) => TRANSPORT_TYPES.has(r.type) && r.reservation_time?.split('T')[0] === day.date)
                const dayAccs = (accommodations || []).filter((a: any) => day.id >= a.start_day_id && day.id <= a.end_day_id)

                const merged = [
                  ...da.map((a: any) => ({ type: 'place', k: a.order_index, data: a })),
                  ...notes.map((n: any) => ({ type: 'note', k: n.sort_order ?? 0, data: n })),
                  ...dayTransport.map((r: any) => ({ type: 'transport', k: r.day_plan_position ?? 999, data: r })),
                ].sort((a, b) => a.k - b.k)

                elements.push(
                <div key={day.id} style={{ background: isToday ? 'rgba(16,185,129,0.04)' : 'var(--bg-card, white)', borderRadius: 14, overflow: 'hidden', border: isToday ? '1.5px solid #10b981' : '1px solid var(--border-faint, #e5e7eb)', opacity: isPast ? 0.7 : 1 }}>
                  <div onClick={() => setSelectedDay(selectedDay === day.id ? null : day.id)}
                    style={{ padding: '12px 16px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ width: 28, height: 28, borderRadius: '50%', background: selectedDay === day.id ? '#111827' : isToday ? '#10b981' : '#f3f4f6', color: selectedDay === day.id || isToday ? 'white' : '#6b7280', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, flexShrink: 0, boxShadow: isToday && selectedDay !== day.id ? '0 0 0 2px rgba(16,185,129,0.2)' : 'none' }}>{di + 1}</div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 14, fontWeight: 600, color: '#111827', display: 'flex', alignItems: 'center', gap: 6 }}>
                        {day.title || t('planner.dayN', { n: day.day_number })}
                        {isToday && <span style={{ fontSize: 9, padding: '2px 6px', borderRadius: 4, background: '#10b981', color: 'white', fontWeight: 700 }}>Heute</span>}
                      </div>
                      {day.date && <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 1 }}>{new Date(day.date + 'T00:00:00').toLocaleDateString(locale, { weekday: 'short', day: 'numeric', month: 'short' })}</div>}
                    </div>
                    {dayAccs.map((acc: any) => (
                      <span key={acc.id} style={{ fontSize: 9, padding: '2px 6px', borderRadius: 4, background: '#f3f4f6', color: '#6b7280', display: 'flex', alignItems: 'center', gap: 3 }}>
                        <Hotel size={8} /> {acc.place_name}
                      </span>
                    ))}
                    <span style={{ fontSize: 11, color: '#9ca3af' }}>{da.length} {da.length === 1 ? t('share.onePlace') : t('planner.places')}</span>
                  </div>

                  {selectedDay === day.id && merged.length > 0 && (
                    <div style={{ padding: '0 16px 12px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {merged.map((item: any, idx: number) => {
                        if (item.type === 'transport') {
                          const r = item.data
                          const TIcon = TRANSPORT_ICONS[r.type] || Ticket
                          const meta = typeof r.metadata === 'string' ? JSON.parse(r.metadata || '{}') : (r.metadata || {})
                          const time = r.reservation_time?.includes('T') ? r.reservation_time.split('T')[1]?.substring(0, 5) : ''
                          let sub = ''
                          if (r.type === 'flight') sub = [meta.airline, meta.flight_number, meta.departure_airport && meta.arrival_airport ? `${meta.departure_airport} → ${meta.arrival_airport}` : ''].filter(Boolean).join(' · ')
                          else if (r.type === 'train') sub = [meta.train_number, meta.platform ? `Gl. ${meta.platform}` : ''].filter(Boolean).join(' · ')
                          return (
                            <div key={`t-${r.id}`} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', borderRadius: 6, background: 'rgba(59,130,246,0.06)', border: '1px solid rgba(59,130,246,0.15)' }}>
                              <div style={{ width: 24, height: 24, borderRadius: '50%', background: 'rgba(59,130,246,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                <TIcon size={12} color="#3b82f6" />
                              </div>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontSize: 12, fontWeight: 500, color: '#111827' }}>{r.title}{time ? ` · ${time}` : ''}</div>
                                {sub && <div style={{ fontSize: 10, color: '#6b7280' }}>{sub}</div>}
                              </div>
                            </div>
                          )
                        }
                        if (item.type === 'note') {
                          return (
                            <div key={`n-${item.data.id}`} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 8px', borderRadius: 6, background: '#f9fafb', border: '1px solid #f3f4f6' }}>
                              <FileText size={12} color="#9ca3af" />
                              <div>
                                <div style={{ fontSize: 12, color: '#374151' }}>{item.data.text}</div>
                                {item.data.time && <div style={{ fontSize: 10, color: '#9ca3af' }}>{item.data.time}</div>}
                              </div>
                            </div>
                          )
                        }
                        const place = item.data.place
                        if (!place) return null
                        const cat = categories?.find((c: any) => c.id === place.category_id)
                        return (
                          <div key={`p-${item.data.id}`} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 8px', borderRadius: 6 }}>
                            <div style={{ width: 28, height: 28, borderRadius: '50%', background: cat?.color || '#6366f1', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                              {place.image_url ? <img src={place.image_url} style={{ width: 28, height: 28, borderRadius: '50%', objectFit: 'cover' }} /> : <MapPin size={13} color="white" />}
                            </div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: 12.5, fontWeight: 500, color: '#111827' }}>{place.name}</div>
                              {(place.address || place.description) && <div style={{ fontSize: 10, color: '#9ca3af', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{place.address || place.description}</div>}
                            </div>
                            {place.place_time && <span style={{ fontSize: 10, color: '#6b7280', display: 'flex', alignItems: 'center', gap: 3, flexShrink: 0 }}><Clock size={9} />{place.place_time}{place.end_time ? ` – ${place.end_time}` : ''}</span>}
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
                )
              })
              return elements
            })()}
          </div>
        </>)}

        {/* Bookings */}
        {activeTab === 'bookings' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {(reservations || []).length === 0 && (
              <div style={{ textAlign: 'center', padding: '40px 20px', color: '#9ca3af', fontSize: 13 }}>{t('share.noBookings')}</div>
            )}
            {[...(reservations || [])].sort((a: any, b: any) => {
              const ta = a.reservation_time ? new Date(a.reservation_time).getTime() : 0
              const tb = b.reservation_time ? new Date(b.reservation_time).getTime() : 0
              return ta - tb
            }).map((r: any) => {
              const meta = typeof r.metadata === 'string' ? JSON.parse(r.metadata || '{}') : (r.metadata || {})
              const TIcon = ALL_TYPE_ICONS[r.type] || Ticket
              const typeColor = TYPE_COLORS[r.type] || '#6b7280'
              const time = r.reservation_time?.includes('T') ? r.reservation_time.split('T')[1]?.substring(0, 5) : ''
              const endTime = r.reservation_end_time?.includes('T') ? r.reservation_end_time.split('T')[1]?.substring(0, 5) : ''
              const fmtShortDate = (str: string) => new Date(str.includes('T') ? str : str + 'T12:00:00').toLocaleDateString(locale, { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' })
              const date = r.reservation_time ? fmtShortDate(r.reservation_time) : ''
              const endDatePart = r.reservation_end_time?.split('T')[0] || ''
              const accEndDate = r.accommodation_end_date || ''
              const effectiveEndDate = endDatePart.includes('-') ? endDatePart : (accEndDate.includes('-') ? accEndDate : '')
              const startDatePart = (r.reservation_time || '').split('T')[0]
              const endDate = effectiveEndDate && effectiveEndDate !== startDatePart ? fmtShortDate(effectiveEndDate) : ''
              const files: any[] = r.files || []
              const metaCells: { label: string; value: string }[] = []
              if (meta.airline) metaCells.push({ label: t('reservations.meta.airline'), value: meta.airline })
              if (meta.flight_number) metaCells.push({ label: t('reservations.meta.flightNumber'), value: meta.flight_number })
              if (meta.departure_airport) metaCells.push({ label: t('reservations.meta.from'), value: meta.departure_airport })
              if (meta.arrival_airport) metaCells.push({ label: t('reservations.meta.to'), value: meta.arrival_airport })
              if (meta.train_number) metaCells.push({ label: t('reservations.meta.trainNumber'), value: meta.train_number })
              if (meta.platform) metaCells.push({ label: t('reservations.meta.platform'), value: meta.platform })
              if (meta.seat) metaCells.push({ label: t('reservations.meta.seat'), value: meta.seat })
              if (meta.check_in_time) metaCells.push({ label: t('reservations.meta.checkIn'), value: meta.check_in_time })
              if (meta.check_out_time) metaCells.push({ label: t('reservations.meta.checkOut'), value: meta.check_out_time })
              return (
                <div key={r.id} style={{ background: 'white', borderRadius: 12, border: '1px solid #e5e7eb', overflow: 'hidden' }}>
                  {/* Header row: type icon + type label + date + title + status */}
                  <div style={{ padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 8, borderBottom: '1px solid #f3f4f6' }}>
                    <TIcon size={13} style={{ color: typeColor, flexShrink: 0 }} />
                    <span style={{ fontSize: 10, color: typeColor, fontWeight: 600, flexShrink: 0 }}>{t(`reservations.type.${r.type}`)}</span>
                    {(date || endDate) && (
                      <span style={{ fontSize: 11, color: '#6b7280', flexShrink: 0 }}>{date}{endDate ? ` – ${endDate}` : ''}</span>
                    )}
                    <span style={{ flex: 1 }} />
                    <span style={{ fontSize: 13, fontWeight: 700, color: '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.title}</span>
                    <span style={{ fontSize: 9, padding: '2px 8px', borderRadius: 20, fontWeight: 600, flexShrink: 0, marginLeft: 8, background: r.status === 'confirmed' ? 'rgba(22,163,74,0.1)' : 'rgba(217,119,6,0.1)', color: r.status === 'confirmed' ? '#16a34a' : '#d97706' }}>
                      {r.status === 'confirmed' ? t('reservations.confirmed') : t('reservations.pending')}
                    </span>
                  </div>
                  <div style={{ padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {/* Date / Time / Code cells */}
                    {(date || time || r.confirmation_number) && (
                      <div style={{ display: 'flex', gap: 0, borderRadius: 8, overflow: 'hidden', background: '#f9fafb', border: '1px solid #f3f4f6' }}>
                        {date && (
                          <div style={{ flex: 1, padding: '5px 10px', textAlign: 'center', borderRight: (time || r.confirmation_number) ? '1px solid #f3f4f6' : 'none' }}>
                            <div style={{ fontSize: 9, fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.03em' }}>{t('reservations.date')}</div>
                            <div style={{ fontSize: 12, fontWeight: 600, color: '#111827', marginTop: 1 }}>{date}{endDate ? ` – ${endDate}` : ''}</div>
                          </div>
                        )}
                        {time && (
                          <div style={{ flex: 1, padding: '5px 10px', textAlign: 'center', borderRight: r.confirmation_number ? '1px solid #f3f4f6' : 'none' }}>
                            <div style={{ fontSize: 9, fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.03em' }}>{t('reservations.time')}</div>
                            <div style={{ fontSize: 12, fontWeight: 600, color: '#111827', marginTop: 1 }}>{time}{endTime ? ` – ${endTime}` : ''}</div>
                          </div>
                        )}
                        {r.confirmation_number && (
                          <div style={{ flex: 1, padding: '5px 10px', textAlign: 'center' }}>
                            <div style={{ fontSize: 9, fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.03em' }}>{t('reservations.confirmationCode')}</div>
                            <div style={{ fontSize: 12, fontWeight: 600, color: '#111827', marginTop: 1 }}>{r.confirmation_number}</div>
                          </div>
                        )}
                      </div>
                    )}
                    {/* Type-specific metadata cells */}
                    {metaCells.length > 0 && (
                      <div style={{ display: 'flex', gap: 0, borderRadius: 8, overflow: 'hidden', background: '#f9fafb', border: '1px solid #f3f4f6' }}>
                        {metaCells.map((c, i) => (
                          <div key={i} style={{ flex: 1, padding: '5px 10px', textAlign: 'center', borderRight: i < metaCells.length - 1 ? '1px solid #f3f4f6' : 'none' }}>
                            <div style={{ fontSize: 9, fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.03em' }}>{c.label}</div>
                            <div style={{ fontSize: 11, fontWeight: 600, color: '#111827', marginTop: 1 }}>{c.value}</div>
                          </div>
                        ))}
                      </div>
                    )}
                    {/* Location */}
                    {r.location && (
                      <div>
                        <div style={{ fontSize: 9, fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.03em', marginBottom: 3 }}>{t('reservations.locationAddress')}</div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 10px', borderRadius: 8, background: '#f9fafb', border: '1px solid #f3f4f6', fontSize: 12, color: '#6b7280' }}>
                          <MapPin size={11} color="#9ca3af" />
                          <span>{r.location}</span>
                        </div>
                      </div>
                    )}
                    {/* Notes */}
                    {r.notes && (
                      <div>
                        <div style={{ fontSize: 9, fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.03em', marginBottom: 3 }}>{t('reservations.notes')}</div>
                        <div style={{ padding: '6px 10px', borderRadius: 8, background: '#f9fafb', border: '1px solid #f3f4f6', fontSize: 12, color: '#6b7280', lineHeight: 1.5 }}>{r.notes}</div>
                      </div>
                    )}
                    {/* Files */}
                    {files.length > 0 && (
                      <div>
                        <div style={{ fontSize: 9, fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.03em', marginBottom: 3 }}>{t('share.filesAttached')}</div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                          {files.map((f: any) => (
                            <a key={f.id} href={f.url} target="_blank" rel="noopener noreferrer"
                              style={{ fontSize: 11, padding: '4px 10px', borderRadius: 8, background: '#f9fafb', border: '1px solid #f3f4f6', color: '#374151', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 5 }}>
                              <FileText size={11} color="#6b7280" />{f.original_name}
                            </a>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* Packing */}
        {activeTab === 'packing' && (packing || []).length > 0 && (
          <div style={{ background: 'var(--bg-card, white)', borderRadius: 14, border: '1px solid var(--border-faint, #e5e7eb)', overflow: 'hidden' }}>
            {Object.entries((packing || []).reduce((g: any, i: any) => { const c = i.category || 'Other'; (g[c] = g[c] || []).push(i); return g }, {})).map(([cat, items]: [string, any]) => (
              <div key={cat}>
                <div style={{ padding: '8px 16px', background: '#f9fafb', fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid #f3f4f6', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span>{cat}</span>
                  <span style={{ fontSize: 10, fontWeight: 400, color: '#9ca3af' }}>{(items as any[]).filter((i: any) => i.checked).length}/{(items as any[]).length}</span>
                </div>
                {(items as any[]).map((item: any) => (
                  <div key={item.id} style={{ padding: '8px 16px', display: 'flex', alignItems: 'center', gap: 10, borderBottom: '1px solid #f9fafb' }}>
                    <div style={{ flexShrink: 0, width: 18, height: 18, borderRadius: 5, border: `1.5px solid ${item.checked ? '#16a34a' : '#9ca3af'}`, background: item.checked ? '#16a34a' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      {item.checked && <Check size={11} color="white" strokeWidth={3} />}
                    </div>
                    <span style={{ fontSize: 13, color: item.checked ? '#9ca3af' : '#111827', textDecoration: item.checked ? 'line-through' : 'none', flex: 1 }}>{item.name}</span>
                    {item.quantity && item.quantity > 1 && (
                      <span style={{ fontSize: 10, color: '#9ca3af', flexShrink: 0 }}>×{item.quantity}</span>
                    )}
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}

        {/* Budget */}
        {activeTab === 'budget' && (budget || []).length > 0 && (() => {
          const grouped = (budget || []).reduce((g: any, i: any) => { const c = i.category || 'Other'; (g[c] = g[c] || []).push(i); return g }, {})
          const total = (budget || []).reduce((s: number, i: any) => s + (parseFloat(i.total_price) || 0), 0)
          return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {/* Total card */}
              <div style={{ background: 'linear-gradient(135deg, #000 0%, #1a1a2e 100%)', borderRadius: 14, padding: '20px 24px', color: 'white' }}>
                <div style={{ fontSize: 10, fontWeight: 500, letterSpacing: 1, textTransform: 'uppercase', opacity: 0.5 }}>{t('share.totalBudget')}</div>
                <div style={{ fontSize: 28, fontWeight: 700, marginTop: 4 }}>{total.toLocaleString(locale, { minimumFractionDigits: 2 })} {trip.currency || 'EUR'}</div>
              </div>
              {/* By category */}
              {Object.entries(grouped).map(([cat, items]: [string, any]) => (
                <div key={cat} style={{ background: 'var(--bg-card, white)', borderRadius: 12, border: '1px solid var(--border-faint, #e5e7eb)', overflow: 'hidden' }}>
                  <div style={{ padding: '10px 16px', background: '#f9fafb', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #f3f4f6' }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: '#374151' }}>{cat}</span>
                    <span style={{ fontSize: 12, fontWeight: 600, color: '#6b7280' }}>{items.reduce((s: number, i: any) => s + (parseFloat(i.total_price) || 0), 0).toLocaleString(locale, { minimumFractionDigits: 2 })} {trip.currency || ''}</span>
                  </div>
                  {items.map((item: any) => (
                    <div key={item.id} style={{ padding: '8px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #fafafa' }}>
                      <span style={{ fontSize: 13, color: '#111827' }}>{item.name}</span>
                      <span style={{ fontSize: 13, fontWeight: 600, color: '#111827' }}>{item.total_price ? Number(item.total_price).toLocaleString(locale, { minimumFractionDigits: 2 }) : '—'}</span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )
        })()}

        {/* Kosten */}
        {activeTab === 'kosten' && kostenData && (() => {
          const expenses = kostenData.expenses || []
          const shares = kostenData.shares || []
          const users = kostenData.users || []
          const balances = kostenData.balances || []
          const debts = kostenData.debts || []
          const total = expenses.reduce((s: number, e: any) => s + (parseFloat(e.amount) || 0) * (e.exchange_rate || 1), 0)
          const fmtAmt = (v: number) => v.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
          const currency = trip.currency || 'EUR'
          return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {/* Total */}
              <div style={{ background: 'linear-gradient(135deg, #000 0%, #1a1a2e 100%)', borderRadius: 14, padding: '20px 24px', color: 'white' }}>
                <div style={{ fontSize: 10, fontWeight: 500, letterSpacing: 1, textTransform: 'uppercase', opacity: 0.5 }}>{t('kosten.totalSpent')}</div>
                <div style={{ fontSize: 28, fontWeight: 700, marginTop: 4 }}>{fmtAmt(total)} {currency}</div>
                <div style={{ fontSize: 11, opacity: 0.4, marginTop: 2 }}>{expenses.length} {t('kosten.tabExpenses')}</div>
              </div>

              {/* Per-person balances */}
              {balances.length > 0 && (
                <div style={{ background: 'var(--bg-card, white)', borderRadius: 12, border: '1px solid var(--border-faint, #e5e7eb)', overflow: 'hidden' }}>
                  <div style={{ padding: '10px 16px', background: '#f9fafb', borderBottom: '1px solid #f3f4f6' }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: '#374151' }}>{t('share.balancePerPerson')}</span>
                  </div>
                  {balances.map((b: any, i: number) => (
                    <div key={i} style={{ padding: '9px 16px', display: 'flex', alignItems: 'center', gap: 10, borderBottom: i < balances.length - 1 ? '1px solid #fafafa' : 'none' }}>
                      <div style={{ width: 28, height: 28, borderRadius: '50%', background: '#e5e7eb', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: '#6b7280', flexShrink: 0 }}>
                        {(b.name || '?')[0].toUpperCase()}
                      </div>
                      <span style={{ flex: 1, fontSize: 13, color: '#111827', fontWeight: 500 }}>{b.name}</span>
                      <div style={{ textAlign: 'right' }}>
                        <span style={{ fontSize: 13, fontWeight: 700, color: b.balance >= 0 ? '#16a34a' : '#dc2626' }}>
                          {b.balance >= 0 ? '+' : ''}{fmtAmt(b.balance)} {currency}
                        </span>
                        <div style={{ fontSize: 10, color: '#9ca3af', marginTop: 1 }}>
                          {t('share.paidShare', { paid: `${fmtAmt(b.paid)} ${currency}`, owed: `${fmtAmt(b.owed)} ${currency}` })}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Simplified debts */}
              {debts.length > 0 && (
                <div style={{ background: 'var(--bg-card, white)', borderRadius: 12, border: '1px solid var(--border-faint, #e5e7eb)', overflow: 'hidden' }}>
                  <div style={{ padding: '10px 16px', background: '#f9fafb', borderBottom: '1px solid #f3f4f6' }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: '#374151' }}>{t('share.whoOwes')}</span>
                  </div>
                  {debts.map((d: any, i: number) => (
                    <div key={i} style={{ padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 8, borderBottom: i < debts.length - 1 ? '1px solid #fafafa' : 'none' }}>
                      <div style={{ width: 26, height: 26, borderRadius: '50%', background: '#fee2e2', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, color: '#dc2626', flexShrink: 0 }}>
                        {(d.fromName || '?')[0].toUpperCase()}
                      </div>
                      <span style={{ fontSize: 12, fontWeight: 600, color: '#111827', flex: 1 }}>{d.fromName}</span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                        <span style={{ fontSize: 12, fontWeight: 700, color: '#111827' }}>{fmtAmt(d.amount)} {currency}</span>
                        <span style={{ fontSize: 10, color: '#9ca3af' }}>→</span>
                      </div>
                      <div style={{ width: 26, height: 26, borderRadius: '50%', background: '#dcfce7', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, color: '#16a34a', flexShrink: 0 }}>
                        {(d.toName || '?')[0].toUpperCase()}
                      </div>
                      <span style={{ fontSize: 12, fontWeight: 600, color: '#111827' }}>{d.toName}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Expenses list */}
              {expenses.map((e: any) => {
                const expShares = (shares as any[]).filter((s: any) => s.expense_id === e.id)
                const paidByUser = users.find((u: any) => u.id === e.paid_by)
                return (
                  <div key={e.id} style={{ background: 'var(--bg-card, white)', borderRadius: 12, border: '1px solid var(--border-faint, #e5e7eb)', overflow: 'hidden' }}>
                    <div style={{ padding: '10px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: expShares.length > 0 ? '1px solid #f3f4f6' : 'none' }}>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 600, color: '#111827' }}>{e.title}</div>
                        <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 2 }}>
                          {e.expense_date && <span>{e.expense_date} · </span>}
                          {paidByUser ? <span>{t('share.paidByName', { name: paidByUser.username })}</span> : e.paid_by_name ? <span>{t('share.paidByName', { name: e.paid_by_name })}</span> : null}
                          {e.category && <span> · {e.category}</span>}
                        </div>
                      </div>
                      <span style={{ fontSize: 15, fontWeight: 700, color: '#111827', flexShrink: 0, marginLeft: 8 }}>{Number(e.amount).toLocaleString(locale, { minimumFractionDigits: 2 })} {e.currency || currency}</span>
                    </div>
                    {expShares.length > 0 && (
                      <div style={{ padding: '6px 16px 8px', display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                        {expShares.map((s: any) => {
                          const su = users.find((u: any) => u.id === s.user_id)
                          const name = su?.username || s.user_name || `#${s.user_id}`
                          return (
                            <span key={s.id} style={{ fontSize: 10, padding: '2px 8px', borderRadius: 12, background: '#f3f4f6', color: '#6b7280' }}>
                              {name}{s.share_value != null ? `: ${Number(s.share_value).toLocaleString(locale, { minimumFractionDigits: 2 })} ${e.currency || ''}` : ''}
                            </span>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )
        })()}

        {/* Collab Chat + Notes + Polls */}
        {activeTab === 'collab' && (() => {
          const collabMessages: any[] = (collab?.messages || [])
          const collabNotes: any[] = (collab?.notes || [])
          const collabPolls: any[] = (collab?.polls || [])
          const hasContent = collabMessages.length > 0 || collabNotes.length > 0 || collabPolls.length > 0
          if (!hasContent) return (
            <div style={{ textAlign: 'center', padding: '40px 20px', color: '#9ca3af', fontSize: 13 }}>{t('share.noCollabContent')}</div>
          )
          return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {/* Notes */}
              {collabNotes.length > 0 && (
                <div style={{ background: 'var(--bg-card, white)', borderRadius: 14, border: '1px solid var(--border-faint, #e5e7eb)', overflow: 'hidden' }}>
                  <div style={{ padding: '12px 16px', background: '#f9fafb', borderBottom: '1px solid #f3f4f6', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <FileText size={14} color="#6b7280" />
                    <span style={{ fontSize: 12, fontWeight: 700, color: '#374151' }}>{t('share.collabNotes')} · {collabNotes.length}</span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                    {collabNotes.map((note: any, i: number) => (
                      <div key={note.id} style={{ padding: '12px 16px', borderBottom: i < collabNotes.length - 1 ? '1px solid #f3f4f6' : 'none' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: note.content ? 6 : 0 }}>
                          {note.color && <div style={{ width: 10, height: 10, borderRadius: '50%', background: note.color, flexShrink: 0 }} />}
                          <span style={{ fontSize: 13, fontWeight: 600, color: '#111827', flex: 1 }}>{note.title}</span>
                          <span style={{ fontSize: 10, color: '#9ca3af' }}>{note.username}</span>
                        </div>
                        {note.content && <div style={{ fontSize: 12, color: '#6b7280', lineHeight: 1.5, whiteSpace: 'pre-wrap', marginLeft: 18 }}>{note.content}</div>}
                        {note.website && <a href={note.website} target="_blank" rel="noopener noreferrer" style={{ fontSize: 11, color: '#3b82f6', marginLeft: 18, textDecoration: 'none' }}>{note.website}</a>}
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {/* Polls */}
              {collabPolls.length > 0 && (
                <div style={{ background: 'var(--bg-card, white)', borderRadius: 14, border: '1px solid var(--border-faint, #e5e7eb)', overflow: 'hidden' }}>
                  <div style={{ padding: '12px 16px', background: '#f9fafb', borderBottom: '1px solid #f3f4f6', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <BarChart3 size={14} color="#6b7280" />
                    <span style={{ fontSize: 12, fontWeight: 700, color: '#374151' }}>{t('collab.polls.title')} · {collabPolls.length}</span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                    {collabPolls.map((poll: any, pi: number) => {
                      const totalVotes = poll.total_votes || 0
                      const maxVotes = Math.max(...(poll.options || []).map((o: any) => o.count || 0), 1)
                      return (
                        <div key={poll.id} style={{ padding: '12px 16px', borderBottom: pi < collabPolls.length - 1 ? '1px solid #f3f4f6' : 'none' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                            <span style={{ fontSize: 13, fontWeight: 600, color: '#111827', flex: 1 }}>{poll.question}</span>
                            {poll.is_closed && (
                              <span style={{ fontSize: 9, padding: '2px 6px', borderRadius: 4, background: '#f3f4f6', color: '#6b7280', fontWeight: 600, flexShrink: 0 }}>{t('collab.polls.closed')}</span>
                            )}
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                            {(poll.options || []).map((opt: any, oi: number) => {
                              const pct = totalVotes > 0 ? Math.round((opt.count / totalVotes) * 100) : 0
                              const isWinner = opt.count > 0 && opt.count === maxVotes
                              return (
                                <div key={oi}>
                                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3 }}>
                                    <span style={{ fontSize: 12, color: isWinner ? '#111827' : '#6b7280', fontWeight: isWinner ? 600 : 400 }}>{opt.label}</span>
                                    <span style={{ fontSize: 11, color: '#9ca3af', flexShrink: 0, marginLeft: 8 }}>{opt.count || 0} ({pct}%)</span>
                                  </div>
                                  <div style={{ height: 6, borderRadius: 3, background: '#f3f4f6', overflow: 'hidden' }}>
                                    <div style={{ height: '100%', width: `${pct}%`, borderRadius: 3, background: isWinner ? '#111827' : '#d1d5db', transition: 'width 0.3s' }} />
                                  </div>
                                  {opt.voters && opt.voters.length > 0 && (
                                    <div style={{ marginTop: 3, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                                      {opt.voters.map((name: string, vi: number) => (
                                        <span key={vi} style={{ fontSize: 9, padding: '1px 6px', borderRadius: 10, background: '#f3f4f6', color: '#6b7280' }}>{name}</span>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              )
                            })}
                          </div>
                          <div style={{ marginTop: 8, fontSize: 10, color: '#9ca3af' }}>
                            {t('collab.polls.votes', { n: totalVotes })}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
              {/* Chat */}
              {collabMessages.length > 0 && (
                <div style={{ background: 'var(--bg-card, white)', borderRadius: 14, border: '1px solid var(--border-faint, #e5e7eb)', overflow: 'hidden' }}>
                  <div style={{ padding: '12px 16px', background: '#f9fafb', borderBottom: '1px solid #f3f4f6', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <MessageCircle size={14} color="#6b7280" />
                    <span style={{ fontSize: 12, fontWeight: 700, color: '#374151' }}>{t('share.permCollab')} · {t('share.messagesCount', { count: collabMessages.length })}</span>
                  </div>
                  <div style={{ maxHeight: 500, overflowY: 'auto', padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {collabMessages.map((msg: any, i: number) => {
                      const prevMsg = i > 0 ? collabMessages[i - 1] : null
                      const showDate = !prevMsg || new Date(msg.created_at).toDateString() !== new Date(prevMsg.created_at).toDateString()
                      return (
                        <div key={msg.id}>
                          {showDate && (
                            <div style={{ textAlign: 'center', margin: '8px 0', fontSize: 10, fontWeight: 600, color: '#9ca3af' }}>
                              {new Date(msg.created_at).toLocaleDateString(locale, { weekday: 'short', day: 'numeric', month: 'short' })}
                            </div>
                          )}
                          <div style={{ display: 'flex', gap: 10 }}>
                            <div style={{ width: 32, height: 32, borderRadius: '50%', background: '#e5e7eb', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: '#6b7280', flexShrink: 0, overflow: 'hidden' }}>
                              {msg.avatar ? <img src={`/uploads/avatars/${msg.avatar}`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : (msg.username || '?')[0].toUpperCase()}
                            </div>
                            <div style={{ flex: 1 }}>
                              <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                                <span style={{ fontSize: 12, fontWeight: 600, color: '#111827' }}>{msg.username}</span>
                                <span style={{ fontSize: 10, color: '#9ca3af' }}>{new Date(msg.created_at).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })}</span>
                              </div>
                              <div style={{ fontSize: 13, color: '#374151', marginTop: 3, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{msg.text}</div>
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>
          )
        })()}

        {/* Footer */}
        <div style={{ textAlign: 'center', padding: '40px 0 20px' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '8px 16px', borderRadius: 20, background: 'var(--bg-card, white)', border: '1px solid var(--border-faint, #e5e7eb)', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
            <img src="/icons/icon.svg" alt="TREK" width="18" height="18" style={{ borderRadius: 4 }} />
            <span style={{ fontSize: 11, color: '#9ca3af' }}>Shared via <strong style={{ color: '#6b7280' }}>TREK</strong></span>
          </div>
          <div style={{ marginTop: 8, fontSize: 10, color: '#d1d5db' }}>Made with <span style={{ color: '#ef4444' }}>&hearts;</span> by Gerd</div>
        </div>
      </div>
    </div>
  )
}
