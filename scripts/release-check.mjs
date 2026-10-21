import {_electron} from 'playwright'
import path from 'node:path'
import {createServer} from 'node:http'
import assert from 'node:assert/strict'
import {readFile,writeFile} from 'node:fs/promises'

// Uses the same isolated fixture as functional-check, never personal app data.
const executable=path.resolve(process.argv[2]||'dist/linux-unpacked/nxncode')
const application=await _electron.launch({executablePath:executable,args:executable.endsWith('.AppImage')?['--appimage-extract-and-run']:[],env:{...process.env,NXNCODE_DATA_DIR:path.resolve('.runtime'),NXNCODE_TEST_FIXTURES:''}})
const page=await application.firstWindow()
const invoke=(action,args={})=>page.evaluate(({action,args})=>window.nxncode.invoke(action,args),{action,args})
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms))
async function waitFor(check,timeout=60000){const start=Date.now();while(Date.now()-start<timeout){const value=await check();if(value)return value;await delay(500)}throw Error('Release check timed out')}
async function children(pid){const ids=(await readFile(`/proc/${pid}/task/${pid}/children`,'utf8').catch(()=>'' )).trim().split(/\s+/).filter(Boolean).map(Number);return ids}
let enginePID
const result={executable:path.relative(process.cwd(),executable)}
const browserFixture=createServer((_req,res)=>res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'}).end('<!doctype html><title>Browser acceptance fixture</title><body style="background:#e9ece8;color:#222;font:18px system-ui;padding:24px">Local browser acceptance fixture</body>'))
await new Promise(resolve=>browserFixture.listen(0,'127.0.0.1',resolve));browserFixture.unref()
const fixtureURL='http://127.0.0.1:'+browserFixture.address().port
try{
 const boot=await waitFor(async()=>{const value=await invoke('bootstrap');if(value.engine.status==='error')throw Error(value.engine.detail);return value.engine.status==='ready'?value:null})
 assert.equal(boot.engine.version,'2.0.32');assert.equal(boot.root,path.resolve('.runtime'))
 for(const id of await children(application.process().pid)){const cmd=await readFile(`/proc/${id}/cmdline`,'utf8').catch(()=>'');if(cmd.includes('serve\0--stdio'))enginePID=id}
 assert.ok(enginePID,'Isolated engine process not found')
 result.packaged=await application.evaluate(({app})=>app.isPackaged)
 assert.equal(result.packaged,true)
 await page.locator('.welcome').waitFor();await page.evaluate(()=>document.fonts.ready)
 assert.equal(boot.demo,undefined,'Normal launch started the order fixture')
 assert.equal(await page.locator('.demo-group,.sales-card,.download-banner,.demo-orders').count(),0)
 assert.equal(await page.locator('.sidebar .bot-row').count(),boot.state.bots.length)
 assert.equal(await page.getByRole('textbox',{name:'网址',exact:true}).inputValue(),'')
 const blank=await waitFor(async()=>(await invoke('bootstrap')).tabs[0])
 assert.equal(blank.url,'about:blank')
 result.noFixedExamples=true
 await invoke('browser.navigate',{id:blank.id,url:fixtureURL})
 await page.waitForFunction(()=>!document.querySelector('.browser-empty'))
 await delay(300)
 assert.equal(await page.locator('.mode-button').textContent(),'Ask First')
 const isMaximized=()=>application.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].isMaximized())
 const isMinimized=()=>application.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].isMinimized())
 assert.equal(await page.locator('.window-controls,.window-drag').count(),0)
 assert.equal(await isMaximized(),false)
 await application.evaluate(({BrowserWindow})=>{const win=BrowserWindow.getAllWindows()[0];if(win.isMaximized())win.unmaximize();else win.maximize()})
 await waitFor(isMaximized,3000)
 assert.equal((await invoke('bootstrap')).maximized,true)
 await application.evaluate(({BrowserWindow})=>{const win=BrowserWindow.getAllWindows()[0];if(win.isMaximized())win.unmaximize();else win.maximize()})
 await waitFor(async()=>!(await isMaximized()),3000)
 assert.equal((await invoke('bootstrap')).maximized,false)
 await application.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].minimize())
 await waitFor(isMinimized,3000)
 await application.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].restore())
 await waitFor(async()=>!(await isMinimized()),3000)
 const decorations=await application.evaluate(({BrowserWindow})=>{const win=BrowserWindow.getAllWindows()[0];return {outer:win.getBounds(),content:win.getContentBounds()}})
 // Native decorations were visually checked separately; Wayland bounds exclude them.
 result.windowControls={systemManaged:true,rendererControls:false,decorations,maximize:true,restore:true,minimize:true}
 const ask=await invoke('session.create',{title:'Release mode Ask',mode:'ask'})
 const build=await invoke('session.create',{title:'Release mode Build',mode:'build'})
 try{
  await page.reload();await page.locator('.welcome').waitFor()
  for(const [title,label] of [['Release mode Build','Build'],['Release mode Ask','Ask First'],['Release mode Build','Build']]){
   await page.getByRole('button',{name:title,exact:true}).click()
   await page.waitForFunction(label=>document.querySelector('.mode-button')?.textContent===label,label)
  }
  await page.locator('.mode-button').click()
  await page.locator('.mode-menu button').filter({has:page.locator('strong',{hasText:'Ask First'})}).click()
  await page.waitForFunction(()=>document.querySelector('.mode-button')?.textContent==='Ask First'&&!document.querySelector('.mode-button').disabled)
  assert.equal((await invoke('session.get',{id:build.id})).permissions[0].effect,'ask')
  await page.getByRole('button',{name:'新会话',exact:false}).first().click()
  assert.equal(await page.locator('.mode-button').textContent(),'Ask First')
  result.sessionModes={defaultAskFirst:true,perSession:true,engineConfirmed:true}
 }finally{await invoke('session.delete',{id:ask.id});await invoke('session.delete',{id:build.id})}
 await page.evaluate(()=>{window.__windowFrames={opening:[],closing:[]};window.nxncode.on('window-motion',value=>{const start=performance.now();function frame(now){const root=document.querySelector('.app-shell');window.__windowFrames[value.phase].push({transform:getComputedStyle(root).transform,opacity:getComputedStyle(root).opacity});if(now-start<260)requestAnimationFrame(frame)}requestAnimationFrame(frame)})})
 await page.getByRole('textbox',{name:'消息',exact:true}).fill('对照视频后的输入区')
 await page.locator('.composer').screenshot({path:'.review/release-composer.png'})
 result.scaling=[]
 for(const scale of [1.25,1.5]){
  await application.evaluate(({BrowserWindow},factor)=>BrowserWindow.getAllWindows()[0].webContents.setZoomFactor(factor),scale)
  await delay(250)
  const bounds=await page.locator('.browser-slot').boundingBox()
  const native=await application.evaluate(({BrowserWindow})=>{const win=BrowserWindow.getAllWindows()[0];const view=win.contentView.children.find(child=>child.webContents&&child.webContents.id!==win.webContents.id);return view?.getBounds()})
  assert.ok(bounds&&native)
  const content=await application.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].getContentBounds());assert.ok(native.x+native.width<=content.width+2,'Native browser overflows window')
  for(const key of ['x','y','width','height'])assert.ok(Math.abs(bounds[key]*scale-native[key])<=2,`Native browser ${key} differs at ${scale}`)
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false)
  result.scaling.push(scale)
 }
 await application.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].webContents.setZoomFactor(1))
 const mainName='Release main '+Date.now()
 const main=await invoke('bot.create',{name:mainName,job:'Coordinate other bots in the release check.'})
 await invoke('bot.main',{id:main.id})
 assert.equal((await invoke('bootstrap')).state.mainBotID,main.id)
 await page.locator('.main-badge').first().waitFor()
 assert.equal(await page.locator('.main-badge').first().textContent(),'主')
 await page.getByRole('button',{name:'设置',exact:true}).click();await page.getByRole('button',{name:'主 Bot',exact:true}).click()
 const mainRow=page.locator('.settings-content .setting-row').filter({hasText:mainName})
 await mainRow.waitFor()
 assert.equal(await page.locator('.window-controls,.window-drag').count(),0)
 await mainRow.getByRole('button',{name:'取消主 Bot',exact:true}).click()
 await mainRow.getByRole('button',{name:'设为主 Bot',exact:true}).waitFor()
 assert.equal((await invoke('bootstrap')).state.mainBotID,undefined)
 const withoutMain=JSON.parse(await readFile('.runtime/state.json','utf8'))
 assert.ok(!('mainBotID' in withoutMain))
 await mainRow.getByRole('button',{name:'设为主 Bot',exact:true}).click()
 await mainRow.getByRole('button',{name:'取消主 Bot',exact:true}).waitFor()
 assert.equal((await invoke('bootstrap')).state.mainBotID,main.id)
 const persisted=JSON.parse(await readFile('.runtime/state.json','utf8'))
 assert.equal(persisted.mainBotID,main.id)
 await page.getByRole('button',{name:'返回工作区',exact:true}).click()
 await page.locator('.main-badge').first().waitFor()
 result.mainBot={created:main.id,uiSynced:true,persisted:true}
 const model={id:'glm-5.3-flash-free',providerID:'opencode',variant:'low'}
 const bot=await invoke('bot.save',{name:'Release background check',job:'Reply RELEASE_BACKGROUND_OK, without tools.',look:{color:'lime',shape:'squircle',face:'calm'},model})
 const schedule=await invoke('schedule.add',{botID:bot.id,kind:'once',at:new Date(Date.now()+3000).toISOString(),text:'Reply exactly RELEASE_BACKGROUND_OK. Do not use any tool.',timeZone:'Asia/Shanghai'})
 await application.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].close())
 await waitFor(async()=>!(await application.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].isVisible())),2000)
 assert.equal(await application.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].isVisible()),false)
 await waitFor(async()=>{const state=(await invoke('bootstrap')).state;return !state.schedules.find(value=>value.id===schedule.id).enabled})
 assert.ok((await children(application.process().pid)).includes(enginePID))
 const sleeping=await page.locator('.sidebar .avatar svg').first().evaluate(el=>el.style.transform);await delay(400);assert.equal(await page.locator('.sidebar .avatar svg').first().evaluate(el=>el.style.transform),sleeping);result.hiddenAnimationsPaused=true
 result.closedToBackground=true;result.scheduleQueuedWhileHidden=true
 await invoke('window.show')
 await waitFor(async()=>await application.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].isVisible()),2000)
 await page.waitForFunction(()=>document.querySelector('.app-shell')?.dataset.windowPhase==='ready')
 assert.equal(await application.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].isVisible()),true)
 await delay(300);result.restored=true
 const frames=await page.evaluate(()=>window.__windowFrames);result.windowAnimationFrames={closing:new Set(frames.closing.map(f=>f.transform)).size,opening:new Set(frames.opening.map(f=>f.transform)).size};assert.ok(result.windowAnimationFrames.closing>2&&result.windowAnimationFrames.opening>2,'Window transition did not animate')
 // The normal quit path must stop the private engine as well as the window.
 await application.close()
 await waitFor(async()=>!(await readFile(`/proc/${enginePID}/cmdline`,'utf8').catch(()=>'')),10000)
 result.engineStoppedOnQuit=true
 const relaunched=await _electron.launch({executablePath:executable,args:executable.endsWith('.AppImage')?['--appimage-extract-and-run']:[],env:{...process.env,NXNCODE_DATA_DIR:path.resolve('.runtime'),NXNCODE_TEST_FIXTURES:''}})
 try{
  const rpage=await relaunched.firstWindow()
  const rinvoke=(action,args={})=>rpage.evaluate(({action,args})=>window.nxncode.invoke(action,args),{action,args})
  const rboot=await waitFor(async()=>{const value=await rinvoke('bootstrap');if(value.engine.status==='error')throw Error(value.engine.detail);return value.engine.status==='ready'?value:null})
  assert.equal(rboot.state.mainBotID,main.id)
  await rpage.locator('.main-badge').first().waitFor()
  assert.equal(await rpage.locator('.main-badge').first().textContent(),'主')
  await rinvoke('bot.delete',{id:main.id})
  assert.equal((await rinvoke('bootstrap')).state.mainBotID,undefined)
  result.mainBotRestart={retained:true,clearedOnDelete:true}
 }finally{await relaunched.close().catch(()=>{})}
 await writeFile('.review/release.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result))
}finally{await application.close().catch(()=>{});browserFixture.close()}
