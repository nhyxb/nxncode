import { useEffect,useId,useRef } from 'react'
import type { Look } from '../shared/types'
import { botPose,observeMotion } from './bot-motion'
// Geometry and palette adapted from Kuvo BotAvatar.swift; see THIRD_PARTY_NOTICES.md.
export const defaultLook:Look={color:'lime',shape:'squircle',face:'calm'}
export const colors:Record<string,string>={mint:'#5ec7b8',sky:'#4f9cf5',indigo:'#5c5cf0',violet:'#8a5cf5',pink:'#ed70b5',coral:'#f2735c',orange:'#f5993d',amber:'#f2c24f',lime:'#8ccc4f',graphite:'#6e7380'}
export const shapes=['round','squircle','pebble','gem','bloom']
export const faces=['calm','happy','sleepy','wink','curious','bright']
export function Avatar({look,size=28,mood='idle'}:{look:Look;size?:number;mood?:string}){
 const id=useId().replaceAll(':','');const c=colors[look.color]||colors.lime;const deep=['indigo','violet','graphite'].includes(look.color);const eye=deep?'#fff':'#26332b'
 const element=useRef<HTMLSpanElement>(null);const noticed=useRef(false)
 const restingFace=mood==='sleeping'?'sleepy':mood==='waiting'?'bright':mood==='news'?'happy':look.face
 useEffect(()=>{
  const root=element.current!;const figure=root.querySelector('svg')!;const body=root.querySelector<SVGGElement>('.bot-body')!;const eyes=root.querySelector<SVGGElement>('.bot-eyes')!;const expressions=[...root.querySelectorAll<SVGGElement>('[data-face]')];const sparks=[...root.querySelectorAll<HTMLElement>('.avatar-spark')];const zs=[...root.querySelectorAll<HTMLElement>('.sleep-z')];const ring=root.querySelector<HTMLElement>('.avatar-ring')
  let stop:(()=>void)|undefined;let face=restingFace
  const seed=[...id+look.color+look.shape].reduce((n,v)=>n+v.charCodeAt(0),0)/31
  function reset(){figure.style.transform='';body.style.transform='';eyes.style.transform='';face=restingFace;for(const group of expressions)group.style.display=group.dataset.face===face?'':'none'}
  const reduced=matchMedia('(prefers-reduced-motion: reduce)')
  function draw(time:number){
   const t=time+seed*.37;const pose=botPose(mood,t,seed,noticed.current,size<40)
   figure.style.transform=`translateY(${pose.lift*size}px) rotate(${pose.tilt}deg) scale(${pose.x},${pose.y})`
   body.style.transform=['bloom','gem'].includes(look.shape)?`rotate(${pose.spin}deg)`:''
   eyes.style.transform=`translateX(${pose.glance*18}px) scaleY(${1-.88*pose.blink})`
   const next=pose.face||restingFace;if(next!==face){face=next;for(const group of expressions)group.style.display=group.dataset.face===face?'':'none'}
   sparks.forEach((spark,index)=>{const a=t*2*Math.PI/1.3+index*Math.PI;spark.style.transform=`translate(${Math.cos(a)*size*.6}px,${Math.sin(a)*size*.55}px)`})
   zs.forEach((z,index)=>{const p=(t/4.2+index/3)%1;z.style.transform=`translate(${p*size*.28}px,${-p*size*.65}px) scale(${.65+p*.4})`;z.style.opacity=String(Math.sin(p*Math.PI)*.7)})
   if(ring){const p=t%1.6/1.6;ring.style.transform=`scale(${1+p*.5})`;ring.style.opacity=String((1-p)*.4)}
  }
  let visible=false
  function sync(){stop?.();stop=undefined;reset();if(visible&&!reduced.matches){stop=observeMotion(draw);root.classList.add('motion-active')}else root.classList.remove('motion-active')}
  const observer=new IntersectionObserver(entries=>{visible=entries[0].isIntersecting;sync()});observer.observe(root);reduced.addEventListener('change',sync)
  return()=>{observer.disconnect();reduced.removeEventListener('change',sync);stop?.()}
 },[id,look.color,look.shape,look.face,mood,size,restingFace])
 const bloom=Array.from({length:97},(_,i)=>{const a=i/96*Math.PI*2;const r=50*(.455+.035*Math.cos(8*a));return (i?'L':'M')+(25+Math.cos(a-Math.PI/2)*r).toFixed(3)+','+(25+Math.sin(a-Math.PI/2)*r).toFixed(3)}).join(' ')+'Z'
 const body=look.shape==='round'?<circle cx="25" cy="25" r="23"/>:look.shape==='gem'?<path d="M21 3 Q25 0 29 3 L47 21 Q50 25 47 29 L29 47 Q25 50 21 47 L3 29 Q0 25 3 21Z"/>:look.shape==='pebble'?<path d="M22 4Q25-1 29 6L47 38Q51 46 41 47L9 47Q0 48 5 36Z"/>:look.shape==='bloom'?<path d={bloom}/>:<rect x="2" y="2" width="46" height="46" rx="15"/>
 return <span ref={element} className={'avatar '+mood} style={{width:size,height:size}} onPointerEnter={()=>{noticed.current=true}} onPointerLeave={()=>{noticed.current=false}}>{mood==='waiting'&&<i className="avatar-ring"/>}<svg width={size} height={size} viewBox="0 0 50 50" aria-hidden="true"><defs><linearGradient id={id} x1="0" y1="0" x2=".3" y2="1"><stop offset="0" stopColor={c}/><stop offset="1" stopColor={c} stopOpacity=".88"/></linearGradient></defs><g className="bot-body" fill={'url(#'+id+')'}>{body}</g><g className="bot-eyes" fill={eye} opacity=".9">{faces.map(face=><g key={face} data-face={face} style={{display:face===restingFace?'':'none'}}>{face==='sleepy'?<><rect x="17" y="24" width="6" height="2" rx="1"/><rect x="29" y="24" width="6" height="2" rx="1"/></>:face==='happy'?<><path d="M17 27Q20 19 23 27" fill="none" stroke={eye} strokeWidth="2.5" strokeLinecap="round"/><path d="M29 27Q32 19 35 27" fill="none" stroke={eye} strokeWidth="2.5" strokeLinecap="round"/></>:<><rect x="18" y={face==='curious'?20:21} width="4" height={face==='bright'?11:9} rx="2"/>{face==='wink'?<rect x="29" y="25" width="6" height="2" rx="1"/>:<rect x="30" y="21" width="4" height={face==='curious'?7:9} rx="2"/>}</>}</g>)}</g></svg>{mood==='sleeping'&&[0,1,2].map(index=><span key={index} className="sleep-z">z</span>)}{mood==='working'&&[0,1].map(index=><i key={index} className="avatar-spark"/>)}</span>
}

