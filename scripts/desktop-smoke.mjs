import { chromium } from 'playwright'
import {mkdir,writeFile} from 'node:fs/promises'
const browser=await chromium.connectOverCDP('http://127.0.0.1:9223')
const pages=browser.contexts().flatMap(c=>c.pages());const page=pages.find(p=>p.url().includes('index.html'))
if(!page)throw Error('Desktop page missing')
const errors=[];page.on('pageerror',e=>errors.push(e.message))
const data=await page.evaluate(()=>window.nxncode.invoke('bootstrap'))
console.log(JSON.stringify({engine:data.engine,tabs:data.tabs,root:data.root}))
await page.locator('.app-shell').waitFor()
await mkdir('.review',{recursive:true});await page.screenshot({path:'.review/native-renderer.png'})
const result=await page.evaluate(async()=>{
 const b=window.nxncode;const boot=await b.invoke('bootstrap');const list=boot.tabs;const tab=list[0]
 if(!tab)throw Error('Native browser missing')
 await b.invoke('browser.takeover',{id:tab.id,value:true});const after=await b.invoke('bootstrap')
 if(!after.tabs[0].takeover)throw Error('Takeover state did not change')
 await b.invoke('browser.takeover',{id:tab.id,value:false})
 const csv=boot.demo?await (await fetch(boot.demo.url+'/orders.csv')).text():undefined
 return {engine:boot.engine,orderRows:csv?csv.trim().split('\n').length-1:undefined,takeover:true,models:boot.engine.status==='ready'?(await b.invoke('catalog')).models.length:0}
})
console.log(JSON.stringify({result,errors}));await writeFile('.review/desktop-smoke.json',JSON.stringify({result,errors},null,2));await browser.close()

