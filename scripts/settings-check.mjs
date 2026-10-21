import assert from 'node:assert/strict'
import { chromium } from 'playwright'
import { spawn } from 'node:child_process'
import { mkdir, writeFile } from 'node:fs/promises'
await mkdir('.review', { recursive: true })
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--config', 'vite.preview.config.ts', '--port', '5189'], { stdio: ['ignore', 'pipe', 'pipe'] })
await new Promise((resolve, reject) => { server.stdout.on('data', chunk => { if (chunk.toString().includes('Local:')) resolve() }); server.once('exit', code => reject(Error('Preview failed ' + code))) })
let browser, page
try {
 browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', headless: true })
 page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
 const errors = []; page.on('pageerror', error => errors.push(error.message))
 await page.addInitScript(() => {
  const clone = value => JSON.parse(JSON.stringify(value))
  const saved = localStorage.getItem('nxn-settings-fixture')
  const state = saved ? JSON.parse(saved) : { version: 1, language: 'zh', sidebar: 280, panel: 420, fontSize: 14, bots: [{id:'bot_research',name:'研究助手',job:'核对资料与事实',project:'',paused:false,look:{color:'#88a9b9',shape:'square',face:'normal'}}], projects: ['/fixture/project'], schedules: [], starred: [], model: { id: 'primary', providerID: 'local', variant: 'low' } }
  const models = [{ id: 'primary', providerID: 'local', name: 'Primary model', enabled: true, variants: [{ id: 'low' }, { id: 'medium' }, { id: 'high' }] }, { id: 'secondary', providerID: 'other', name: 'Secondary model', enabled: true, variants: [] }, { id: 'locked', providerID: 'offline', name: 'Unavailable model', enabled: false, variants: [] }]
  const extensions = { online: true, providers: [], servers: [], skills: [], discoveredSkills: [], builtinServers: [{ id: 'nxncode-tools', status: 'connected' }] }
  const sessions = [{ id: 'ses_motion', title: '展开动效', permissions: [{ action: '*', resource: '*', effect: 'ask' }] }]
  const fixture = window.__settingsFixture = { failModel: false, actions: [], prompts: [], extensions }
  const listeners = new Map()
  window.nxncode = { on: (event, callback) => { const list = listeners.get(event) || []; list.push(callback); listeners.set(event, list); return () => {} }, invoke: async (action, args = {}) => {
   if (action === 'bootstrap') return { state: clone(state), engine: { status: 'ready', version: '2.0.32' }, tabs: [] }
   if (action === 'catalog') return { models: clone(models), integrations: [], skills: extensions.skills.filter(skill => skill.enabled).map(skill => ({ id: skill.id, name: skill.name, description: skill.description })) }
   if (action === 'sessions') return clone(sessions)
   if (action === 'account.list') return []
   if (action === 'preferences') {
    if (fixture.failModel && args.model) { fixture.failModel = false; throw Error('模型设置被拒绝') }
    Object.assign(state, args); localStorage.setItem('nxn-settings-fixture', JSON.stringify(state)); return clone(state)
   }
   if (action === 'session.get') return clone(sessions.find(session => session.id === args.id))
   if (action === 'session.messages') return { active: false, permissions: [], forms: [], messages: [{ id: 'msg_a', type: 'assistant', content: [{ type: 'reasoning', text: '先核对输入数据与边界。\n\n这是可以展开和收起的思考内容。\n\n接下来运行本地命令。' }, { type: 'tool', name: 'shell', state: { status: 'completed', input: { command: 'printf LOCAL_OK' }, content: [{ type: 'text', text: 'LOCAL_OK\nline 2\nline 3' }] } }] }, { id: 'msg_s', type: 'shell', command: 'pwd', output: { output: '/local/fixture\nDone\n' } }] }
   if (action === 'session.model') { if (fixture.failModel) { fixture.failModel = false; throw Error('模型设置被拒绝') } return null }
   if (action === 'session.create') { const session = { id: 'ses_new', title: 'Fixture conversation', model: args.model, permissions: [{ action: '*', resource: '*', effect: 'ask' }] }; sessions.push(session); return clone(session) }
   if (action === 'skill.activate' || action === 'session.send') { fixture.actions.push(action); if(action==='session.send')fixture.prompts.push(clone(args)); return true }
   if (action === 'project.open') return '/fixture/project'
   if (action === 'files.list') return []
   if (action === 'files.search') { await new Promise(resolve=>setTimeout(resolve,args.query==='slow'?300:10)); return [{path:'src/文件.ts'},{path:'README.md'}].filter(file=>file.path.toLowerCase().includes(args.query)) }
   if (action === 'files.attach') return '/fixture/project/'+args.path
   if (action === 'extensions.list') return clone(extensions)
   if (action === 'provider.save') {
    await new Promise(resolve => setTimeout(resolve, 300))
    extensions.providers = [{ id: args.id, name: args.name, baseURL: args.baseURL, models: args.models, hasKey: !!args.key }]
    models.push(...args.models.map(model => ({ ...model, providerID: args.id, enabled: true, variants: [] }))); return clone(extensions)
   }
   if (action === 'provider.delete') { extensions.providers = extensions.providers.filter(provider => provider.id !== args.id); return clone(extensions) }
   if (action === 'skill.import') { extensions.skills = [{ id: 'local-skill', name: 'Local Skill', description: 'Follow a local task workflow.', enabled: true, available: true }]; return clone(extensions) }
   if (action === 'skill.toggle') { const skill = extensions.skills.find(skill => skill.id === args.id); skill.enabled = args.enabled; skill.available = args.enabled; return clone(extensions) }
   if (action === 'skill.delete') { extensions.skills = []; return clone(extensions) }
   if (action === 'mcp.save') { extensions.servers = [{ id: args.id, type: args.type, command: args.command, url: args.url, enabled: args.enabled, environmentKeys: [], headerKeys: [], status: args.enabled ? 'connected' : 'disabled' }]; return clone(extensions) }
   if (action === 'mcp.toggle') { extensions.servers[0].enabled = args.enabled; extensions.servers[0].status = args.enabled ? 'connected' : 'disabled'; return clone(extensions) }
   if (action === 'mcp.delete') { extensions.servers = []; return clone(extensions) }
   return undefined
  } }
 })
 async function shot(file) { await page.waitForTimeout(350); await page.screenshot({ path: file }) }
 await page.goto('http://127.0.0.1:5189'); await page.locator('.welcome').waitFor(); await page.evaluate(() => document.fonts.ready)
 assert.equal(await page.locator('.tools-pane').getAttribute('aria-hidden'), 'true')
 await page.getByRole('button', { name: '调整思考强度', exact: true }).click()
 assert.equal(await page.locator('.model-effort').count(), 1); assert.equal(await page.locator('.model-picker').count(), 0)
 await page.evaluate(() => { const el=document.querySelector('.effort-thumb-rail'); window.__effortFrames=[]; const start=performance.now(); const frame=now=>{window.__effortFrames.push(getComputedStyle(el).transform);if(now-start<350)requestAnimationFrame(frame)};requestAnimationFrame(frame) })
 await page.getByRole('slider', { name: '思考强度', exact: true }).press('End'); await page.waitForFunction(()=>document.querySelector('.model-variant')?.textContent==='high'); await page.waitForTimeout(380)
 const effortFrames=await page.evaluate(()=>new Set(window.__effortFrames).size); assert.ok(effortFrames>=3,'Effort thumb snapped')
 assert.equal(await page.locator('.model-effort').isVisible(),true)
 assert.equal(await page.getByRole('slider', { name: '思考强度', exact: true }).inputValue(),'2')
 const track=await page.locator('.effort-slider').boundingBox(); await page.mouse.move(track.x+track.width*.8,track.y+15);await page.mouse.down();await page.mouse.move(track.x+track.width*.48,track.y+15,{steps:12});await page.mouse.up()
 await page.waitForFunction(()=>document.querySelector('.model-variant')?.textContent==='medium');assert.equal(await page.locator('.model-effort').isVisible(),true)
 await page.getByRole('slider', { name: '思考强度', exact: true }).press('End');await page.waitForFunction(()=>document.querySelector('.model-variant')?.textContent==='high')
 await shot('.review/effort-retained.png')
 await page.evaluate(() => window.__settingsFixture.failModel = true)
 await page.getByRole('slider', { name: '思考强度', exact: true }).press('Home'); await page.getByText('模型设置被拒绝', { exact: true }).waitFor()
 assert.equal(await page.locator('.effort-trigger .model-variant').textContent(), 'high'); assert.equal(await page.getByRole('slider',{name:'思考强度',exact:true}).inputValue(),'2'); await page.keyboard.press('Escape'); await page.waitForTimeout(150); await page.locator('.toast .icon').click()
 await page.getByRole('button', { name: '设置', exact: true }).click(); await page.getByRole('button', { name: '启用模型', exact: true }).click()
 assert.equal(await page.getByRole('switch', { name: '启用 Unavailable model', exact: true }).isDisabled(), true)
 await page.getByRole('switch', { name: '启用 Secondary model', exact: true }).click(); await page.getByText('已保存', { exact: true }).waitFor()
 await shot('.review/settings-models.png')
 await page.getByRole('button', { name: '返回工作区', exact: true }).click(); await page.getByRole('button', { name: '选择模型', exact: true }).click()
 assert.equal(await page.locator('.model-row').count(), 1); await page.locator('.model-pick').click();await page.locator('.model-picker').waitFor({state:'detached'});assert.equal(await page.locator('.model-effort').count(),0)
 await page.reload(); await page.locator('.welcome').waitFor(); await page.getByRole('button', { name: '选择模型', exact: true }).click(); assert.equal(await page.locator('.model-row').count(), 1); await page.keyboard.press('Escape'); await page.waitForTimeout(150)
 await page.getByRole('button', { name: '设置', exact: true }).click(); await page.getByRole('button', { name: '启用模型', exact: true }).click(); await page.getByRole('button', { name: '全部停用', exact: true }).click(); await page.getByText('已保存', { exact: true }).waitFor(); await page.getByRole('button', { name: '返回工作区', exact: true }).click(); await page.getByRole('button', { name: '选择模型', exact: true }).click(); assert.equal(await page.locator('.model-row').count(), 0)
 await page.getByRole('button', { name: '管理启用模型', exact: true }).click(); await page.getByRole('switch', { name: '启用 Primary model', exact: true }).click(); await page.getByText('已保存', { exact: true }).waitFor()
 await page.getByRole('button', { name: '账号与供应商', exact: true }).click(); await page.getByRole('button', { name: '添加供应商', exact: true }).click()
 await page.getByRole('textbox', { name: '供应商 ID', exact: true }).fill('custom-fixture'); await page.getByRole('textbox', { name: '供应商名称', exact: true }).fill('My Gateway'); await page.getByRole('textbox', { name: 'Base URL', exact: true }).fill('http://127.0.0.1:1234/v1'); await page.getByRole('textbox', { name: '自定义供应商 API Key', exact: true }).fill('local-fixture-value'); await page.getByRole('textbox', { name: '自定义模型', exact: true }).fill('custom-model | Custom model')
 await shot('.review/settings-provider.png'); await page.getByRole('button', { name: '保存', exact: true }).click(); await page.locator('.extension-form').waitFor({ state: 'detached' }); await page.locator('.extension-row').filter({ hasText: 'My Gateway' }).waitFor()
 await page.getByRole('button', { name: 'Skills', exact: true }).click(); await page.getByRole('button', { name: '导入文件夹', exact: true }).click(); await page.getByRole('switch', { name: '启用 Skill Local Skill', exact: true }).waitFor(); await page.getByRole('switch', { name: '启用 Skill Local Skill', exact: true }).click(); await page.waitForFunction(() => document.querySelector('.extension-skills [role=switch]')?.getAttribute('aria-checked') === 'false'); await page.getByRole('switch', { name: '启用 Skill Local Skill', exact: true }).click(); await shot('.review/settings-skills.png')
 await page.getByRole('button', { name: 'MCP', exact: true }).click(); await page.getByRole('button', { name: '添加 MCP', exact: true }).click(); await page.getByRole('textbox', { name: 'MCP ID', exact: true }).fill('local-tools'); await page.getByRole('textbox', { name: 'MCP 程序', exact: true }).fill('node'); await page.getByRole('textbox', { name: 'MCP 参数', exact: true }).fill('/local/server.mjs'); await page.getByRole('button', { name: '保存', exact: true }).click(); await page.locator('.extension-form').waitFor({ state: 'detached' }); await shot('.review/settings-mcp.png')
 await page.getByRole('switch', { name: '启用 MCP local-tools', exact: true }).click(); await page.waitForFunction(() => document.querySelector('.extension-mcp [role=switch]')?.getAttribute('aria-checked') === 'false')
 await page.getByRole('button', { name: '返回工作区', exact: true }).click()
 assert.equal(await page.getByRole('button',{name:'选择 Skill',exact:true}).count(),0)
 const input=page.getByRole('textbox',{name:'消息',exact:true})
 await input.fill('/loc');await page.getByRole('option').filter({hasText:'Local Skill'}).waitFor();await shot('.review/composer-slash.png');await input.press('Enter');await page.locator('.skill-attachments').waitFor();assert.equal(await input.inputValue(),'')
 assert.deepEqual(await page.evaluate(()=>window.__settingsFixture.actions),[])
 await input.fill('/missing');await page.locator('.composer-menu').waitFor();await input.press('Escape');await page.locator('.composer-menu').waitFor({state:'detached'});assert.equal(await input.inputValue(),'/missing')
 await input.fill('mail@example.com');assert.equal(await page.locator('.composer-menu').count(),0)
 await input.fill('/loc');await input.dispatchEvent('compositionstart');await input.dispatchEvent('keydown',{key:'Enter',code:'Enter',keyCode:229,isComposing:true,bubbles:true});assert.deepEqual(await page.evaluate(()=>window.__settingsFixture.actions),[]);await input.dispatchEvent('compositionend');await input.fill('')
 await page.locator('.welcome').getByRole('button',{name:'打开项目',exact:true}).click()
 await input.fill('@slow');await page.waitForTimeout(150);await input.fill('@文件');await page.getByRole('option').filter({hasText:'文件.ts'}).waitFor();await page.waitForTimeout(360);assert.equal(await page.getByRole('option').filter({hasText:'文件.ts'}).count(),1);await shot('.review/composer-at-files.png');await input.press('Tab');await page.locator('.attachment-row').filter({hasText:'文件.ts'}).waitFor()
 await input.fill('@研究');await page.getByRole('option').filter({hasText:'研究助手'}).waitFor();await shot('.review/composer-at-bots.png');await input.press('ArrowDown');await input.press('Enter');await page.locator('.skill-attachments').filter({hasText:'研究助手'}).waitFor()
 await input.fill('Use my local skill and references');await page.getByRole('button',{name:'发送',exact:true}).click();await page.waitForFunction(()=>window.__settingsFixture.actions.includes('session.send'));assert.deepEqual(await page.evaluate(()=>window.__settingsFixture.actions),['skill.activate','session.send'])
 const prompt=await page.evaluate(()=>window.__settingsFixture.prompts[0]);assert.deepEqual(prompt.files,['/fixture/project/src/文件.ts']);assert.deepEqual(prompt.bots,['bot_research']);assert.equal(prompt.text,'Use my local skill and references')
 await page.getByRole('button', { name: '展开动效', exact: true }).click(); await page.locator('.disclosure').first().waitFor()
 const frames = []
 async function toggle(index) {
  const disclosure = page.locator('.disclosure').nth(index)
  await disclosure.scrollIntoViewIfNeeded()
  await page.evaluate(index => { const el = document.querySelectorAll('.disclosure-body')[index]; window.__detailFrames = []; const start = performance.now(); const frame = now => { window.__detailFrames.push(Math.round(el.getBoundingClientRect().height)); if (now - start < 350) requestAnimationFrame(frame) }; requestAnimationFrame(frame) }, index)
  await disclosure.getByRole('button').click(); await page.waitForTimeout(380)
  const values = await page.evaluate(() => window.__detailFrames)
  assert.ok(new Set(values).size >= 3, 'Disclosure snapped without motion, index=' + index); return new Set(values).size
 }
 for (let index = 0; index < 3; index++) { frames.push({ open: await toggle(index), close: await toggle(index) }) }
 await page.locator('.disclosure').first().getByRole('button').click(); await page.waitForTimeout(60); await page.locator('.disclosure').first().getByRole('button').click(); await page.waitForTimeout(230); assert.equal(await page.locator('.disclosure-body').first().isVisible(), false)
 await page.emulateMedia({ reducedMotion: 'reduce' });await page.getByRole('button',{name:'调整思考强度',exact:true}).click();assert.equal(await page.locator('.effort-thumb-rail').evaluate(el=>getComputedStyle(el).transitionDuration),'0s');await page.keyboard.press('Escape');await page.locator('.model-effort').waitFor({state:'detached'}); await page.locator('.disclosure').first().getByRole('button').click(); assert.equal(await page.locator('.disclosure-body').first().isVisible(), true); assert.equal(await page.locator('.disclosure-body').first().evaluate(el => el.getAnimations().length), 0)
 await shot('.review/motion-details.png')
 for (const width of [1200, 1920]) { await page.setViewportSize({ width, height: 900 }); assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false) }
 assert.deepEqual(errors, [])
 const result = { panelInitiallyCollapsed: true, directEffort: true, effortStaysOpen:true, modelDoesNotOpenEffort:true, effortThumbFrames:effortFrames, references:{slashSkills:true,atFiles:true,atBots:true,keyboard:true,ime:true,staleSearchIgnored:true}, failedEffortKeepsConfirmedValue: true, enabledModels: { filtered: true, persistsOnReload: true, emptyAllowed: true }, providerForm: true, skills: { importToggle: true, activatedBeforePrompt: true }, mcpFormAndToggle: true, disclosureFrames: frames, interruptedAnimation: true, reducedMotion: true, errors }
 await writeFile('.review/settings-check.json', JSON.stringify(result, null, 2)); console.log(JSON.stringify(result))
} catch (error) { await page?.screenshot({ path: '.review/settings-check-failed.png' }).catch(() => {}); throw error }
finally { await browser?.close(); server.kill() }
