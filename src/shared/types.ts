export type Wire = Record<string, any>
export type Look = { color: string; shape: string; face: string }
export type ModelRef = { id: string; providerID: string; variant?: string }
export type Bot = { id: string; name: string; job: string; look: Look; project: string; sessionID?: string; model?: ModelRef; paused: boolean; unread?: boolean }
export type Schedule = { id: string; botID: string; text: string; kind: 'once'|'daily'|'weekly'; at: string; timeZone: string; nextRunAt: number; pendingID?: string; retryAt?: number; attempts?: number; enabled: boolean }
export type SessionMode = 'ask' | 'auto' | 'full'
export type AppState = { version: 1; language: 'zh'|'en'; sidebar: number; panel: number; fontSize: number; bots: Bot[]; projects: string[]; schedules: Schedule[]; selected?: string; model?: ModelRef; starred: string[]; mainBotID?: string; enabledModels?: string[]; sessionModes?: Record<string, SessionMode> }
export type EngineState = { status: 'stopped'|'installing'|'starting'|'ready'|'error'; detail?: string; progress?: number; version: string }
export type BrowserTab = { id: string; sessionID: string; title: string; url: string; loading: boolean; takeover: boolean }
export type Bridge = { invoke: (action: string, args?: Wire) => Promise<any>; on: (event: string, listener: (value: any) => void) => () => void }
declare global { interface Window { nxncode?: Bridge } }

