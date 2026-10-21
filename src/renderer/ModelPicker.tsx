import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { flushSync } from 'react-dom'
import { Search, Star, Check, ChevronRight, X, Box, RotateCcw, SlidersHorizontal } from 'lucide-react'
import { defaultVariant, modelKey } from '../shared/models'
import type { ModelRef, Wire } from '../shared/types'
import { bridge } from './bridge'
const flowParticles = Array.from({length: 60}, (_, index) => {
 const duration = 1.3 + index % 6 * .15
 return {
  '--particle-y': 3 + index * 11 % 24 + 'px',
  '--particle-duration': duration + 's',
  '--particle-delay': -(index * .6180339887 % 1 * duration) + 's',
  '--particle-size': 1.4 + index % 7 * .28 + 'px',
  '--particle-drift': (index % 2 ? 1 : -1) * (1.5 + index % 4 * .5) + 'px',
  '--particle-opacity': .42 + index % 4 * .14
 } as CSSProperties
})

export function ModelPicker({ models, selected, starred, onChoose, onStar, onClose, onManage, initialView = 'models', busy = false, active = true, burstStage = '', onBurst, t }: {
 models: Wire[]; selected?: ModelRef; starred: string[]; onChoose: (model: ModelRef, keepOpen?: boolean) => Promise<boolean>; onStar: (key: string) => void; onClose: () => void; onManage: () => void; initialView?: 'models' | 'effort'; busy?: boolean; active?: boolean; burstStage?: string; onBurst?: () => void; t: (a: string, b: string) => string
}) {
 const current = models.find(model => model.id === selected?.id && model.providerID === selected?.providerID)
 const [query, setQuery] = useState(''), [provider, setProvider] = useState('all')
 const [effort, setEffort] = useState<Wire | null>(initialView === 'effort' && current?.variants?.length > 1 ? current || null : null)
 const [effortIndex, setEffortIndex] = useState(() => Math.max(0, current?.variants?.findIndex((variant: Wire) => variant.id === defaultVariant(current, selected?.variant)) || 0))
 const [dragging, setDragging] = useState(false)
 const [reduced, setReduced] = useState(() => matchMedia('(prefers-reduced-motion: reduce)').matches)
 const [motionAllowed, setMotionAllowed] = useState(() => !reduced && document.visibilityState === 'visible')
 const [nativeVisible, setNativeVisible] = useState(true)
 const [burstGen, setBurstGen] = useState(0)
 const consumedBurst = useRef('')
 const atMax = !!effort && Math.round(effortIndex) === effort.variants.length - 1
 const confirmedMax = !!effort && selected?.id === effort.id && selected?.providerID === effort.providerID && defaultVariant(effort, selected?.variant) === effort.variants.at(-1)?.id
 const flowing = atMax && confirmedMax && motionAllowed && nativeVisible && active
 useEffect(() => {
  const preference = matchMedia('(prefers-reduced-motion: reduce)')
  const update = () => flushSync(() => { setReduced(preference.matches); setMotionAllowed(!preference.matches && document.visibilityState === 'visible') })
  const offVisibility = bridge.on('window-visibility', value => flushSync(() => setNativeVisible(!!value.visible)))
  preference.addEventListener('change', update); document.addEventListener('visibilitychange', update)
  return () => { preference.removeEventListener('change', update); document.removeEventListener('visibilitychange', update); offVisibility() }
 }, [])
 // The opening departure belongs to the confirmed jump into the highest effort, not to this mount.
 useEffect(() => {
  if (!burstStage || !effort || !confirmedMax) return
  const stage = modelKey({ id: effort.id, providerID: effort.providerID }) + ':' + effort.variants.at(-1)?.id
  if (!burstStage.startsWith(stage + '#') || consumedBurst.current === burstStage) return
  consumedBurst.current = burstStage; onBurst?.()
  if (!reduced) setBurstGen(generation => generation + 1)
 }, [burstStage, effort, confirmedMax, reduced])
 // Reducing motion after the departure started drops it for good instead of replaying it later.
 useEffect(() => { if (reduced) setBurstGen(0) }, [reduced])
 // Leaving the highest effort brings the static dots back and cancels a running departure.
 useEffect(() => { if (!confirmedMax) setBurstGen(0) }, [confirmedMax])
 const pointer = useRef<{id: number; x: number; y: number; dragging: boolean} | null>(null)
 function pointerPosition(input: HTMLInputElement, x: number) {
  const bounds = input.getBoundingClientRect()
  return Math.max(0, Math.min(1, (x - bounds.left - 16) / Math.max(1, bounds.width - 32))) * ((effort?.variants.length || 1) - 1)
 }
 function cancelPointer() {
  pointer.current = null; setDragging(false)
  if (effort) setEffortIndex(Math.max(0, effort.variants.findIndex((variant: Wire) => variant.id === defaultVariant(effort, selected?.variant))))
 }
 useEffect(() => { if (effort && !busy && !dragging) setEffortIndex(Math.max(0, effort.variants.findIndex((variant: Wire) => variant.id === defaultVariant(effort, selected?.variant)))) }, [busy, selected?.variant, effort, dragging])
 function commitEffort(index: number) {
  if (busy) return
  index = Math.round(index); setEffortIndex(index)
  if (effort) void onChoose({ id: effort.id, providerID: effort.providerID, variant: effort.variants[index].id }, true)
 }
 const providers = [...new Set(models.map(model => String(model.providerID)))]
 const filtered = models.filter(model => (model.name + ' ' + model.id + ' ' + model.providerID).toLowerCase().includes(query.toLowerCase()) && (provider === 'all' || provider === 'star' ? provider !== 'star' || starred.includes(model.providerID + '/' + model.id) : model.providerID === provider))
 if (effort) {
  const tickGroup = <span className="effort-tick-group">{effort.variants.map((variant: Wire, index: number) => <i className={index <= Math.round(effortIndex) ? 'is-filled' : ''} style={{'--tick-position': index / (effort.variants.length - 1), '--particle-duration': 1.45 + index * .2 + 's', '--particle-drift': (index % 2 ? 2.5 : -2.5) + 'px'} as CSSProperties} key={variant.id}/>)}</span>
  const ticks = <div className="effort-ticks" aria-hidden="true">{tickGroup}</div>
  const departure = burstGen > 0 && <div className="effort-ticks is-flowing" key={burstGen} aria-hidden="true">{tickGroup}</div>
  const label = String(effort.variants[Math.round(effortIndex)]?.id || ''), displayLabel = label.charAt(0).toUpperCase() + label.slice(1)
  return <div className={'popover model-effort ' + (atMax ? 'effort-is-max' : '')} role="dialog" aria-label={t('思考强度', 'Reasoning effort')} aria-busy={busy}>
   <div className="effort-heading"><span className="model-brand"><Box size={22}/></span><button className="effort-model" title={t('返回模型列表', 'Back to models')} onClick={() => setEffort(null)}><strong key={displayLabel}>{displayLabel}</strong><span><span>{effort.name}</span><ChevronRight size={13}/></span></button><button className="icon" disabled={busy} title={t('重置强度', 'Reset effort')} onClick={() => { const index = Math.max(0, effort.variants.findIndex((variant: Wire) => variant.id === 'low')); setEffortIndex(index); commitEffort(index) }}><RotateCcw size={16}/></button><button className="icon" title={t('关闭', 'Close')} onClick={onClose}><X size={14}/></button></div>
   <div className={'effort-slider ' + (dragging ? 'is-dragging' : '')} style={{'--effort-progress': effortIndex / (effort.variants.length - 1)} as CSSProperties}><div className="effort-fill" aria-hidden="true">{flowing && <span className="effort-particles">{flowParticles.map((style, index) => <i key={index} style={style}/>)}</span>}{departure}</div>{!flowing && burstGen === 0 && (!confirmedMax || reduced) && ticks}<div className="effort-thumb-rail" aria-hidden="true"><i className="effort-thumb"/></div><input aria-label={t('思考强度', 'Reasoning effort')} aria-valuetext={displayLabel} type="range" autoFocus aria-disabled={busy} min="0" max={effort.variants.length - 1} step="0.001" value={effortIndex} onChange={event => { if (!busy) setEffortIndex(Number(event.target.value)) }} onPointerDown={event => {
    event.preventDefault()
    if (busy || !event.isPrimary || event.button !== 0) return
    event.currentTarget.focus(); event.currentTarget.setPointerCapture(event.pointerId)
    pointer.current = {id: event.pointerId, x: event.clientX, y: event.clientY, dragging: false}
    setEffortIndex(Math.round(pointerPosition(event.currentTarget, event.clientX)))
   }} onPointerMove={event => {
    const start = pointer.current
    if (!start || start.id !== event.pointerId || busy) return
    if (!start.dragging && Math.hypot(event.clientX - start.x, event.clientY - start.y) > 4) { start.dragging = true; setDragging(true) }
    if (start.dragging) setEffortIndex(pointerPosition(event.currentTarget, event.clientX))
   }} onPointerUp={event => {
    if (pointer.current?.id !== event.pointerId) return
    pointer.current = null; setDragging(false); commitEffort(pointerPosition(event.currentTarget, event.clientX))
   }} onPointerCancel={cancelPointer} onLostPointerCapture={() => { if (pointer.current) cancelPointer() }} onKeyDown={event => { if (busy) { event.preventDefault(); return } const offset = ['ArrowLeft', 'ArrowDown'].includes(event.key) ? -1 : ['ArrowRight', 'ArrowUp'].includes(event.key) ? 1 : 0; if (offset || ['Home', 'End'].includes(event.key)) { event.preventDefault(); commitEffort(event.key === 'Home' ? 0 : event.key === 'End' ? effort.variants.length - 1 : Math.max(0, Math.min(effort.variants.length - 1, Math.round(effortIndex) + offset))) } }}/></div>
  </div>
 }
 return <div className="popover model-picker" role="dialog" aria-label={t('选择模型', 'Select model')} aria-busy={busy}>
  <div className="model-rail"><button className={provider === 'all' ? 'selected' : ''} title={t('全部模型', 'All models')} onClick={() => setProvider('all')}><Box size={17}/></button><button className={provider === 'star' ? 'selected' : ''} title={t('收藏', 'Starred')} onClick={() => setProvider('star')}><Star size={17}/></button><div className="rail-line"/>{providers.slice(0, 8).map(id => <button key={id} title={id} className={provider === id ? 'selected' : ''} onClick={() => setProvider(id)}><span className="provider-letter">{id.slice(0, 1).toUpperCase()}</span></button>)}</div>
  <div className="model-main"><div className="model-search"><Search size={15}/><input autoFocus placeholder={t('搜索模型…', 'Search models…')} value={query} onChange={event => setQuery(event.target.value)}/><button className="icon" title={t('关闭', 'Close')} onClick={onClose}><X size={14}/></button></div><div className="model-list">{filtered.length ? filtered.map(model => <div className="model-row" key={model.providerID + '/' + model.id}><button className="model-pick" disabled={busy} onClick={() => void onChoose({ id: model.id, providerID: model.providerID, variant: defaultVariant(model, selected?.id === model.id && selected?.providerID === model.providerID ? selected?.variant : undefined) })}><span className="model-brand">{String(model.providerID).slice(0, 1).toUpperCase()}</span><span><strong>{model.name || model.id}</strong><small>{model.providerID}{model.cost?.length && model.cost.every((cost: Wire) => cost.input === 0 && cost.output === 0) ? ' · ' + t('免费', 'Free') : ''}</small></span>{selected?.id === model.id && selected?.providerID === model.providerID && <Check size={14}/>}</button><button className={'icon favorite ' + (starred.includes(model.providerID + '/' + model.id) ? 'is-starred' : '')} title={t('收藏模型', 'Star model')} onClick={() => onStar(model.providerID + '/' + model.id)}><Star size={13}/></button></div>) : <div className="empty-small">{models.length ? t('没有匹配的模型。', 'No matching models.') : t('没有已启用的可用模型。', 'No enabled models available.')}</div>}</div><button className="model-manage" onClick={onManage}><SlidersHorizontal size={13}/>{t('管理启用模型', 'Manage enabled models')}</button></div>
 </div>
}
