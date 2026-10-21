// Run with: node --import tsx scripts/extensions-check.mjs
// Uses only isolated files and loopback fixtures; no provider account or paid model.
import assert from 'node:assert/strict'
import path from 'node:path'
import { promises as fs } from 'node:fs'
import { createServer } from 'node:http'
import { Engine, unwrap } from '../src/main/engine.ts'
import { ExtensionService } from '../src/main/extensions.ts'
import { MCPService } from '../src/main/mcp.ts'
import { messageID } from '../src/main/identifier.ts'
await fs.mkdir('.runtime', { recursive: true }); await fs.mkdir('.review', { recursive: true })
const root = await fs.mkdtemp(path.resolve('.runtime/extensions-'))
const seed = process.env.NXNCODE_ENGINE_BINARY || path.resolve('.runtime/engine/bin/2.0.32/opencode')
try {
 await fs.access(seed)
 const target = path.join(root, 'engine/bin/2.0.32/opencode'); await fs.mkdir(path.dirname(target), { recursive: true }); await fs.copyFile(seed, target); await fs.chmod(target, 0o700); await fs.copyFile(seed + '.sha256', target + '.sha256')
} catch { /* Engine.start downloads and verifies its own runtime when no seed exists. */ }
const internal = new MCPService(async () => 'LOCAL_FIXTURE_OK'), remote = new MCPService(async () => 'REMOTE_FIXTURE_OK')
let requests = 0, authenticated = false
const provider = createServer(async (req, res) => {
 if (!req.url?.endsWith('/chat/completions')) { res.writeHead(404).end(); return }
 const chunks = []; for await (const chunk of req) chunks.push(chunk)
 const body = JSON.parse(Buffer.concat(chunks).toString()); requests++; authenticated ||= req.headers.authorization === 'Bearer local-fixture-key'
 const base = { id: 'fixture-' + requests, created: 1, model: 'local-model' }
 if (body.stream) {
  res.writeHead(200, { 'Content-Type': 'text/event-stream' })
  res.write('data: ' + JSON.stringify({ ...base, object: 'chat.completion.chunk', choices: [{ index: 0, delta: { role: 'assistant', content: 'LOCAL_PROVIDER_OK' }, finish_reason: null }] }) + '\n\n')
  res.write('data: ' + JSON.stringify({ ...base, object: 'chat.completion.chunk', choices: [{ index: 0, delta: {}, finish_reason: 'stop' }], usage: { prompt_tokens: 8, completion_tokens: 4, total_tokens: 12 } }) + '\n\ndata: [DONE]\n\n'); res.end()
 } else res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ ...base, object: 'chat.completion', choices: [{ index: 0, message: { role: 'assistant', content: 'LOCAL_PROVIDER_OK' }, finish_reason: 'stop' }], usage: { prompt_tokens: 8, completion_tokens: 4, total_tokens: 12 } }))
})
await new Promise(resolve => provider.listen(0, '127.0.0.1', resolve))
const engine = new Engine(path.join(root, 'engine'), () => internal.config())
const service = new ExtensionService(root, engine)
const wait = async (check, timeout = 20000) => { const start = Date.now(); while (Date.now() - start < timeout) { if (await check()) return; await new Promise(resolve => setTimeout(resolve, 250)) } throw Error('Local extension fixture timed out') }
const result = {}
try {
 await internal.start(); await remote.start(); await service.load(); await engine.start()
 await wait(async () => (unwrap(await engine.request('GET', 'api/mcp')) || []).some(s => s.name === 'nxncode-tools' && s.status.status === 'connected'))
 const providerInput = { id: 'local-fixture', name: 'Local fixture', baseURL: 'http://127.0.0.1:' + provider.address().port + '/v1', key: 'local-fixture-key', models: [{ id: 'local-model', name: 'Local model' }] }
 await service.saveProvider(providerInput)
 await service.saveProvider({...providerInput,models:[...providerInput.models,{id:'temporary-model',name:'Temporary model'}]})
 await service.saveProvider({...providerInput,key:'',models:providerInput.models})
 assert.equal(unwrap(await engine.request('GET','api/model')).filter(model=>model.providerID===providerInput.id).length,1)
 const catalog = unwrap(await engine.request('GET', 'api/model'))
 assert.ok(catalog.some(model => model.providerID === 'local-fixture' && model.id === 'local-model' && model.enabled))
 const session = unwrap(await engine.request('POST', 'api/session', { title: 'Local provider acceptance', location: { directory: root }, model: { id: 'local-model', providerID: 'local-fixture', variant: 'low' }, permissions: [{ action: '*', resource: '*', effect: 'ask' }] }))
 try {
  await engine.request('POST', 'api/session/' + session.id + '/prompt', { id: messageID(), text: 'Reply with the local fixture marker.', delivery: 'steer' })
  await wait(async () => (unwrap(await engine.request('GET', 'api/session/' + session.id + '/message?limit=50&order=asc')) || []).some(message => message.type === 'assistant' && message.content?.some(part => part.type === 'text' && part.text.includes('LOCAL_PROVIDER_OK'))), 30000)
  assert.ok(requests > 0 && authenticated); result.customProvider = { realLocalInference: true, authenticated: true }
 } finally { await engine.request('DELETE', 'api/session/' + session.id) }
 const remoteConfig = remote.config().mcp.servers['nxncode-tools']
 await service.saveServer({ id: 'fixture-http', type: 'remote', url: remoteConfig.url, headers: remoteConfig.headers, enabled: true })
 await wait(async () => (await service.list()).servers.some(server => server.id === 'fixture-http' && server.status === 'connected'))
 await service.saveServer({ id: 'fixture-stdio', type: 'local', command: [process.execPath, path.resolve('scripts/fixtures/mcp-server.mjs')], enabled: true })
 await wait(async () => (await service.list()).servers.some(server => server.id === 'fixture-stdio' && server.status === 'connected'))
 await service.toggleServer('fixture-http', false)
 assert.equal((await service.list()).servers.find(server => server.id === 'fixture-http').status, 'disabled')
 await service.toggleServer('fixture-http', true)
 await wait(async () => (await service.list()).servers.some(server => server.id === 'fixture-http' && server.status === 'connected'))
 await service.removeServer('fixture-stdio'); await service.removeServer('fixture-http')
 assert.ok((await service.list()).builtinServers.some(server => server.id === 'nxncode-tools' && server.status === 'connected'))
 result.mcp = { http: true, stdio: true, disableReconnectRemove: true, internalPreserved: true }
 const source = path.join(root, 'source/local-fixture-skill'); await fs.mkdir(path.join(source, 'references'), { recursive: true })
 await fs.writeFile(path.join(source, 'SKILL.md'), '---\nname: Local fixture skill\ndescription: Use for the local acceptance fixture.\n---\nRead references/fixture.md.')
 await fs.writeFile(path.join(source, 'references/fixture.md'), 'LOCAL_SKILL_RESOURCE')
 await service.importSkill(source); assert.ok((await service.list()).skills.find(skill=>skill.id==='local-fixture-skill').available)
 const skillSession = unwrap(await engine.request('POST', 'api/session', { title: 'Local skill activation', location: { directory: root }, model: { id: 'local-model', providerID: 'local-fixture' } }))
 try {
  await engine.request('POST', 'api/experimental/session/' + skillSession.id + '/skill', { id: 'local-fixture-skill', resume: false })
  assert.ok(JSON.stringify(unwrap(await engine.request('GET', 'api/session/' + skillSession.id + '/message?limit=50&order=asc'))).includes('local-fixture-skill'))
 } finally { await engine.request('DELETE', 'api/session/' + skillSession.id) }
 await service.toggleSkill('local-fixture-skill', false); assert.ok(!(await service.list()).skills.find(skill=>skill.id==='local-fixture-skill').available)
 await service.toggleSkill('local-fixture-skill', true); assert.ok((await service.list()).skills.find(skill=>skill.id==='local-fixture-skill').available)
 const reopened = new ExtensionService(root, engine); await reopened.load(); assert.equal((await reopened.list()).skills.filter(skill=>!skill.builtin).length, 1)
 await service.removeSkill('local-fixture-skill'); await fs.access(path.join(source, 'SKILL.md'))
 result.skills = { import: true, supportingResources: true, sessionActivation: true, disableEnableRemove: true, sourcePreserved: true, persistent: true }
 assert.ok(!JSON.stringify(await service.list()).includes('local-fixture-key'))
 await service.removeProvider('local-fixture'); result.secretsRedacted = true
 await fs.writeFile('.review/extensions.json', JSON.stringify(result, null, 2)); console.log(JSON.stringify(result))
} finally {
 const child = engine.process; engine.stop(); if (child && child.exitCode === null) await Promise.race([new Promise(resolve => child.once('exit', resolve)), new Promise(resolve => setTimeout(resolve, 6000))])
 internal.stop(); remote.stop(); provider.closeAllConnections(); await new Promise(resolve => provider.close(resolve))
}
