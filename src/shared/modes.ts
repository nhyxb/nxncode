import type { SessionMode, Wire } from './types'
export type { SessionMode } from './types'

// Full access and Ask First are enforced by the engine's permission rules.
// Auto approve keeps the engine in "ask" mode and lets the desktop process
// answer each request after a local risk analysis, so only the overlay needs
// to be remembered per session.

export const isSessionMode = (value: unknown): value is SessionMode =>
  value === 'ask' || value === 'auto' || value === 'full'

export function modeFromPermissions(permissions: Wire[] | undefined): SessionMode | undefined {
  if (!Array.isArray(permissions)) return undefined
  const unrestricted = permissions.some(rule => rule?.action === '*' && rule?.resource === '*' && rule?.effect === 'allow')
  return unrestricted && permissions.every(rule => rule?.effect === 'allow') ? 'full' : 'ask'
}

export function resolveSessionMode(
  session: { id?: string; appMode?: unknown; permissions?: Wire[] } | undefined,
  modes?: Record<string, SessionMode>
): SessionMode {
  if (isSessionMode(session?.appMode)) return session.appMode
  const stored = session?.id ? modes?.[session.id] : undefined
  if (isSessionMode(stored)) return stored
  return modeFromPermissions(session?.permissions) ?? 'ask'
}

export const modeEffect = (mode: SessionMode) => (mode === 'full' ? 'allow' : 'ask')
