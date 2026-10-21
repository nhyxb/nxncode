import { useEffect, useLayoutEffect, useState, type FormEvent, type ReactNode } from 'react'
import { Plus, RefreshCw, Trash2, Pencil, Check, FolderInput, Plug, BookOpen } from 'lucide-react'
import { bridge } from './bridge'
import { Switch } from './ModelSettings'
import type { Wire } from '../shared/types'

type Translate = (a: string, b: string) => string
function MotionRows({ items, children }: { items: Wire[]; children: (item: Wire) => ReactNode }) {
 const [previous, setPrevious] = useState<Wire[]>(items)
 const leaving = previous.filter(item => !items.some(next => next.id === item.id))
 useLayoutEffect(() => {
  if (!leaving.length) { setPrevious(items); return }
  const timer = setTimeout(() => setPrevious(items), matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 170)
  return () => clearTimeout(timer)
 }, [items])
 return <>{[...items, ...leaving].map(item => <div key={item.id} className={'motion-row ' + (leaving.includes(item) ? 'is-leaving' : '')}><div>{children(item)}</div></div>)}</>
}
const blank = { providers: [], servers: [], skills: [], discoveredSkills: [], builtinServers: [] } as Wire
export function ExtensionSettings({ kind, onRefresh, onError, t }: { kind: 'providers' | 'mcp' | 'skills'; onRefresh: () => void; onError: (error: unknown) => void; t: Translate }) {
 const [data, setData] = useState<Wire>(blank), [loading, setLoading] = useState(true), [busy, setBusy] = useState(false)
 const [draft, setDraft] = useState<Wire | null>(null), [message, setMessage] = useState(''), [remove, setRemove] = useState<string | null>(null)
 const [loadError, setLoadError] = useState(false)
 async function refresh() {
  setLoading(true); setLoadError(false)
  try { setData(await bridge.invoke('extensions.list')) } catch (error) { setLoadError(true); onError(error) } finally { setLoading(false) }
 }
 useEffect(() => { void refresh() }, [kind])
 const connecting = kind === 'mcp' && data.online && data.servers?.some((server: Wire) => server.enabled && server.status === 'pending')
 useEffect(() => {
  if (!connecting) return
  const timer = setInterval(() => { if (!document.hidden) void bridge.invoke('extensions.list').then(setData).catch(onError) }, 1500)
  return () => clearInterval(timer)
 }, [connecting])
 useEffect(() => { if (!message) return; const timer = setTimeout(() => setMessage(''), 3500); return () => clearTimeout(timer) }, [message])
 async function act(action: string, args: Wire = {}) {
  setBusy(true); setMessage('')
  try {
   const result = await bridge.invoke(action, args)
   if (!result) return false
   setData(result); onRefresh(); setMessage(t('已保存', 'Saved')); return true
  } catch (error) { onError(error); return false } finally { setBusy(false) }
 }
 async function save(event: FormEvent) {
  event.preventDefault()
  if (!draft || busy) return
  try {
   let value: Wire = { ...draft }
   if (kind === 'providers') value.models = draft.modelText.split('\n').map((line: string) => line.trim()).filter(Boolean).map((line: string) => { const [id, ...name] = line.split('|'); return { id: id.trim(), name: name.join('|').trim() || id.trim() } })
   else if (draft.type === 'local') { value.command = [draft.program, ...(draft.arguments || '').split('\n').filter((line: string) => line.trim())]; if (draft.secretText?.trim()) value.environment = JSON.parse(draft.secretText) }
   else if (draft.secretText?.trim()) value.headers = JSON.parse(draft.secretText)
   if (await act(kind === 'providers' ? 'provider.save' : 'mcp.save', value)) setDraft(null)
  } catch { onError(Error(t('环境变量或请求头需填写有效的 JSON 对象。', 'Environment variables or headers must be a valid JSON object.'))) }
 }
 function edit(item?: Wire) {
  setRemove(null)
  setDraft(kind === 'providers' ? { id: item?.id || '', name: item?.name || '', baseURL: item?.baseURL || '', key: '', hasKey: item?.hasKey, modelText: item?.models?.map((model: Wire) => model.id + (model.name !== model.id ? ' | ' + model.name : '')).join('\n') || '', editing: !!item } : { id: item?.id || '', type: item?.type || 'local', program: item?.command?.[0] || '', arguments: item?.command?.slice(1).join('\n') || '', cwd: item?.cwd || '', url: item?.url || '', enabled: item?.enabled ?? true, secretText: '', secretKeys: item?.type === 'remote' ? item?.headerKeys || [] : item?.environmentKeys || [], editing: !!item })
 }
 const list: Wire[] = data[kind === 'mcp' ? 'servers' : kind] || []
 const status = (value: string) => ({ connected: t('已连接', 'Connected'), pending: t('正在连接', 'Connecting'), failed: t('连接失败，请检查配置后重试', 'Connection failed. Check the configuration and retry.'), disabled: t('已停用', 'Disabled'), offline: t('引擎未启动', 'Engine offline'), needs_auth: t('需要身份验证', 'Authentication required') }[value] || value)
 return <div className={'extension-settings extension-' + kind}>
  {kind !== 'providers' && <><h1>{kind === 'skills' ? 'Skills' : 'MCP'}</h1><p className="settings-description">{kind === 'skills' ? t('内置常用工作流，也可导入自己的 Skills。启用后在对话中输入 / 选择。', 'Use built-in workflows or import your own skills. Type / in a conversation to choose enabled skills.') : t('连接本地工具或 HTTP 服务，让代理使用更多能力。', 'Connect local tools or HTTP services for your agent.')}</p></>}
  <div className="settings-toolbar">{kind === 'providers' ? <h2>{t('自定义供应商', 'Custom providers')}</h2> : <span className="muted">{list.length} {kind === 'skills' ? t('个 Skill', 'skills') : t('个自定义服务', 'custom servers')}</span>}<span className="save-feedback" role="status">{busy ? <><RefreshCw size={12} className="spin"/>{t('正在应用…', 'Applying…')}</> : message ? <><Check size={12}/>{message}</> : null}</span><div className="row-actions"><button className="icon" title={t('刷新扩展状态', 'Refresh extensions')} disabled={busy || loading} onClick={() => void refresh()}><RefreshCw size={14} className={loading ? 'spin' : ''}/></button><button className="button secondary compact" disabled={busy} onClick={() => kind === 'skills' ? void act('skill.import') : edit()}>{kind === 'skills' ? <FolderInput size={13}/> : <Plus size={13}/>} {kind === 'skills' ? t('导入文件夹', 'Import folder') : kind === 'mcp' ? t('添加 MCP', 'Add MCP') : t('添加供应商', 'Add provider')}</button></div></div>
  {kind === 'providers' && <p className="extension-note">{t('支持 OpenAI 兼容接口，包括本地模型服务。', 'Supports OpenAI-compatible APIs, including local model servers.')}</p>}
  {loadError ? <div className="empty-small">{t('未能读取扩展配置。', 'Unable to load extensions.')}<button className="text-button" onClick={() => void refresh()}>{t('重试', 'Retry')}</button></div> : loading ? <div className="empty-small">{t('正在读取…', 'Loading…')}</div> : !list.length ? <div className="extension-empty">{kind === 'skills' ? <BookOpen size={19}/> : <Plug size={19}/>}<p>{kind === 'skills' ? t('还没有导入 Skills。选择含 SKILL.md 的文件夹。', 'No imported skills. Choose a folder containing SKILL.md.') : kind === 'mcp' ? t('还没有自定义 MCP 服务。', 'No custom MCP servers yet.') : t('还没有自定义供应商。', 'No custom providers yet.')}</p></div> : <div className="extension-list"><MotionRows items={list}>{item => <div className="setting-row extension-row"><div className="extension-identity"><strong>{item.name || item.id}</strong><small>{kind === 'skills' ? item.description : kind === 'providers' ? item.baseURL : item.type === 'local' ? item.command?.join(' ') : item.url}</small><small className={'extension-status ' + (kind === 'mcp' ? item.status : item.enabled === false ? 'disabled' : 'connected')}>{kind === 'skills' && item.builtin && t('内置 · ', 'Built-in · ')}{kind === 'skills' ? item.enabled ? item.available ? t('已启用', 'Enabled') : t('已保存，等待引擎加载', 'Saved, awaiting engine') : t('已停用', 'Disabled') : kind === 'providers' ? item.models.length + t(' 个模型 · 保存后可在启用模型中选择', ' models · available under Enabled models') : status(item.status)}</small></div><div className="row-actions">{kind !== 'providers' && <Switch checked={item.enabled} disabled={busy} label={(kind === 'skills' ? t('启用 Skill ', 'Enable skill ') : t('启用 MCP ', 'Enable MCP ')) + (item.name || item.id)} onChange={() => void act(kind === 'skills' ? 'skill.toggle' : 'mcp.toggle', { id: item.id, enabled: !item.enabled })}/>}{kind !== 'skills' && <button className="icon" title={t('编辑 ', 'Edit ') + (item.name || item.id)} disabled={busy} onClick={() => edit(item)}><Pencil size={14}/></button>}{!item.builtin && <button className="icon danger" title={t('移除 ', 'Remove ') + (item.name || item.id)} disabled={busy} onClick={() => setRemove(item.id)}><Trash2 size={14}/></button>}</div></div>}</MotionRows></div>}
  {remove && <div className="inline-confirm"><p>{t('移除 ', 'Remove ')}<strong>{list.find(item => item.id === remove)?.name || remove}</strong>{kind === 'skills' ? t('？只删除导入副本，源文件夹保留。', '? Only the imported copy is deleted; the source folder is retained.') : t(' 及其本地连接配置？', ' and its local connection settings?')}</p><div className="row-actions"><button className="text-button" disabled={busy} onClick={() => setRemove(null)}>{t('取消', 'Cancel')}</button><button className="button danger compact" disabled={busy} onClick={async () => { if (await act(kind === 'providers' ? 'provider.delete' : kind === 'skills' ? 'skill.delete' : 'mcp.delete', { id: remove })) setRemove(null) }}>{t('确认移除', 'Remove')}</button></div></div>}
  {draft && <form className="extension-form" onSubmit={event => void save(event)}><h3>{draft.editing ? t('编辑配置', 'Edit configuration') : kind === 'providers' ? t('添加自定义供应商', 'Add a custom provider') : t('添加 MCP 服务', 'Add MCP server')}</h3>
   <label>{t('ID', 'ID')}<input autoFocus required disabled={draft.editing || busy} pattern="[a-z][a-z0-9_-]{0,63}" aria-label={kind === 'providers' ? t('供应商 ID', 'Provider ID') : t('MCP ID', 'MCP ID')} value={draft.id} placeholder={kind === 'providers' ? 'my-provider' : 'my-tools'} onChange={event => setDraft({ ...draft, id: event.target.value })}/></label>
   {kind === 'providers' ? <><label>{t('名称', 'Name')}<input required aria-label={t('供应商名称', 'Provider name')} value={draft.name} onChange={event => setDraft({ ...draft, name: event.target.value })}/></label><label>Base URL<input type="url" required aria-label="Base URL" value={draft.baseURL} placeholder="https://api.example.com/v1" onChange={event => setDraft({ ...draft, baseURL: event.target.value })}/></label><label>API Key<input type="password" autoComplete="new-password" aria-label={t('自定义供应商 API Key', 'Custom provider API key')} value={draft.key} placeholder={draft.hasKey ? t('已保存；留空保留', 'Saved; leave blank to keep') : t('本地无鉴权服务可留空', 'Optional for a local server without authentication')} onChange={event => setDraft({ ...draft, key: event.target.value })}/></label><label>{t('模型（每行：ID | 显示名称）', 'Models (one per line: ID | display name)')}<textarea required aria-label={t('自定义模型', 'Custom models')} rows={4} value={draft.modelText} placeholder="model-id | Model name" onChange={event => setDraft({ ...draft, modelText: event.target.value })}/></label><p className="extension-note">{t('密钥只保存在本机。保存后在“启用模型”中控制对话菜单。', 'Keys stay on this computer. Manage conversation menus under Enabled models after saving.')}</p></> : <><label>{t('连接方式', 'Transport')}<select aria-label={t('MCP 连接方式', 'MCP transport')} value={draft.type} disabled={busy} onChange={event => setDraft({ ...draft, type: event.target.value, secretText: '' })}><option value="local">{t('本地命令 · stdio', 'Local command · stdio')}</option><option value="remote">{t('HTTP · 请求头鉴权', 'HTTP · header authentication')}</option></select></label>{draft.type === 'local' ? <><label>{t('程序', 'Program')}<input required aria-label={t('MCP 程序', 'MCP program')} placeholder="npx" value={draft.program} onChange={event => setDraft({ ...draft, program: event.target.value })}/></label><label>{t('参数（每行一个）', 'Arguments (one per line)')}<textarea rows={3} aria-label={t('MCP 参数', 'MCP arguments')} value={draft.arguments} placeholder={'-y\n@modelcontextprotocol/server-example'} onChange={event => setDraft({ ...draft, arguments: event.target.value })}/></label><label>{t('工作目录（可选绝对路径）', 'Working directory (optional absolute path)')}<input aria-label={t('MCP 工作目录', 'MCP working directory')} value={draft.cwd} onChange={event => setDraft({ ...draft, cwd: event.target.value })}/></label></> : <label>{t('服务地址', 'Server URL')}<input required type="url" aria-label={t('MCP 服务地址', 'MCP server URL')} value={draft.url} placeholder="https://example.com/mcp" onChange={event => setDraft({ ...draft, url: event.target.value })}/></label>}<label>{draft.type === 'local' ? t('环境变量（JSON，可选）', 'Environment variables (JSON, optional)') : t('请求头（JSON，可选）', 'Headers (JSON, optional)')}<textarea aria-label={t('MCP 密钥配置', 'MCP secret configuration')} rows={3} spellCheck={false} value={draft.secretText} placeholder={draft.secretKeys?.length ? t('已保存 ', 'Saved ') + draft.secretKeys.join(', ') + t('；留空保留，{} 清空', '; leave blank to keep, {} to clear') : '{}'} onChange={event => setDraft({ ...draft, secretText: event.target.value })}/></label><div className="form-switch"><span>{t('启用服务', 'Enable server')}</span><Switch checked={draft.enabled} label={t('启用新 MCP', 'Enable new MCP')} disabled={busy} onChange={() => setDraft({ ...draft, enabled: !draft.enabled })}/></div></>}
   <div className="row-actions form-actions"><button type="button" className="text-button" disabled={busy} onClick={() => setDraft(null)}>{t('取消', 'Cancel')}</button><button type="submit" className="button primary" disabled={busy}>{busy && <RefreshCw size={13} className="spin"/>}{busy ? t('正在应用…', 'Applying…') : t('保存', 'Save')}</button></div>
  </form>}
  {kind === 'mcp' && <div className="extension-footnote"><Plug size={14}/><span>{t('内置浏览器与 Bot 工具始终保留', 'Built-in browser and bot tools are retained')} · {data.builtinServers?.[0] ? status(data.builtinServers[0].status) : t('等待引擎', 'Waiting for engine')}</span></div>}
  {kind === 'skills' && data.discoveredSkills?.length > 0 && <div className="discovered-skills"><h2>{t('引擎发现的 Skills', 'Skills discovered by the engine')}</h2><p className="extension-note">{t('这些来自引擎或项目配置；内置和导入的 Skills 在上方管理。', 'These come from the engine or project configuration. Manage built-in and imported skills above.')}</p>{data.discoveredSkills.map((skill: Wire) => <div className="setting-row" key={skill.id}><div><strong>{skill.name}</strong><small>{skill.description}</small></div></div>)}</div>}
 </div>
}
