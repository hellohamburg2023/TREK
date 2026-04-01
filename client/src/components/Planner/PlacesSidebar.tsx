import { useState } from 'react'
import { Search, Plus, Minus, X, CalendarDays, Pencil, Trash2, ExternalLink, Navigation } from 'lucide-react'
import PlaceAvatar from '../shared/PlaceAvatar'
import { getCategoryIcon } from '../shared/categoryIcons'
import { useTranslation } from '../../i18n'
import CustomSelect from '../shared/CustomSelect'
import { useContextMenu, ContextMenu } from '../shared/ContextMenu'
import { useSettingsStore } from '../../store/settingsStore'
import type { Place, Category, Day, AssignmentsMap } from '../../types'

interface PlacesSidebarProps {
  places: Place[]
  categories: Category[]
  assignments: AssignmentsMap
  selectedDayId: number | null
  selectedPlaceId: number | null
  onPlaceClick: (placeId: number | null) => void
  onAddPlace: () => void
  onAssignToDay: (placeId: number, dayId: number) => void
  onRemoveAssignment?: (dayId: number, assignmentId: number) => void
  onEditPlace: (place: Place) => void
  onDeletePlace: (placeId: number) => void
  onSelectDay?: (dayId: number | null) => void
  days?: Day[]
  isMobile?: boolean
  onCategoryFilterChange?: (categoryId: string) => void
}

function formatTime12(val: string | null | undefined, is12h: boolean): string {
  if (!val) return ''
  const [h, m] = val.split(':').map(Number)
  if (isNaN(h) || isNaN(m)) return val
  if (!is12h) return val
  const period = h >= 12 ? 'PM' : 'AM'
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h
  return `${h12}:${String(m).padStart(2, '0')} ${period}`
}

