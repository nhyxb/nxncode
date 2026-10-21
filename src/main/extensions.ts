import { promises as fs } from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { unwrap, type Engine } from './engine'
import type { Wire } from '../shared/types'
import { builtinSkills, builtinSkillsPath } from './builtin-skills'

type Skill = { id: string; name: string; description: string; enabled: boolean; builtin?: boolean }
type Provider = { id: string; name: string; baseURL: string; key?: string; models: { id: string; name: string }[] }
type Server = { id: string; type: 'local' | 'remote'; command?: string[]; cwd?: string; url?: string; environment?: Record<string, string>; headers?: Record<string, string>; enabled: boolean }
type Data = { version: 1; providers: Provider[]; servers: Server[]; skills: Skill[] }
const empty = (): Data => ({ version: 1, providers: [], servers: [], skills: [] })
const pause = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))
export function extensionID(value: unknown) {
 if (typeof value !== 'string' || !/^[a-z][a-z0-9_-]{0,63}$/.test(value) || value.startsWith('nxncode')) throw Error('ID 需以小写字母开头，只能包含小写字母、数字、- 和 _，且不能使用 nxncode 保留名称')
 return value
}
function text(value: unknown, label: string, max = 200) {
 if (typeof value !== 'string' || !value.trim() || value.length > max || value.includes('\0')) throw Error(label + '格式不正确')
 return value.trim()
}
export function endpoint(value: unknown) {
 const url = new URL(text(value, '地址', 2048))
 if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.hash || url.search) throw Error('请填写不含账号密码、查询参数或锚点的 HTTP / HTTPS 地址；鉴权请使用 API Key 或请求头')
 return url.href.replace(/\/$/, '')
}
function stringMap(value: unknown): Record<string, string> | undefined {
 if (value === undefined) return undefined
 if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length > 64 || Object.entries(value).some(([key, val]) => !key || typeof val !== 'string' || val.length > 8192 || /[\r\n\0]/.test(key))) throw Error('环境变量或请求头必须是字符串键值对象')
 return value as Record<string, string>
}
async function atomic(file: string, value: unknown) {
 await atomicText(file, JSON.stringify(value, null, 2) + '\n')
}
async function atomicText(file: string, content: string) {
 await fs.mkdir(path.dirname(file), { recursive: true, mode: 0o700 })
 const tmp = file + '.' + randomUUID() + '.tmp'
 try { await fs.writeFile(tmp, content, { mode: 0o600 }); await fs.rename(tmp, file) }
 finally { await fs.rm(tmp, { force: true }) }
}
function skillMetadata(content: string, fallbackName: string) {
 if (content.length > 1024 * 1024) throw Error('SKILL.md 超过大小限制')
 const header = content.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/)?.[1]
 if (!header) throw Error('SKILL.md 需要有效的 YAML 信息头')
 const field = (key: string) => header.match(new RegExp('^' + key + ':\\s*([^\\n]+)', 'm'))?.[1]?.trim().replace(/^["']|["']$/g, '')
 const description = field('description')
 if (!description) throw Error('SKILL.md 缺少 description')
 return { name: field('name') || fallbackName, description: /^[>|]/.test(description) ? header.match(/^description:\s*[>|][^\n]*\n((?:[ \t]+[^\n]*\n?)+)/m)?.[1]?.replace(/\s+/g, ' ').trim() || fallbackName : description }
}
export async function copySkill(source: string, target: string) {
 try { await fs.lstat(target); throw Error('导入目标已存在，未覆盖原有文件') } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error }
 let count = 0, bytes = 0
 async function copy(from: string, to: string, depth: number) {
  const stat = await fs.lstat(from)
  if (stat.isSymbolicLink() || depth > 12) throw Error('Skill 包含符号链接或目录层级过深，未导入')
  if (stat.isDirectory()) {
   await fs.mkdir(to, { recursive: true, mode: 0o700 })
   for (const name of await fs.readdir(from)) {
    if (['.git', 'node_modules'].includes(name) || name === '.env' || name.startsWith('.env.')) continue
    await copy(path.join(from, name), path.join(to, name), depth + 1)
   }
  } else if (stat.isFile()) {
   bytes += stat.size
   if (++count > 1000 || bytes > 20 * 1024 * 1024) throw Error('Skill 超过 1000 个文件或 20 MiB，未导入')
   await fs.copyFile(from, to); await fs.chmod(to, stat.mode & 0o100 ? 0o700 : 0o600)
  } else throw Error('Skill 只能包含普通文件和目录')
 }
 try { await copy(source, target, 0) } catch (error) { await fs.rm(target, { recursive: true, force: true }); throw error }
}
export class ExtensionService {
 private data: Data = empty()
 private queue = Promise.resolve()
 private folder: string
 private config: string
 constructor(private root: string, private engine: Pick<Engine, 'state' | 'request'>, private bundledPath = builtinSkillsPath) {
  this.folder = path.join(root, 'extensions')
  this.config = path.join(root, 'engine/config/opencode/opencode.json')
 }
 async load() {
  try { const value = JSON.parse(await fs.readFile(path.join(this.folder, 'extensions.json'), 'utf8')); if (value.version !== 1) throw Error('不支持的扩展配置版本'); this.data = { ...empty(), ...value } }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw Error('扩展配置无法读取，请检查本机 extensions/extensions.json') }
  const previousSkills = JSON.stringify(this.data.skills)
  const bundled = await Promise.all(builtinSkills.map(async spec => {
   const content = await fs.readFile(path.join(this.bundledPath, spec.id, 'SKILL.md'), 'utf8')
   const metadata = skillMetadata(content, spec.id)
   if (metadata.name !== spec.id) throw Error('内置 Skill 资源名称不一致：' + spec.id)
   return { ...spec, description: metadata.description, content }
  }))
  const installed: Skill[] = []
  for (const { content, ...spec } of bundled) {
   const old = this.data.skills.find(skill => skill.id === spec.id)
   if (old && !old.builtin) throw Error('内置 Skill ID 与已有导入项冲突，未覆盖：' + spec.id)
   const skill: Skill = { ...spec, enabled: old?.enabled ?? true, builtin: true }
   const file = path.join(this.skillPath(skill), 'SKILL.md')
   let existing: string | undefined
   try { existing = await fs.readFile(file, 'utf8') } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error }
   if (!old && existing !== undefined && existing !== content) throw Error('内置 Skill 目标已有其他文件，未覆盖：' + spec.id)
   if (existing !== content) await atomicText(file, content)
   installed.push(skill)
  }
  this.data.skills = [...installed, ...this.data.skills.filter(skill => !builtinSkills.some(spec => spec.id === skill.id))]
  await this.writeConfig(this.data, this.data)
  if (JSON.stringify(this.data.skills) !== previousSkills) await atomic(path.join(this.folder, 'extensions.json'), this.data)
 }
 async catalogSkills() {
  let skills: Wire[] = unwrap(await this.engine.request('GET', 'api/skill')) || []
  // The engine can report ready before its initial filesystem scan completes.
  const expected = this.data.skills.filter(skill => skill.builtin && skill.enabled)
  const deadline = Date.now() + 5000
  while (this.engine.state.status === 'ready' && expected.some(skill => !skills.some(found => found.id === skill.id)) && Date.now() < deadline) {
   await pause(150); skills = unwrap(await this.engine.request('GET', 'api/skill')) || []
  }
  return skills.flatMap(skill => {
   const own = this.data.skills.find(item => item.id === skill.id)
   return own?.enabled === false ? [] : [{ id: skill.id, name: own?.name || skill.name, description: own?.description || skill.description, builtin: !!own?.builtin }]
  }).sort((a, b) => Number(b.builtin) - Number(a.builtin))
 }
 private skillPath(skill: Skill) { return path.join(this.folder, skill.enabled ? 'skills' : 'disabled-skills', skill.id) }
 private serverConfig(server: Server) {
  const { id: _, enabled, ...config } = server
  return { ...config, disabled: !enabled, ...(server.type === 'remote' ? { oauth: false } : {}) }
 }
 private async writeConfig(next: Data, previous: Data) {
  let config: Wire = {}
  try { config = JSON.parse(await fs.readFile(this.config, 'utf8')) } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw Error('独立引擎配置无法读取，请修复配置后重试') }
  config.providers = { ...config.providers }; config.mcp = { ...config.mcp, servers: { ...config.mcp?.servers } }
  for (const provider of previous.providers) delete config.providers[provider.id]
  for (const server of previous.servers) delete config.mcp.servers[server.id]
  for (const provider of next.providers) config.providers[provider.id] = {
   name: provider.name, package: '@opencode/ai/providers/openai-compatible',
   settings: { baseURL: provider.baseURL, apiKey: provider.key || 'not-required' },
   models: Object.fromEntries(provider.models.map(model => [model.id, { name: model.name }]))
  }
  for (const server of next.servers) config.mcp.servers[server.id] = this.serverConfig(server)
  const skills = path.join(this.folder, 'skills'); await fs.mkdir(skills, { recursive: true, mode: 0o700 })
  config.skills = [...new Set([...(config.skills || []), skills])]
  await atomic(this.config, config)
 }
 private mutate(change: (next: Data) => Promise<(() => Promise<void>) | void> | (() => Promise<void>) | void, check?: () => Promise<boolean>) {
  const operation = this.queue.then(async () => {
   const previous = this.data, next = structuredClone(previous)
   const rollback = await change(next)
   try {
    await this.writeConfig(next, previous)
    if (this.engine.state.status === 'ready' && check) {
     const deadline = Date.now() + 15000
     while (!await check()) { if (Date.now() > deadline) throw Error('引擎未确认配置变更，请稍后重试'); await pause(250) }
    }
    await atomic(path.join(this.folder, 'extensions.json'), next); this.data = next
    return this.list()
   } catch (error) {
    await rollback?.(); await this.writeConfig(previous, next)
    // Engine errors can contain submitted secrets. Never forward their payloads.
    if (error instanceof Error && error.message === '引擎未确认配置变更，请稍后重试') throw error
    throw Error('扩展配置未能应用，已恢复原配置。请检查地址、命令或引擎状态后重试。')
   }
  })
  this.queue = operation.then(() => {}, () => {})
  return operation
 }
 async list() {
  let online = this.engine.state.status === 'ready'
  let servers: Wire[] = [], skills: Wire[] = []
  if (online) {
   try { [servers, skills] = await Promise.all([this.engine.request('GET', 'api/mcp').then(value => unwrap<Wire[]>(value) || []), this.engine.request('GET', 'api/skill').then(value => unwrap<Wire[]>(value) || [])]) }
   catch { online = false }
  }
  return {
   online,
   providers: this.data.providers.map(({ key, ...provider }) => ({ ...provider, hasKey: !!key })),
   servers: this.data.servers.map(({ environment, headers, ...server }) => ({ ...server, environmentKeys: Object.keys(environment || {}), headerKeys: Object.keys(headers || {}), status: servers.find(s => s.name === server.id)?.status?.status || (server.enabled ? online ? 'pending' : 'offline' : 'disabled') })),
   skills: this.data.skills.map(skill => ({ ...skill, available: skills.some(s => s.id === skill.id) })),
   builtinServers: servers.filter(s => s.name === 'nxncode-tools').map(s => ({ id: s.name, status: s.status.status })),
   discoveredSkills: skills.filter(s => !this.data.skills.some(own => own.id === s.id)).map(s => ({ id: s.id, name: s.name, description: s.description }))
  }
 }
 async saveProvider(input: Wire) {
  const id = extensionID(input.id)
  if (['opencode','openai','anthropic','google','azure','openrouter','github-copilot','amazon-bedrock','ollama'].includes(id) && !this.data.providers.some(p=>p.id===id)) throw Error('请为自定义供应商使用独立 ID，不能覆盖内置供应商')
  const name = text(input.name, '供应商名称'), baseURL = endpoint(input.baseURL)
  if (!Array.isArray(input.models) || input.models.length < 1 || input.models.length > 100) throw Error('请添加 1 至 100 个模型')
  const models = input.models.map((model: Wire) => ({ id: text(model.id, '模型 ID', 200), name: text(model.name || model.id, '模型名称', 200) }))
  if (new Set(models.map(m => m.id)).size !== models.length || models.some(m => /[#\0\r\n]/.test(m.id))) throw Error('模型 ID 重复或格式不正确')
  if (input.key !== undefined && (typeof input.key !== 'string' || input.key.length > 8192 || /[\r\n\0]/.test(input.key))) throw Error('API Key 格式不正确')
  if (this.engine.state.status === 'ready' && !this.data.providers.some(p => p.id === id)) {
   const providers: Wire[] = unwrap(await this.engine.request('GET', 'api/provider')) || []
   if (providers.some(provider => provider.id === id)) throw Error('这个 ID 已由内置供应商使用，请更换 ID')
  }
  let expectedKey = ''
  return this.mutate(next => {
   const old = next.providers.find(provider => provider.id === id)
   expectedKey = input.key?.trim() || old?.key || 'not-required'
   next.providers = [...next.providers.filter(provider => provider.id !== id), { id, name, baseURL, models, key: input.key?.trim() || old?.key }]
  }, async () => {
   const catalog: Wire[] = unwrap(await this.engine.request('GET', 'api/model')) || []
   const owned = catalog.filter(model => model.providerID === id)
   return owned.length === models.length && models.every(model => owned.some(m => m.id === model.id && m.name === model.name && m.settings?.baseURL === baseURL && m.settings?.apiKey === expectedKey))
  })
 }
 removeProvider(id: string) {
  extensionID(id)
  return this.mutate(next => { next.providers = next.providers.filter(provider => provider.id !== id) }, async () => !(unwrap<Wire[]>(await this.engine.request('GET', 'api/model')) || []).some(model => model.providerID === id))
 }
 saveServer(input: Wire) {
  const id = extensionID(input.id)
  if (!['local', 'remote'].includes(input.type)) throw Error('请选择本地命令或 HTTP 服务')
  const environment = stringMap(input.environment), headers = stringMap(input.headers)
  const config: Server = { id, type: input.type, enabled: input.enabled !== false }
  if (config.type === 'local') {
   if (!Array.isArray(input.command) || !input.command.length || input.command.length > 100 || input.command.some((part: unknown) => typeof part !== 'string' || part.includes('\0') || part.length > 8192) || !input.command[0].trim()) throw Error('命令须为非空的程序与参数数组')
   config.command = input.command
   if (input.cwd) { if (!path.isAbsolute(input.cwd)) throw Error('工作目录必须是绝对路径'); config.cwd = input.cwd }
  } else config.url = endpoint(input.url)
  return this.mutate(next => {
   const old = next.servers.find(server => server.id === id)
   next.servers = [...next.servers.filter(server => server.id !== id), { ...config, ...(config.type === 'local' ? { environment: environment ?? old?.environment } : { headers: headers ?? old?.headers }) }]
  }, async () => (unwrap<Wire[]>(await this.engine.request('GET', 'api/mcp')) || []).some(server => server.name === id && (config.enabled || server.status?.status === 'disabled')))
 }
 toggleServer(id: string, enabled: boolean) {
  const server = this.data.servers.find(server => server.id === id)
  if (!server) throw Error('MCP 服务不存在')
  return this.saveServer({ ...server, enabled })
 }
 removeServer(id: string) {
  extensionID(id)
  return this.mutate(next => { next.servers = next.servers.filter(server => server.id !== id) }, async () => !(unwrap<Wire[]>(await this.engine.request('GET', 'api/mcp')) || []).some(server => server.name === id))
 }
 async importSkill(source: string) {
  const content = await fs.readFile(path.join(source, 'SKILL.md'), 'utf8')
  const id = extensionID(path.basename(source))
  if (this.data.skills.some(skill => skill.id === id)) throw Error('同名 Skill 已存在，请先移除旧版本再导入')
  const skill: Skill = { id, ...skillMetadata(content, id), enabled: true }
  return this.mutate(async next => {
   if (next.skills.some(existing => existing.id === id)) throw Error('同名 Skill 已存在，请先移除旧版本再导入')
   await copySkill(source, this.skillPath(skill)); next.skills.push(skill)
   return () => fs.rm(this.skillPath(skill), { recursive: true, force: true })
  }, async () => (unwrap<Wire[]>(await this.engine.request('GET', 'api/skill')) || []).some(s => s.id === id))
 }
 toggleSkill(id: string, enabled: boolean) {
  return this.mutate(async next => {
   const skill = next.skills.find(skill => skill.id === id)
   if (!skill) throw Error('Skill 不存在')
   const from = this.skillPath(skill); skill.enabled = enabled; const to = this.skillPath(skill)
   if (from !== to) { await fs.mkdir(path.dirname(to), { recursive: true, mode: 0o700 }); await fs.rename(from, to) }
   return async () => { if (from !== to) await fs.rename(to, from) }
  }, async () => (unwrap<Wire[]>(await this.engine.request('GET', 'api/skill')) || []).some(s => s.id === id) === enabled)
 }
 async removeSkill(id: string) {
  const skill = this.data.skills.find(skill => skill.id === id)
  if (!skill) throw Error('Skill 不存在')
  if (skill.builtin) throw Error('内置 Skill 随应用提供，可以停用，不能移除')
  const from = this.skillPath(skill), trash = path.join(this.folder, 'trash-' + randomUUID())
  const result = await this.mutate(async next => {
   await fs.rename(from, trash); next.skills = next.skills.filter(skill => skill.id !== id)
   return () => fs.rename(trash, from)
  }, async () => !(unwrap<Wire[]>(await this.engine.request('GET', 'api/skill')) || []).some(s => s.id === id))
  await fs.rm(trash, { recursive: true, force: true }); return result
 }
}
