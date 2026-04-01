import { useState, useEffect } from 'react'
import Modal from '../shared/Modal'
import { tripsApi, authApi, shareApi } from '../../api/client'
import { useToast } from '../shared/Toast'
import { useAuthStore } from '../../store/authStore'
import { Crown, UserMinus, UserPlus, Users, LogOut, Link2, Check, Copy, Trash2 } from 'lucide-react'
import { useTranslation } from '../../i18n'
import { getApiErrorMessage } from '../../types'
import CustomSelect from '../shared/CustomSelect'

interface AvatarProps {
  username: string
  avatarUrl: string | null
  size?: number
}

function Avatar({ username, avatarUrl, size = 32 }: AvatarProps) {
  if (avatarUrl) {
    return <img src={avatarUrl} alt="" style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
  }
  const letter = (username || '?')[0].toUpperCase()
  const colors = ['#3b82f6', '#8b5cf6', '#ec4899', '#10b981', '#f59e0b', '#ef4444', '#06b6d4']
  const color = colors[letter.charCodeAt(0) % colors.length]
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%', background: color,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: size * 0.4, fontWeight: 700, color: 'white', flexShrink: 0,
    }}>
      {letter}
    </div>
  )
}

interface ShareLink {
  id: number
  token: string
  label: string | null
  created_at: string
  share_map: boolean
  share_bookings: boolean
  share_packing: boolean
  share_budget: boolean
  share_collab: boolean
  share_kosten: boolean
}

const DEFAULT_PERMS = { share_map: true, share_bookings: true, share_packing: false, share_budget: false, share_collab: false, share_kosten: false }

function PermToggle({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} style={{
      display: 'flex', alignItems: 'center', gap: 5, padding: '3px 9px', borderRadius: 20,
      border: '1.5px solid', fontSize: 11, fontWeight: 500, cursor: 'pointer',
      fontFamily: 'inherit', transition: 'all 0.12s',
      background: active ? 'var(--text-primary)' : 'transparent',
      borderColor: active ? 'var(--text-primary)' : 'var(--border-primary)',
      color: active ? 'var(--bg-primary)' : 'var(--text-muted)',
    }}>
      {active ? <Check size={10} /> : null}{label}
    </button>
  )
}

