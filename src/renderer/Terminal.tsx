import { useEffect,useRef } from 'react'
import { Terminal as XTerm } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'
import { bridge } from './bridge'
export function Terminal({root,onError}:{root:string;onError:(e:unknown)=>void}){
 const ref=useRef<HTMLDivElement>(null)
 useEffect(()=>{let id='';let disposed=false;const term=new XTerm({fontFamily:'monospace',fontSize:12.5,theme:{background:'#181a1f',foreground:'#d9dfe6',cursor:'#a7d77a'},cursorBlink:true,convertEol:true});const fit=new FitAddon();term.loadAddon(fit);term.open(ref.current!);fit.fit()
 const off=bridge.on('terminal',p=>{if(p.id===id)term.write(p.data)})
 const input=term.onData(data=>{if(id)void bridge.invoke('terminal.write',{id,data})})
 const observer=new ResizeObserver(()=>{fit.fit();if(id)void bridge.invoke('terminal.resize',{id,cols:term.cols,rows:term.rows})});observer.observe(ref.current!)
 bridge.invoke('terminal.open',{root}).then(value=>{id=value;if(disposed)void bridge.invoke('terminal.close',{id});else{fit.fit();void bridge.invoke('terminal.resize',{id,cols:term.cols,rows:term.rows});term.focus()}}).catch(onError)
 return()=>{disposed=true;off();observer.disconnect();input.dispose();term.dispose();if(id)void bridge.invoke('terminal.close',{id})}
 },[root])
 return <div className="terminal" ref={ref}/>
}

