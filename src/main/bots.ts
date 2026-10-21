import path from 'node:path'
import { promises as fs } from 'node:fs'
import { randomUUID } from 'node:crypto'
import type { Store } from './store'
import type { Engine } from './engine'
import { unwrap } from './engine'
import { messageID } from './identifier'
import type { Bot, Look, ModelRef, Schedule, Wire } from '../shared/types'
import { DEFAULT_LOOK, LOOK_COLORS, LOOK_FACES, LOOK_SHAPES } from '../shared/look'

const pick=(list:string[],value:unknown,fallback:string)=>typeof value==='string'&&list.includes(value)?value:fallback
const cleanLook=(value:any,base:Look=DEFAULT_LOOK):Look=>({color:pick(LOOK_COLORS,value?.color,base.color),shape:pick(LOOK_SHAPES,value?.shape,base.shape),face:pick(LOOK_FACES,value?.face,base.face)})
// The editor sends {look:{...}} while MCP tools send flat color/shape/face fields.
const avatar=(input:any,base?:Look)=>cleanLook({...input?.look,...input},base)
const cleanModel=(value:any):ModelRef|undefined=>value&&typeof value.id==='string'&&typeof value.providerID==='string'?{id:value.id,providerID:value.providerID,...(typeof value.variant==='string'?{variant:value.variant}:{})}:undefined

