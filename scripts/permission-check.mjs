import {_electron} from 'playwright'
import path from 'node:path'
import {writeFile} from 'node:fs/promises'
import assert from 'node:assert/strict'
const application=await _electron.launch({executablePath:path.resolve('dist/linux-unpacked/nxncode'),args:[],env:{...process.env,NXNCODE_DATA_DIR:path.resolve('.runtime')}})
const page=await application.firstWindow();const invoke=(action,args={})=>page.evaluate(({action,args})=>window.nxncode.invoke(action,args),{action,args})
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms))
try{
 for(let i=0;i<120;i++){const boot=await invoke('bootstrap');if(boot.engine.status==='ready')break;if(boot.engine.status==='error')throw Error(boot.engine.detail);await delay(500)}
 const session=await invoke('session.create',{title:'Ask First acceptance',model:{id:'glm-5.3-flash-free',providerID:'opencode',variant:'low'},mode:'ask'})
 await invoke('session.send',{id:session.id,text:'Run the shell command printf NXNCODE_PERMISSION_OK using the actual shell tool. Reply with the output. Wait for permission when asked. Do not use any other tools or make any other changes.'})
 const approved=new Set();let complete=false
 for(let i=0;i<90;i++){
  await delay(1000);const snapshot=await invoke('session.messages',{id:session.id})
  const tools=snapshot.messages.flatMap(m=>(m.content||[]).filter(c=>c.type==='tool'))
  for(const permission of snapshot.permissions||[]){assert.ok(!tools.some(c=>c.name==='shell'&&c.state.status==='completed'),'Command ran before approval');await invoke('session.permission',{id:session.id,permission:permission.id,decision:'once'});approved.add(permission.id)}
  if(!snapshot.active&&snapshot.messages.some(m=>m.type==='idle')){complete=tools.some(c=>c.state.status==='completed'&&JSON.stringify(c.state).includes('NXNCODE_PERMISSION_OK'));break}
 }
 assert.ok(approved.size>0,'No approval request was presented');assert.ok(complete,'Approved command did not complete')
 const result={askedBeforeCommand:true,onceAccepted:true,requests:approved.size,completed:true};await writeFile('.review/permissions.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result))
}finally{await application.close()}
