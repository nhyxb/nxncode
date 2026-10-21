import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, readFile, rm, stat, symlink, truncate, cp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { ExtensionService, extensionID, endpoint, copySkill } from '../src/main/extensions'
import { selectableModels, defaultVariant } from '../src/shared/models'
import { builtinSkills, builtinSkillsPath } from '../src/main/builtin-skills'

test('model enablement keeps legacy behavior, empty means none and IDs are provider scoped', () => {
 const models = [{ id: 'same', providerID: 'a', enabled: true }, { id: 'same', providerID: 'b', enabled: true }, { id: 'unavailable', providerID: 'a', enabled: false }]
 assert.equal(selectableModels(models).length, 2)
 assert.deepEqual(selectableModels(models, []), [])
 assert.deepEqual(selectableModels(models, ['b/same']), [models[1]])
 assert.deepEqual(selectableModels(models, ['a/unavailable']), [])
 assert.equal(defaultVariant({ variants: [{ id: 'low' }, { id: 'high' }] }, 'high'), 'high')
 assert.equal(defaultVariant({ variants: [{ id: 'low' }] }, 'missing'), 'low')
})
test('extensions validate IDs and transports without touching outside paths', () => {
 for (const id of ['../escape', 'nxncode-tools', '', 'a/b']) assert.throws(() => extensionID(id))
 for (const url of ['file:///tmp/test', 'https://user:pass@example.com', 'https://example.com?key=secret']) assert.throws(() => endpoint(url))
 assert.equal(endpoint('http://127.0.0.1:1234/v1/'), 'http://127.0.0.1:1234/v1')
})
test('private extension state redacts secrets, preserves unrelated config, survives reopen', async () => {
 const root = await mkdtemp(path.join(tmpdir(), 'nxn-extensions-'))
 const engine: any = { state: { status: 'stopped' }, request: async () => [] }
 try {
  const config = path.join(root, 'engine/config/opencode/opencode.json')
  await mkdir(path.dirname(config), { recursive: true }); await writeFile(config, JSON.stringify({ username: 'local-user', mcp: { servers: { retained: { type: 'remote', url: 'http://localhost:9999' } } } }))
  const service = new ExtensionService(root, engine); await service.load()
  await service.saveProvider({ id: 'custom-api', name: 'My local API', baseURL: 'http://localhost:1234/v1', key: 'fixture-private-key', models: [{ id: 'local-model' }] })
  await service.saveServer({ id: 'local-mcp', type: 'local', command: ['node', 'server.mjs'], environment: { SECRET: 'fixture-private-env' }, enabled: false })
  await service.saveProvider({ id: 'custom-api', name: 'Renamed', baseURL: 'http://localhost:1234/v1', key: '', models: [{ id: 'local-model' }] })
  const serialized = JSON.stringify(await service.list())
  assert.ok(!serialized.includes('fixture-private-key') && !serialized.includes('fixture-private-env'))
  const parsed = JSON.parse(await readFile(config, 'utf8'))
  assert.equal(parsed.username, 'local-user'); assert.ok(parsed.mcp.servers.retained)
  assert.equal(parsed.providers['custom-api'].settings.apiKey, 'fixture-private-key')
  assert.equal((await stat(config)).mode & 0o777, 0o600)
  const reopened = new ExtensionService(root, engine); await reopened.load()
  assert.equal((await reopened.list()).providers[0].hasKey, true)
  await reopened.removeProvider('custom-api'); assert.equal((await reopened.list()).providers.length, 0)
 } finally { await rm(root, { recursive: true, force: true }) }
})
test('skill import retains resources, rejects symlinks and oversized packages, never deletes source', async () => {
 const root = await mkdtemp(path.join(tmpdir(), 'nxn-skills-'))
 const source = path.join(root, 'my-skill'), copied = path.join(root, 'copy')
 const engine: any = { state: { status: 'stopped' }, request: async () => [] }
 try {
  await mkdir(path.join(source, 'references'), { recursive: true })
  await writeFile(path.join(source, 'SKILL.md'), '---\nname: My Skill\ndescription: Local fixture\n---\nRead references/context.md')
  await writeFile(path.join(source, 'references/context.md'), 'resource')
  const service = new ExtensionService(path.join(root, 'app'), engine); await service.load()
  await service.importSkill(source); await service.toggleSkill('my-skill', false)
  assert.equal(await readFile(path.join(root, 'app/extensions/disabled-skills/my-skill/references/context.md'), 'utf8'), 'resource')
  await service.toggleSkill('my-skill', true); await service.removeSkill('my-skill')
  assert.equal(await readFile(path.join(source, 'references/context.md'), 'utf8'), 'resource')
  const imports = await Promise.allSettled([service.importSkill(source), service.importSkill(source)])
  assert.equal(imports.filter(r => r.status === 'fulfilled').length, 1)
  await symlink('/etc', path.join(source, 'escape'))
  await assert.rejects(copySkill(source, copied), /符号链接/)
  await rm(path.join(source, 'escape')); await writeFile(path.join(source, 'huge'), ''); await truncate(path.join(source, 'huge'), 21 * 1024 * 1024)
  await assert.rejects(copySkill(source, copied), /20 MiB/)
 } finally { await rm(root, { recursive: true, force: true }) }
})
test('bundled skills migrate old installs, preserve disabled choices and imports, update only owned content', async () => {
 const temp = await mkdtemp(path.join(tmpdir(), 'nxn-bundled-'))
 const root = path.join(temp, 'app'), bundle = path.join(temp, 'bundle')
 const engine: any = { state: { status: 'stopped' }, request: async () => [{id:'external-skill',name:'External',description:'Existing'},...builtinSkills.map(spec => ({ ...spec, description: 'Engine description' }))] }
 const source = path.join(root, 'extensions/skills/user-workflow/SKILL.md')
 const legacy = { id: 'user-workflow', name: 'User workflow', description: 'Preserved', enabled: true }
 try {
  await cp(builtinSkillsPath, bundle, { recursive: true })
  await mkdir(path.dirname(source), { recursive: true }); await writeFile(source, 'USER_OWNED_CONTENT')
  await writeFile(path.join(root, 'extensions/extensions.json'), JSON.stringify({version:1, providers:[], servers:[], skills:[legacy]}))
  const service = new ExtensionService(root, engine, bundle); await service.load()
  let list = await service.list()
  assert.equal(list.skills.filter(skill => skill.builtin && skill.enabled).length, 8)
  assert.deepEqual(list.skills.find(skill => skill.id === legacy.id), { ...legacy, available: false })
  const id = 'nxncode-debug', file = path.join(root, 'extensions/skills', id, 'SKILL.md')
  const inode = (await stat(file)).ino
  await service.load(); assert.equal((await stat(file)).ino, inode, 'Unchanged bundle should not rewrite watched files')
  await service.toggleSkill(id, false)
  await assert.rejects(service.removeSkill(id), /内置.*停用/)
  const bundledFile = path.join(bundle, id, 'SKILL.md'), updated = await readFile(bundledFile, 'utf8') + '\nUPDATED_BUNDLE\n'
  await writeFile(bundledFile, updated)
  const reopened = new ExtensionService(root, engine, bundle); await reopened.load()
  list = await reopened.list()
  assert.equal(list.skills.length, 9); assert.equal(list.skills.find(skill => skill.id === id)?.enabled, false)
  assert.equal(await readFile(path.join(root, 'extensions/disabled-skills', id, 'SKILL.md'), 'utf8'), updated)
  assert.equal(await readFile(source, 'utf8'), 'USER_OWNED_CONTENT')
  assert.ok(!(await reopened.catalogSkills()).some(skill => skill.id === id), 'A stale engine snapshot must not expose disabled skills')
  assert.equal((await reopened.catalogSkills())[0].name, '任务规划'); assert.ok((await reopened.catalogSkills()).some(skill=>skill.id==='external-skill'))
  await reopened.toggleSkill(id, true)
  assert.equal(await readFile(file, 'utf8'), updated)
 } finally { await rm(temp, { recursive: true, force: true }) }
})
test('bundled skill migration refuses an existing user-owned reserved ID', async () => {
 const root = await mkdtemp(path.join(tmpdir(), 'nxn-skill-collision-'))
 const folder = path.join(root, 'extensions'), file = path.join(folder, 'skills/nxncode-plan/SKILL.md')
 const engine: any = { state: { status: 'stopped' }, request: async () => [] }
 try {
  await mkdir(path.dirname(file), { recursive: true }); await writeFile(file, 'KEEP_EXISTING_FILE')
  await writeFile(path.join(folder, 'extensions.json'), JSON.stringify({ version:1, skills:[{id:'nxncode-plan',name:'Existing',description:'Existing',enabled:true}] }))
  await assert.rejects(new ExtensionService(root, engine).load(), /冲突.*未覆盖/)
  assert.equal(await readFile(file, 'utf8'), 'KEEP_EXISTING_FILE')
 } finally { await rm(root, { recursive: true, force: true }) }
})
test('first catalog waits for the engine initial skill scan instead of caching an empty menu', async () => {
 const root = await mkdtemp(path.join(tmpdir(), 'nxn-skill-scan-'))
 let calls = 0
 const engine: any = { state: { status: 'ready' }, request: async () => ++calls === 1 ? [] : builtinSkills.map(spec => ({id:spec.id,name:spec.id})) }
 try {
  const service = new ExtensionService(root, engine); await service.load()
  const catalog = await service.catalogSkills()
  assert.equal(catalog.length, 8); assert.equal(catalog[0].name, '任务规划')
 } finally { await rm(root, { recursive: true, force: true }) }
})