// One place where bots are created, configured, scheduled and deleted. Both the
// renderer (bot.* actions) and the main bot's MCP tools go through this service,
// so validation, persistence and idempotency cannot drift apart.
export class BotService{
 private operations=new Map<string,{at:number;value:any}>()
 constructor(private store:Store,private engine:Engine,private save:()=>Promise<void>,private project:(value:string)=>string){}
 private find(id:string){const bot=this.store.state.bots.find(b=>b.id===id);if(!bot)throw Error('找不到这个 Bot');return bot}
 private recall(key?:string){if(!key)return;const hit=this.operations.get(key);if(hit&&Date.now()-hit.at<600000)return hit;return undefined}
 private remember(key:string|undefined,value:unknown){if(!key)return;const now=Date.now();for(const [k,v] of this.operations)if(now-v.at>=600000)this.operations.delete(k);this.operations.set(key,{at:now,value})}
 private summary(bot:Bot){return {...bot,main:this.store.state.mainBotID===bot.id,ready:!!bot.sessionID,schedules:this.store.state.schedules.filter(s=>s.botID===bot.id).length}}
 list(){return this.store.state.bots.map(bot=>this.summary(bot))}
 get(id:string){return this.summary(this.find(id))}
 mainBot(){return this.store.state.bots.find(b=>b.id===this.store.state.mainBotID)}
 isMain(id?:string|null){return !!id&&this.store.state.mainBotID===id}
 isMainSession(sessionID?:string){const bot=this.mainBot();return !!sessionID&&!!bot?.sessionID&&bot.sessionID===sessionID}
 async setMain(id?:string|null){if(id){const bot=this.find(id);this.store.state.mainBotID=bot.id}else delete this.store.state.mainBotID;await this.save();return this.store.state.mainBotID||null}
 private async writeMemory(bot:Bot){const folder=await this.store.botFolder(bot.id);const memory=path.join(folder,'MEMORY.md');let memoryText=await fs.readFile(memory,'utf8').catch(()=>'# '+bot.name+'\n');const jobSection='## Job\n'+bot.job+'\n\n';memoryText=/^## Job\s*$/m.test(memoryText)?memoryText.replace(/^## Job\s*\n[\s\S]*?(?=^## |$(?![\s\S]))/m,jobSection):memoryText+'\n'+jobSection;await fs.writeFile(memory,memoryText,{mode:0o600});return memory}
 private async instructions(bot:Bot,memory:string){await this.engine.request('PUT','api/experimental/session/'+encodeURIComponent(bot.sessionID!)+'/instructions/entries/nxncode.bot',{value:'You are '+bot.name+'. Job: '+bot.job+'. Your local memory is '+memory+'. Read and update it for lasting context. Never use any cloud memory service.'+(this.isMain(bot.id)?' You are the main bot. The bot_* management tools are available to you; use them only when the user asks you to create, inspect or run other bots.':'' )})}
 private async ensureSession(bot:Bot){
 if(bot.sessionID)return
 if(this.engine.state.status!=='ready')throw Error('引擎尚未就绪，请先启动引擎')
 const memory=await this.writeMemory(bot)
 const folder=await this.store.botFolder(bot.id)
 const session=unwrap(await this.engine.request('POST','api/session',{title:bot.name,location:{directory:bot.project||folder},model:bot.model,permissions:[{action:'*',resource:'*',effect:'allow'}]}))
 bot.sessionID=session.id
 await this.instructions(bot,memory)
 await this.save()
 }
 async upsert(input:Wire){
 const name=String(input.name||'').trim().slice(0,80)
 if(!name)throw Error('请输入 Bot 名称')
 let bot=this.store.state.bots.find(b=>b.id===input.id)
 if(!bot){bot={id:'bot_'+randomUUID(),name,job:String(input.job||''),look:avatar(input),project:input.project?this.project(input.project):'',model:cleanModel(input.model),paused:false};this.store.state.bots.push(bot)}
 else Object.assign(bot,{name,job:String(input.job||''),look:avatar(input,bot.look),project:input.project?this.project(input.project):'',model:cleanModel(input.model)||bot.model})
 const memory=await this.writeMemory(bot)
 if(this.engine.state.status==='ready'){
  if(!bot.sessionID)await this.ensureSession(bot)
  if(bot.sessionID)await this.instructions(bot,memory)
  if(bot.sessionID&&bot.model)await this.engine.request('POST','api/session/'+encodeURIComponent(bot.sessionID)+'/model',{model:bot.model})
 }
 await this.save()
 return this.summary(bot)
 }
 async create(input:Wire){
 const name=String(input.name||'').trim().slice(0,80)
 if(!name)throw Error('请输入 Bot 名称')
 const operation=input.operationID?`create:${input.operationID}`:undefined
 const hit=this.recall(operation);if(hit)return hit.value
 const bot:Bot={id:'bot_'+randomUUID(),name,job:String(input.job||''),look:avatar(input),project:input.project?this.project(input.project):'',model:cleanModel(input.model),paused:false}
 this.store.state.bots.push(bot)
 if(this.engine.state.status==='ready')await this.ensureSession(bot)
 await this.save()
 const value=this.summary(bot)
 this.remember(operation,value)
 return value
 }
 async update(id:string,input:Wire){
 const bot=this.find(id)
 if('name' in input){const name=String(input.name||'').trim().slice(0,80);if(!name)throw Error('请输入 Bot 名称');bot.name=name}
 if('job' in input)bot.job=String(input.job||'')
 if('look' in input||'color' in input||'shape' in input||'face' in input)bot.look=avatar(input,bot.look)
 if('project' in input)bot.project=input.project?this.project(input.project):''
 if('model' in input)bot.model=cleanModel(input.model)
 const memory=await this.writeMemory(bot)
 if(this.engine.state.status==='ready'&&bot.sessionID){await this.instructions(bot,memory);if(bot.model)await this.engine.request('POST','api/session/'+encodeURIComponent(bot.sessionID)+'/model',{model:bot.model})}
 await this.save()
 return this.summary(bot)
 }
 async pause(id:string,paused:boolean){const bot=this.find(id);bot.paused=!!paused;await this.save();return this.summary(bot)}
 async run(id:string,text?:string,operationID?:string){
 const bot=this.find(id)
 if(bot.paused)throw Error('Bot 已暂停，请先恢复')
 const operation=operationID?`run:${id}:${operationID}`:undefined
 const hit=this.recall(operation);if(hit)return hit.value
 await this.ensureSession(bot)
 const message=messageID()
 await this.engine.request('POST','api/session/'+encodeURIComponent(bot.sessionID!)+'/prompt',{id:message,text:String(text||bot.job||'继续你负责的工作。'),delivery:'queue'})
 const value={botID:bot.id,messageID:message,queued:true}
 this.remember(operation,value)
 return value
 }
 async stop(id:string){const bot=this.find(id);if(!bot.sessionID)return {botID:bot.id,stopped:false};await this.engine.request('POST','api/session/'+encodeURIComponent(bot.sessionID)+'/interrupt');return {botID:bot.id,stopped:true}}
 async remove(id:string){
 const bot=this.find(id)
 if(bot.sessionID)await this.engine.request('POST','api/session/'+encodeURIComponent(bot.sessionID)+'/interrupt').catch(()=>{})
 this.store.state.bots=this.store.state.bots.filter(b=>b.id!==id)
 this.store.state.schedules=this.store.state.schedules.filter(s=>s.botID!==id)
 if(this.store.state.mainBotID===id)delete this.store.state.mainBotID
 await this.save()
 return true
 }
 schedules(botID:string){this.find(botID);return this.store.state.schedules.filter(s=>s.botID===botID)}
 async addSchedule(input:Wire,sessionID?:string){
 const bot=this.store.state.bots.find(b=>b.id===input.botID||b.id===input.id||(sessionID&&b.sessionID===sessionID))
 if(!bot)throw Error('请先创建 Bot')
 if(!['once','daily','weekly'].includes(input.kind)||!Number.isFinite(Date.parse(input.at)))throw Error('计划时间无效')
 new Intl.DateTimeFormat('en',{timeZone:input.timeZone||'Asia/Shanghai'})
 if(Date.parse(input.at)<Date.now()+1000)throw Error('请选择未来的时间')
 const s:Schedule={id:'wake_'+randomUUID(),botID:bot.id,kind:input.kind,at:input.at,timeZone:input.timeZone||'Asia/Shanghai',text:String(input.text||bot.job),nextRunAt:Date.parse(input.at),enabled:true}
 this.store.state.schedules.push(s)
 await this.save()
 return s
 }
 async removeSchedule(id:string){this.store.state.schedules=this.store.state.schedules.filter(s=>s.id!==id);await this.save();return true}
 async result(id:string){
 const bot=this.find(id)
 if(!bot.sessionID)return {botID:bot.id,ready:false,active:false,text:'',messages:0}
 const active=!!unwrap(await this.engine.request('GET','api/session/active'))?.[bot.sessionID]
 const messages=unwrap(await this.engine.request('GET','api/session/'+encodeURIComponent(bot.sessionID)+'/message?limit=15&order=desc'))||[]
 const last=messages.find((m:Wire)=>m.type==='assistant'||m.role==='assistant')
 const text=Array.isArray(last?.content)?last.content.filter((c:Wire)=>c.type==='text').map((c:Wire)=>c.text).join('\n').slice(0,4000):String(last?.text||'')
 return {botID:bot.id,ready:true,active,text,messages:messages.length}
 }
}
