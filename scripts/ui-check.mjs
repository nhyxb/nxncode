import {chromium} from 'playwright'
import {spawn} from 'node:child_process'
import {mkdir,writeFile} from 'node:fs/promises'
await mkdir('.review',{recursive:true})
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--config','vite.preview.config.ts','--port','5187'],{stdio:['ignore','pipe','pipe']})
await new Promise((resolve,reject)=>{server.stdout.on('data',chunk=>{if(chunk.toString().includes('Local:'))resolve()});server.once('exit',code=>reject(Error('Preview failed '+code)));setTimeout(()=>reject(Error('Preview startup timeout')),15000).unref()})
process.on('uncaughtException',error=>{console.error(error);server.kill();process.exit(1)})
const browser=await chromium.launch({executablePath:'/usr/bin/google-chrome',headless:true})
const page=await browser.newPage({viewport:{width:1440,height:900},deviceScaleFactor:1})
const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text())})
await page.goto('http://127.0.0.1:5187');await page.locator('.welcome').waitFor();await page.evaluate(()=>document.fonts.ready)
await page.waitForTimeout(250);await page.screenshot({path:'.review/desktop.png'})
if(await page.locator('.bot-row,.demo-group,.sales-card,.download-banner,.demo-orders').count())throw Error('Fresh workspace contains fabricated bots or activity')
if(!await page.locator('.tools-pane').evaluate(el=>el.classList.contains('is-collapsed')))throw Error('Tool panel must start collapsed')
if(await page.locator('.address-field input').inputValue()!=='')throw Error('Fresh browser has a sample URL')
if(!await page.getByText('还没有 Bot',{exact:true}).isVisible())throw Error('Missing real empty bot state')
if(await page.locator('.window-controls,.window-drag').count())throw Error('App still draws its own window controls')
if(await page.locator('.main-badge').count())throw Error('Unexpected main badge without a main bot')
await page.getByRole('textbox',{name:'消息',exact:true}).focus();const focusStyle=await page.getByRole('textbox',{name:'消息',exact:true}).evaluate(el=>({outline:getComputedStyle(el).outlineStyle,shadow:getComputedStyle(el.closest('.composer')).boxShadow}));if(focusStyle.outline!=='none'||!focusStyle.shadow.includes('inset'))throw Error('Composer focus regression');await page.locator('.composer').screenshot({path:'.review/composer-focused.png'})
await page.getByRole('button',{name:'新建 Bot',exact:true}).click();if(await page.getByRole('textbox',{name:'Bot 名称'}).inputValue()||await page.getByRole('textbox',{name:'任务说明'}).inputValue())throw Error('New bot has a fabricated identity');if(await page.locator('.template-list').count())throw Error('Fixed personal bot templates remain');await page.getByRole('textbox',{name:'Bot 名称'}).fill('My Scout');await page.getByRole('button',{name:'bloom',exact:true}).click();await page.mouse.move(1400,850);await page.waitForTimeout(200);await page.screenshot({path:'.review/bot-editor.png'})
await page.getByRole('button',{name:'取消',exact:true}).click()
await page.getByRole('button',{name:'设置',exact:true}).click();await page.getByRole('button',{name:'外观',exact:true}).click();await page.mouse.move(1400,850);await page.waitForTimeout(200);await page.screenshot({path:'.review/settings.png'})
await page.getByRole('button',{name:'通用',exact:true}).click();await page.locator('select').first().selectOption('en');await page.getByRole('button',{name:'Back to workspace'}).click()
await page.screenshot({path:'.review/english.png'})
await page.getByRole('button',{name:'Settings',exact:true}).click();await page.locator('select').first().selectOption('zh');await page.getByRole('button',{name:'返回工作区'}).click()
for(const width of [1200,1920]){await page.setViewportSize({width,height:width===1920?1080:800});await page.screenshot({path:'.review/desktop-'+width+'.png'});const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);if(overflow)errors.push('Horizontal overflow at '+width)}
// Isolated visual fixture: exercise controls without sending model requests.
const fixture=await browser.newPage({viewport:{width:1440,height:900}})
await fixture.addInitScript(()=>{
 const model={id:'glm-5.3-flash-free',providerID:'opencode',variant:'low'}
 const state={version:1,language:'zh',sidebar:280,panel:420,fontSize:14,bots:[{id:'bot_scout',name:'Scout',job:'Watch prices',look:{color:'lime',shape:'gem',face:'bright'},project:'',sessionID:'ses_scout',paused:false}],projects:[],schedules:[],starred:[],mainBotID:'bot_scout',model}
 window.nxncode={on:()=>()=>{},invoke:async(action,args={})=>{
  if(action==='bootstrap')return {state,engine:{status:'ready',version:'2.0.32'},demo:{url:''},tabs:[]}
  if(action==='catalog')return {models:[{...model,name:'GLM-5.3-Flash Free',variants:[{id:'low'},{id:'medium'},{id:'high'}]}],integrations:[]}
  if(action==='sessions')return []
  if(action==='bot.list')return state.bots.map(b=>({...b,main:state.mainBotID===b.id,schedules:0}))
  if(action==='bot.main'){if(args.id)state.mainBotID=args.id;else delete state.mainBotID;return state.mainBotID||null}
  if(action==='preferences'){Object.assign(state,args);return state}
  return undefined
 }}
})
await fixture.goto('http://127.0.0.1:5187');await fixture.locator('.welcome').waitFor();await fixture.evaluate(()=>document.fonts.ready)
if(await fixture.locator('.main-badge').textContent()!=='主')throw Error('Sidebar main badge missing')
await fixture.getByRole('button',{name:'设置',exact:true}).click();await fixture.getByRole('button',{name:'主 Bot',exact:true}).click()
await fixture.locator('.settings-content .setting-row').first().waitFor()
if(await fixture.locator('.settings-content .setting-row').count()!==1)throw Error('Main bot settings page did not list exactly one bot')
const navHover=fixture.getByRole('button',{name:'外观',exact:true});await navHover.hover();await fixture.waitForTimeout(220);const navBg=await navHover.evaluate(el=>getComputedStyle(el).backgroundColor);if(navBg==='rgba(0, 0, 0, 0)')throw Error('Settings nav hover has no feedback')
await fixture.screenshot({path:'.review/settings-main.png'})
await fixture.getByRole('button',{name:'取消主 Bot',exact:true}).click()
await fixture.getByRole('button',{name:'设为主 Bot',exact:true}).waitFor()
await fixture.getByRole('button',{name:'设为主 Bot',exact:true}).click()
await fixture.getByRole('button',{name:'取消主 Bot',exact:true}).waitFor()
await fixture.getByRole('button',{name:'返回工作区',exact:true}).click()
if(await fixture.locator('.main-badge').textContent()!=='主')throw Error('Main badge did not return after switching')
await fixture.getByRole('textbox',{name:'消息',exact:true}).fill('这周的销售怎么样？做一张图表。')
await fixture.locator('.composer').screenshot({path:'.review/composer-ready.png'})
const bareControls=await fixture.locator('.composer .mode-button,.composer .model-trigger').evaluateAll(els=>els.every(el=>{const s=getComputedStyle(el);return s.boxShadow==='none'&&s.backgroundImage==='none'&&s.borderTopWidth==='0px'}));if(!bareControls)throw Error('Composer controls gained separate plates')
await fixture.getByRole('button',{name:'选择模型',exact:true}).click();await fixture.locator('.model-pick').click();await fixture.locator('.model-picker').waitFor({state:'detached'});if(await fixture.locator('.model-effort').count())throw Error('Model selection opened effort');await fixture.getByRole('button',{name:'调整思考强度',exact:true}).click();await fixture.locator('.model-effort').screenshot({path:'.review/model-effort.png'})
await fixture.getByRole('slider',{name:'思考强度'}).press('End');await fixture.waitForFunction(()=>document.querySelector('.model-variant')?.textContent==='high');if(await fixture.locator('.model-variant').textContent()!=='high')throw Error('Effort slider selection did not persist');if(!await fixture.locator('.model-effort').isVisible())throw Error('Effort closed on selection');await fixture.keyboard.press('Escape');await fixture.locator('.model-effort').waitFor({state:'detached'})
await fixture.getByRole('button',{name:'新建 Bot',exact:true}).click();await fixture.getByRole('textbox',{name:'Bot 名称'}).fill('Scout');await fixture.locator('.editor-footer').screenshot({path:'.review/editor-actions.png'})
for(const scale of [1.25,1.5]){
 const context=await browser.newContext({viewport:{width:1280,height:800},deviceScaleFactor:scale});const scaled=await context.newPage();await scaled.goto('http://127.0.0.1:5187');await scaled.locator('.welcome').waitFor();await scaled.evaluate(()=>document.fonts.ready);await scaled.screenshot({path:'.review/scaled-'+scale+'.png'});await context.close()
}
// Permission labels must describe the selected engine session, including failure and races.
const modes=await browser.newPage({viewport:{width:1440,height:900}})
modes.on('pageerror',e=>errors.push(e.message))
await modes.addInitScript(()=>{
 const sessions=[
  {id:'ses_ask',title:'Ask session',permissions:[{action:'*',resource:'*',effect:'ask'}],appMode:'ask'},
  {id:'ses_auto',title:'Auto session',permissions:[{action:'*',resource:'*',effect:'ask'}],appMode:'auto'},
  {id:'ses_full',title:'Full session',permissions:[{action:'*',resource:'*',effect:'allow'}],appMode:'full'}
 ]
 const state={version:1,language:'zh',sidebar:280,panel:420,fontSize:14,bots:[],projects:[],schedules:[],starred:[],sessionModes:{ses_ask:'ask',ses_auto:'auto',ses_full:'full'}}
 window.__modeFixture={rejectNext:false,delayRead:0,delayWrite:400,writes:0,lastMode:''}
 const copy=value=>JSON.parse(JSON.stringify(value))
 window.nxncode={on:()=>()=>{},invoke:async(action,args={})=>{
  if(action==='bootstrap')return {state,engine:{status:'ready',version:'2.0.32'},demo:{url:''},tabs:[]}
  if(action==='catalog')return {models:[],integrations:[]}
  if(action==='sessions')return copy(sessions)
  if(action==='preferences'){Object.assign(state,args);return copy(state)}
  if(action==='session.messages')return {messages:[],permissions:[],forms:[],active:false}
  if(action==='session.get'){
   const found=sessions.find(s=>s.id===args.id);if(!found)throw Error('unknown session '+args.id)
   const snapshot={...copy(found),appMode:state.sessionModes[found.id]}
   await new Promise(resolve=>setTimeout(resolve,window.__modeFixture.delayRead));return snapshot
  }
  if(action==='session.mode'){
   window.__modeFixture.writes++;window.__modeFixture.lastMode=args.mode
   await new Promise(resolve=>setTimeout(resolve,window.__modeFixture.delayWrite))
   if(window.__modeFixture.rejectNext){window.__modeFixture.rejectNext=false;throw Error('模式切换失败，请重试')}
   if(!['ask','auto','full'].includes(args.mode))throw Error('unknown mode '+args.mode)
   const session=sessions.find(s=>s.id===args.id);if(!session)throw Error('unknown session '+args.id)
   state.sessionModes[session.id]=args.mode;session.appMode=args.mode
   // auto stays an engine "ask" session: only full relaxes the permission rule.
   session.permissions=[{action:'*',resource:'*',effect:args.mode==='full'?'allow':'ask'}]
   return copy(session)
  }
 }}
})
await modes.goto('http://127.0.0.1:5187');await modes.locator('.welcome').waitFor()
const modeButton=modes.locator('.mode-button')
async function expectMode(label){await modes.waitForFunction(label=>document.querySelector('.mode-button')?.textContent===label,label)}
async function selectSession(title){await modes.getByRole('button',{name:title,exact:true}).click()}
async function chooseMode(label){await modeButton.click();await modes.locator('.mode-menu button').filter({has:modes.locator('strong',{hasText:label})}).click()}
const modeLabels=()=>modes.evaluate(()=>[...document.querySelectorAll('.mode-menu button strong')].map(el=>el.textContent))
const fixtureWrites=()=>modes.evaluate(()=>window.__modeFixture.writes)
await expectMode('Ask First')
await modeButton.click()
const menu=await modeLabels()
if(JSON.stringify(menu)!==JSON.stringify(['Ask First','Auto approve','Full access']))throw Error('Mode menu does not offer ask/auto/full: '+menu.join(','))
await modes.keyboard.press('Escape')
await selectSession('Full session');await expectMode('Full access')
await selectSession('Auto session');await expectMode('Auto approve')
await selectSession('Ask session');await expectMode('Ask First')
await selectSession('Full session');await expectMode('Full access')
await modes.evaluate(()=>window.__modeFixture.rejectNext=true)
await modes.getByRole('textbox',{name:'消息',exact:true}).fill('未发送的审批回归检查')
await chooseMode('Ask First')
if(!await modeButton.isDisabled()||!await modes.getByRole('button',{name:'发送',exact:true}).isDisabled())throw Error('Permission update permits duplicate actions')
await modes.getByText('模式切换失败，请重试',{exact:true}).waitFor();await expectMode('Full access')
await modes.waitForFunction(()=>!document.querySelector('.mode-button').disabled)
await chooseMode('Auto approve');await expectMode('Auto approve')
if(await modes.evaluate(()=>window.__modeFixture.lastMode)!=='auto')throw Error('Renderer did not send the auto mode to the main process')
// A change belongs to its own session only.
await selectSession('Ask session');await expectMode('Ask First')
await selectSession('Auto session');await expectMode('Auto approve')
await selectSession('Full session');await expectMode('Auto approve')
// Draft sessions default to ask and never write an engine rule.
const writes=await fixtureWrites()
await modes.getByRole('button',{name:'新会话',exact:false}).first().click();await expectMode('Ask First')
await chooseMode('Full access');await expectMode('Full access')
if(await fixtureWrites()!==writes)throw Error('Draft mode change reached the engine')
await modes.getByRole('button',{name:'新会话',exact:false}).first().click();await expectMode('Ask First')
// A stale read arriving after a successful PATCH cannot revert that session's label.
await modes.evaluate(()=>window.__modeFixture.delayRead=600)
await selectSession('Full session');await expectMode('Auto approve')
await chooseMode('Full access');await expectMode('Full access')
await modes.waitForTimeout(700);await expectMode('Full access')
// A delayed write for another session must not change the current label.
await modes.evaluate(()=>{window.__modeFixture.delayWrite=300;window.__modeFixture.delayRead=0})
await chooseMode('Ask First');await selectSession('Ask session');await expectMode('Ask First')
await modes.waitForFunction(()=>!document.querySelector('.mode-button').disabled)
await expectMode('Ask First')
await modes.screenshot({path:'.review/session-mode.png'})

