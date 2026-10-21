import path from 'node:path'
process.env.PLAYWRIGHT_BROWSERS_PATH||=path.resolve('.cache/playwright')
const {chromium}=await import('playwright')
import {spawn} from 'node:child_process'
import {mkdir,writeFile} from 'node:fs/promises'
import assert from 'node:assert/strict'
await mkdir('.review/motion',{recursive:true})
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--config','vite.preview.config.ts','--port','5188'],{stdio:['ignore','pipe','pipe']})
await new Promise((resolve,reject)=>{server.stdout.on('data',data=>{if(data.toString().includes('Local:'))resolve()});server.once('exit',code=>reject(Error('Preview failed '+code)))})
let browser
try{
 browser=await chromium.launch({executablePath:'/usr/bin/google-chrome',headless:true})
 const context=await browser.newContext({viewport:{width:1440,height:900},recordVideo:{dir:'.review/motion',size:{width:1440,height:900}}})
 const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message))
 await page.goto('http://127.0.0.1:5188/scripts/fixtures/avatar-motion.html');await page.locator('.avatar.working').waitFor();await page.evaluate(()=>document.fonts.ready)
 const samples=await page.evaluate(async()=>{const samples=[];for(let i=0;i<12;i++){samples.push([...document.querySelectorAll('.sidebar .avatar')].map(el=>({mood:el.className,figure:el.querySelector('svg').style.transform,eyes:el.querySelector('.bot-eyes').style.transform,body:el.querySelector('.bot-body').style.transform,z:el.querySelector('.sleep-z')?.style.transform})));await new Promise(resolve=>setTimeout(resolve,130))}return samples})
 for(const mood of ['working','watching','sleeping','idle']){const transforms=samples.flatMap(row=>row.filter(p=>p.mood.includes(mood))).map(p=>JSON.stringify(p));assert.ok(new Set(transforms).size>2,'No visible '+mood+' motion')}
 await page.goto('http://127.0.0.1:5188');await page.locator('.welcome').waitFor();await page.locator('.welcome .avatar').hover();await page.waitForTimeout(500)
 async function panel(button,selector){
  await page.evaluate(selector=>{window.__widthSamples=[];let start=performance.now();function frame(now){window.__widthSamples.push(document.querySelector(selector).getBoundingClientRect().width);if(now-start<400)requestAnimationFrame(frame)}requestAnimationFrame(frame)},selector)
  await button.click();await page.waitForTimeout(450)
  const samples=await page.evaluate(()=>window.__widthSamples);assert.ok(new Set(samples.map(v=>Math.round(v))).size>3,'Panel snapped without transition');return samples
 }
 const sidebar=await panel(page.getByRole('button',{name:'隐藏侧栏',exact:true}),'.sidebar');await page.getByRole('button',{name:'显示侧栏',exact:true}).click();await page.waitForTimeout(300)
 const tools=await panel(page.getByRole('button',{name:'切换工具面板',exact:true}),'.tools-pane');await page.getByRole('button',{name:'切换工具面板',exact:true}).click();await page.waitForTimeout(300)
 await page.getByRole('button',{name:'选择模型',exact:true}).click();await page.waitForTimeout(220);await page.screenshot({path:'.review/motion/model-open.png'});await page.keyboard.press('Escape');await page.waitForTimeout(180);assert.equal(await page.locator('.model-picker').count(),0)
 await page.getByRole('button',{name:'新建 Bot',exact:true}).click();await page.waitForTimeout(250);await page.getByRole('button',{name:'取消',exact:true}).click();await page.waitForTimeout(250)
 await page.emulateMedia({reducedMotion:'reduce'});await page.waitForTimeout(100)
 const first=await page.locator('.welcome .avatar svg').evaluateAll(els=>els.map(el=>el.style.transform));await page.waitForTimeout(300);const second=await page.locator('.welcome .avatar svg').evaluateAll(els=>els.map(el=>el.style.transform));assert.ok(first.length>0);assert.deepEqual(first,second);assert.ok(first.every(value=>value===''))
 await page.emulateMedia({reducedMotion:'no-preference'});await page.waitForTimeout(200)
 await page.screenshot({path:'.review/motion/workspace.png'})
 const video=page.video();await context.close();const recording=await video.path()
 const result={avatarStates:['idle','working','watching','sleeping'],sidebarFrames:new Set(sidebar.map(Math.round)).size,toolPanelFrames:new Set(tools.map(Math.round)).size,reducedMotion:true,errors,recording}
 assert.equal(errors.length,0);await writeFile('.review/motion.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result))
}finally{await browser?.close();server.kill()}