function ShareLinkRow({ link, tripId, onUpdated, onDeleted, t }: { link: ShareLink; tripId: number; onUpdated: (updated: ShareLink) => void; onDeleted: (id: number) => void; t: any }) {
  const [copied, setCopied] = useState(false)
  const [editingLabel, setEditingLabel] = useState(false)
  const [labelInput, setLabelInput] = useState(link.label || '')
  const toast = useToast()
  const shareUrl = `${window.location.origin}/shared/${link.token}`

  const handleTogglePerm = async (key: string) => {
    try {
      const d = await shareApi.updateLink(tripId, link.id, { [key]: !link[key as keyof ShareLink] })
      onUpdated(d.link)
    } catch {}
  }

  const handleSaveLabel = async () => {
    try {
      const d = await shareApi.updateLink(tripId, link.id, { label: labelInput.trim() || null })
      onUpdated(d.link)
      setEditingLabel(false)
    } catch {}
  }

  const handleCopy = () => {
    navigator.clipboard.writeText(shareUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleDelete = async () => {
    try {
      await shareApi.deleteLink(tripId, link.id)
      onDeleted(link.id)
    } catch {}
  }

  return (
    <div style={{ border: '1px solid var(--border-primary)', borderRadius: 10, padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
      {/* Label row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        {editingLabel ? (
          <>
            <input
              autoFocus
              value={labelInput}
              onChange={e => setLabelInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleSaveLabel(); if (e.key === 'Escape') setEditingLabel(false) }}
              placeholder={t('share.labelPlaceholder')}
              style={{ flex: 1, border: '1px solid var(--border-primary)', borderRadius: 6, padding: '3px 8px', fontSize: 12, background: 'var(--bg-secondary)', color: 'var(--text-primary)', outline: 'none', fontFamily: 'inherit' }}
            />
            <button onClick={handleSaveLabel} style={{ padding: '3px 8px', borderRadius: 6, border: 'none', background: 'var(--accent)', color: 'var(--accent-text)', fontSize: 11, cursor: 'pointer', fontFamily: 'inherit' }}><Check size={11} /></button>
          </>
        ) : (
          <>
            <span
              onClick={() => setEditingLabel(true)}
              style={{ flex: 1, fontSize: 12, fontWeight: 500, color: link.label ? 'var(--text-primary)' : 'var(--text-faint)', cursor: 'pointer', borderRadius: 4, padding: '2px 4px' }}
              title={t('share.editLabel')}
            >
              {link.label || t('share.noLabel')}
            </span>
          </>
        )}
      </div>
      {/* Permission chips */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
        {[
          { key: 'share_map', label: t('share.permMap') },
          { key: 'share_bookings', label: t('share.permBookings') },
          { key: 'share_packing', label: t('share.permPacking') },
          { key: 'share_budget', label: t('share.permBudget') },
          { key: 'share_kosten', label: t('share.permKosten') },
          { key: 'share_collab', label: t('share.permCollab') },
        ].map(opt => (
          <PermToggle key={opt.key} label={opt.label} active={link[opt.key as keyof ShareLink] as boolean} onClick={() => handleTogglePerm(opt.key)} />
        ))}
      </div>
      {/* URL + actions */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 4, padding: '4px 8px', background: 'var(--bg-tertiary)', borderRadius: 6, border: '1px solid var(--border-faint)', minWidth: 0 }}>
          <input type="text" value={shareUrl} readOnly style={{ flex: 1, border: 'none', background: 'none', fontSize: 10, color: 'var(--text-primary)', outline: 'none', fontFamily: 'monospace', minWidth: 0 }} />
        </div>
        <button onClick={handleCopy} title={t('common.copy')} style={{
          display: 'flex', alignItems: 'center', gap: 3, padding: '5px 8px', borderRadius: 6,
          border: 'none', background: copied ? '#16a34a' : 'var(--accent)', color: copied ? 'white' : 'var(--accent-text)',
          fontSize: 10, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', transition: 'background 0.18s', flexShrink: 0,
        }}>
          {copied ? <Check size={10} /> : <Copy size={10} />}
        </button>
        <button onClick={handleDelete} title={t('share.deleteLink')} style={{
          display: 'flex', alignItems: 'center', padding: '5px 7px', borderRadius: 6,
          border: '1px solid rgba(239,68,68,0.3)', background: 'rgba(239,68,68,0.06)',
          color: '#ef4444', cursor: 'pointer', flexShrink: 0, transition: 'background 0.15s',
        }}>
          <Trash2 size={12} />
        </button>
      </div>
    </div>
  )
}

function ShareLinkSection({ tripId, t }: { tripId: number; t: any }) {
  const [links, setLinks] = useState<ShareLink[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const toast = useToast()

  useEffect(() => {
    shareApi.getLinks(tripId).then(d => {
      setLinks(d.links || [])
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [tripId])

  const handleCreate = async () => {
    setCreating(true)
    try {
      const d = await shareApi.createLink(tripId, { ...DEFAULT_PERMS })
      setLinks(prev => [...prev, d.link])
    } catch { toast.error(t('share.createError')) }
    finally { setCreating(false) }
  }

  if (loading) return <div style={{ height: 80, background: 'var(--bg-tertiary)', borderRadius: 10, animation: 'pulse 1.5s ease-in-out infinite' }} />

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <Link2 size={14} style={{ color: 'var(--text-muted)' }} />
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{t('share.linkTitle')}</span>
      </div>
      <p style={{ fontSize: 11, color: 'var(--text-faint)', lineHeight: 1.5 }}>{t('share.linkHint')}</p>

      {links.map(link => (
        <ShareLinkRow
          key={link.id}
          link={link}
          tripId={tripId}
          onUpdated={(updated) => setLinks(prev => prev.map(l => l.id === updated.id ? updated : l))}
          onDeleted={(id) => setLinks(prev => prev.filter(l => l.id !== id))}
          t={t}
        />
      ))}

      <button onClick={handleCreate} disabled={creating} style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
        width: '100%', padding: '8px 0', borderRadius: 8, border: '1px dashed var(--border-primary)',
        background: 'none', color: 'var(--text-muted)', fontSize: 12, fontWeight: 500,
        cursor: creating ? 'wait' : 'pointer', fontFamily: 'inherit', opacity: creating ? 0.6 : 1,
      }}>
        <Link2 size={12} /> {t('share.createLink')}
      </button>
    </div>
  )
}

interface TripMembersModalProps {
  isOpen: boolean
  onClose: () => void
  tripId: number
  tripTitle: string
}

export default function TripMembersModal({ isOpen, onClose, tripId, tripTitle }: TripMembersModalProps) {
  const [data, setData] = useState(null)
  const [allUsers, setAllUsers] = useState([])
  const [loading, setLoading] = useState(false)
  const [selectedUserId, setSelectedUserId] = useState('')
  const [adding, setAdding] = useState(false)
  const [removingId, setRemovingId] = useState(null)
  const toast = useToast()
  const { user } = useAuthStore()
  const { t } = useTranslation()

  useEffect(() => {
    if (isOpen && tripId) {
      loadMembers()
      loadAllUsers()
    }
  }, [isOpen, tripId])

  const loadMembers = async () => {
    setLoading(true)
    try {
      const d = await tripsApi.getMembers(tripId)
      setData(d)
    } catch {
      toast.error(t('members.loadError'))
    } finally {
      setLoading(false)
    }
  }

  const loadAllUsers = async () => {
    try {
      const d = await authApi.listUsers()
      setAllUsers(d.users)
    } catch {}
  }

  const handleAdd = async () => {
    if (!selectedUserId) return
    setAdding(true)
    try {
      const target = allUsers.find(u => String(u.id) === String(selectedUserId))
      await tripsApi.addMember(tripId, target.username)
      setSelectedUserId('')
      await loadMembers()
      toast.success(`${target.username} ${t('members.added')}`)
    } catch (err: unknown) {
      toast.error(getApiErrorMessage(err, t('members.addError')))
    } finally {
      setAdding(false)
    }
  }

  const handleRemove = async (userId, isSelf) => {
    const msg = isSelf
      ? t('members.confirmLeave')
      : t('members.confirmRemove')
    if (!confirm(msg)) return
    setRemovingId(userId)
    try {
      await tripsApi.removeMember(tripId, userId)
      if (isSelf) { onClose(); window.location.reload() }
      else { await loadMembers(); toast.success(t('members.removed')) }
    } catch {
      toast.error(t('members.removeError'))
    } finally {
      setRemovingId(null)
    }
  }

  // Users not yet in the trip
  const existingIds = new Set([
    data?.owner?.id,
    ...(data?.members?.map(m => m.id) || []),
  ])
  const availableUsers = allUsers.filter(u => !existingIds.has(u.id))

  const isCurrentOwner = data?.owner?.id === user?.id
  const allMembers = data ? [
    { ...data.owner, role: 'owner' },
    ...data.members,
  ] : []

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={t('members.shareTrip')} size="3xl">
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', system-ui, sans-serif" }} className="share-modal-grid">
        <style>{`@media (max-width: 640px) { .share-modal-grid { grid-template-columns: 1fr !important; } }`}</style>

        {/* Left column: Members */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

        {/* Trip name */}
        <div style={{ padding: '10px 14px', background: 'var(--bg-secondary)', borderRadius: 10, border: '1px solid var(--border-secondary)' }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 2 }}>{t('nav.trip')}</div>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>{tripTitle}</div>
        </div>

        {/* Add member dropdown */}
        <div>
          <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 8 }}>
            {t('members.inviteUser')}
          </label>
          <div style={{ display: 'flex', gap: 8 }}>
            <CustomSelect
              value={selectedUserId}
              onChange={value => setSelectedUserId(value)}
              placeholder={t('members.selectUser')}
              options={[
                { value: '', label: t('members.selectUser') },
                ...availableUsers.map(u => ({
                  value: u.id,
                  label: u.username,
                })),
              ]}
              searchable
              style={{ flex: 1 }}
              size="sm"
            />
            <button
              onClick={handleAdd}
              disabled={adding || !selectedUserId}
              style={{
                display: 'flex', alignItems: 'center', gap: 5, padding: '8px 14px',
                background: 'var(--accent)', color: 'var(--accent-text)', border: 'none', borderRadius: 10,
                fontSize: 13, fontWeight: 600, cursor: adding || !selectedUserId ? 'default' : 'pointer',
                fontFamily: 'inherit', opacity: adding || !selectedUserId ? 0.4 : 1, flexShrink: 0,
              }}
            >
              <UserPlus size={13} /> {adding ? '…' : t('members.invite')}
            </button>
          </div>
          {availableUsers.length === 0 && allUsers.length > 0 && (
            <p style={{ fontSize: 11.5, color: 'var(--text-faint)', margin: '6px 0 0' }}>{t('members.allHaveAccess')}</p>
          )}
        </div>

        {/* Members list */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
            <Users size={13} style={{ color: 'var(--text-faint)' }} />
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>
              {t('members.access')} ({allMembers.length} {allMembers.length === 1 ? t('members.person') : t('members.persons')})
            </span>
          </div>

          {loading ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {[1, 2].map(i => (
                <div key={i} style={{ height: 48, background: 'var(--bg-tertiary)', borderRadius: 10, animation: 'pulse 1.5s ease-in-out infinite' }} />
              ))}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {allMembers.map(member => {
                const isSelf = member.id === user?.id
                const canRemove = isCurrentOwner ? member.role !== 'owner' : isSelf
                return (
                  <div key={member.id} style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '8px 12px', borderRadius: 10, background: 'var(--bg-secondary)',
                    border: '1px solid var(--border-secondary)',
                  }}>
                    <Avatar username={member.username} avatarUrl={member.avatar_url} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{member.username}</span>
                        {isSelf && <span style={{ fontSize: 10, color: 'var(--text-faint)' }}>({t('members.you')})</span>}
                        {member.role === 'owner' && (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 10, fontWeight: 700, color: '#d97706', background: '#fef9c3', padding: '1px 6px', borderRadius: 99 }}>
                            <Crown size={9} /> {t('members.owner')}
                          </span>
                        )}
                      </div>
                    </div>
                    {canRemove && (
                      <button
                        onClick={() => handleRemove(member.id, isSelf)}
                        disabled={removingId === member.id}
                        title={isSelf ? t('members.leaveTrip') : t('members.removeAccess')}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', borderRadius: 6, display: 'flex', color: 'var(--text-faint)', opacity: removingId === member.id ? 0.4 : 1 }}
                        onMouseEnter={e => e.currentTarget.style.color = '#ef4444'}
                        onMouseLeave={e => e.currentTarget.style.color = '#9ca3af'}
                      >
                        {isSelf ? <LogOut size={14} /> : <UserMinus size={14} />}
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>

        <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.5} }`}</style>
        </div>

        {/* Right column: Share Link */}
        <div style={{ borderLeft: '1px solid var(--border-faint)', paddingLeft: 24 }}>
          <ShareLinkSection tripId={tripId} t={t} />
        </div>

      </div>
    </Modal>
  )
}
