import type { Bridge, AppState, Wire } from '../shared/types'
const previewState:AppState={version:1,language:'zh',sidebar:280,panel:420,fontSize:14,bots:[],projects:[],schedules:[],starred:[]}
export const bridge:Bridge=window.nxncode||{
 async invoke(action:string,args:Wire={}){
 if(action==='bootstrap')return {state:JSON.parse(localStorage.getItem('nxn-preview')||'null')||previewState,engine:{status:'stopped',version:'2.0.32',detail:'浏览器外观预览，请使用桌面版运行真实任务'},tabs:[]}
 if(action==='preferences'){Object.assign(previewState,args);localStorage.setItem('nxn-preview',JSON.stringify(previewState));return {...previewState}}
 if(action==='browser.bounds'||action==='browser.hidden')return true
 throw Error('当前为浏览器外观预览；请在 Electron 桌面版使用此功能。')
 },on:()=>()=>{}
}
export const desktop=!!window.nxncode

