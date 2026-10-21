import { useEffect, useRef, useState } from 'react'
import { BookOpen, FileText, Bot as BotIcon, FolderOpen, SlidersHorizontal, X } from 'lucide-react'
import { composerToken } from '../shared/composer'
import type { Bot, Wire } from '../shared/types'
import { bridge } from './bridge'
import { usePresence } from './motion'

type Item = { kind: 'skill' | 'file' | 'bot'; id: string; name: string; detail: string; data: Wire }
export function ComposerInput({ value, onChange, onSend, skills, chosenSkills, onSkills, bots, chosenBots, onBots, directory, onAttach, onOpenProject, onManage, onMenuChange, onError, placeholder, t }: {
 value: string; onChange: (value: string) => void; onSend: () => void; skills: Wire[]; chosenSkills: Wire[]; onSkills: (skills: Wire[]) => void; bots: Bot[]; chosenBots: string[]; onBots: (ids: string[]) => void; directory: string; onAttach: (path: string) => void; onOpenProject: () => void; onManage: () => void; onMenuChange: (open: boolean) => void; onError: (error: unknown) => void; placeholder: string; t: (zh: string, en: string) => string
}) {
 const input = useRef<HTMLTextAreaElement>(null), list = useRef<HTMLDivElement>(null)
 const [caret, setCaret] = useState(value.length), [focused, setFocused] = useState(false), [composing, setComposing] = useState(false), [dismissed, setDismissed] = useState(false)
 const [files, setFiles] = useState<Wire[]>([]), [loading, setLoading] = useState(false), [searchError, setSearchError] = useState(''), [index, setIndex] = useState(0), [pending, setPending] = useState(false)
 const token = focused && !composing && !dismissed ? composerToken(value, caret) : null
 const kind = token?.kind, query = token?.query.toLocaleLowerCase() || '', open = !!token
 const present = usePresence(open), latest = useRef({ value, token }); latest.current = { value, token }
 useEffect(() => { onMenuChange(open); return () => onMenuChange(false) }, [open, onMenuChange])
 useEffect(() => {
  setFiles([]); setSearchError('')
  if (kind !== '@' || !directory) { setLoading(false); return }
  let active = true; setLoading(true)
  const timer = setTimeout(() => { void bridge.invoke('files.search', { root: directory, query }).then(result => { if (active) setFiles(result || []) }).catch(error => { if (active) setSearchError(String(error.message || error)) }).finally(() => { if (active) setLoading(false) }) }, 120)
  return () => { active = false; clearTimeout(timer) }
 }, [kind, query, directory])
 const items: Item[] = kind === '/' ? skills.filter(skill => !chosenSkills.some(chosen => chosen.id === skill.id) && `${skill.name} ${skill.id} ${skill.description}`.toLocaleLowerCase().includes(query)).map(skill => ({ kind: 'skill', id: skill.id, name: skill.name, detail: skill.description, data: skill })) : [
  ...bots.filter(bot => !chosenBots.includes(bot.id) && `${bot.name} ${bot.job}`.toLocaleLowerCase().includes(query)).map(bot => ({ kind: 'bot' as const, id: bot.id, name: bot.name, detail: bot.job, data: bot })),
  ...files.filter(file => file.path.toLocaleLowerCase().includes(query)).map(file => ({ kind: 'file' as const, id: file.path, name: file.path.split('/').pop(), detail: file.path, data: file }))
 ].slice(0, 50)
 const activeIndex = Math.min(index, Math.max(0, items.length - 1))
 const menuCache = useRef<{ kind: '/' | '@'; items: Item[]; index: number } | null>(null)
 if (token) menuCache.current = { kind: token.kind, items, index: activeIndex }
 const menu = menuCache.current
 useEffect(() => { setIndex(0) }, [kind, query])
 useEffect(() => { list.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' }) }, [activeIndex, files])
 async function choose(item: Item) {
  if (!token || pending) return
  const snapshot = { value, token }; setPending(true)
  try {
   if (item.kind === 'file') { const path = await bridge.invoke('files.attach', { root: directory, path: item.id }); onAttach(path) }
   else if (item.kind === 'skill') onSkills([...chosenSkills, item.data])
   else onBots([...chosenBots, item.id])
   if (latest.current.value === snapshot.value && latest.current.token?.start === snapshot.token.start) {
    onChange(value.slice(0, token.start) + value.slice(token.end)); setCaret(token.start); setDismissed(true)
    requestAnimationFrame(() => { input.current?.focus(); input.current?.setSelectionRange(token.start, token.start) })
   }
  } catch (error) { onError(error) } finally { setPending(false) }
 }
 const chips = chosenSkills.length > 0 || chosenBots.length > 0
 return <div className="composer-input" onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false) }}>
  {chips && <div className="attachment-row skill-attachments">{chosenSkills.map(skill => <span key={'skill:' + skill.id}><BookOpen size={12}/>{skill.name}<button className="icon" title={t('移除 Skill', 'Remove skill')} onClick={() => onSkills(chosenSkills.filter(item => item.id !== skill.id))}><X size={11}/></button></span>)}{chosenBots.map(id => { const bot = bots.find(bot => bot.id === id); return <span key={'bot:' + id}><BotIcon size={12}/>{bot?.name || id}<button className="icon" title={t('移除 Bot 引用', 'Remove bot reference')} onClick={() => onBots(chosenBots.filter(item => item !== id))}><X size={11}/></button></span> })}</div>}
  <textarea ref={input} aria-label={t('消息', 'Message')} aria-autocomplete="list" aria-expanded={open} aria-controls={open ? 'composer-options' : undefined} aria-activedescendant={open && items.length ? 'composer-option-' + activeIndex : undefined} placeholder={placeholder} value={value} onChange={event => { onChange(event.target.value); setCaret(event.target.selectionStart); setDismissed(false) }} onSelect={event => setCaret(event.currentTarget.selectionStart)} onFocus={() => setFocused(true)} onCompositionStart={() => setComposing(true)} onCompositionEnd={event => { setComposing(false); setCaret(event.currentTarget.selectionStart) }} onKeyDown={event => {
   if (event.nativeEvent.isComposing || composing || event.keyCode === 229) return
   if (open && event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); setDismissed(true); return }
   if (open && ['ArrowDown', 'ArrowUp'].includes(event.key)) { event.preventDefault(); setIndex(old => (old + (event.key === 'ArrowDown' ? 1 : -1) + Math.max(1, items.length)) % Math.max(1, items.length)); return }
   if (open && !event.shiftKey && ['Enter', 'Tab'].includes(event.key)) { if (items.length) { event.preventDefault(); void choose(items[activeIndex]) } else if (event.key === 'Enter') event.preventDefault(); return }
   if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); onSend() }
  }}/>
  {present && menu && <div className={'popover composer-menu ' + (!open ? 'is-exiting' : '')} aria-label={menu.kind === '/' ? 'Skills' : t('引用', 'References')}>
   <div className="composer-menu-heading"><strong>{menu.kind === '/' ? t('/ 选择 Skill', '/ Choose a skill') : t('@ 引用文件或 Bot', '@ Reference a file or bot')}</strong><span>↑ ↓ <kbd>Tab</kbd></span></div>
   <div id="composer-options" ref={list} className="composer-menu-list" role="listbox" aria-label={t('输入建议', 'Suggestions')} aria-busy={pending || loading}>{menu.items.map((item, i) => <button key={item.kind + ':' + item.id} id={'composer-option-' + i} role="option" aria-selected={i === menu.index} disabled={pending} onPointerDown={event => event.preventDefault()} onMouseMove={() => setIndex(i)} onClick={() => void choose(item)}>{item.kind === 'skill' ? <BookOpen size={15}/> : item.kind === 'bot' ? <BotIcon size={15}/> : <FileText size={15}/>}<span><strong>{item.name}</strong><small>{item.detail}</small></span><em>{item.kind === 'bot' ? 'Bot' : item.kind === 'file' ? t('文件', 'File') : 'Skill'}</em></button>)}{!menu.items.length && <p className="empty-small">{loading ? t('正在搜索文件…', 'Searching files…') : searchError || (menu.kind === '/' ? t('没有匹配的 Skill', 'No matching skills') : t('没有匹配的引用', 'No matching references'))}</p>}</div>
   {menu.kind === '/' ? <button className="model-manage" onClick={() => { setDismissed(true); onManage() }}><SlidersHorizontal size={13}/>{t('管理 Skills', 'Manage skills')}</button> : !directory ? <button className="model-manage" onClick={onOpenProject}><FolderOpen size={13}/>{t('打开项目以引用文件', 'Open a project to reference files')}</button> : <div className="composer-menu-footnote">{t('文件随消息发送 · Bot 引用包含名称与职责', 'Files are attached · Bot references include name and role')}</div>}
  </div>}
 </div>
}
