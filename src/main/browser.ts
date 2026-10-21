import { BrowserWindow, WebContentsView, session, type Session } from 'electron'
import { randomUUID, createHash } from 'node:crypto'
import path from 'node:path'
import { promises as fs } from 'node:fs'
import type { BrowserTab, Wire } from '../shared/types'
import { Store } from './store'
import { within } from './workspace'
type Entry={view:WebContentsView;tab:BrowserTab;attached:boolean;snapshot?:string}
export class BrowserService {
 tabs=new Map<string,Entry>();active?:string;private bounds={x:0,y:0,width:0,height:0};hidden=false;private frozen=false;private partitions=new Set<Session>()
 constructor(private window:()=>BrowserWindow|undefined,private store:Store,private emit:(event:string,data:unknown)=>void){}
 list(){return [...this.tabs.values()].map(t=>({...t.tab,active:t.tab.id===this.active}))}
 private changed(){this.emit('browser',this.list())}
 async create(sessionID:string,url='about:blank'){
 const win=this.window();if(!win)throw Error('窗口尚未就绪')
 const id='tab_'+randomUUID();const folder=path.join(this.store.root,'artifacts',sessionID.replace(/[^\w-]/g,'_'));await fs.mkdir(folder,{recursive:true,mode:0o700});const part=session.fromPartition('persist:nxn-'+createHash('sha256').update(sessionID).digest('hex').slice(0,20))
 if(!this.partitions.has(part)){this.partitions.add(part);part.setPermissionRequestHandler((_wc,_permission,callback)=>callback(false));part.setPermissionCheckHandler(()=>false);part.on('will-download',(_e,item)=>{const dest=path.join(folder,randomUUID().slice(0,8)+'-'+path.basename(item.getFilename()));item.setSavePath(dest);item.on('done',(_event,state)=>{this.emit('download',{sessionID,path:dest,name:item.getFilename(),state})})})}
 const view=new WebContentsView({webPreferences:{session:part,nodeIntegration:false,contextIsolation:true,sandbox:true}})
 const entry:Entry={view,tab:{id,sessionID,title:'新标签页',url,loading:false,takeover:false},attached:false};this.tabs.set(id,entry);win.contentView.addChildView(view)
 view.setBorderRadius(0);view.setVisible(false);view.webContents.setWindowOpenHandler(({url})=>{void this.create(sessionID,url).catch(()=>{});return {action:'deny'}})
 view.webContents.on('did-start-loading',()=>{entry.tab.loading=true;this.changed()})
 view.webContents.on('did-stop-loading',()=>{entry.tab.loading=false;entry.tab.url=view.webContents.getURL();this.changed()})
 view.webContents.on('page-title-updated',(_e,title)=>{entry.tab.title=title;this.changed()})
 view.webContents.on('did-navigate',()=>{entry.snapshot=undefined})
 view.webContents.on('render-process-gone',()=>{entry.tab.loading=false;this.emit('notice','浏览器页面已停止，可刷新重试')})
 view.webContents.debugger.on('detach',()=>{entry.attached=false})
 await this.navigate(id,url);this.select(id);return entry.tab
 }
 get(id?:string){const entry=this.tabs.get(id||this.active||'');if(!entry)throw Error('没有打开的网页');return entry}
 select(id:string){this.get(id);this.active=id;this.layout(this.bounds);this.changed()}
 layout(bounds:Wire){for(const key of ['x','y','width','height'])if(!Number.isFinite(bounds[key]))throw Error('Invalid bounds');this.bounds={x:Math.round(bounds.x),y:Math.round(bounds.y),width:Math.max(0,Math.round(bounds.width)),height:Math.max(0,Math.round(bounds.height))};for(const [id,e]of this.tabs){e.view.setBounds(this.bounds);e.view.setVisible(!this.hidden&&!this.frozen&&id===this.active&&this.bounds.width>0&&this.bounds.height>0)}}
 hide(value:boolean){this.hidden=value;this.layout(this.bounds)}
 freeze(value:boolean){this.frozen=value;this.layout(this.bounds)}
 async preview(){if(this.hidden||!this.active)return undefined;return (await this.get().view.webContents.capturePage()).toDataURL()}
 close(id:string){const e=this.get(id);this.tabs.delete(id);this.window()?.contentView.removeChildView(e.view);e.view.webContents.close();if(this.active===id)this.active=[...this.tabs.keys()].at(-1);this.layout(this.bounds);this.changed()}
 async navigate(id:string,url:string){const e=this.get(id);let target=url.trim();if(target!=='about:blank'&&!/^[a-zA-Z][a-zA-Z\d+.-]*:/.test(target))target='https://'+target;const u=new URL(target);if(!['https:','http:','about:'].includes(u.protocol))throw Error('请通过文件面板打开本地产物');e.snapshot=undefined;await e.view.webContents.loadURL(u.href);return e.tab}
 async command(entry:Entry,name:string,params:Wire={}){if(!entry.attached){entry.view.webContents.debugger.attach('1.3');entry.attached=true}return Promise.race([entry.view.webContents.debugger.sendCommand(name,params),new Promise<never>((_,reject)=>{const t=setTimeout(()=>reject(Error('浏览器操作超时')),30000);t.unref()})])}
 async evaluate(e:Entry,expression:string){const data=await this.command(e,'Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(data.exceptionDetails)throw Error('网页内容已变化，请重新观察');return data.result.value}
 async snapshot(e:Entry){
 const token=randomUUID();e.snapshot=token
 return this.evaluate(e,`(()=>{const nodes=[...document.querySelectorAll('a,button,input,textarea,select,[role="button"],[contenteditable="true"]')].filter(n=>{const r=n.getBoundingClientRect();return r.width>0&&r.height>0}).slice(0,250);window.__nxn={token:${JSON.stringify(token)},nodes};return {title:document.title,url:location.href,text:document.body.innerText.slice(0,24000),elements:nodes.map((n,i)=>({index:i+1,tag:n.tagName,text:(n.innerText||n.getAttribute('aria-label')||n.getAttribute('placeholder')||n.getAttribute('name')||'').slice(0,180),type:n.getAttribute('type')}))}})()`)
 }
 async forSession(id:string){let e=[...this.tabs.values()].find(x=>x.tab.sessionID===id&&x.tab.id===this.active)||[...this.tabs.values()].find(x=>x.tab.sessionID===id);if(!e){const tab=await this.create(id);e=this.get(tab.id)}return e}
 async tool(name:string,args:Wire,sessionID:string){
 const e=await this.forSession(sessionID)
 if(e.tab.takeover&&name!=='browser_tabs')throw Error('用户正在接管浏览器，等待用户点击继续')
 this.select(e.tab.id)
 if(name==='browser_tabs'){if(args.action==='close')this.close(String(args.tab));else if(args.action==='switch'){const target=this.get(String(args.tab));if(target.tab.sessionID!==sessionID)throw Error('标签不属于当前会话');this.select(target.tab.id)}return this.list().filter(t=>t.sessionID===sessionID)}
 if(name==='browser_new_tab'){const t=await this.create(sessionID,args.url||'about:blank');return this.snapshot(this.get(t.id))}
 if(name==='browser_navigate'){await this.navigate(e.tab.id,String(args.url));return this.snapshot(e)}
 if(name==='browser_snapshot')return this.snapshot(e)
 if(name==='browser_text')return this.evaluate(e,'document.body.innerText.slice(0,60000)')
 if(name==='browser_screenshot'){return {image:await this.command(e,'Page.captureScreenshot',{format:'png'})}}
 if(name==='browser_save_pdf'){const folder=path.join(this.store.root,'artifacts',sessionID.replace(/[^\w-]/g,'_'));await fs.mkdir(folder,{recursive:true});const dest=path.join(folder,path.basename(String(args.path||'report.pdf')));await fs.writeFile(dest,await e.view.webContents.printToPDF({printBackground:true}));this.emit('download',{sessionID,path:dest,name:path.basename(dest),state:'completed'});return {path:dest}}
 if(name==='browser_back'){if(e.view.webContents.navigationHistory.canGoBack())e.view.webContents.navigationHistory.goBack();return this.snapshot(e)}
 if(name==='browser_scroll'){await this.evaluate(e,`scrollBy(0,innerHeight*${(args.direction==='up'?-1:1)*Math.min(Number(args.pages)||1,10)})`);return this.snapshot(e)}
 if(name==='browser_press'){const key=String(args.key);if(!['Enter','Escape','Tab','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Backspace'].includes(key))throw Error('Unsupported key');e.view.webContents.sendInputEvent({type:'keyDown',keyCode:key});e.view.webContents.sendInputEvent({type:'keyUp',keyCode:key});return this.snapshot(e)}
 if(name==='browser_wait'){await new Promise(r=>setTimeout(r,Math.min(10,Math.max(0,Number(args.seconds)||1))*1000));return this.snapshot(e)}
 const index=Number(args.index)-1;if(!Number.isInteger(index)||index<0)throw Error('Invalid element index')
 const get=`const s=window.__nxn;if(!s||s.token!==${JSON.stringify(e.snapshot)}||!s.nodes[${index}]?.isConnected)throw Error('stale');const n=s.nodes[${index}];`
 if(name==='browser_click'||name==='browser_hover'){
 const point=await this.evaluate(e,`(()=>{${get}n.scrollIntoView({block:'center'});const r=n.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`)
 await this.command(e,'Input.dispatchMouseEvent',{type:'mouseMoved',...point});if(name==='browser_click'){await this.command(e,'Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,...point});await this.command(e,'Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,...point})}
 }else if(name==='browser_type'){
 await this.evaluate(e,`(()=>{${get}if(n.type==='password')throw Error('Use manual takeover for passwords');n.focus();if(${args.clear!==false}){const setter=Object.getOwnPropertyDescriptor(n.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype,'value')?.set;if(setter)setter.call(n,'');else n.textContent='';n.dispatchEvent(new Event('input',{bubbles:true}))}})()`)
 await this.command(e,'Input.insertText',{text:String(args.text||'')});if(args.submit){e.view.webContents.sendInputEvent({type:'keyDown',keyCode:'Enter'});e.view.webContents.sendInputEvent({type:'keyUp',keyCode:'Enter'})}
 }else if(name==='browser_select'){await this.evaluate(e,`(()=>{${get}n.value=${JSON.stringify(args.option)};n.dispatchEvent(new Event('change',{bubbles:true}))})()`)}
 else throw Error('Unknown browser tool')
 await new Promise(r=>setTimeout(r,120));return this.snapshot(e)
 }
 takeover(id:string,value:boolean){const e=this.get(id);e.tab.takeover=value;this.changed()}
 destroy(){for(const id of [...this.tabs.keys()])this.close(id)}
}

