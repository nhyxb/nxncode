import { useEffect, useRef, useState } from 'react'
import { MessageCircle, MoreHorizontal, Pin, PinOff, Pencil, GitFork, Archive, ArchiveRestore, Check, ChevronRight, Plus } from 'lucide-react'
import type { Wire } from '../shared/types'
import { arrangeSessions, mergeSessionOrder, reorderSessions, type SessionPreferences } from '../shared/sessions'

type MenuState = { id: string; top: number; left: number }
type Editing = { id: string; value: string }
type Drop = { id: string; after: boolean }

const menuHeight = 152

export function SessionList({ sessions, botSessionIDs, selected, query, preferences, order, onSelect, onPreferences, onOrder, onRename, onFork, t }: {
  sessions: Wire[]
  botSessionIDs: string[]
  selected: string
  query: string
  preferences: SessionPreferences
  order: string[]
  onSelect: (id: string) => void
  onPreferences: (id: string, values: { pinned?: boolean; archived?: boolean }) => void
  onOrder: (ids: string[]) => void
  onRename: (id: string, title: string) => void
  onFork: (id: string) => void
  t: (a: string, b: string) => string
}) {
  const [menu, setMenu] = useState<MenuState | null>(null)
  const [editing, setEditing] = useState<Editing | null>(null)
  const [archiveOpen, setArchiveOpen] = useState(false)
  const [dragging, setDragging] = useState('')
  const [drop, setDrop] = useState<Drop | null>(null)
  const committing = useRef(false)
  const sessionsRef = useRef(sessions)
  sessionsRef.current = sessions

  useEffect(() => { setMenu(null); setDrop(null) }, [query])

  const others = sessions.filter(session => !botSessionIDs.includes(session.id))
  const arranged = arrangeSessions(others, preferences, order)
  const needle = query.trim().toLowerCase()
  const match = (session: Wire) => !needle || (session.title || '').toLowerCase().includes(needle)
  const pinned = arranged.pinned.filter(match)
  const regular = arranged.regular.filter(match)
  const archived = arranged.archived.filter(match)
  const title = (session: Wire) => session.title || t('未命名会话', 'Untitled')

  function commitRename() {
    if (committing.current) return
    const current = editing
    if (!current) return
    committing.current = true
    setEditing(null)
    const value = current.value.trim()
    if (value && value !== (sessionsRef.current.find(s => s.id === current.id)?.title || '')) onRename(current.id, value)
    committing.current = false
  }

  function openMenu(event: React.MouseEvent<HTMLButtonElement>, session: Wire) {
    event.stopPropagation()
    const rect = event.currentTarget.getBoundingClientRect()
    const top = Math.min(rect.bottom + 4, window.innerHeight - menuHeight - 8)
    setEditing(null)
    setMenu({ id: session.id, top: Math.max(8, top), left: Math.max(8, rect.left - 118) })
  }

  function dragOver(event: React.DragEvent<HTMLDivElement>, session: Wire) {
    if (!dragging || needle) return
    event.preventDefault()
    const rect = event.currentTarget.getBoundingClientRect()
    setDrop({ id: session.id, after: event.clientY > rect.top + rect.height / 2 })
  }

  function dropOn(event: React.DragEvent<HTMLDivElement>, session: Wire) {
    event.preventDefault()
    const rect = event.currentTarget.getBoundingClientRect()
    const source = dragging
    const after = drop && drop.id === session.id ? drop.after : event.clientY > rect.top + rect.height / 2
    setDragging(''); setDrop(null)
    if (!source || source === session.id || needle) return
    const visible = arranged.visible.map(item => item.id)
    const next = reorderSessions(visible, source, session.id, after)
    if (next === visible) return
    onOrder(mergeSessionOrder(next, order, arranged.archived.map(item => item.id)))
    const targetPinned = !!preferences[session.id]?.pinned
    if (!!preferences[source]?.pinned !== targetPinned) onPreferences(source, { pinned: targetPinned })
  }

  function row(session: Wire, archivedRow = false) {
    const active = selected === session.id
    const pinned = !!preferences[session.id]?.pinned
    const classes = ['chat-row', 'session-row', active ? 'active' : '', pinned ? 'pinned' : '', dragging === session.id ? 'dragging' : '', menu?.id === session.id ? 'menu-open' : '', drop && drop.id === session.id ? (drop.after ? 'drop-after' : 'drop-before') : ''].filter(Boolean).join(' ')
    const current = editing
    if (current && current.id === session.id) return <div className="chat-row editing" key={session.id}>
      <input autoFocus value={current.value} maxLength={120} aria-label={t('会话名称', 'Session name')} onChange={event => setEditing({ id: session.id, value: event.target.value })} onKeyDown={event => { if (event.key === 'Enter') commitRename(); if (event.key === 'Escape') setEditing(null) }} onBlur={commitRename} />
      <button className="icon" title={t('保存名称', 'Save name')} onMouseDown={event => event.preventDefault()} onClick={commitRename}><Check size={13} /></button>
    </div>
    return <div className={classes} key={session.id} role="button" tabIndex={0} draggable={!archivedRow && !needle} onDragStart={event => { setDragging(session.id); event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain', session.id) }} onDragEnd={() => { setDragging(''); setDrop(null) }} onDragOver={event => dragOver(event, session)} onDrop={event => dropOn(event, session)} onClick={() => onSelect(session.id)} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onSelect(session.id) } }}>
      <MessageCircle size={14} />
      <span>{title(session)}</span>
      {pinned && !archivedRow && <Pin size={11} className="pin-mark" />}
      <button className="icon chat-more" title={t('会话操作', 'Session actions')} onClick={event => openMenu(event, session)}><MoreHorizontal size={14} /></button>
    </div>
  }

  const empty = !others.length

  return <div className="session-list">
    {empty && <button className="chat-row muted" onClick={() => onSelect('new')}><Plus size={14} />{t('开始聊天', 'Start a chat')}</button>}
    {!empty && !pinned.length && !regular.length && !archived.length && <div className="sidebar-empty">{t('没有匹配的会话', 'No matching sessions')}</div>}
    {pinned.length > 0 && <div className="pinned-label">{t('置顶', 'Pinned')}</div>}
    {pinned.map(session => row(session))}
    {regular.map(session => row(session))}
    {archived.length > 0 && <button className="archive-toggle" onClick={() => setArchiveOpen(open => !open)} aria-expanded={archiveOpen}><ChevronRight size={12} className={archiveOpen ? 'open' : ''} />{t('已归档', 'Archived')}<span>{archived.length}</span></button>}
    {archiveOpen || needle ? archived.map(session => row(session, true)) : null}
    {menu && <>
      <div className="popover-dismiss" onClick={() => setMenu(null)} onContextMenu={event => { event.preventDefault(); setMenu(null) }} />
      <div className="session-menu popover" style={{ top: menu.top, left: menu.left }} role="menu">
        <button role="menuitem" onClick={() => { const pinned = !!preferences[menu.id]?.pinned; onPreferences(menu.id, { pinned: !pinned }); setMenu(null) }}>{preferences[menu.id]?.pinned ? <PinOff size={13} /> : <Pin size={13} />}{preferences[menu.id]?.pinned ? t('取消置顶', 'Unpin') : t('置顶会话', 'Pin session')}</button>
        <button role="menuitem" onClick={() => { const session = sessions.find(item => item.id === menu.id); if (session) setEditing({ id: menu.id, value: title(session) }); setMenu(null) }}><Pencil size={13} />{t('重命名', 'Rename')}</button>
        <button role="menuitem" onClick={() => { onFork(menu.id); setMenu(null) }}><GitFork size={13} />{t('分叉会话', 'Fork session')}</button>
        <button role="menuitem" onClick={() => { const archived = !!preferences[menu.id]?.archived; onPreferences(menu.id, { archived: !archived }); setMenu(null) }}>{preferences[menu.id]?.archived ? <ArchiveRestore size={13} /> : <Archive size={13} />}{preferences[menu.id]?.archived ? t('移出归档', 'Unarchive') : t('归档会话', 'Archive session')}</button>
      </div>
    </>}
  </div>
}
