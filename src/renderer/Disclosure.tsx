import { useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { ChevronRight } from 'lucide-react'

export function Disclosure({ title, children, className = '' }: { title: ReactNode; children: ReactNode; className?: string }) {
 const [open, setOpen] = useState(false)
 const id = useId(), body = useRef<HTMLDivElement>(null), content = useRef<HTMLDivElement>(null)
 const animation = useRef<Animation | null>(null)
 useLayoutEffect(() => {
  const el = body.current, inner = content.current
  if (!el || !inner) return
  const from = el.hidden ? 0 : el.getBoundingClientRect().height
  animation.current?.cancel(); el.hidden = false
  const finish = () => { el.style.height = open ? 'auto' : '0px'; el.style.opacity = open ? '1' : '0'; el.hidden = !open; animation.current = null }
  if ((!open && from === 0) || document.hidden || matchMedia('(prefers-reduced-motion: reduce)').matches) { finish(); return }
  el.style.height = from + 'px'
  const next = el.animate([{ height: from + 'px', opacity: from ? 1 : 0 }, { height: (open ? inner.scrollHeight : 0) + 'px', opacity: open ? 1 : 0 }], { duration: open ? 240 : 160, easing: 'cubic-bezier(.16,1,.3,1)', fill: 'both' })
  animation.current = next
  next.onfinish = () => { finish(); next.cancel() }
  return () => { next.onfinish = null }
 }, [open])
 useLayoutEffect(() => () => animation.current?.cancel(), [])
 return <section className={'disclosure ' + className} data-open={open}>
  <button className="disclosure-trigger" aria-expanded={open} aria-controls={id} onClick={() => setOpen(value => !value)}>{title}<ChevronRight className="disclosure-chevron" size={13}/></button>
  <div className="disclosure-body" id={id} ref={body} aria-hidden={!open} inert={!open} style={{ height: 0 }}><div ref={content} className="disclosure-content">{children}</div></div>
 </section>
}
