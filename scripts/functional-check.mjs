import {_electron} from 'playwright'
import path from 'node:path'
import {mkdir,writeFile,stat,readFile} from 'node:fs/promises'
const application=await _electron.launch({executablePath:path.resolve('node_modules/electron/dist/electron'),args:['.'],env:{...process.env,NXNCODE_DATA_DIR:path.resolve('.runtime'),NXNCODE_TEST_FIXTURES:'1'}})
const p=await application.firstWindow()
const invoke=(action,args={})=>p.evaluate(({action,args})=>window.nxncode.invoke(action,args),{action,args})
process.on('uncaughtException',async error=>{console.error(error.message);await application.close().catch(()=>{});process.exit(1)})
let booting;for(let i=0;i<120;i++){try{booting=await invoke('bootstrap');if(booting.engine.status==='ready')break;if(booting.engine.status==='error')throw Error(booting.engine.detail)}catch(e){if(i>20)throw e}await new Promise(r=>setTimeout(r,500))}
if(booting?.engine.status!=='ready')throw Error('Engine startup did not complete: '+JSON.stringify(booting?.engine))
const boot=await invoke('bootstrap');const root=boot.state.projects[0];const model={id:'glm-5.3-flash-free',providerID:'opencode',variant:'low'}
const results={}
const catalog=await invoke('catalog');if(catalog.models.some(m=>'settings'in m))throw Error('Model catalog leaks runtime settings')
results.catalog={models:catalog.models.length,isolated:true}
const files=await invoke('files.list',{root});if(!files.some(f=>f.name==='中文 file.txt'))throw Error('File list failed')
const changes=await invoke('git.status',{root});const diff=await invoke('git.diff',{root,path:'中文 file.txt'});if(diff.original!=='before\n'||diff.modified!=='after\n')throw Error('Diff mismatch')
results.git={file:changes[0].path,diff:true};console.log('PASS files and Git')
const term=await p.evaluate(async root=>{let output='';let termID='';const off=window.nxncode.on('terminal',e=>{if(e.id===termID)output+=e.data});termID=await window.nxncode.invoke('terminal.open',{root});await window.nxncode.invoke('terminal.write',{id:termID,data:"printf 'NXNCODE_PTY_OK\\n'\r"});await new Promise(r=>setTimeout(r,600));await window.nxncode.invoke('terminal.close',{id:termID});off();return output.includes('NXNCODE_PTY_OK')},root)
if(!term)throw Error('PTY output missing');results.terminal=true;console.log('PASS real PTY')
const bot=await invoke('bot.save',{name:'Smoke Scout',job:'Only follow the local smoke test task. No external services.',look:{color:'lime',shape:'squircle',face:'calm'},project:root,model})
const schedule=await invoke('schedule.add',{botID:bot.id,kind:'once',at:new Date(Date.now()+2000).toISOString(),text:'Reply exactly SCHEDULE_OK. Do not use tools or external services.',timeZone:'Asia/Shanghai'})
await p.waitForFunction(async id=>{const s=(await window.nxncode.invoke('bootstrap')).state.schedules.find(s=>s.id===id);return s&&!s.enabled},schedule.id,{timeout:65000})
results.schedule={bot:bot.id,queuedOnce:true};console.log('PASS persisted bot and scheduled delivery')
const session=await invoke('session.create',{directory:root,title:'Browser/report acceptance',model,mode:'build'})
await invoke('session.send',{id:session.id,text:'Local app acceptance test. Only work on local test data, no external websites. 1) Use nxncode-tools_browser_navigate to open '+boot.demo.url+'. 2) Use nxncode-tools_browser_click to click Export CSV. Files will be downloaded into '+boot.root+'/artifacts/'+session.id+'. 3) Use a shell command to read that CSV and compute order count and total. 4) Write report.html in your current project folder with those real values. 5) Use nxncode-tools_show_widget to display a small inline SVG chart of real daily totals; embed all data. 6) Use nxncode-tools_show_in_panel to open report.html. Finish with a short Chinese summary. Never use another browser backend or cloud memory.'})
let settled=false;let snapshot
for(let i=0;i<90;i++){await new Promise(r=>setTimeout(r,2000));snapshot=await invoke('session.messages',{id:session.id});if(!snapshot.active&&snapshot.messages.some(m=>m.type==='idle')){settled=true;break}}
if(!settled)throw Error('Model flow timed out')
const calls=snapshot.messages.flatMap(m=>(m.content||[]).filter(c=>c.type==='tool'));const summary=calls.map(c=>({name:c.name,status:c.state.status,error:c.state.error?.message}))
results.modelFlow={sessionID:session.id,tools:summary}
await mkdir('.review',{recursive:true});await writeFile('.review/functional.json',JSON.stringify(results,null,2))
console.log(JSON.stringify(results))
const navigate=calls.find(c=>c.name.endsWith('browser_navigate'));const click=calls.find(c=>c.name.endsWith('browser_click'));const widget=calls.find(c=>c.name.endsWith('show_widget'));if(!navigate||!click||!widget||[navigate,click,widget].some(c=>c.state.status!=='completed'))throw Error('Required browser tools did not complete')
const report=await readFile(root+'/report.html','utf8');if(!report.includes('912'))throw Error('Report missing real count')
const pdf=await invoke('artifact.pdf',{root,path:root+'/report.html'});if((await stat(pdf)).size<1000)throw Error('PDF export failed')
results.report={html:true,pdf:true};await writeFile('.review/functional.json',JSON.stringify(results,null,2));console.log('PASS live CSV analysis, chart, report and PDF')
// Main bot management: only the main bot session may use the bot_* tools.
async function settle(id){let snap;for(let i=0;i<90;i++){await new Promise(r=>setTimeout(r,2000));snap=await invoke('session.messages',{id});if(!snap.active&&snap.messages.some(m=>m.type==='idle'))return snap}throw Error('Model flow timed out: '+id)}
const mainBot=await invoke('bot.create',{name:'Functional Main',job:'Coordinate the other bots in local checks.',model})
await invoke('bot.main',{id:mainBot.id})
const mainSession=(await invoke('bootstrap')).state.bots.find(b=>b.id===mainBot.id).sessionID
await invoke('session.send',{id:mainSession,text:'主 Bot 管理自检：立即调用一次 nxncode-tools_bot_create，参数 name="Functional Worker"、job="Assist local checks."。只创建这一个 Bot，不要做其他操作，然后用一句中文回报结果。'})
const mainSnap=await settle(mainSession)
const worker=(await invoke('bootstrap')).state.bots.find(b=>b.name==='Functional Worker')
if(!worker)throw Error('Main bot did not create a worker bot')
const mainCalls=mainSnap.messages.flatMap(m=>(m.content||[]).filter(c=>c.type==='tool'&&c.name.endsWith('bot_create')))
if(!mainCalls.length||mainCalls.some(c=>c.state.status!=='completed'))throw Error('Main bot bot_create did not complete: '+JSON.stringify(mainCalls.map(c=>c.state)))
results.mainBot={session:mainSession,created:worker.id}
const plain=await invoke('session.create',{directory:root,title:'Functional plain',model,mode:'build'})
await invoke('session.send',{id:plain.id,text:'权限边界自检：立即调用一次 nxncode-tools_bot_list（参数 {}）。即使失败也必须调用，不要使用其他工具，然后简短回报。'})
const plainSnap=await settle(plain.id)
const plainCalls=plainSnap.messages.flatMap(m=>(m.content||[]).filter(c=>c.type==='tool'&&c.name.endsWith('bot_list')))
if(!plainCalls.length||plainCalls[0].state.status!=='error'||!String(plainCalls[0].state.error?.message||'').includes('只有主 Bot'))throw Error('Plain session could use main-bot tools: '+JSON.stringify(plainCalls.map(c=>c.state)))
results.mainBot.plainRefused=true
await invoke('bot.delete',{id:worker.id})
await invoke('session.delete',{id:plain.id})
await invoke('bot.delete',{id:mainBot.id})
await writeFile('.review/functional.json',JSON.stringify(results,null,2))
console.log('PASS main bot management and plain-session refusal')
await application.close()

