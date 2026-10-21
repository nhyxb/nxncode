import { promises as fs } from 'node:fs'
import path from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
const exec=promisify(execFile)
export async function within(root:string,file:string){const base=await fs.realpath(root);const real=await fs.realpath(path.resolve(root,file));if(real!==base&&!real.startsWith(base+path.sep))throw Error('路径超出当前项目');return real}
export async function readDirectory(root:string,file=''){const target=await within(root,file);return (await fs.readdir(target,{withFileTypes:true})).filter(e=>!['node_modules','.git','.cache'].includes(e.name)).map(e=>({name:e.name,path:path.relative(root,path.join(target,e.name)),directory:e.isDirectory(),symlink:e.isSymbolicLink()})).sort((a,b)=>Number(b.directory)-Number(a.directory)||a.name.localeCompare(b.name))}
export async function readFile(root:string,file:string){const target=await within(root,file);const stat=await fs.stat(target);if(!stat.isFile()||stat.size>2*1024*1024)throw Error('仅预览 2MB 以下文件');const data=await fs.readFile(target);if(data.includes(0))throw Error('二进制文件，请使用系统应用打开');return {path:target,text:data.toString('utf8')}}
export async function searchFiles(root:string,query='') {
 const base=await fs.realpath(root), needle=String(query).toLocaleLowerCase().slice(0,200)
 let candidates:string[]=[]
 try {
  const ignoredRoot=await exec('git',['check-ignore','-q',base],{cwd:base,timeout:2000}).then(()=>true,()=>false)
  if(ignoredRoot)throw Error('当前目录被外层仓库忽略，使用项目内有界搜索')
  const {stdout}=await exec('git',['ls-files','--cached','--others','--exclude-standard','-z'],{cwd:base,maxBuffer:8*1024*1024,timeout:2000})
  candidates=[...new Set(stdout.split('\0').filter(Boolean))]
 } catch {
  const skipped=new Set(['node_modules','.git','.cache','.runtime','.review','out','dist','build','vendor','.next','target'])
  const queue=[{directory:base,depth:0}], started=Date.now();let visited=0
  while(queue.length&&visited<10000&&Date.now()-started<800) {
   const next=queue.shift()!;let entries
   try{entries=await fs.readdir(next.directory,{withFileTypes:true})}catch{continue}
   for(const entry of entries) {
    if(++visited>10000)break
    if(entry.isSymbolicLink()||skipped.has(entry.name)||entry.name.startsWith('.'))continue
    const target=path.join(next.directory,entry.name)
    if(entry.isDirectory()&&next.depth<12)queue.push({directory:target,depth:next.depth+1})
    else if(entry.isFile())candidates.push(path.relative(base,target))
   }
  }
 }
 const matches=candidates.filter(file=>!path.isAbsolute(file)&&!file.split(path.sep).includes('..')&&file.toLocaleLowerCase().includes(needle)).sort((a,b)=>Number(!path.basename(a).toLocaleLowerCase().startsWith(needle))-Number(!path.basename(b).toLocaleLowerCase().startsWith(needle))||a.length-b.length||a.localeCompare(b))
 const result=[]
 for(const file of matches) {
  if(result.length>=40)break
  try{const target=await within(base,file);if(!(await fs.lstat(path.resolve(base,file))).isSymbolicLink()&&(await fs.stat(target)).isFile())result.push({path:file})}catch{}
 }
 return result
}
export async function attachFile(root:string,file:string) { const result=await readFile(root,file);return result.path }
export async function gitStatus(root:string){try{const {stdout}=await exec('git',['status','--porcelain=v1','-z'],{cwd:root,maxBuffer:4*1024*1024});const entries=stdout.split('\0');const rows=[];for(let i=0;i<entries.length;i++){if(!entries[i])continue;const status=entries[i].slice(0,2);const file=entries[i].slice(3);if(status.includes('R')||status.includes('C'))i++;rows.push({status,path:file})}return rows}catch(e){throw Error('无法读取 Git 仓库：'+(e as Error).message)}}
export async function gitDiff(root:string,file:string,staged=false){const status=await gitStatus(root);if(!status.some(s=>s.path===file))throw Error('文件不在当前改动中');if(status.find(s=>s.path===file)?.status==='??'){const data=await readFile(root,file);return {original:'',modified:data.text,path:file}}
 const {stdout:top}=await exec('git',['rev-parse','--show-toplevel'],{cwd:root});const repo=top.trim();const relative=path.relative(repo,path.resolve(root,file)).split(path.sep).join('/')
 const rev=staged?'HEAD:'+relative:':'+relative
 let original='';try{original=(await exec('git',['show',rev],{cwd:repo,maxBuffer:2*1024*1024})).stdout}catch{}
 let modified='';try{modified=staged?(await exec('git',['show',':'+relative],{cwd:repo,maxBuffer:2*1024*1024})).stdout:(await readFile(root,file)).text}catch{}
 return {original,modified,path:file}
}

