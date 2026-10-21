import type { Engine } from './engine'
import { unwrap } from './engine'
import { analyzePermission, type PermissionRequest } from './approval'
import type { Store } from './store'

const PERMISSION_EVENTS = new Set(['permission.asked', 'permission.created', 'session.permission.created'])

// The engine streams {"type":"permission.asked","data":{...}} on the SSE bus,
// but older builds and the reconnect path may flatten the same fields.
export function permissionFromEvent(event: any): PermissionRequest | undefined {
  const type = event?.type || event?.data?.type || event?.payload?.type
  if (!PERMISSION_EVENTS.has(type)) return undefined
  const data = event?.data || event?.payload?.data || event?.payload || event
  if (data && typeof data === 'object' && typeof data.id === 'string' && typeof data.sessionID === 'string') return data as PermissionRequest
  return undefined
}

// Answers permission requests for sessions in "auto" mode. The engine stays in
// ask mode, so a decision here is always a one-off approval or a refusal; no
// rule is ever persisted on the session.
export class AutoApproval {
  private inFlight = new Set<string>()
  private prompts = new Map<string, string>()
  private directories = new Map<string, string>()
  constructor(
    private engine: Engine,
    private store: Store,
    private lookup: (sessionID: string) => Promise<string | undefined>
  ) {}

  notePrompt(sessionID: string, text: string) {
    if (!sessionID || !text) return
    this.prompts.set(sessionID, text.slice(-4000))
  }

  private isAuto(sessionID?: string) {
    return !!sessionID && this.store.state.sessionModes?.[sessionID] === 'auto'
  }

  async onEvent(event: unknown) {
    const permission = permissionFromEvent(event)
    if (permission) await this.handle(permission)
  }

  async sweepAll() {
    for (const sessionID of Object.keys(this.store.state.sessionModes || {})) await this.sweep(sessionID)
  }

  async sweep(sessionID: string) {
    if (!this.isAuto(sessionID)) return
    try {
      const list = unwrap<PermissionRequest[]>(await this.engine.request('GET', 'api/session/' + encodeURIComponent(sessionID) + '/permission')) || []
      for (const permission of list) await this.handle({ ...permission, sessionID: permission.sessionID || sessionID })
    } catch {}
  }

  private async handle(permission: PermissionRequest) {
    const sessionID = permission.sessionID
    const id = permission.id
    if (!this.isAuto(sessionID) || !sessionID || !id || this.inFlight.has(id)) return
    this.inFlight.add(id)
    try {
      const [directory, authorization] = await Promise.all([this.directory(sessionID), this.authorization(sessionID)])
      // The user may have switched modes while context was loading.
      if (!this.isAuto(sessionID)) return
      const result = analyzePermission(permission, { directory, authorization })
      await this.engine.request('POST', 'api/session/' + encodeURIComponent(sessionID) + '/permission/' + encodeURIComponent(id) + '/reply', {
        decision: result.decision,
        ...(result.decision === 'reject' ? { message: result.reason } : {})
      })
    } catch {}
    finally { this.inFlight.delete(id) }
  }

  private async directory(sessionID: string) {
    const cached = this.directories.get(sessionID)
    if (cached) return cached
    const value = await this.lookup(sessionID).catch(() => undefined)
    if (value) this.directories.set(sessionID, value)
    return value
  }

  private async authorization(sessionID: string) {
    const cached = this.prompts.get(sessionID)
    if (cached) return cached
    try {
      const messages = unwrap<any[]>(await this.engine.request('GET', 'api/session/' + encodeURIComponent(sessionID) + '/message?limit=20&order=desc')) || []
      for (const message of messages) {
        const role = message?.role || message?.info?.role || message?.type
        if (role !== 'user') continue
        // Engine user messages carry plain text on `text`; other wire shapes
        // expose text parts inside `content` or `parts`.
        const text = typeof message.text === 'string' && message.text
          ? message.text
          : (message.content || message.parts || []).filter((part: any) => part?.type === 'text' && typeof part.text === 'string').map((part: any) => part.text).join('\n')
        if (text) { this.notePrompt(sessionID, text); return text }
      }
    } catch {}
    return ''
  }
}
