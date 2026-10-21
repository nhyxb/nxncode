import { useState } from 'react'
import { Search, Check, RefreshCw } from 'lucide-react'
import { modelKey, selectableModels } from '../shared/models'
import type { AppState, ModelRef, Wire } from '../shared/types'

export function Switch({ checked, disabled, label, onChange }: { checked: boolean; disabled?: boolean; label: string; onChange: () => void }) {
 return <button type="button" role="switch" className="toggle" aria-checked={checked} aria-label={label} disabled={disabled} onClick={onChange}><span/></button>
}
export function ModelSettings({ models, state, onPrefs, t }: { models: Wire[]; state: AppState; onPrefs: (v: Wire) => Promise<boolean>; t: (a: string, b: string) => string }) {
 const [query, setQuery] = useState(''), [provider, setProvider] = useState('all'), [limit, setLimit] = useState(60)
 const [busy, setBusy] = useState(false), [saved, setSaved] = useState(false)
 const active = selectableModels(models, state.enabledModels).map(model => modelKey(model as ModelRef))
 const configured = state.enabledModels ?? active
 const filtered = models.filter(model => (provider === 'all' || model.providerID === provider) && (model.name + ' ' + model.id + ' ' + model.providerID).toLowerCase().includes(query.toLowerCase()))
 async function save(enabledModels: string[] | undefined) {
  setBusy(true); setSaved(false)
  try { setSaved(await onPrefs({ enabledModels })) } finally { setBusy(false) }
 }
 return <>
  <h1>{t('启用模型', 'Enabled models')}</h1><p className="settings-description">{t('只把你要用的模型放进对话与 Bot 的选择菜单。', 'Show only the models you use in conversation and bot menus.')}</p>
  <div className="settings-toolbar"><span className="muted">{t('已启用 ', 'Enabled ')}{active.length} / {models.length}</span><span className="save-feedback" role="status">{busy ? <><RefreshCw size={12} className="spin"/>{t('保存中', 'Saving')}</> : saved ? <><Check size={12}/>{t('已保存', 'Saved')}</> : null}</span><div className="row-actions"><button className="text-button" disabled={busy || !models.length} onClick={() => void save([...new Set([...configured, ...models.filter(m => m.enabled !== false).map(m => modelKey(m as ModelRef))])])}>{t('全部启用', 'Enable all')}</button><button className="text-button" disabled={busy} onClick={() => void save([])}>{t('全部停用', 'Disable all')}</button></div></div>
  <div className="model-settings-filters"><div className="account-search"><Search size={15}/><input aria-label={t('搜索可启用模型', 'Search available models')} placeholder={t('搜索名称、模型 ID 或供应商', 'Search name, model ID or provider')} value={query} onChange={e => { setQuery(e.target.value); setLimit(60) }}/></div><select aria-label={t('筛选供应商', 'Filter providers')} value={provider} onChange={e => { setProvider(e.target.value); setLimit(60) }}><option value="all">{t('全部供应商', 'All providers')}</option>{[...new Set(models.map(m => String(m.providerID)))].map(id => <option key={id}>{id}</option>)}</select></div>
  {!models.length ? <div className="empty-small">{t('引擎就绪后会显示模型。请先在账号与供应商中连接账号。', 'Models appear when the engine is ready. Connect an account under Accounts & providers.')}</div> : <div className="model-settings-list">{filtered.slice(0, limit).map(model => {
   const key = modelKey(model as ModelRef), enabled = configured.includes(key)
   return <div className="setting-row model-setting-row" key={key}><div><strong>{model.name || model.id}</strong><small>{model.providerID} · {model.id}{model.enabled === false ? ' · ' + t('需先连接账号', 'Connect an account first') : ''}</small></div><Switch checked={enabled} disabled={busy || (!enabled && model.enabled === false)} label={t('启用 ', 'Enable ') + (model.name || model.id)} onChange={() => void save(enabled ? configured.filter(id => id !== key) : [...configured, key])}/></div>
  })}{!filtered.length && <div className="empty-small">{t('没有匹配的模型', 'No matching models')}</div>}</div>}
  {filtered.length > limit && <button className="button secondary" onClick={() => setLimit(value => value + 60)}>{t('显示更多', 'Show more')} ({filtered.length - limit})</button>}
 </>
}
