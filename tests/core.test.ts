import test from 'node:test'
import assert from 'node:assert/strict'
import {mkdtemp,writeFile,mkdir,symlink,rm,readFile as read} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import path from 'node:path'
import {promisify} from 'node:util'
import {execFile} from 'node:child_process'
import {nextOccurrence,due,retryDelay,localParts} from '../src/shared/schedule'
import {within,gitStatus,gitDiff} from '../src/main/workspace'
import {Store} from '../src/main/store'
import {messageID} from '../src/main/identifier'
import {demoOrders,demoWeekly,demoTotal} from '../src/shared/demo'
const exec=promisify(execFile)
test('daily and weekly schedules skip missed runs and preserve local clock across DST',()=>{
 const daily={kind:'daily' as const,at:'2026-03-07T09:00:00-05:00',timeZone:'America/New_York'}
 const next=nextOccurrence(daily,Date.parse(daily.at));assert.equal(new Date(next).toISOString(),'2026-03-08T13:00:00.000Z')
 assert.equal(localParts(next,daily.timeZone).hour,'09')
 const week={kind:'weekly' as const,at:'2026-10-19T09:00:00+08:00',timeZone:'Asia/Shanghai'}
 assert.equal(new Date(nextOccurrence(week,Date.parse('2026-11-02T09:05:00+08:00'))).toISOString(),'2026-11-09T01:00:00.000Z')
 assert.equal(nextOccurrence({...daily,kind:'once'},Date.parse(daily.at)),Infinity)
})
test('retry backoff and due state',()=>{assert.deepEqual([1,2,3,8].map(retryDelay),[60000,120000,240000,1800000]);const s:any={enabled:true,nextRunAt:100,retryAt:300};assert.equal(due(s,200),false);assert.equal(due(s,300),true);s.enabled=false;assert.equal(due(s,500),false)})
test('project access denies symlink escape and Git handles spaces and Chinese',async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),'nxn-work-'));const outside=await mkdtemp(path.join(tmpdir(),'nxn-out-'))
 try{await writeFile(path.join(outside,'secret'),'outside');await symlink(outside,path.join(dir,'escape'));await assert.rejects(within(dir,'escape/secret'))
 await exec('git',['init','-q'],{cwd:dir});await exec('git',['config','user.name','Test'],{cwd:dir});await exec('git',['config','user.email','test@example.invalid'],{cwd:dir})
 const name='中文 file.txt';await writeFile(path.join(dir,name),'before\n');await exec('git',['add','--',name],{cwd:dir});await exec('git',['commit','-qm','fixture'],{cwd:dir});await writeFile(path.join(dir,name),'after\n');assert.equal((await gitStatus(dir))[0].path,name);const diff=await gitDiff(dir,name);assert.equal(diff.original,'before\n');assert.equal(diff.modified,'after\n')
 }finally{await rm(dir,{recursive:true,force:true});await rm(outside,{recursive:true,force:true})}
})
test('atomic app state keeps latest queued write and reopens',async()=>{const root=await mkdtemp(path.join(tmpdir(),'nxn-state-'));try{const store=new Store(root);await store.load();store.state.language='en';const a=store.save();store.state.language='zh';const b=store.save();await Promise.all([a,b]);const reopened=new Store(root);await reopened.load();assert.equal(reopened.state.language,'zh');assert.equal(JSON.parse(await read(path.join(root,'state.json'),'utf8')).version,1)}finally{await rm(root,{recursive:true,force:true})}})
test('message IDs preserve engine format and are unique',()=>{const ids=Array.from({length:100},()=>messageID(100000));assert.equal(new Set(ids).size,100);assert.ok(ids.every(id=>/^msg_[a-f0-9]{12}[A-Za-z0-9]{14}$/.test(id)));assert.ok(ids[0]<ids[1])})
test('demo CSV data reconciles with daily chart totals',()=>{assert.equal(demoOrders.length,912);assert.equal(Math.round(demoOrders.reduce((n,o)=>n+o.amount,0)*100),Math.round(demoTotal*100));assert.equal(Math.round(demoWeekly.reduce((n,v)=>n+v,0)*100),Math.round(demoTotal*100));assert.ok(demoWeekly[4]>demoWeekly[0])})

