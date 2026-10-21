import { contextBridge, ipcRenderer } from 'electron'
contextBridge.exposeInMainWorld('nxncode',{
 invoke:(action:string,args?:unknown)=>ipcRenderer.invoke('nxn:invoke',action,args),
 on:(event:string,listener:(value:unknown)=>void)=>{const handler=(_e:unknown,data:{event:string;value:unknown})=>{if(data.event===event)listener(data.value)};ipcRenderer.on('nxn:event',handler);return()=>ipcRenderer.removeListener('nxn:event',handler)}
})

