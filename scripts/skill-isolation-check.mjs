// node --import tsx scripts/skill-isolation-check.mjs
// Direct engine acceptance: no UI filtering, external model or host configuration changes.
import assert from 'node:assert/strict'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { Engine, unwrap } from '../src/main/engine.ts'
import { ExtensionService } from '../src/main/extensions.ts'
await fs.mkdir('.runtime', { recursive: true }); await fs.mkdir('.review', { recursive: true })
const root = await fs.mkdtemp(path.resolve('.runtime/skill-isolation-'))
const seed = process.env.NXNCODE_ENGINE_BINARY || path.resolve('.runtime/engine/bin/2.0.32/opencode')
const target = path.join(root, 'engine/bin/2.0.32/opencode')
await fs.mkdir(path.dirname(target), { recursive: true }); await fs.copyFile(seed, target); await fs.chmod(target, 0o700); await fs.copyFile(seed + '.sha256', target + '.sha256')
const engine = new Engine(path.join(root, 'engine'), () => ({})), service = new ExtensionService(root, engine)
try {
 await service.load()
 // Existing config cannot re-enable the shared compatibility scanner.
 const file = path.join(root, 'engine/config/opencode/opencode.json'), config = JSON.parse(await fs.readFile(file, 'utf8'))
 config.plugins = ['opencode.config.compatibility']; await fs.writeFile(file, JSON.stringify(config))
 await engine.start()
 let skills = []
 for (let index = 0; index < 50; index++) { skills = unwrap(await engine.request('GET', 'api/skill')) || []; if (skills.filter(skill => skill.id.startsWith('nxncode-')).length === 8) break; await new Promise(resolve => setTimeout(resolve, 150)) }
 const ids = skills.map(skill => skill.id)
 assert.equal(ids.length, 10); assert.ok(ids.includes('opencode') && ids.includes('report'))
 for (const id of ['find-skills', 'design-taste-frontend', 'frontend-design', 'impeccable', 'openai-gpt-image', 'xai-grok-imagine-image']) assert.ok(!ids.includes(id), id)
 const environment = (await fs.readFile(`/proc/${engine.process.pid}/environ`, 'utf8')).split('\0')
 assert.equal(environment.find(value => value.startsWith('HOME=')), 'HOME=' + process.env.HOME)
 const session = unwrap(await engine.request('POST', 'api/session', { title: 'Skills isolation acceptance', location: { directory: root } }))
 try {
  for (const id of ['nxncode-find-skills', 'nxncode-skill-creator']) await engine.request('POST', 'api/experimental/session/' + session.id + '/skill', { id, resume: false })
  await assert.rejects(engine.request('POST', 'api/experimental/session/' + session.id + '/skill', { id: 'find-skills', resume: false }))
 } finally { await engine.request('DELETE', 'api/session/' + session.id) }
 const result = { rawEngineSkillIDs: ids, sharedNotLoaded: true, sharedActivationRejected: true, normalHomePreserved: true, inlineDirectiveOverridesOldConfig: true, newWorkflowsActivated: true }
 await fs.writeFile('.review/skill-isolation.json', JSON.stringify(result, null, 2)); console.log(JSON.stringify(result))
} finally {
 const child = engine.process; engine.stop()
 if (child && child.exitCode === null) await Promise.race([new Promise(resolve => child.once('exit', resolve)), new Promise(resolve => setTimeout(resolve, 6000))])
}
