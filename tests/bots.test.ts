import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm, readFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { Store } from '../src/main/store'
import { BotService } from '../src/main/bots'
import type { Engine } from '../src/main/engine'
import type { Bot } from '../src/shared/types'

const look={color:'mint',shape:'squircle',face:'calm'}

async function setup(){
 const root=await mkdtemp(path.join(os.tmpdir(),'nxncode-bots-'))
 const store=new Store(root)
 await store.load()
 const calls:{method:string;endpoint:string;body:unknown}[]=[]
 const engine={state:{status:'ready',version:'2.0.32'},request:async(method:string,endpoint:string,body?:unknown)=>{calls.push({method,endpoint,body});if(method==='POST'&&endpoint==='api/session')return {data:{id:'ses_created'}};if(endpoint==='api/session/active')return {data:{}};if(endpoint.includes('/message'))return {data:[]};return {data:{}}}} as unknown as Engine
 const bots=new BotService(store,engine,()=>store.save(),(value:string)=>value)
 const add=(id:string,sessionID:string,extra:Partial<Bot>={})=>{const bot:Bot={id,name:id,job:'work',look,project:'',sessionID,paused:false,...extra};store.state.bots.push(bot);return bot}
 return {root,store,bots,calls,add,cleanup:()=>rm(root,{recursive:true,force:true})}
}

test('bot permissions bind to the main bot session only',async()=>{
 const ctx=await setup()
 try{
  // Old state files predate mainBotID: undefined simply means "nothing selected".
  assert.equal(ctx.store.state.mainBotID,undefined)
  ctx.add('bot_a','ses_a');ctx.add('bot_b','ses_b')
  await ctx.bots.setMain('bot_a')
  assert.equal(ctx.bots.isMainSession('ses_a'),true)
  assert.equal(ctx.bots.isMainSession('ses_b'),false)
  assert.equal(ctx.bots.isMainSession('ses_forged'),false)
  assert.equal(ctx.bots.isMainSession(undefined),false)
  await ctx.bots.setMain(null)
  assert.equal(ctx.bots.isMainSession('ses_a'),false)
  const state=JSON.parse(await readFile(path.join(ctx.root,'state.json'),'utf8'))
  assert.equal('mainBotID' in state,false)
 }finally{await ctx.cleanup()}
})

test('deleting the main bot clears the pointer and keeps other bots',async()=>{
 const ctx=await setup()
 try{
  ctx.add('bot_a','ses_a');ctx.add('bot_b','ses_b')
  await ctx.bots.setMain('bot_a')
  await ctx.bots.remove('bot_a')
  assert.equal(ctx.bots.mainBot(),undefined)
  assert.equal(ctx.store.state.mainBotID,undefined)
  assert.deepEqual(ctx.store.state.bots.map(b=>b.id),['bot_b'])
  const state=JSON.parse(await readFile(path.join(ctx.root,'state.json'),'utf8'))
  assert.deepEqual(state.bots.map((b:Bot)=>b.id),['bot_b'])
 }finally{await ctx.cleanup()}
})

test('retried bot runs are idempotent and paused bots stay idle',async()=>{
 const ctx=await setup()
 try{
  ctx.add('bot_a','ses_a')
  const first=await ctx.bots.run('bot_a','snapshot prices','op-1')
  const retry=await ctx.bots.run('bot_a','snapshot prices','op-1')
  assert.equal(first.messageID,retry.messageID)
  assert.equal(ctx.calls.filter(c=>c.endpoint.endsWith('/prompt')).length,1)
  await ctx.bots.run('bot_a','snapshot prices','op-2')
  assert.equal(ctx.calls.filter(c=>c.endpoint.endsWith('/prompt')).length,2)
  await ctx.bots.pause('bot_a',true)
  await assert.rejects(()=>ctx.bots.run('bot_a','again'),/暂停/)
 }finally{await ctx.cleanup()}
})

test('schedules reject past times and survive a restart',async()=>{
 const ctx=await setup()
 try{
  ctx.add('bot_a','ses_a')
  await assert.rejects(()=>ctx.bots.addSchedule({botID:'bot_a',kind:'once',at:new Date(Date.now()-60000).toISOString(),text:'x'}),/未来的时间/)
  const at=new Date(Date.now()+3600000).toISOString()
  const s=await ctx.bots.addSchedule({botID:'bot_a',kind:'daily',at,text:'brief'})
  assert.equal(ctx.store.state.schedules.length,1)
  const reopened=new Store(ctx.root);await reopened.load()
  assert.equal(reopened.state.schedules[0].id,s.id)
  await ctx.bots.removeSchedule(s.id)
  assert.equal(ctx.store.state.schedules.length,0)
 }finally{await ctx.cleanup()}
})

test('bot create and update validate names and keep avatars inside the palette',async()=>{
 const ctx=await setup()
 try{
  await assert.rejects(()=>ctx.bots.create({name:'  '}),/名称/)
  const created=await ctx.bots.create({name:'Scout',job:'watch',color:'lime',shape:'gem',face:'bright'})
  assert.equal(created.look.color,'lime')
  const updated=await ctx.bots.update(created.id,{color:'not-a-color'})
  assert.equal(updated.look.color,'lime')
  assert.equal(updated.look.face,'bright')
 }finally{await ctx.cleanup()}
})
