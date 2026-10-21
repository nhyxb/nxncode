// Sidebar session list: local pin/archive flags and a user-defined order.
// The engine owns the sessions themselves; these preferences only change how
// this app lists them, so no engine state is written for pinning or sorting.
export type SessionPreference = { pinned?: boolean; archived?: boolean }
export type SessionPreferences = Record<string, SessionPreference>
export type ArrangedSessions<T> = { pinned: T[]; regular: T[]; archived: T[]; visible: T[] }

export function arrangeSessions<T>(sessions: T[], preferences: SessionPreferences | undefined, order: string[] | undefined): ArrangedSessions<T> {
  const prefs = preferences || {}
  const ranked = new Map((order || []).map((id, index) => [id, index]))
  const key = (session: T) => (session as { id: string }).id
  const active = sessions.filter(session => !prefs[key(session)]?.archived)
  const known = active.filter(session => ranked.has(key(session))).sort((a, b) => (ranked.get(key(a)) ?? 0) - (ranked.get(key(b)) ?? 0))
  // Sessions the user has not placed yet are newly created ones: newest first.
  const fresh = active.filter(session => !ranked.has(key(session)))
  const visible = [...fresh, ...known]
  return {
    pinned: visible.filter(session => prefs[key(session)]?.pinned),
    regular: visible.filter(session => !prefs[key(session)]?.pinned),
    archived: sessions.filter(session => prefs[key(session)]?.archived),
    visible: [...visible.filter(session => prefs[key(session)]?.pinned), ...visible.filter(session => !prefs[key(session)]?.pinned)]
  }
}

export function reorderSessions(visibleIds: string[], movedId: string, targetId: string, after: boolean): string[] {
  if (movedId === targetId || !visibleIds.includes(movedId) || !visibleIds.includes(targetId)) return visibleIds
  const next = visibleIds.filter(id => id !== movedId)
  const index = next.indexOf(targetId)
  next.splice(after ? index + 1 : index, 0, movedId)
  return next
}

// Keep archived sessions in the stored order so restoring one does not move it
// to the top; the dragged visible order replaces everything else.
export function mergeSessionOrder(nextVisible: string[], order: string[] | undefined, archivedIds: string[]): string[] {
  const visible = new Set(nextVisible)
  const archived = new Set(archivedIds)
  return [...nextVisible, ...(order || []).filter(id => !visible.has(id) && !archived.has(id)), ...archivedIds]
}
