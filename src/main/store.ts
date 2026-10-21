import { promises as fs } from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import type { AppState } from '../shared/types'
export const initialState = (): AppState => ({version:1,language:'zh',sidebar:280,panel:420,fontSize:14,bots:[],projects:[],schedules:[],starred:[]})
export class Store {
 state=initialState(); private writes=Promise.resolve()
 constructor(public root:string){}
 async load(){ await fs.mkdir(this.root,{recursive:true,mode:0o700}); try{const s=JSON.parse(await fs.readFile(path.join(this.root,'state.json'),'utf8'));if(s.version!==1)throw Error('Unsupported state version');this.state={...initialState(),...s}}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e}return this.state }
 async save(){const data=JSON.stringify(this.state,null,2);this.writes=this.writes.catch(()=>{}).then(async()=>{const file=path.join(this.root,'state.json');const tmp=file+'.'+randomUUID()+'.tmp';await fs.writeFile(tmp,data,{mode:0o600});await fs.rename(tmp,file)});await this.writes}
 async botFolder(id:string){if(!/^bot_[a-zA-Z0-9-]+$/.test(id))throw Error('Invalid bot');const p=path.join(this.root,'bots',id);await fs.mkdir(path.join(p,'workspace'),{recursive:true,mode:0o700});return p}
}

