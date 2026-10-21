// Focused mouse/keyboard motion check. Optional argument runs the actual package.
import assert from 'node:assert/strict'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { mkdir, readFile, writeFile, copyFile, chmod, access } from 'node:fs/promises'
import { chromium, _electron } from 'playwright'
const executable = process.argv[2] && path.resolve(process.argv[2])
const kind = !executable ? 'preview' : executable.endsWith('.AppImage') ? 'appimage' : 'rpm'
const PARTICLES = 60
const delay = ms => new Promise(resolve => setTimeout(resolve, ms))
async function until(check, timeout = 30000) { const start = Date.now(); while (Date.now() - start < timeout) { const value = await check(); if (value) return value; await delay(100) } throw Error('Effort check timed out') }
await mkdir('.review', { recursive: true })
let server, browser, application, page, enginePID
const result = { kind, clicks: [] }
try {
 if (executable) {
  const root = path.resolve('.runtime/effort-click-' + kind), seed = process.env.NXNCODE_ENGINE_BINARY || path.resolve('.runtime/engine/bin/2.0.32/opencode')
  const target = path.join(root, 'engine/bin/2.0.32/opencode'); await mkdir(path.dirname(target), { recursive: true })
  await copyFile(seed, target); await chmod(target, 0o700); await copyFile(seed + '.sha256', target + '.sha256')
  application = await _electron.launch({ executablePath: executable, args: executable.endsWith('.AppImage') ? ['--appimage-extract-and-run'] : [], env: { ...process.env, NXNCODE_DATA_DIR: root, NXNCODE_TEST_FIXTURES: '' } })
  page = await application.firstWindow()
  const invoke = (action, args = {}) => page.evaluate(({action,args}) => window.nxncode.invoke(action,args), {action,args})
  await until(async () => { const boot = await invoke('bootstrap'); assert.equal(boot.root, root); if (boot.engine.status === 'error') throw Error(boot.engine.detail); return boot.engine.status === 'ready' })
  const children = (await readFile(`/proc/${application.process().pid}/task/${application.process().pid}/children`, 'utf8')).trim().split(/\s+/)
  for (const id of children) { if ((await readFile(`/proc/${id}/cmdline`, 'utf8').catch(() => '')).includes('serve\0--stdio')) enginePID = id }
  assert.ok(enginePID)
  await invoke('provider.save', { id:'effort-fixture', name:'Effort fixture', baseURL:'http://127.0.0.1:1/v1', models:[{id:'effort-model',name:'Effort model'}] })
  await invoke('preferences', { enabledModels:['effort-fixture/effort-model'], model:{id:'effort-model',providerID:'effort-fixture',variant:'low'} })
  await page.reload()
 } else {
  server = spawn(process.execPath, ['node_modules/vite/bin/vite.js','--config','vite.preview.config.ts','--port','5190'], {stdio:['ignore','pipe','pipe']})
  await new Promise((resolve,reject) => { server.stdout.on('data',chunk => { if (chunk.toString().includes('Local:')) resolve() }); server.once('exit',code=>reject(Error('Preview failed '+code))) })
  browser = await chromium.launch({executablePath:'/usr/bin/google-chrome',headless:true}); page = await browser.newPage({viewport:{width:1440,height:900}})
  await page.addInitScript(() => {
   const state = {version:1,language:'zh',sidebar:280,panel:420,fontSize:14,bots:[],projects:[],schedules:[],starred:[],model:{id:'effort-model',providerID:'local',variant:'low'}}
   window.__failEffort = false
   window.nxncode = {on:()=>()=>{},invoke:async(action,args={})=>{
    if(action==='bootstrap')return {state,engine:{status:'ready',version:'2.0.32'},tabs:[]}
    if(action==='catalog')return {models:[{id:'effort-model',providerID:'local',name:'Effort model',enabled:true,variants:[{id:'low'},{id:'medium'},{id:'high'}]}],integrations:[],skills:[]}
    if(action==='sessions')return []
    if(action==='preferences'){await new Promise(resolve=>setTimeout(resolve,40));if(args.model&&window.__failEffort){window.__failEffort=false;throw Error('挡位保存失败')}Object.assign(state,args);return {...state}}
    return undefined
   }}
  })
  await page.goto('http://127.0.0.1:5190')
 }
 const errors=[];page.on('pageerror',error=>errors.push(error.message))
 await page.getByRole('button',{name:'调整思考强度',exact:true}).click();await page.locator('.model-effort').waitFor();await delay(180)
 let track = await page.locator('.effort-slider').boundingBox()
 const xFor = ratio => track.x + 16 + (track.width - 32) * ratio
 async function confirmed(variant) { await page.waitForFunction(variant=>document.querySelector('.model-variant')?.textContent===variant&&document.querySelector('.model-effort')?.getAttribute('aria-busy')==='false',variant) }
 async function beginFrames() { await page.evaluate(()=>{window.__clickFrames=[];const el=document.querySelector('.effort-thumb'),start=performance.now();function frame(now){window.__clickFrames.push(el.getBoundingClientRect().x);if(now-start<350)requestAnimationFrame(frame)}requestAnimationFrame(frame)}) }
 for(const [ratio,variant] of [[1,'high'],[0,'low'],[.5,'medium']]) {
  const from=await page.locator('.effort-thumb').evaluate(el=>el.getBoundingClientRect().x)
  await beginFrames();await page.mouse.move(xFor(ratio),track.y+15);await page.mouse.down();await delay(60)
  const mid=await page.locator('.effort-thumb').evaluate(el=>el.getBoundingClientRect().x)
  if(ratio===1)assert.equal(await page.locator('.effort-particles').count(),0,'Unconfirmed highest effort emitted particles')
  await page.mouse.up();await confirmed(variant);await delay(300)
  const to=await page.locator('.effort-thumb').evaluate(el=>el.getBoundingClientRect().x), frames=await page.evaluate(()=>new Set(window.__clickFrames.map(x=>Math.round(x*100)/100)).size)
  assert.ok(mid>Math.min(from,to)+.5&&mid<Math.max(from,to)-.5,'Single click jumped or failed to start until release')
  assert.ok(frames>=3,'Single click had no intermediate frames');assert.equal(await page.locator('.model-effort').isVisible(),true)
  result.clicks.push({variant,frames,from,mid,to});if(ratio===1)assert.equal(await page.locator('.effort-particles i').count(),PARTICLES);else assert.equal(await page.locator('.effort-particles').count(),0)
 }
 const trackImage=await page.locator('.effort-slider').screenshot()
 const colors=await page.evaluate(async data=>{const img=new Image();img.src='data:image/png;base64,'+data;await img.decode();const canvas=document.createElement('canvas');canvas.width=img.width;canvas.height=img.height;const ctx=canvas.getContext('2d');ctx.drawImage(img,0,0);const sample=ratio=>Array.from(ctx.getImageData(Math.round(img.width*ratio),Math.round(img.height*.25),1,1).data).slice(0,3);return {left:sample(.25),right:sample(.75)}},trackImage.toString('base64'))
 assert.deepEqual(colors.left,[169,154,245]);assert.deepEqual(colors.right,[58,60,66]);result.trackColors=colors;assert.equal(await page.locator('.effort-ticks.is-flowing,.effort-tick-copy').count(),0);assert.equal(await page.locator('.effort-tick-group').evaluate(node=>node.getAnimations().length),0)
 const staticTickX=await page.locator('.effort-tick-group>i').evaluateAll(nodes=>nodes.map(node=>node.getBoundingClientRect().x))
 await page.locator('.model-effort').screenshot({path:'.review/effort-color-medium-'+kind+'.png'})
 // Reverse a still-running transition with another click.
 await page.mouse.click(xFor(1),track.y+15);await confirmed('high');await delay(20)
 await page.mouse.click(xFor(0),track.y+15);await confirmed('low');await delay(250);assert.equal(await page.getByRole('slider',{name:'思考强度',exact:true}).inputValue(),'0');result.reversal=true
 await page.mouse.move(xFor(0),track.y+15);await page.mouse.down();await page.mouse.move(xFor(.5),track.y+15,{steps:12});await page.mouse.up();await confirmed('medium');result.dragPreserved=true
 await page.getByRole('slider',{name:'思考强度',exact:true}).press('End');await confirmed('high');result.keyboardPreserved=true
 await page.waitForFunction(count=>document.querySelectorAll('.effort-particles i').length===count,PARTICLES)
 assert.equal(await page.locator('.effort-fill>.effort-particles').count(),1);assert.equal(await page.locator('.effort-thumb-rail .effort-particles').count(),0)
 const tickStart=await page.locator('.effort-ticks.is-flowing .effort-tick-group>i').evaluateAll(nodes=>nodes.map(node=>{const animation=node.getAnimations().find(animation=>animation.animationName==='effort-tick-depart'),original=animation.currentTime;animation.pause();animation.currentTime=0;const x=node.getBoundingClientRect().x;animation.currentTime=original;animation.play();return x}))
 tickStart.forEach((x,index)=>assert.ok(Math.abs(x-staticTickX[index])<1,'Original dots did not depart from their static positions'))
 const tickDrift=await page.locator('.effort-ticks.is-flowing .effort-tick-group>i').first().evaluate(node=>{const animation=node.getAnimations().find(animation=>animation.animationName==='effort-tick-depart'),duration=Number(animation.effect.getTiming().duration),original=animation.currentTime;animation.pause();const positions=[.2,.6].map(phase=>{animation.currentTime=duration*phase;return node.getBoundingClientRect().x});animation.currentTime=original;animation.play();return positions[0]-positions[1]})
 const tickLife=await page.locator('.effort-ticks.is-flowing .effort-tick-group>i').first().evaluate(node=>{const animation=node.getAnimations({subtree:true}).find(animation=>animation.animationName==='effort-seed-life'),duration=Number(animation.effect.getTiming().duration),original=animation.currentTime;animation.pause();const states=[.2,.65].map(phase=>{animation.currentTime=duration*phase;const matrix=new DOMMatrix(getComputedStyle(node,'::before').transform);return {scale:matrix.m11,y:matrix.m42}});animation.currentTime=original;animation.play();return {shrinks:states[1].scale<states[0].scale,vertical:Math.abs(states[1].y-states[0].y)}})
 assert.ok(tickDrift>5,JSON.stringify({tickDrift,tickLife}));assert.equal(tickLife.shrinks,true);assert.ok(tickLife.vertical>1);assert.equal(await page.locator('.effort-tick-copy').count(),0);assert.equal(await page.locator('.effort-fill>.effort-ticks.is-flowing').count(),1)
 const particleFrom=await page.locator('.effort-particles i').evaluateAll(nodes=>nodes.map(node=>node.getBoundingClientRect().x));await delay(45)
 const particleTo=await page.locator('.effort-particles i').evaluateAll(nodes=>nodes.map(node=>node.getBoundingClientRect().x))
 const movingLeft=particleTo.filter((x,index)=>x<particleFrom[index]-1).length;assert.ok(movingLeft>=30,'Particles are not flowing left')
 const acceleration=await page.locator('.effort-particles i').first().evaluate(node=>{const animation=node.getAnimations().find(animation=>animation.animationName==='effort-flow');const timing=animation.effect.getTiming(),original=animation.currentTime;animation.pause();const positions=[.15,.3,.45,.6].map(phase=>{animation.currentTime=Number(timing.duration)*(phase+1)+Number(timing.delay);return node.getBoundingClientRect().x});animation.currentTime=original;animation.play();return {early:positions[0]-positions[1],late:positions[2]-positions[3]}})
 assert.ok(acceleration.late>acceleration.early*1.3,'Particle flow does not accelerate')
 const grainShape=await page.locator('.effort-particles i').evaluateAll(nodes=>{const styles=nodes.map(node=>getComputedStyle(node,'::before'));return {round:styles.every(style=>style.width===style.height&&style.borderRadius==='50%'&&style.backgroundImage==='none'),sizes:[...new Set(styles.map(style=>style.width))]}});assert.equal(grainShape.round,true);assert.ok(grainShape.sizes.length>=4)
 const grainDrift=await page.locator('.effort-particles i').first().evaluate(node=>{const animation=node.getAnimations({subtree:true}).find(animation=>animation.animationName==='effort-grain-life'),timing=animation.effect.getTiming(),original=animation.currentTime;animation.pause();const positions=[.2,.65].map(phase=>{animation.currentTime=Number(timing.duration)*(phase+1)+Number(timing.delay);return new DOMMatrix(getComputedStyle(node,'::before').transform).m42});animation.currentTime=original;animation.play();return Math.abs(positions[1]-positions[0])});assert.ok(grainDrift>1,'Grains have no vertical drift')
 const visibleSparks=await page.locator('.effort-particles i').evaluateAll(nodes=>nodes.filter(node=>{const rect=node.getBoundingClientRect(),track=node.parentElement.getBoundingClientRect();return Number(getComputedStyle(node,'::before').opacity)>.25&&rect.x>=track.x&&rect.x<track.right-16}).length);assert.ok(visibleSparks>=18,'Particle flow is not visibly dense')
 await page.locator('.model-effort').screenshot({path:'.review/effort-particles-'+kind+'.png'});await delay(2300);assert.equal(await page.locator('.effort-particles i').count(),PARTICLES)
 const running=await page.locator('.effort-particles i').evaluateAll(nodes=>nodes.every(node=>node.getAnimations().some(animation=>animation.playState==='running'&&animation.effect.getTiming().iterations===Infinity)));assert.equal(running,true)
 const ticksGone=()=>page.locator('.effort-ticks.is-flowing .effort-tick-group>i').evaluateAll(nodes=>nodes.length>0&&nodes.every(node=>Number(getComputedStyle(node,'::before').opacity)===0&&node.getAnimations({subtree:true}).every(animation=>animation.playState==='finished'&&animation.effect.getTiming().iterations===1)))
 assert.equal(await ticksGone(),true,'Original dots did not finish and disappear')
 await delay(2300);assert.equal(await ticksGone(),true,'Original dots repeated after finishing')
 await page.getByRole('slider',{name:'思考强度',exact:true}).press('End');await confirmed('high');assert.equal(await ticksGone(),true,'Selecting the same highest effort replayed the original dots')
 await page.locator('.model-effort').screenshot({path:'.review/effort-dots-gone-'+kind+'.png'})
 result.particles={confirmedHighest:true,insideFill:true,movingLeft,acceleration,visibleSparks,roundGrains:grainShape.round,variedSizes:grainShape.sizes,grainDrift,continuous:true,tickDrift,tickLife,individualTicks:true,tickStartMatchesStatic:true,ticksDisappearOnce:true,ticksDoNotRepeat:true,staticTicksRestored:true,lowerEffortClears:true}
 await page.keyboard.press('Escape');await page.locator('.model-effort').waitFor({state:'detached'});await page.getByRole('button',{name:'调整思考强度',exact:true}).click();await page.waitForFunction(count=>document.querySelectorAll('.effort-particles i').length===count,PARTICLES);assert.equal(await page.locator('.effort-ticks').count(),0,'Reopening the highest effort replayed the original dots');result.particles.reopenHighest=true
 if(application){assert.equal(await application.evaluate(({BrowserWindow})=>{const win=BrowserWindow.getAllWindows()[0];win.hide();return win.isVisible()}),false)}
 else await page.evaluate(()=>{Object.defineProperty(document,'visibilityState',{configurable:true,get:()=> 'hidden'});document.dispatchEvent(new Event('visibilitychange'))})
 await page.waitForFunction(()=>!document.querySelector('.effort-particles'),null,{polling:100});result.particles.hiddenClears=true
 if(application){await application.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].show())}
 else await page.evaluate(()=>{delete document.visibilityState;document.dispatchEvent(new Event('visibilitychange'))})
 await page.waitForFunction(()=>document.visibilityState==='visible');await page.waitForFunction(count=>document.querySelectorAll('.effort-particles i').length===count,PARTICLES);await delay(200)
 assert.equal(await page.locator('.effort-ticks').count(),0,'Restoring the window replayed the original dots');result.particles.restoreHighest=true
 await page.keyboard.press('Escape');await page.waitForFunction(()=>!document.querySelector('.effort-particles'));await page.locator('.model-effort').waitFor({state:'detached'});result.particles.closeClears=true
 await page.getByRole('button',{name:'调整思考强度',exact:true}).click();await page.locator('.model-effort').waitFor();await delay(180);track=await page.locator('.effort-slider').boundingBox()
 // Raising the effort again must depart once; closing mid-opening must still not replay it.
 await page.mouse.click(xFor(0),track.y+15);await confirmed('low');await page.mouse.click(xFor(1),track.y+15);await confirmed('high')
 await page.waitForFunction(()=>document.querySelectorAll('.effort-ticks.is-flowing').length===1,null,{timeout:4000}).catch(()=>{})
 assert.equal(await page.locator('.effort-ticks.is-flowing').count(),1,'Raising the effort again did not replay the original dots once')
 await delay(150);await page.keyboard.press('Escape');await page.locator('.model-effort').waitFor({state:'detached'})
 await page.getByRole('button',{name:'调整思考强度',exact:true}).click();await page.waitForFunction(count=>document.querySelectorAll('.effort-particles i').length===count,PARTICLES)
 assert.equal(await page.locator('.effort-ticks').count(),0,'Reopening after a partial opening replayed the original dots');result.particles.midOpeningCloseNoReplay=true
 track=await page.locator('.effort-slider').boundingBox()
 
 if(!executable){await page.evaluate(()=>window.__failEffort=true);await page.mouse.click(xFor(0),track.y+15);await page.getByText('挡位保存失败',{exact:true}).waitFor();await confirmed('high');assert.equal(await page.getByRole('slider',{name:'思考强度',exact:true}).inputValue(),'2');assert.equal(await page.locator('.effort-particles i').count(),PARTICLES);result.failureRestored=true;await page.locator('.toast .icon').click();await page.getByRole('slider',{name:'思考强度',exact:true}).press('Home');await confirmed('low');await page.evaluate(()=>window.__failEffort=true);await page.getByRole('slider',{name:'思考强度',exact:true}).press('End');await page.getByText('挡位保存失败',{exact:true}).waitFor();await confirmed('low');assert.equal(await page.locator('.effort-particles').count(),0);await page.locator('.toast .icon').click();await page.getByRole('slider',{name:'思考强度',exact:true}).press('End');await confirmed('high');result.particles.failedHighestDoesNotStart=true}
 await delay(250);await page.screenshot({path:'.review/effort-click-'+kind+'.png'})
 await page.emulateMedia({reducedMotion:'reduce'});assert.equal(await page.locator('.effort-thumb-rail').evaluate(el=>getComputedStyle(el).transitionDuration),'0s');await page.mouse.click(xFor(0),track.y+15);await confirmed('low');await page.mouse.click(xFor(1),track.y+15);await confirmed('high');assert.equal(await page.locator('.effort-particles').count(),0);assert.equal(await page.locator('.effort-fill').evaluate(el=>getComputedStyle(el).transitionDuration),'0s');assert.equal(await page.locator('.effort-ticks.is-flowing,.effort-tick-copy').count(),0);result.reducedMotion=true
 await page.emulateMedia({reducedMotion:'no-preference'});await page.waitForFunction(count=>document.querySelectorAll('.effort-particles i').length===count,PARTICLES);await delay(120)
 assert.equal(await page.locator('.effort-ticks.is-flowing').count(),0,'Turning reduced motion off replayed the original dots');result.particles.reducedMotionNoReplay=true
 assert.equal(await page.locator('.model-effort').isVisible(),true);assert.deepEqual(errors,[]);result.errors=errors
 if(application){await application.close();application=undefined;await until(async()=>{try{await access(`/proc/${enginePID}`);return false}catch{return true}},10000);result.engineStoppedOnQuit=true}
 await writeFile('.review/effort-click-'+kind+'.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result))
} catch(error){if(page){const debug=await page.evaluate(()=>({visibility:document.visibilityState,slider:document.querySelector('.effort-slider input')?.value,variant:document.querySelector('.model-variant')?.textContent,busy:document.querySelector('.model-effort')?.getAttribute('aria-busy'),particles:document.querySelectorAll('.effort-particles i').length})).catch(()=>null);console.error(JSON.stringify({debug}))}await page?.screenshot({path:'.review/effort-click-failed.png'}).catch(()=>{});throw error}
finally{await application?.close().catch(()=>{});await browser?.close();server?.kill()}
