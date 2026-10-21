// Real isolated engine and UI check. No external model inference or user credentials.
import assert from 'node:assert/strict'
import path from 'node:path'
import { promises as fs } from 'node:fs'
import { _electron } from 'playwright'

const executable = process.argv[2] && path.resolve(process.argv[2])
const kind = !executable ? 'dev' : executable.endsWith('.AppImage') ? 'appimage' : 'rpm'
await fs.mkdir('.runtime', { recursive: true }); await fs.mkdir('.review', { recursive: true })
const root = await fs.mkdtemp(path.resolve('.runtime/builtin-skills-' + kind + '-'))
const seed = process.env.NXNCODE_ENGINE_BINARY || path.resolve('.runtime/engine/bin/2.0.32/opencode')
const target = path.join(root, 'engine/bin/2.0.32/opencode')
await fs.mkdir(path.dirname(target), { recursive: true }); await fs.copyFile(seed, target); await fs.chmod(target, 0o700); await fs.copyFile(seed + '.sha256', target + '.sha256')
const delay = ms => new Promise(resolve => setTimeout(resolve, ms))
async function until(check, timeout = 30000) { const start = Date.now(); while (Date.now() - start < timeout) { const value = await check(); if (value) return value; await delay(100) } throw Error('Built-in skill check timed out') }
let application, page, enginePID
const errors = [], result = { kind }
const invoke = (action, args = {}) => page.evaluate(({action,args}) => window.nxncode.invoke(action,args), {action,args})
async function launch() {
 application = await _electron.launch({ executablePath: executable || path.resolve('node_modules/electron/dist/electron'), args: !executable ? ['.'] : executable.endsWith('.AppImage') ? ['--appimage-extract-and-run'] : [], cwd: executable ? '/tmp' : process.cwd(), env: { ...process.env, NXNCODE_DATA_DIR: root, NXNCODE_TEST_FIXTURES: '' } })
 page = await application.firstWindow(); page.on('pageerror', error => errors.push(error.message))
 await until(async () => { const boot = await invoke('bootstrap'); assert.equal(boot.root, root); if (boot.engine.status === 'error') throw Error(boot.engine.detail); return boot.engine.status === 'ready' })
 const children = (await fs.readFile(`/proc/${application.process().pid}/task/${application.process().pid}/children`, 'utf8')).trim().split(/\s+/)
 enginePID = undefined
 for (const id of children) if ((await fs.readFile(`/proc/${id}/cmdline`, 'utf8').catch(() => '')).includes('serve\0--stdio')) enginePID = id
 assert.ok(enginePID)
}
async function close() {
 await application.close(); application = undefined
 await until(async () => { try { await fs.access(`/proc/${enginePID}`); return false } catch { return true } }, 10000)
}
try {
 await launch()
 const initial = await until(async () => { const list = await invoke('extensions.list'); return list.skills.filter(skill => skill.builtin && skill.enabled && skill.available).length === 8 && list })
 result.defaults = initial.skills.map(({id,name,enabled,builtin}) => ({id,name,enabled,builtin}))
 const catalog = await invoke('catalog'); assert.equal(catalog.skills.filter(skill => skill.builtin).length, 8)
 assert.ok(catalog.skills.some(skill => skill.name === '排查故障'))
 assert.deepEqual(initial.discoveredSkills.map(skill=>skill.id).sort(),['opencode','report']);assert.equal(catalog.skills.length,10);result.sharedSkillsExcluded=true
 const childEnv=(await fs.readFile(`/proc/${enginePID}/environ`,'utf8')).split('\0');assert.equal(childEnv.find(value=>value.startsWith('HOME=')),'HOME='+process.env.HOME);result.normalHomePreserved=true
 // Files originate inside the shipped app, even when launched from a different cwd.
 for (const skill of initial.skills) assert.ok((await fs.readFile(path.join(root, 'extensions/skills', skill.id, 'SKILL.md'), 'utf8')).startsWith('---\nname: ' + skill.id))
 await invoke('provider.save', { id:'builtin-fixture', name:'Built-in fixture', baseURL:'http://127.0.0.1:1/v1', models:[{id:'skill-model',name:'Skill model'}] })
 await invoke('preferences', {enabledModels:['builtin-fixture/skill-model'],model:{id:'skill-model',providerID:'builtin-fixture'}}); await page.reload()
 const input = page.getByRole('textbox', {name:'消息',exact:true})
 await input.fill('/nxncode-'); await page.waitForFunction(() => document.querySelectorAll('.composer-menu-list>[role=option]').length === 8)
 await page.screenshot({path:'.review/builtin-skills-menu-'+kind+'.png'})
 await input.fill('/find-skills');await page.getByRole('option').filter({hasText:'查找 Skills'}).waitFor();await page.screenshot({path:'.review/find-skills-menu-'+kind+'.png'});await input.fill('/skill-creator');await page.getByRole('option').filter({hasText:'创建 Skills'}).waitFor();await input.fill('/nxncode-')
 await page.getByRole('option').filter({hasText:'排查故障'}).click(); await page.locator('.skill-attachments').filter({hasText:'排查故障'}).waitFor(); result.slashSelection = true
 await page.getByRole('button', {name:'设置',exact:true}).click(); await page.getByRole('button', {name:'Skills',exact:true}).click()
 await page.getByRole('switch', {name:'启用 Skill 排查故障',exact:true}).waitFor()
 assert.equal(await page.locator('.extension-skills .extension-row').count(), 8)
 assert.equal(await page.locator('.extension-skills .extension-status').filter({hasText:'内置'}).count(), 8)
 assert.equal(await page.locator('.extension-skills .extension-row button[title^="移除"],.extension-skills .extension-row button[title^="编辑"]').count(), 0)
 await page.screenshot({path:'.review/builtin-skills-settings-'+kind+'.png'}); result.settings = {markedBuiltin:true,noDeleteOrEdit:true}
 await page.getByRole('switch', {name:'启用 Skill 排查故障',exact:true}).click(); await page.waitForFunction(() => document.querySelector('[aria-label="启用 Skill 排查故障"]')?.getAttribute('aria-checked') === 'false')
 await until(async () => !(await invoke('catalog')).skills.some(skill => skill.id === 'nxncode-debug'))
 await assert.rejects(invoke('skill.delete',{id:'nxncode-debug'}), /内置.*停用/)
 await close(); await launch()
 const reopened = await until(async () => { const list = await invoke('extensions.list'); return list.skills.filter(skill => skill.enabled && skill.available).length === 7 && list })
 assert.equal(reopened.skills.length, 8); assert.equal(reopened.skills.find(skill => skill.id === 'nxncode-debug').enabled, false)
 await page.getByRole('textbox', {name:'消息',exact:true}).fill('/nxncode-')
 await page.waitForFunction(() => document.querySelectorAll('.composer-menu-list>[role=option]').length === 7)
 assert.equal(await page.getByRole('option').filter({hasText:'排查故障'}).count(), 0); result.disabledSurvivesRestart = true
 await invoke('skill.toggle',{id:'nxncode-debug',enabled:true}); await until(async () => (await invoke('catalog')).skills.some(skill => skill.id === 'nxncode-debug'))
 const session = await invoke('session.create',{title:'Built-in activation fixture',model:{id:'skill-model',providerID:'builtin-fixture'}})
 try {
  for(const id of ['nxncode-debug','nxncode-find-skills','nxncode-skill-creator'])await invoke('skill.activate',{sessionID:session.id,id})
  await assert.rejects(invoke('skill.activate',{sessionID:session.id,id:'find-skills'}));result.sharedActivationRejected=true
  const messages = await invoke('session.messages',{id:session.id})
  for(const id of ['nxncode-debug','nxncode-find-skills','nxncode-skill-creator'])assert.ok(JSON.stringify(messages).includes(id));result.realSessionActivation=true;result.newWorkflowsActivated=true
 } finally { await invoke('session.delete',{id:session.id}) }
 await close(); result.engineStoppedOnQuit = true; assert.deepEqual(errors,[]); result.errors = errors
 await fs.writeFile('.review/builtin-skills-'+kind+'.json', JSON.stringify(result,null,2)); console.log(JSON.stringify(result))
} catch (error) { await page?.screenshot({path:'.review/builtin-skills-failed.png'}).catch(()=>{}); throw error }
finally { await application?.close().catch(()=>{}) }
