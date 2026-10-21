// Tool protocol adapted from Kuvo Code; see THIRD_PARTY_NOTICES.md.
import http from 'node:http'
import { randomBytes, timingSafeEqual } from 'node:crypto'
import type { Wire } from '../shared/types'
const prop=(type:string,description?:string)=>({type,description})
const tool=(name:string,description:string,properties:Wire={},required:string[]=[])=>({name,description,inputSchema:{type:'object',properties,required,additionalProperties:false}})
export const tools=[
tool('browser_navigate','Open a URL in the visible browser. Returns numbered page elements.',{url:prop('string')},['url']),
tool('browser_snapshot','Observe the current visible page and numbered interactive elements.'),
tool('browser_click','Click element from latest snapshot.',{index:prop('integer')},['index']),
tool('browser_type','Type into input from latest snapshot; passwords require manual takeover.',{index:prop('integer'),text:prop('string'),clear:prop('boolean'),submit:prop('boolean')},['index','text']),
tool('browser_select','Select an option.',{index:prop('integer'),option:prop('string')},['index','option']),
tool('browser_hover','Hover element.',{index:prop('integer')},['index']),
tool('browser_scroll','Scroll page.',{direction:{type:'string',enum:['up','down']},pages:prop('number')},['direction']),
tool('browser_press','Press Enter, Escape, Tab, arrows or Backspace.',{key:prop('string')},['key']),
tool('browser_text','Read page text.'),tool('browser_screenshot','Capture page screenshot.'),tool('browser_back','Navigate back.'),
tool('browser_new_tab','Open another visible browser tab.',{url:prop('string')}),
tool('browser_tabs','List, switch or close this session’s tabs.',{action:{type:'string',enum:['list','switch','close']},tab:prop('string')}),
tool('browser_wait','Wait up to ten seconds then observe.',{seconds:prop('number')}),
tool('browser_save_pdf','Save visible report as PDF to task artifacts.',{path:prop('string')}),
tool('show_in_panel','Open an existing project or artifact file in the side panel.',{path:prop('string')},['path']),
tool('show_widget','Show a chart or interactive HTML in the conversation. Embed data and CSS/JS inline; no remote fetches. Use plain SVG/canvas for charts. Follow dark theme. No secrets.',{html:prop('string'),title:prop('string')},['html']),
tool('bot_schedule','Schedule this bot to run. Use once, daily or weekly. at must be ISO8601 with offset; default timezone Asia/Shanghai.',{kind:{type:'string',enum:['once','daily','weekly']},at:prop('string'),text:prop('string'),timeZone:prop('string')},['kind','at','text']),
tool('bot_list','List every bot with its job, status, avatar and whether it is the main bot. Main bot only.'),
tool('bot_get','Read one bot by id. Main bot only.',{id:prop('string')},['id']),
tool('bot_create','Create another bot with its own session and local memory. Give a short name and a concrete job. Main bot only.',{name:prop('string'),job:prop('string'),project:prop('string'),color:prop('string'),shape:prop('string'),face:prop('string'),operationID:prop('string')},['name','job']),
tool('bot_update','Change an existing bot: name, job, project or avatar. Main bot only.',{id:prop('string'),name:prop('string'),job:prop('string'),project:prop('string'),color:prop('string'),shape:prop('string'),face:prop('string')},['id']),
tool('bot_run','Queue a task for another bot and return a message id. Main bot only.',{id:prop('string'),text:prop('string'),operationID:prop('string')},['id','text']),
tool('bot_stop','Interrupt the current task of a bot. Main bot only.',{id:prop('string')},['id']),
tool('bot_pause','Pause or resume a bot. Main bot only.',{id:prop('string'),paused:prop('boolean')},['id','paused']),
tool('bot_delete','Delete a bot and its schedules. Local files stay. Main bot only.',{id:prop('string')},['id']),
tool('bot_result','Read the latest answer and activity of a bot. Main bot only.',{id:prop('string')},['id']),
tool('bot_schedules','List the schedules of a bot. Main bot only.',{id:prop('string')},['id']),
tool('bot_schedule_add','Schedule another bot to run later. Main bot only.',{id:prop('string'),kind:{type:'string',enum:['once','daily','weekly']},at:prop('string'),text:prop('string'),timeZone:prop('string')},['id','kind','at']),
tool('bot_schedule_remove','Remove a schedule by its id. Main bot only.',{scheduleID:prop('string')},['scheduleID'])
]
export const managerTools=new Set(['bot_list','bot_get','bot_create','bot_update','bot_run','bot_stop','bot_pause','bot_delete','bot_result','bot_schedules','bot_schedule_add','bot_schedule_remove'])
export class MCPService{
 private server?:http.Server;private token=randomBytes(32).toString('base64url');url=''
 constructor(private call:(name:string,args:Wire,sessionID:string)=>Promise<unknown>){}
 config(){return {mcp:{servers:{'nxncode-tools':{type:'remote',url:this.url,headers:{Authorization:'Bearer '+this.token},oauth:false,codemode:false}}}}}
 async start(){this.server=http.createServer(async(req,res)=>{
 const auth=Buffer.from(req.headers.authorization||'');const expected=Buffer.from('Bearer '+this.token)
 if(req.url!=='/mcp'||auth.length!==expected.length||!timingSafeEqual(auth,expected)||req.headers.origin){res.writeHead(403).end();return}
 if(req.method==='DELETE'){res.writeHead(204).end();return}if(req.method!=='POST'){res.writeHead(405).end();return}
 const chunks:Buffer[]=[];let size=0
 try{for await(const chunk of req){size+=chunk.length;if(size>2097152){res.writeHead(413).end();return}chunks.push(chunk)}
 const message=JSON.parse(Buffer.concat(chunks).toString());if(message.jsonrpc!=='2.0'||typeof message.method!=='string')throw Error('Invalid JSON-RPC')
 if(message.id===undefined){res.writeHead(202).end();return}
 let result:unknown
 if(message.method==='initialize')result={protocolVersion:'2025-06-18',capabilities:{tools:{listChanged:false}},serverInfo:{name:'nxncode',version:'0.1.0'},instructions:'Use these tools to operate the browser the user sees. Files and reports must be real. Ask user to manually take over for login or CAPTCHA. Use show_widget for inline charts and show_in_panel for real reports. The bot_* tools that manage other bots are main-bot only. Do not configure external/cloud memory services.'}
 else if(message.method==='ping')result={}
 else if(message.method==='tools/list')result={tools}
 else if(message.method==='tools/call'){
 const p=message.params||{};const definition=tools.find(t=>t.name===p.name);if(!definition)throw Error('Unknown tool');const args=p.arguments||{};const sessionID=p._meta?.['ai.opencode/sessionID'];if(typeof sessionID!=='string'||!/^[-\w]+$/.test(sessionID))throw Error('Missing engine session context')
 for(const required of definition.inputSchema.required)if(args[required]===undefined)throw Error('Missing '+required)
 try{const output:any=await this.call(p.name,args,sessionID);result=output?.image?{content:[{type:'image',data:output.image.data,mimeType:'image/png'}]}:{content:[{type:'text',text:typeof output==='string'?output:JSON.stringify(output)}]}}catch(e){result={content:[{type:'text',text:(e as Error).message}],isError:true}}
 }else{res.writeHead(200,{'Content-Type':'application/json'}).end(JSON.stringify({jsonrpc:'2.0',id:message.id,error:{code:-32601,message:'Method not found'}}));return}
 res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'}).end(JSON.stringify({jsonrpc:'2.0',id:message.id,result}))
 }catch{if(!res.headersSent)res.writeHead(400).end()}
 });await new Promise<void>(resolve=>this.server!.listen(0,'127.0.0.1',resolve));const address=this.server.address() as import('node:net').AddressInfo;this.url='http://127.0.0.1:'+address.port+'/mcp'}
 stop(){this.server?.close()}
}

