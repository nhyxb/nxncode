import {useEffect,useLayoutEffect,useRef,useState} from 'react'
export function usePresence(open:boolean,ms=110){
 const [present,setPresent]=useState(open)
 useEffect(()=>{if(open){setPresent(true);return}const timer=setTimeout(()=>setPresent(false),matchMedia('(prefers-reduced-motion: reduce)').matches?0:ms);return()=>clearTimeout(timer)},[open,ms])
 return open||present
}
export function useSurfaceMotion(key:string,selector:string){
 const previous=useRef('')
 useLayoutEffect(()=>{
  if(previous.current===key)return;previous.current=key
  const el=document.querySelector<HTMLElement>(selector)
  if(!el||matchMedia('(prefers-reduced-motion: reduce)').matches)return
  const animation=el.animate([{opacity:.55,transform:'translateY(5px)'},{opacity:1,transform:'translateY(0)'}],{duration:180,easing:'cubic-bezier(.16,1,.3,1)'})
  const children=selector==='.settings-content'?[...el.children].slice(0,6).map((child,index)=>child.animate([{opacity:.65,transform:'translateY(4px)'},{opacity:1,transform:'translateY(0)'}],{duration:220,delay:Math.min(index*28,112),easing:'cubic-bezier(.16,1,.3,1)',fill:'backwards'})):[]
  return()=>{animation.cancel();children.forEach(child=>child.cancel())}
 },[key,selector])
}