export default function PlacesSidebar({
  places, categories, assignments, selectedDayId, selectedPlaceId,
  onPlaceClick, onAddPlace, onAssignToDay, onRemoveAssignment, onEditPlace, onDeletePlace, onSelectDay, days, isMobile, onCategoryFilterChange,
}: PlacesSidebarProps) {
  const { t } = useTranslation()
  const ctxMenu = useContextMenu()
  const is12h = useSettingsStore(s => s.settings.time_format) === '12h'
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('all')
  const [categoryFilter, setCategoryFilterLocal] = useState('')
  // Local day filter state — independent of the global selectedDayId
  const [localDayId, setLocalDayId] = useState<number | null>(null)

  const setCategoryFilter = (val: string) => {
    setCategoryFilterLocal(val)
    onCategoryFilterChange?.(val)
  }

  // Use local day filter if set, otherwise fall back to selectedDayId from planner
  const activeDayId = localDayId ?? selectedDayId

  const handleDayChange = (val: string) => {
    const id = val ? Number(val) : null
    setLocalDayId(id)
    onSelectDay?.(id)
  }

  const handleClearDay = () => {
    setLocalDayId(null)
    onSelectDay?.(null)
  }

  // Alle geplanten Ort-IDs abrufen (einem Tag zugewiesen)
  const plannedIds = new Set(
    Object.values(assignments).flatMap(da => da.map(a => a.place?.id).filter(Boolean))
  )

  // For the active day: assignments sorted by time
  const activeDayAssignments = activeDayId ? (assignments[String(activeDayId)] || []) : []
  const activeDayPlaceIds = new Set(activeDayAssignments.map(a => a.place?.id).filter(Boolean))

  const baseFiltered = places.filter(p => {
    if (filter === 'planned' && !plannedIds.has(p.id)) return false
    if (filter === 'unplanned' && plannedIds.has(p.id)) return false
    if (categoryFilter && String(p.category_id) !== String(categoryFilter)) return false
    if (search && !p.name.toLowerCase().includes(search.toLowerCase()) &&
        !(p.address || '').toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  // When a day is active: group into planned (in this day) and unplanned (not in this day), sorted by time
  let renderedGroups: Array<{ label: string | null; places: Array<{ place: Place; assignment: any | null }> }> = []
  if (activeDayId) {
    // Build a map from place_id → assignment (with time)
    const assignmentByPlaceId = new Map(activeDayAssignments.map(a => [a.place?.id, a]))

    const inDay = baseFiltered.filter(p => activeDayPlaceIds.has(p.id))
    const notInDay = baseFiltered.filter(p => !activeDayPlaceIds.has(p.id))

    // Sort in-day places by assignment time ascending (nulls last)
    const sortByTime = (a: Place, b: Place) => {
      const aAssignment = assignmentByPlaceId.get(a.id)
      const bAssignment = assignmentByPlaceId.get(b.id)
      const aTime = aAssignment?.place?.place_time || ''
      const bTime = bAssignment?.place?.place_time || ''
      if (!aTime && !bTime) return 0
      if (!aTime) return 1
      if (!bTime) return -1
      return aTime < bTime ? -1 : aTime > bTime ? 1 : 0
    }

    const inDaySorted = [...inDay].sort(sortByTime)

    renderedGroups = [
      { label: t('places.planned'), places: inDaySorted.map(p => ({ place: p, assignment: assignmentByPlaceId.get(p.id) || null })) },
      { label: t('places.unplanned'), places: notInDay.map(p => ({ place: p, assignment: null })) },
    ].filter(g => g.places.length > 0)
  } else {
    // Build map: place_id → first assignment found across all days
    const allAssignmentsByPlaceId = new Map<number, any>()
    Object.values(assignments).forEach(dayAssignments => {
      dayAssignments.forEach(a => {
        if (a.place?.id != null && !allAssignmentsByPlaceId.has(a.place.id)) {
          allAssignmentsByPlaceId.set(a.place.id, a)
        }
      })
    })
    // Build map: day_id → day_number for sorting
    const dayNumberById = new Map<number, number>((days || []).map((d, i) => [d.id, (d as any).day_number ?? i + 1]))

    const planned = baseFiltered.filter(p => plannedIds.has(p.id))
    const unplanned = baseFiltered.filter(p => !plannedIds.has(p.id))

    // Sort planned by day_number asc, then by time asc (nulls last)
    const sortedPlanned = [...planned].sort((a, b) => {
      const aA = allAssignmentsByPlaceId.get(a.id)
      const bA = allAssignmentsByPlaceId.get(b.id)
      const aDayNum = aA ? (dayNumberById.get(aA.day_id) ?? 9999) : 9999
      const bDayNum = bA ? (dayNumberById.get(bA.day_id) ?? 9999) : 9999
      if (aDayNum !== bDayNum) return aDayNum - bDayNum
      const aTime = aA?.place?.place_time || ''
      const bTime = bA?.place?.place_time || ''
      if (!aTime && !bTime) return 0
      if (!aTime) return 1
      if (!bTime) return -1
      return aTime < bTime ? -1 : aTime > bTime ? 1 : 0
    })

    renderedGroups = [
      { label: t('places.planned'), places: sortedPlanned.map(p => ({ place: p, assignment: allAssignmentsByPlaceId.get(p.id) || null })) },
      { label: t('places.unplanned'), places: unplanned.map(p => ({ place: p, assignment: null })) },
    ].filter(g => g.places.length > 0)
  }

  const totalFiltered = baseFiltered.length

  const isAssignedToActiveDay = (placeId: number) =>
    activeDayId ? (assignments[String(activeDayId)] || []).some(a => a.place?.id === placeId) : false

  const selectedDayIndex = days?.findIndex(d => d.id === activeDayId) ?? -1

  // Build map: place_id → all assigned day_ids across all days (for multi-day display)
  const allDaysByPlaceId = new Map<number, Set<number>>()
  Object.values(assignments).forEach(dayAssignments => {
    dayAssignments.forEach(a => {
      if (a.place?.id != null && a.day_id != null) {
        const existing = allDaysByPlaceId.get(a.place.id) || new Set<number>()
        existing.add(a.day_id)
        allDaysByPlaceId.set(a.place.id, existing)
      }
    })
  })

  const renderPlaceRow = (place: Place, assignment: any | null) => {
    const cat = categories.find(c => c.id === place.category_id)
    const isSelected = place.id === selectedPlaceId
    const inDay = isAssignedToActiveDay(place.id)
    const assignmentInActiveDay = activeDayId
      ? (assignment || (assignments[String(activeDayId)] || []).find(a => a.place?.id === place.id))
      : null

    // When no day is active, build a label showing all assigned days
    let dayLabel: string | null = null
    if (!activeDayId) {
      const placeAssignedDayIds = allDaysByPlaceId.get(place.id)
      if (placeAssignedDayIds && placeAssignedDayIds.size > 0) {
        const dayNums = Array.from(placeAssignedDayIds)
          .map(dayId => {
            const idx = days?.findIndex(d => d.id === dayId) ?? -1
            return idx >= 0 ? ((days?.[idx] as any)?.day_number ?? idx + 1) : null
          })
          .filter((n): n is number => n !== null)
          .sort((a, b) => a - b)
        if (dayNums.length === 1) {
          dayLabel = t('dayplan.dayN', { n: dayNums[0] })
        } else if (dayNums.length <= 3) {
          dayLabel = dayNums.map(n => t('dayplan.dayN', { n })).join('/')
        } else {
          dayLabel = t('places.multiDay')
        }
      }
    }

    // Time string from assignment (per-day time) if available, else from place
    const placeTime = assignment?.place?.place_time || place.place_time
    const endTime = assignment?.place?.end_time || place.end_time
    const timeStr = placeTime && (activeDayId || dayLabel != null)
      ? `${formatTime12(placeTime, is12h)}${endTime ? `–${formatTime12(endTime, is12h)}` : ''}`
      : ''

    return (
      <div
        key={place.id}
        draggable
        onDragStart={e => {
          e.dataTransfer.setData('placeId', String(place.id))
          e.dataTransfer.effectAllowed = 'copy'
          window.__dragData = { placeId: String(place.id) }
        }}
        onClick={() => {
          onPlaceClick(isSelected ? null : place.id)
        }}
        onContextMenu={e => ctxMenu.open(e, [
          onEditPlace && { label: t('common.edit'), icon: Pencil, onClick: () => onEditPlace(place) },
          (!inDay && activeDayId) && { label: t('planner.addToDay'), icon: CalendarDays, onClick: () => onAssignToDay(place.id, activeDayId) },
          (inDay && activeDayId && onRemoveAssignment && assignmentInActiveDay) && { label: t('planner.removeFromDay'), icon: Minus, danger: true, onClick: () => onRemoveAssignment(activeDayId, assignmentInActiveDay.id) },
          place.website && { label: t('inspector.website'), icon: ExternalLink, onClick: () => window.open(place.website, '_blank') },
          (place.lat && place.lng) && { label: 'Google Maps', icon: Navigation, onClick: () => window.open(`https://www.google.com/maps/search/?api=1&query=${place.lat},${place.lng}`, '_blank') },
          { divider: true },
          onDeletePlace && { label: t('common.delete'), icon: Trash2, danger: true, onClick: () => onDeletePlace(place.id) },
        ])}
        style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '9px 14px 9px 16px',
          cursor: 'grab',
          background: isSelected ? 'var(--border-faint)' : 'transparent',
          borderBottom: '1px solid var(--border-faint)',
          transition: 'background 0.1s',
        }}
        onMouseEnter={e => { if (!isSelected) (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)' }}
        onMouseLeave={e => { if (!isSelected) (e.currentTarget as HTMLElement).style.background = 'transparent' }}
      >
        <PlaceAvatar place={place} category={cat} size={34} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, overflow: 'hidden' }}>
            {cat && (() => {
              const CatIcon = getCategoryIcon(cat.icon)
              return <CatIcon size={11} strokeWidth={2} color={cat.color || '#6366f1'} style={{ flexShrink: 0 }} title={cat.name} />
            })()}
            <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', lineHeight: 1.2 }}>
              {place.name}
            </span>
          </div>
          {(timeStr || (!activeDayId && dayLabel != null)) ? (
            <div style={{ marginTop: 2, display: 'flex', alignItems: 'center', gap: 3 }}>
              {!activeDayId && dayLabel != null && (
                <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 500, lineHeight: 1.2 }}>
                  {dayLabel}{timeStr ? ' ·' : ''}
                </span>
              )}
              {timeStr && (
                <span style={{ fontSize: 11, color: 'var(--accent)', fontWeight: 600, lineHeight: 1.2 }}>{timeStr}</span>
              )}
            </div>
          ) : (place.description || place.address || cat?.name) ? (
            <div style={{ marginTop: 2 }}>
              <span style={{ fontSize: 11, color: 'var(--text-faint)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block', lineHeight: 1.2 }}>
                {place.description || place.address || cat?.name}
              </span>
            </div>
          ) : null}
        </div>
        <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center' }}>
          {onEditPlace && (
            <button
              onClick={e => { e.preventDefault(); e.stopPropagation(); onEditPlace(place) }}
              onPointerDown={e => e.stopPropagation()}
              onPointerUp={e => e.stopPropagation()}
              onTouchStart={e => e.stopPropagation()}
              onTouchEnd={e => e.stopPropagation()}
              title={t('common.edit')}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                width: 32, height: 32, borderRadius: 8, marginRight: 6,
                background: 'var(--bg-hover)', border: 'none', cursor: 'pointer',
                color: 'var(--text-faint)', padding: 0, transition: 'background 0.15s, color 0.15s',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-tertiary)'; e.currentTarget.style.color = 'var(--text-primary)' }}
              onMouseLeave={e => { e.currentTarget.style.background = 'var(--bg-hover)'; e.currentTarget.style.color = 'var(--text-faint)' }}
            ><Pencil size={15} strokeWidth={2.3} /></button>
          )}
          {onDeletePlace && (
            <button
              onClick={e => { e.preventDefault(); e.stopPropagation(); onDeletePlace(place.id) }}
              onPointerDown={e => e.stopPropagation()}
              onPointerUp={e => e.stopPropagation()}
              onTouchStart={e => e.stopPropagation()}
              onTouchEnd={e => e.stopPropagation()}
              title={t('common.delete')}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                width: 32, height: 32, borderRadius: 8, marginRight: activeDayId ? 6 : 0,
                background: 'var(--bg-hover)', border: 'none', cursor: 'pointer',
                color: '#ef4444', padding: 0, transition: 'background 0.15s, color 0.15s',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = 'rgba(239,68,68,0.12)'; e.currentTarget.style.color = '#dc2626' }}
              onMouseLeave={e => { e.currentTarget.style.background = 'var(--bg-hover)'; e.currentTarget.style.color = '#ef4444' }}
            ><Trash2 size={15} strokeWidth={2.3} /></button>
          )}
          {!inDay && activeDayId && onAssignToDay && (
            <button
              onClick={e => { e.preventDefault(); e.stopPropagation(); onAssignToDay(place.id, activeDayId) }}
              onPointerDown={e => e.stopPropagation()}
              onPointerUp={e => e.stopPropagation()}
              onTouchStart={e => e.stopPropagation()}
              onTouchEnd={e => e.stopPropagation()}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                width: 32, height: 32, borderRadius: 8,
                background: 'var(--bg-hover)', border: 'none', cursor: 'pointer',
                color: 'var(--text-faint)', padding: 0, transition: 'background 0.15s, color 0.15s',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = 'var(--accent)'; e.currentTarget.style.color = 'var(--accent-text)' }}
              onMouseLeave={e => { e.currentTarget.style.background = 'var(--bg-hover)'; e.currentTarget.style.color = 'var(--text-faint)' }}
            ><Plus size={18} strokeWidth={2.5} /></button>
          )}
          {inDay && activeDayId && onRemoveAssignment && assignmentInActiveDay && (
            <button
              onClick={e => { e.preventDefault(); e.stopPropagation(); onRemoveAssignment(activeDayId, assignmentInActiveDay.id) }}
              onPointerDown={e => e.stopPropagation()}
              onPointerUp={e => e.stopPropagation()}
              onTouchStart={e => e.stopPropagation()}
              onTouchEnd={e => e.stopPropagation()}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                width: 32, height: 32, borderRadius: 8,
                background: 'var(--bg-hover)', border: 'none', cursor: 'pointer',
                color: '#ef4444', padding: 0, transition: 'background 0.15s, color 0.15s',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = 'rgba(239,68,68,0.12)'; e.currentTarget.style.color = '#dc2626' }}
              onMouseLeave={e => { e.currentTarget.style.background = 'var(--bg-hover)'; e.currentTarget.style.color = '#ef4444' }}
            ><Minus size={18} strokeWidth={2.5} /></button>
          )}
        </div>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', system-ui, sans-serif" }}>
      {/* Kopfbereich */}
      <div style={{ padding: '14px 16px 10px', borderBottom: '1px solid var(--border-faint)', flexShrink: 0 }}>
        {/* Tag-Filter (immer sichtbar wenn Tage vorhanden) */}
        {days && days.length > 0 && (
          <div style={{ marginBottom: 10, display: 'flex', gap: 6, alignItems: 'center' }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <CustomSelect
                value={activeDayId ? String(activeDayId) : ''}
                onChange={handleDayChange}
                placeholder={t('day.allDays')}
                options={[
                  { value: '', label: t('day.allDays') },
                  ...days.map((d, i) => ({ value: String(d.id), label: d.title || t('dayplan.dayN', { n: i + 1 }), icon: <CalendarDays size={14} color="var(--accent)" /> }))
                ]}
              />
            </div>
            {activeDayId && (
              <button
                onClick={handleClearDay}
                title={t('common.close')}
                style={{
                  width: 30, height: 30, borderRadius: 8, border: 'none', cursor: 'pointer', flexShrink: 0,
                  background: 'var(--bg-tertiary)', color: 'var(--text-faint)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  transition: 'background 0.15s, color 0.15s',
                }}
                onMouseEnter={e => { e.currentTarget.style.background = 'rgba(239,68,68,0.12)'; e.currentTarget.style.color = '#dc2626' }}
                onMouseLeave={e => { e.currentTarget.style.background = 'var(--bg-tertiary)'; e.currentTarget.style.color = 'var(--text-faint)' }}
              ><X size={13} strokeWidth={2} /></button>
            )}
          </div>
        )}

        <button
          onClick={onAddPlace}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            width: '100%', padding: '8px 12px', borderRadius: 12, border: 'none',
            background: 'var(--accent)', color: 'var(--accent-text)', fontSize: 13, fontWeight: 500,
            cursor: 'pointer', fontFamily: 'inherit', marginBottom: 10,
          }}
        >
          <Plus size={14} strokeWidth={2} /> {t('places.addPlace')}
        </button>

        {/* Filter-Tabs */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 8 }}>
          {[{ id: 'all', label: t('places.all') }, { id: 'planned', label: t('places.planned') }, { id: 'unplanned', label: t('places.unplanned') }].map(f => (
            <button key={f.id} onClick={() => setFilter(f.id)} style={{
              padding: '4px 10px', borderRadius: 20, border: 'none', cursor: 'pointer',
              fontSize: 11, fontWeight: 500, fontFamily: 'inherit',
              background: filter === f.id ? 'var(--accent)' : 'var(--bg-tertiary)',
              color: filter === f.id ? 'var(--accent-text)' : 'var(--text-muted)',
            }}>{f.label}</button>
          ))}
        </div>

        {/* Suchfeld */}
        <div style={{ position: 'relative' }}>
          <Search size={13} strokeWidth={1.8} color="var(--text-faint)" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder={t('places.search')}
            style={{
              width: '100%', padding: '7px 30px 7px 30px', borderRadius: 10,
              border: 'none', background: 'var(--bg-tertiary)', fontSize: 12, color: 'var(--text-primary)',
              outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box',
            }}
          />
          {search && (
            <button onClick={() => setSearch('')} style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex' }}>
              <X size={12} strokeWidth={2} color="var(--text-faint)" />
            </button>
          )}
        </div>

        {/* Kategoriefilter */}
        {categories.length > 0 && (
          <div style={{ marginTop: 6 }}>
            <CustomSelect
              value={categoryFilter}
              onChange={setCategoryFilter}
              placeholder={t('places.allCategories')}
              size="sm"
              options={[
                { value: '', label: t('places.allCategories') },
                ...categories.map(c => ({ value: String(c.id), label: c.name }))
              ]}
            />
          </div>
        )}
      </div>

      {/* Anzahl */}
      <div style={{ padding: '6px 16px', flexShrink: 0 }}>
        <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>{totalFiltered === 1 ? t('places.countSingular') : t('places.count', { count: totalFiltered })}</span>
      </div>

      {/* Liste */}
      <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
        {totalFiltered === 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '40px 16px', gap: 8 }}>
            <span style={{ fontSize: 13, color: 'var(--text-faint)' }}>
              {filter === 'unplanned' ? t('places.allPlanned') : t('places.noneFound')}
            </span>
            <button onClick={onAddPlace} style={{ fontSize: 12, color: 'var(--text-primary)', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline', fontFamily: 'inherit' }}>
              {t('places.addPlace')}
            </button>
          </div>
        ) : (
          renderedGroups.map((group, gi) => (
            <div key={gi}>
              {group.label && (
                <div style={{ padding: '8px 16px 4px', fontSize: 10, fontWeight: 700, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.06em', background: 'var(--bg-secondary)' }}>
                  {group.label} ({group.places.length})
                </div>
              )}
              {group.places.map(({ place, assignment }) => renderPlaceRow(place, assignment))}
            </div>
          ))
        )}
      </div>

      <ContextMenu menu={ctxMenu.menu} onClose={ctxMenu.close} />
    </div>
  )
}