// Session list: drag order, pin, rename, fork, archive and one-tap answers.
const listed=await browser.newPage({viewport:{width:1440,height:900}})
listed.on('pageerror',e=>errors.push(e.message))
await listed.addInitScript(()=>{
 const state={version:1,language:'zh',sidebar:280,panel:420,fontSize:14,bots:[],projects:[],schedules:[],starred:[],sessionPrefs:{},sessionOrder:[]}
 const sessions=[
  {id:'ses_one',title:'价格监控',permissions:[{action:'*',resource:'*',effect:'ask'}],appMode:'ask'},
  {id:'ses_two',title:'重构登录',permissions:[{action:'*',resource:'*',effect:'ask'}],appMode:'ask'},
  {id:'ses_three',title:'周报',permissions:[{action:'*',resource:'*',effect:'ask'}],appMode:'ask'}
 ]
 const copy=value=>JSON.parse(JSON.stringify(value))
 window.__listFixture={answer:null,answered:false,order:[]}
 window.nxncode={on:()=>()=>{},invoke:async(action,args={})=>{
  if(action==='bootstrap')return {state,engine:{status:'ready',version:'2.0.32'},demo:{url:''},tabs:[]}
  if(action==='catalog')return {models:[],integrations:[]}
  if(action==='sessions')return copy(sessions)
  if(action==='preferences'){Object.assign(state,args);return copy(state)}
  if(action==='session.prefs'){const current={...(state.sessionPrefs[args.id]||{})};if(typeof args.pinned==='boolean')current.pinned=args.pinned;if(typeof args.archived==='boolean')current.archived=args.archived;if(!current.pinned&&!current.archived)delete state.sessionPrefs[args.id];else state.sessionPrefs[args.id]=current;return copy(state.sessionPrefs)}
  if(action==='session.order'){state.sessionOrder=copy(args.ids);window.__listFixture.order=copy(args.ids);return state.sessionOrder}
  if(action==='session.rename'){const session=sessions.find(item=>item.id===args.id);if(session)session.title=args.title;return copy(session)}
  if(action==='session.fork'){const source=sessions.find(item=>item.id===args.id);const fork={...copy(source),id:'ses_fork',title:(source?.title||'会话')+' 副本'};sessions.unshift(fork);return copy(fork)}
  if(action==='session.get')return copy(sessions.find(item=>item.id===args.id))
  if(action==='session.messages')return {messages:[],permissions:[],active:false,forms:args.id==='ses_two'&&!window.__listFixture.answered?[{id:'form_env',title:'部署环境',fields:[{key:'env',title:'环境',type:'string',required:true,options:[{value:'staging',label:'预发布',description:'先验证再上线'},{value:'prod',label:'正式环境',description:'直接发布'}]}]}]:[]}
  if(action==='session.form'){window.__listFixture.answer=copy(args.answer);window.__listFixture.answered=true;return true}
  return undefined
 }}
})
await listed.goto('http://127.0.0.1:5187');await listed.locator('.welcome').waitFor();await listed.evaluate(()=>document.fonts.ready)
const sessionRows=()=>listed.locator('.session-row')
if(await sessionRows().count()!==3)throw Error('Session list did not render engine sessions')
await listed.screenshot({path:'.review/session-list.png'})
await sessionRows().nth(2).dragTo(sessionRows().nth(0),{targetPosition:{x:40,y:6}})
await listed.waitForFunction(()=>window.__listFixture.order.length===3)
const order=await listed.evaluate(()=>window.__listFixture.order)
if(order[0]!=='ses_three')throw Error('Drag did not move the session to the top: '+order.join(','))
await sessionRows().first().hover();await sessionRows().first().locator('.chat-more').click()
await listed.getByRole('menuitem',{name:'置顶会话'}).click()
await listed.locator('.pinned-label').waitFor()
if(!(await sessionRows().first().getAttribute('class')).includes('pinned'))throw Error('Pinned session is not marked')
await sessionRows().first().hover();await sessionRows().first().locator('.chat-more').click()
await listed.getByRole('menuitem',{name:'重命名'}).click()
const rename=listed.getByRole('textbox',{name:'会话名称'})
await rename.fill('季度复盘');await rename.press('Enter')
await listed.locator('.session-list').getByText('季度复盘',{exact:true}).waitFor()
const forkSource=sessionRows().filter({hasText:'价格监控'}).first()
await forkSource.hover();await forkSource.locator('.chat-more').click()
await listed.getByRole('menuitem',{name:'分叉会话'}).click()
await listed.locator('.session-list').getByText('价格监控 副本',{exact:true}).waitFor()
const archivedRow=sessionRows().filter({hasText:'重构登录'}).first()
await archivedRow.hover();await archivedRow.locator('.chat-more').click()
await listed.getByRole('menuitem',{name:'归档会话'}).click()
await listed.locator('.archive-toggle').waitFor()
if(await listed.locator('.session-list').getByText('重构登录',{exact:true}).isVisible())throw Error('Archived session stayed in the active list')
await listed.locator('.archive-toggle').click();await listed.locator('.session-list').getByText('重构登录',{exact:true}).waitFor()
await sessionRows().filter({hasText:'重构登录'}).first().click()
await listed.locator('.choice').first().waitFor()
if(await listed.locator('.choice').count()!==2)throw Error('Question options are not rendered as choices')
await listed.getByRole('radio',{name:/正式环境/}).click()
await listed.waitForFunction(()=>window.__listFixture.answer?.env==='prod')
await listed.locator('.choice').first().waitFor({state:'detached'})
await listed.screenshot({path:'.review/session-choices.png'})
await writeFile('.review/session-modes.json',JSON.stringify({menuHasThreeModes:true,perSession:true,newSessionAskFirst:true,draftDoesNotWriteEngine:true,failedChangePreservesMode:true,pendingDisablesSend:true,staleReadIgnored:true,delayedWriteIsolated:true},null,2))
await writeFile('.review/ui-errors.json',JSON.stringify(errors,null,2));console.log(JSON.stringify({errors,screenshots:16,visualFixture:true,effortSlider:true,sessionModes:true,sessionList:true,noFixedExamples:true}));await browser.close();server.kill()
if(errors.length)process.exitCode=1

