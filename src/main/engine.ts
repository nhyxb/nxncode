// API and environment isolation adapted from Kuvo Code; see THIRD_PARTY_NOTICES.md.
import { EventEmitter } from 'node:events'
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { promises as fs, createReadStream } from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { createInterface } from 'node:readline'
import { promisify } from 'node:util'
import { execFile } from 'node:child_process'
import type { EngineState, Wire } from '../shared/types'
const exec=promisify(execFile)
export const VERSION='2.0.32'
export const INTEGRITY:Record<string,string>={x64:'Q50ofBQ3gdwjD6ZQhrVR8fVlm8D2xPMshy4dynY6l6b+qLdKgBSJ9WpoaDyrQX1YWmf2s7IN4RbXmoXXdJitDA==',arm64:'YR5O03irvmot/G0f8W49ehvhn5uqCFN3vf9JTsChvf47W6ldjKCNvsaCSXS2SP26dPOUMQBn7WqbKnyHzrNR5w=='}
export function verifyArchive(bytes:Buffer, arch:string){if(createHash('sha512').update(bytes).digest('base64')!==INTEGRITY[arch])throw Error('Engine checksum mismatch')}
export class Engine extends EventEmitter {
 state:EngineState={status:'stopped',version:VERSION};process?:ChildProcessWithoutNullStreams
 private url=''; private password=''; private abort?:AbortController;private starting?:Promise<void>;private stopped=false
 constructor(public root:string,private mcp:()=>Wire){super()}
 private update(status:EngineState['status'],detail?:string,progress?:number){this.state={status,detail,progress,version:VERSION};this.emit('state',this.state)}
 async installed(){try{const p=path.join(this.root,'bin',VERSION,'opencode');const expected=(await fs.readFile(p+'.sha256','utf8')).trim();const hash=createHash('sha256');for await(const chunk of createReadStream(p))hash.update(chunk);return expected===hash.digest('hex')?p:undefined}catch{return undefined}}
 async install(){
 const existing=await this.installed();if(existing)return existing
 if(!INTEGRITY[process.arch])throw Error('Unsupported architecture')
 this.update('installing','正在下载并校验 OpenCode 2.0.32',0)
 const url='https://registry.npmjs.org/@opencode/cli-linux-'+process.arch+'/-/cli-linux-'+process.arch+'-'+VERSION+'.tgz'
 const response=await fetch(url,{signal:AbortSignal.timeout(180000)});if(!response.ok)throw Error('Engine download: HTTP '+response.status)
 const chunks:Buffer[]=[];let size=0;const total=Number(response.headers.get('content-length')||0)
 for await(const chunk of response.body! as any){chunks.push(Buffer.from(chunk));size+=chunk.length;this.update('installing','正在下载 OpenCode',total?size/total:undefined)}
 const bytes=Buffer.concat(chunks);verifyArchive(bytes,process.arch)
 const stage=path.join(this.root,'bin','.stage-'+randomUUID());await fs.mkdir(stage,{recursive:true,mode:0o700})
 try{const archive=path.join(stage,'engine.tgz');await fs.writeFile(archive,bytes,{mode:0o600});await exec('tar',['-xzf',archive,'-C',stage,'package/bin/opencode']);const dest=path.join(this.root,'bin',VERSION);await fs.mkdir(dest,{recursive:true});const binary=path.join(dest,'opencode');await fs.copyFile(path.join(stage,'package/bin/opencode'),binary);await fs.chmod(binary,0o700);await fs.writeFile(binary+'.sha256',createHash('sha256').update(await fs.readFile(binary)).digest('hex'),{mode:0o600});return binary}finally{await fs.rm(stage,{recursive:true,force:true})}
 }
 start(){if(this.state.status==='ready')return Promise.resolve();if(this.starting)return this.starting;this.starting=this.launch().catch(e=>{this.update('error',e.message);throw e}).finally(()=>{this.starting=undefined});return this.starting}
 private async launch(){
 this.stopped=false;const binary=await this.install();this.update('starting','正在启动独立引擎')
 const env:NodeJS.ProcessEnv={}
 for(const key of ['HOME','USER','LOGNAME','PATH','SHELL','LANG','LC_ALL','LC_CTYPE','TERM','DISPLAY','WAYLAND_DISPLAY','XDG_RUNTIME_DIR','DBUS_SESSION_BUS_ADDRESS','SSH_AUTH_SOCK','HTTP_PROXY','HTTPS_PROXY','ALL_PROXY','NO_PROXY','http_proxy','https_proxy','all_proxy','no_proxy'])if(process.env[key]!==undefined)env[key]=process.env[key]
 const names=['XDG_DATA_HOME','XDG_CONFIG_HOME','XDG_STATE_HOME','XDG_CACHE_HOME','npm_config_cache','BUN_INSTALL']
 const targets=['data','config','state','cache','cache/npm','cache/bun']
 for(let i=0;i<names.length;i++){env['NXNCODE_OWN_'+names[i]]=process.env[names[i]]||'';env[names[i]]=path.join(this.root,targets[i]);await fs.mkdir(env[names[i]]!,{recursive:true,mode:0o700})}
 const tmp=await fs.mkdtemp(path.join(os.tmpdir(),'nxn-'));env.TMPDIR=tmp;this.password=randomBytes(32).toString('base64url');env.OPENCODE_PASSWORD=this.password;env.OPENCODE_CLIENT='desktop';env.OPENCODE_CONFIG_CONTENT=JSON.stringify(this.mcp())
 const config=path.join(this.root,'config/opencode');await fs.mkdir(path.join(config,'plugins'),{recursive:true})
 await fs.writeFile(path.join(config,'plugins/nxncode.js'),`export default {id:'nxncode.commands',setup:async ctx=>{await ctx.shell.hook('create.before',input=>{for(const k of ['OPENCODE_CONFIG_CONTENT','OPENCODE_PASSWORD','OPENCODE_SERVER_PASSWORD'])delete input.env[k];for(const key of Object.keys(input.env)){if(!key.startsWith('NXNCODE_OWN_'))continue;const name=key.slice(12);const value=input.env[key];delete input.env[key];if(value)input.env[name]=value;else delete input.env[name]}})}}`,{mode:0o600})
 const cwd=path.join(this.root,'workspace');await fs.mkdir(cwd,{recursive:true})
 this.process=spawn(binary,['serve','--stdio','--port','0'],{cwd,env,stdio:'pipe'})
 const child=this.process
 child.stderr.on('data',()=>{}) // never forward credential-bearing engine logs to UI
 child.on('exit',()=>{this.abort?.abort();void fs.rm(tmp,{recursive:true,force:true});if(!this.stopped)this.update('error','引擎已停止，请重试连接')})
 this.url=await new Promise<string>((resolve,reject)=>{const timeout=setTimeout(()=>{child.kill();reject(Error('Engine startup timed out'))},60000);const reader=createInterface({input:child.stdout});reader.once('line',line=>{clearTimeout(timeout);try{const u=new URL(JSON.parse(line).url);if(u.hostname!=='127.0.0.1'&&u.hostname!=='localhost')throw Error('Invalid engine address');resolve(u.origin)}catch{reject(Error('Invalid engine handshake'))}});child.once('error',e=>{clearTimeout(timeout);reject(e)});child.once('exit',()=>{clearTimeout(timeout);reject(Error('Engine exited during startup'))})})
 this.update('ready');void this.events()
 }
 async request(method:string,endpoint:string,body?:unknown,directory?:string){
 if(this.state.status!=='ready')throw Error('引擎尚未就绪，请先启动引擎')
 const headers:Record<string,string>={Authorization:'Basic '+Buffer.from('opencode:'+this.password).toString('base64')}
 if(body!==undefined)headers['Content-Type']='application/json'
 if(directory)headers['x-opencode-directory']=encodeURIComponent(directory)
 const res=await fetch(this.url+'/'+endpoint.replace(/^\//,''),{method,headers,body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(60000)})
 if(!res.ok){const error=await res.json().catch(()=>({}));throw Error(error.message||error.error?.message||'Engine HTTP '+res.status)}
 if(res.status===204)return null
 const text=await res.text();if(!text)return null;const data=JSON.parse(text);return data
 }
 private async events(){
 let wait=1000
 while(!this.stopped&&this.state.status==='ready'){
 this.abort=new AbortController()
 try{
 const res=await fetch(this.url+'/api/event',{headers:{Authorization:'Basic '+Buffer.from('opencode:'+this.password).toString('base64')},signal:this.abort.signal});if(!res.ok||!res.body)throw Error('Event stream unavailable')
 this.emit('event',{type:'reconnected'});wait=1000;let buffer=''
 const reader=res.body.getReader();const decoder=new TextDecoder()
 while(!this.stopped){let heartbeat:NodeJS.Timeout|undefined;const result=await Promise.race([reader.read(),new Promise<never>((_,reject)=>{heartbeat=setTimeout(()=>reject(Error('Heartbeat timeout')),45000);heartbeat.unref()})]).finally(()=>{if(heartbeat)clearTimeout(heartbeat)});if(result.done)break;buffer=(buffer+decoder.decode(result.value,{stream:true})).replace(/\r\n/g,'\n');let end;while((end=buffer.indexOf('\n\n'))>=0){const frame=buffer.slice(0,end);buffer=buffer.slice(end+2);const data=frame.split('\n').filter(l=>l.startsWith('data:')).map(l=>l.slice(5).trim()).join('\n');if(data){try{this.emit('event',JSON.parse(data))}catch{}}}}
 }catch{if(this.stopped)break;this.emit('event',{type:'disconnected'})}finally{this.abort.abort()}
 await new Promise(r=>{const t=setTimeout(r,wait);t.unref()});wait=Math.min(30000,wait*2)
 }
 }
 stop(){this.stopped=true;this.abort?.abort();const child=this.process;child?.stdin.end();const timer=setTimeout(()=>child?.kill('SIGTERM'),5000);timer.unref();this.update('stopped')}
}
export function unwrap<T=any>(value:any):T{return (value&&typeof value==='object'&&'data'in value?value.data:value) as T}

