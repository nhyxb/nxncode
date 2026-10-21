import { app, BrowserWindow, ipcMain, dialog, Tray, Menu, nativeImage, Notification, shell } from 'electron'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { promises as fs } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { Store } from './store'
import { BotService } from './bots'
import { messageID } from './identifier'
import { Engine, unwrap } from './engine'
import { BrowserService } from './browser'
import { WindowMotion } from './window-motion'
import { MCPService, managerTools } from './mcp'
import { readDirectory, readFile, gitStatus, gitDiff, within } from './workspace'
import { startDemo, weekly, total } from './demo'
import { due, nextOccurrence, retryDelay } from '../shared/schedule'
import type { Bot, Schedule, Wire } from '../shared/types'
const here=path.dirname(fileURLToPath(import.meta.url))
let win:BrowserWindow|undefined;let tray:Tray|undefined;let exiting=false;let store:Store;let engine:Engine;let browser:BrowserService;let windowMotion:WindowMotion;let mcp:MCPService;let bots:BotService;let demo:Awaited<ReturnType<typeof startDemo>>|undefined;let timer:NodeJS.Timeout
const terminals=new Map<string,import('node-pty').IPty>();const pendingBots=new Set<string>()
const broadcast=(event:string,value:unknown)=>{if(win&&!win.isDestroyed())win.webContents.send('nxn:event',{event,value})}
let lastNotice=0;const notify=(body:string)=>{if(Notification.isSupported()&&Date.now()-lastNotice>10000){lastNotice=Date.now();new Notification({title:'nxncode',body}).show()}}
async function save(){await store.save();broadcast('state',store.state)}
function project(p:string){if(!store.state.projects.includes(p)&&p!==path.join(store.root,'workspace')&&!p.startsWith(path.join(store.root,'bots')+path.sep))throw Error('请先打开这个项目');return p}
async function sessionDirectory(id:string){const s=unwrap(await engine.request('GET','api/session/'+encodeURIComponent(id)));return s.location.directory as string}
async function createSession(args:Wire){const directory=args.directory?project(args.directory):path.join(store.root,'workspace');await fs.mkdir(directory,{recursive:true});const session=unwrap(await engine.request('POST','api/session',{title:args.title,location:{directory},model:args.model,permissions:[{action:'*',resource:'*',effect:args.mode==='build'?'allow':'ask'}]}));await engine.request('PUT','api/experimental/session/'+session.id+'/instructions/entries/nxncode.browser',{value:'You work in nxncode. Always use nxncode-tools_browser_* MCP tools for browser tasks so the user sees the same page. Do not use any other browser backend. Use nxncode-tools_show_widget for inline charts with real data and show_in_panel for project files. Credentials and lasting memory must stay local.'});return session}
async function tick(){
 if(engine.state.status!=='ready')return
 for(const s of store.state.schedules){
 const bot=store.state.bots.find(b=>b.id===s.botID)
 if(!bot||bot.paused||!bot.sessionID||!due(s,Date.now())||pendingBots.has(bot.id))continue
 pendingBots.add(bot.id)
 try{
 const active=unwrap(await engine.request('GET','api/session/active'))||{};if(active[bot.sessionID])continue
 s.pendingID||=messageID();await save()
 await engine.request('POST','api/session/'+bot.sessionID+'/prompt',{id:s.pendingID,text:s.text,delivery:'queue'})
 const next=nextOccurrence(s,Date.now());s.enabled=Number.isFinite(next);if(s.enabled)s.nextRunAt=next;s.pendingID=undefined;s.attempts=0;s.retryAt=undefined;await save()
 }catch{ s.attempts=(s.attempts||0)+1;s.retryAt=Date.now()+retryDelay(s.attempts);await save();notify(bot.name+' 的计划暂未执行，将自动重试') }
 finally{pendingBots.delete(bot.id)}
 }
}
async function dispatch(action:string,a:Wire={}):Promise<any>{
 switch(action){
 case 'bootstrap':return {state:store.state,engine:engine.state,root:store.root,...(demo?{demo:{url:demo.url,weekly,total,count:912}}:{}),tabs:browser.list(),maximized:!!win?.isMaximized()}
 case 'preferences':{for(const key of ['language','sidebar','panel','fontSize','selected','model','starred'])if(key in a)(store.state as any)[key]=a[key];store.state.sidebar=Math.min(440,Math.max(220,Number(store.state.sidebar)||280));store.state.panel=Math.min(900,Math.max(300,Number(store.state.panel)||420));store.state.fontSize=Math.min(20,Math.max(12,Number(store.state.fontSize)||14));if(!['zh','en'].includes(store.state.language))throw Error('Invalid language');await save();return store.state}
 case 'engine.start':await engine.start();return engine.state
 case 'catalog':return {models:(unwrap(await engine.request('GET','api/model'))||[]).map((m:Wire)=>({id:m.id,providerID:m.providerID,name:m.name,enabled:m.enabled,family:m.family,capabilities:m.capabilities,cost:m.cost,limit:m.limit,variants:(m.variants||[]).map((v:Wire)=>({id:v.id}))})),providers:unwrap(await engine.request('GET','api/provider')),integrations:unwrap(await engine.request('GET','api/integration'))}
 case 'account.key':return engine.request('POST','api/integration/'+encodeURIComponent(a.id)+'/connect/key',{key:a.key,answer:a.answer})
 case 'account.oauth':return unwrap(await engine.request('POST','api/integration/'+encodeURIComponent(a.id)+'/connect/oauth',{methodID:a.method,answer:a.answer}))
 case 'account.oauthStatus':return unwrap(await engine.request('GET','api/integration/'+encodeURIComponent(a.id)+'/connect/oauth/'+encodeURIComponent(a.attempt)))
 case 'account.oauthComplete':return engine.request('POST','api/integration/'+encodeURIComponent(a.id)+'/connect/oauth/'+encodeURIComponent(a.attempt)+'/complete',{code:a.code})
 case 'account.oauthCancel':return engine.request('DELETE','api/integration/'+encodeURIComponent(a.id)+'/connect/oauth/'+encodeURIComponent(a.attempt))
 case 'account.list':return (unwrap(await engine.request('GET','api/credential'))||[]).map((c:Wire)=>({id:c.id,label:c.label,integrationID:c.integrationID,active:c.active}))
 case 'account.delete':return engine.request('DELETE','api/credential/'+encodeURIComponent(a.id))
 case 'account.activate':return engine.request('POST','api/credential/'+encodeURIComponent(a.id)+'/activate')
 case 'sessions':return unwrap(await engine.request('GET','api/session?limit=100&order=desc&parentID=null'))
 case 'session.create':return createSession(a)
 case 'session.get':return unwrap(await engine.request('GET','api/session/'+encodeURIComponent(a.id)))
 case 'session.messages':return {messages:(unwrap(await engine.request('GET','api/session/'+encodeURIComponent(a.id)+'/message?limit=100&order=asc'))||[]),permissions:unwrap(await engine.request('GET','api/session/'+encodeURIComponent(a.id)+'/permission')),active:!!unwrap(await engine.request('GET','api/session/active'))?.[a.id],forms:unwrap(await engine.request('GET','api/session/'+encodeURIComponent(a.id)+'/form'))}
 case 'session.send':{const files=(a.files||[]).filter((p:string)=>attachments.has(p)).map((p:string)=>({uri:pathToFileURL(p).href,name:path.basename(p)}));await engine.request('POST','api/session/'+encodeURIComponent(a.id)+'/prompt',{id:a.messageID||messageID(),text:a.text,files,delivery:'steer'});return true}
 case 'session.interrupt':return engine.request('POST','api/session/'+encodeURIComponent(a.id)+'/interrupt')
 case 'session.model':return engine.request('POST','api/session/'+encodeURIComponent(a.id)+'/model',{model:a.model})
 case 'session.mode':{
 await engine.request('PATCH','api/session/'+encodeURIComponent(a.id),{permissions:[{action:'*',resource:'*',effect:a.mode==='build'?'allow':'ask'}]})
 // OpenCode 2.0.32 returns 204; the UI needs confirmed metadata, not that empty body.
 return unwrap(await engine.request('GET','api/session/'+encodeURIComponent(a.id)))
 }
 case 'session.permission':if(!['once','always','reject'].includes(a.decision))throw Error('Invalid decision');return engine.request('POST','api/session/'+encodeURIComponent(a.id)+'/permission/'+encodeURIComponent(a.permission)+'/reply',{decision:a.decision,message:a.message})
 case 'session.form':return a.dismiss?engine.request('DELETE','api/session/'+encodeURIComponent(a.id)+'/form/'+encodeURIComponent(a.form)):engine.request('POST','api/session/'+encodeURIComponent(a.id)+'/form/'+encodeURIComponent(a.form)+'/reply',{answer:a.answer})
 case 'session.delete':return engine.request('DELETE','api/session/'+encodeURIComponent(a.id))
 case 'project.open':{const result=await dialog.showOpenDialog(win!,{properties:['openDirectory']});if(result.canceled)return null;const dir=await fs.realpath(result.filePaths[0]);if(!store.state.projects.includes(dir))store.state.projects.unshift(dir);await save();return dir}
 case 'attachments':{const result=await dialog.showOpenDialog(win!,{properties:['openFile','multiSelections']});for(const f of result.filePaths)attachments.add(f);return result.filePaths}
 case 'files.list':return readDirectory(project(a.root),a.path)
 case 'files.read':return readFile(project(a.root),a.path)
 case 'git.status':return gitStatus(project(a.root))
 case 'git.diff':return gitDiff(project(a.root),a.path,a.staged)
 case 'bot.save':return bots.upsert(a)
 case 'bot.pause':return bots.pause(a.id,!!a.paused)
 case 'bot.delete':return bots.remove(a.id)
 case 'bot.list':return bots.list()
 case 'bot.get':return bots.get(a.id)
 case 'bot.create':return bots.create(a)
 case 'bot.update':return bots.update(a.id,a)
 case 'bot.run':return bots.run(a.id,a.text,a.operationID)
 case 'bot.stop':return bots.stop(a.id)
 case 'bot.result':return bots.result(a.id)
 case 'bot.schedules':return bots.schedules(a.id)
 case 'bot.main':return bots.setMain(a.id??null)
 case 'schedule.add':return bots.addSchedule(a)
 case 'schedule.delete':return bots.removeSchedule(a.id)
 case 'browser.create':return browser.create(a.sessionID||'workspace',a.url||'about:blank')
 case 'browser.select':browser.select(a.id);return true
 case 'browser.close':browser.close(a.id);return true
 case 'browser.navigate':return browser.navigate(a.id,a.url)
 case 'browser.bounds':{const scale=win?.webContents.getZoomFactor()||1;browser.layout({x:a.x*scale,y:a.y*scale,width:a.width*scale,height:a.height*scale});return true}
 case 'browser.hidden':browser.hide(!!a.hidden);return true
 case 'browser.takeover':browser.takeover(a.id,!!a.value);return true
 case 'browser.reload':browser.get(a.id).view.webContents.reload();return true
 case 'browser.back':{const wc=browser.get(a.id).view.webContents;if(wc.navigationHistory.canGoBack())wc.navigationHistory.goBack();return true}
 case 'browser.forward':{const wc=browser.get(a.id).view.webContents;if(wc.navigationHistory.canGoForward())wc.navigationHistory.goForward();return true}
 case 'terminal.open':{const pty=await import('node-pty');const id='pty_'+randomUUID();const term=pty.spawn(process.env.SHELL||'/bin/bash',[],{name:'xterm-256color',cols:80,rows:24,cwd:project(a.root),env:process.env as Record<string,string>});term.onData(data=>broadcast('terminal',{id,data}));term.onExit(({exitCode})=>{broadcast('terminal',{id,data:'\r\n[process exited: '+exitCode+']\r\n'});terminals.delete(id)});terminals.set(id,term);return id}
 case 'terminal.write':terminals.get(a.id)?.write(String(a.data));return true
 case 'terminal.resize':terminals.get(a.id)?.resize(Math.min(500,Math.max(2,a.cols)),Math.min(200,Math.max(2,a.rows)));return true
 case 'terminal.close':terminals.get(a.id)?.kill();terminals.delete(a.id);return true
 case 'artifact.pdf':{let file:string;try{file=await within(store.root,a.path)}catch{file=await within(project(a.root),a.path)}if(!/\.html?$/i.test(file))throw Error('请选择 HTML 报告');const html=await fs.readFile(file,'utf8');const render=new BrowserWindow({show:false,webPreferences:{sandbox:true,nodeIntegration:false,contextIsolation:true,partition:'pdf-'+randomUUID()}});render.webContents.session.webRequest.onBeforeRequest((details,callback)=>callback({cancel:!details.url.startsWith('data:')&&details.url!=='about:blank'}));try{await render.loadURL('data:text/html;charset=utf-8,'+encodeURIComponent(html));const pdf=await render.webContents.printToPDF({printBackground:true});const folder=path.join(store.root,'artifacts','reports');await fs.mkdir(folder,{recursive:true});const dest=path.join(folder,path.basename(file).replace(/\.html?$/i,'')+'-'+Date.now()+'.pdf');await fs.writeFile(dest,pdf);broadcast('download',{path:dest,name:path.basename(dest),state:'completed'});return dest}finally{render.destroy()}}
 case 'artifact.read':{const file=await within(store.root,a.path);return readFile(store.root,file)}
 case 'external':{const url=new URL(a.url);if(!['https:','http:'].includes(url.protocol))throw Error('Invalid external URL');await shell.openExternal(url.href);return true}
 case 'window.minimize':win?.minimize();return true
 case 'window.maximize':if(win?.isMaximized())win.unmaximize();else win?.maximize();return {maximized:!!win?.isMaximized()}
 case 'window.close':win?.close();return true
 case 'window.show':windowMotion.show();return true
 case 'window.motionReady':windowMotion.ready(Number(a.token));return true
 case 'window.quit':app.quit();return true
 default:throw Error('未知操作：'+action)
 }
}
const attachments=new Set<string>()
if(!app.requestSingleInstanceLock())app.quit()
else{
 app.on('second-instance',()=>windowMotion?.show())
 app.whenReady().then(async()=>{
 app.setName('nxncode');if(process.env.NXNCODE_DATA_DIR)app.setPath('userData',path.resolve(process.env.NXNCODE_DATA_DIR))
 store=new Store(app.getPath('userData'));await store.load();if(process.env.NXNCODE_TEST_FIXTURES==='1'&&process.env.NXNCODE_DATA_DIR)demo=await startDemo()
 win=new BrowserWindow({width:1440,height:900,minWidth:1000,minHeight:660,frame:true,autoHideMenuBar:true,title:'nxncode',backgroundColor:'#13191b',show:false,webPreferences:{preload:path.join(here,'../preload/index.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true}})
 browser=new BrowserService(()=>win,store,broadcast);windowMotion=new WindowMotion(()=>win,browser,broadcast)
 mcp=new MCPService(async(name,args,sessionID)=>{
 await sessionDirectory(sessionID) // reject nonexistent/forged session context
 // Management tools act on other bots, so they are bound to the main bot's own
 // session. A normal session (or a forged _meta id) can never reach them.
 if(managerTools.has(name)){
 if(!bots.isMainSession(sessionID))throw Error('只有主 Bot 才能管理其他 Bots')
 switch(name){
 case 'bot_list':return bots.list()
 case 'bot_get':return bots.get(String(args.id||''))
 case 'bot_create':return bots.create(args)
 case 'bot_update':return bots.update(String(args.id||''),args)
 case 'bot_run':return bots.run(String(args.id||''),args.text,args.operationID)
 case 'bot_stop':return bots.stop(String(args.id||''))
 case 'bot_pause':return bots.pause(String(args.id||''),!!args.paused)
 case 'bot_delete':return bots.remove(String(args.id||''))
 case 'bot_result':return bots.result(String(args.id||''))
 case 'bot_schedules':return bots.schedules(String(args.id||''))
 case 'bot_schedule_add':return bots.addSchedule({...args,botID:args.id})
 case 'bot_schedule_remove':return bots.removeSchedule(String(args.scheduleID||''))
 }
 }
 if(name==='show_widget'){broadcast('widget',{sessionID,...args});return 'Widget shown in the conversation'}
 if(name==='show_in_panel'){const directory=await sessionDirectory(sessionID);let file:string;try{file=await within(directory,args.path)}catch{file=await within(store.root,args.path)}broadcast('open-file',{sessionID,path:file,root:file.startsWith(store.root)?store.root:directory,artifact:file.startsWith(store.root)});return 'Opened in panel'}
 if(name==='bot_schedule')return bots.addSchedule({...args,botID:sessionID},sessionID)
 return browser.tool(name,args,sessionID)
 });await mcp.start()
 engine=new Engine(path.join(store.root,'engine'),()=>mcp.config());bots=new BotService(store,engine,save,project);engine.on('state',s=>{broadcast('engine',s);if(s.status==='ready')void (async()=>{for(const bot of store.state.bots.filter(b=>!b.sessionID))await bots.upsert(bot);await tick()})().catch(()=>notify('部分 Bot 初始化失败，请打开编辑器重新保存'))});engine.on('event',e=>{broadcast('engine-event',e);if(['permission.created','permission.asked','session.permission.created'].includes(e.type||e.payload?.type))notify('代理正在等待你的批准')})
 ipcMain.handle('nxn:invoke',async(event,action,args)=>{if(event.sender!==win?.webContents||event.senderFrame!==win.webContents.mainFrame)throw Error('Untrusted sender');return dispatch(action,args)})
 win.webContents.setWindowOpenHandler(({url})=>{if(/^https?:/.test(url))void shell.openExternal(url);return {action:'deny'}})
 win.webContents.on('will-navigate',(event,url)=>{const target=new URL(url);if(process.env.ELECTRON_RENDERER_URL?target.origin!==new URL(process.env.ELECTRON_RENDERER_URL).origin:target.protocol!=='file:')event.preventDefault()})
 win.on('close',e=>{if(!exiting){e.preventDefault();windowMotion.hide()}})
 win.on('maximize',()=>broadcast('window-state',{maximized:true}))
 win.on('unmaximize',()=>broadcast('window-state',{maximized:false}))
 win.once('ready-to-show',()=>win?.show())
 const icon=nativeImage.createFromDataURL('data:image/png;base64,'+await fs.readFile(path.join(here,'../../resources/icon.png'),'base64').catch(()=>''));tray=new Tray(icon);tray.setToolTip('nxncode');tray.setContextMenu(Menu.buildFromTemplate([{label:'打开 nxncode',click:()=>windowMotion.show()},{type:'separator'},{label:'退出',click:()=>app.quit()}]));tray.on('click',()=>win?.isVisible()?windowMotion.hide():windowMotion.show())
 if(process.env.ELECTRON_RENDERER_URL)await win.loadURL(process.env.ELECTRON_RENDERER_URL);else await win.loadFile(path.join(here,'../renderer/index.html'))
 timer=setInterval(()=>void tick(),20000);timer.unref()
 void engine.start().catch(()=>{})
 }).catch(e=>{dialog.showErrorBox('nxncode 启动失败',e.message);app.quit()})
 app.on('before-quit',()=>{exiting=true;windowMotion?.dispose();clearInterval(timer);engine?.stop();mcp?.stop();browser?.destroy();for(const term of terminals.values())term.kill();demo?.server.close();tray?.destroy()})
 app.on('window-all-closed',()=>{if(exiting)app.quit()})
}

