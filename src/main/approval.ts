import os from 'node:os'
import path from 'node:path'

// Auto approve keeps the engine in "ask" mode and answers each permission
// request here. Decisions are deterministic and explainable: the operation,
// its paths, the project scope and the user's latest request are inspected
// before anything is approved. Risky work is denied with guidance instead of
// being silently allowed.
export type PermissionRequest = {
  id?: string
  sessionID?: string
  action?: string
  resources?: unknown
  metadata?: Record<string, unknown>
  message?: string
}

export type ApprovalContext = { directory?: string; authorization?: string }
export type RiskLevel = 'low' | 'medium' | 'high'
export type ApprovalIntent = 'delete' | 'write' | 'network' | 'git' | 'install' | 'process' | 'permission' | 'secret' | 'run' | 'external'
export type ApprovalResult = { decision: 'once' | 'reject'; risk: RiskLevel; reason: string }

type Analysis = { risk: RiskLevel; reasons: string[]; intents: Set<ApprovalIntent>; targets: string[] }

const INTENTS: Record<ApprovalIntent, RegExp> = {
  delete: /删除|删掉|移除|清理|清空|delete|remove|\brm\b/i,
  write: /创建|新建|写入|修改|编辑|保存|生成|重命名|移动|复制|覆盖|create|write|edit|save|rename|move|copy/i,
  network: /下载|抓取|获取|访问|请求|搜索|网页|网络|联网|fetch|download|request|search|https?:\/\//i,
  git: /提交|推送|合并|变基|暂存|分支|标签|commit|push|merge|rebase|stash|branch|tag/i,
  install: /安装|依赖|软件包|install|package|dependency|\badd\b/i,
  process: /停止|终止|结束|重启|进程|kill|stop|restart|process/i,
  permission: /权限|所有者|chmod|chown|permission/i,
  secret: /\.env|环境变量|密钥|凭证|凭据|密码|credential|secret|token|api\s*key|password/i,
  run: /运行|执行|命令|终端|脚本|测试|构建|run|execute|command|shell|terminal|test|build|lint|check/i,
  external: /外部|其他目录|绝对路径|主目录|桌面|下载目录|external|absolute|home|projects?|workspace/i
}

const INTENT_LABELS: Record<ApprovalIntent, string> = {
  delete: '删除文件',
  write: '修改文件',
  network: '访问外部网络',
  git: '改写 Git 仓库状态',
  install: '安装或执行第三方软件包',
  process: '终止本机进程',
  permission: '修改文件权限',
  secret: '读取敏感配置',
  run: '执行无法确认安全性的命令',
  external: '访问项目目录之外的路径'
}

const STRUCTURAL_HIGH: [RegExp, string][] = [
  [/:\s*\(\s*\)\s*\{/, '疑似 fork 炸弹'],
  [/\b(curl|wget)\b[^\n|;&]*\|\s*(sudo\s+)?(ba|z|da|k)?sh\b/, '从网络下载并直接执行脚本'],
  [/\beval\b[^\n]*\$\(\s*(curl|wget)\b/, '从网络获取并执行代码']
]

const HIGH_RISK: [RegExp, string][] = [
  [/\b(sudo|doas|pkexec)\b/, '请求系统管理员权限'],
  [/\bsu\s+(-[^\s]*\s+)?root\b/, '切换到 root 用户'],
  [/\b(mkfs(\.\w+)?|wipefs|fdisk|parted)\b/, '格式化或修改磁盘分区'],
  [/\bdd\b[^\n]*\bof=\/dev\//, '直接写入块设备'],
  [/\b(shutdown|reboot|poweroff|halt)\b/, '关闭或重启系统'],
  [/\bsystemctl\s+(stop|disable|mask|poweroff|reboot|isolate)\b/, '修改系统服务状态'],
  [/\bcrontab\b/, '修改计划任务'],
  [/\bhistory\s+-c\b/, '清除命令历史'],
  [/\bgit\s+push\b[^\n]*(--force\b|--force-with-lease\b|\s-f(\s|$))/, '强制推送覆盖远端历史'],
  [/\bgit\s+reset\s+--hard\b/, '丢弃未提交的修改'],
  [/\bgit\s+clean\s+-[a-z]*[fx]/, '删除未跟踪文件'],
  [/\bgit\s+(filter-branch|filter-repo|reflog\s+expire)\b/, '改写或清理 Git 历史'],
  [/\b(npm|pnpm|yarn|bun)\s+[^\n]*\s(-g|--global)(\s|$)/, '全局安装软件包'],
  [/\b(pip3?|gem|composer|dotnet\s+tool)\s+[^\n]*\s(--user|--global|--system|-g)(\s|$)/, '全局安装软件包'],
  [/\brsync\b[^\n]*\s--delete(\s|$)/, '同步时删除目标端文件'],
  [/\bchmod\b[^\n]*\b777\b[^\n]*\s(\/|~|\$HOME)(\s|$)/, '对系统目录或主目录开放全部权限']
]

const CREDENTIAL = /(^|[\s"'`/])(~|\$HOME)\/\.ssh(\/|\b)|\.gnupg(\/|\b)|\bid_(rsa|ed25519|ecdsa|dsa)\b|(^|[\s"'`/])\.aws(\/|\b)|(^|\/)\.netrc\b|^\/etc\/(shadow|gshadow|sudoers)$|(^|[\s"'`/])\.config\/gh\/hosts\b/i


const READ_ONLY = new Set(['ls','pwd','cat','head','tail','wc','grep','rg','ag','ack','stat','file','du','df','tree','which','whereis','type','basename','dirname','realpath','readlink','sort','uniq','cut','tr','jq','diff','cmp','md5sum','sha1sum','sha256sum','date','whoami','id','uname','hostname','echo','printf','test','[','true','false','sleep','cd','pushd','popd','column','paste','comm','nl','od','strings'])
const SAFE_READERS = new Set([...READ_ONLY, 'sed'])
const SIMPLE_WRITE: Record<string, [RiskLevel, ApprovalIntent]> = {
  rm: ['medium','delete'], rmdir: ['medium','delete'], unlink: ['medium','delete'], shred: ['medium','delete'],
  mv: ['medium','write'], ln: ['medium','write'], tee: ['medium','write'], truncate: ['medium','write'],
  mkdir: ['low','write'], touch: ['low','write'], cp: ['low','write'],
  chmod: ['medium','permission'], chown: ['medium','permission'], chgrp: ['medium','permission']
}
const PACKAGE = new Set(['npm','pnpm','yarn','bun'])
const INSTALLERS = new Set(['pip','pip3','uv','gem','composer','dotnet','apt','apt-get','dnf','yum','pacman','brew','snap','flatpak'])

const resourceList = (value: unknown): string[] => Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string' && !!item.trim()) : []

function resolveTarget(value: string, base: string) {
  let raw = value.trim().replace(/^file:\/\//, '')
  try { raw = decodeURIComponent(raw) } catch {}
  raw = raw.replace(/^\$HOME(?=\/|$)/, os.homedir()).replace(/^~(?=\/|$)/, os.homedir())
  // Permission resources may be glob patterns; strip the wildcard part.
  raw = raw.replace(/[*?[\]]/g, '')
  return path.resolve(base, raw)
}

function inside(target: string, base: string) {
  const root = path.resolve(base)
  return target === root || target.startsWith(root + path.sep) || target === os.tmpdir() || target.startsWith(os.tmpdir() + path.sep)
}

function tokenize(segment: string) {
  const tokens: string[] = []
  let current = '', quote = ''
  for (let i = 0; i < segment.length; i++) {
    const char = segment[i]
    if (quote) {
      if (char === quote) quote = ''
      else if (char === '\\' && quote === '"' && i + 1 < segment.length) current += segment[++i]
      else current += char
      continue
    }
    if (char === '"' || char === "'") { quote = char; continue }
    if (/\s/.test(char)) { if (current) { tokens.push(current); current = '' } continue }
    current += char
  }
  if (current) tokens.push(current)
  return tokens
}

function raise(analysis: Analysis, risk: RiskLevel, reason: string, intent?: ApprovalIntent) {
  if (risk === 'high') analysis.risk = 'high'
  else if (risk === 'medium' && analysis.risk === 'low') analysis.risk = 'medium'
  if (reason && !analysis.reasons.includes(reason)) analysis.reasons.push(reason)
  if (intent) analysis.intents.add(intent)
}

function credential(paths: string[]) {
  return paths.some(value => CREDENTIAL.test(value))
}

function sensitiveConfig(paths: string[]) {
  return paths.some(value => /(^|\/)\.env(\.|$)/i.test(value))
}

function checkPaths(analysis: Analysis, values: string[], base: string, mode: 'read' | 'write') {
  for (const value of values) {
    if (!value || value === '-') continue
    const target = resolveTarget(value, base)
    analysis.targets.push(target)
    if (credential([value, target])) { raise(analysis, 'high', '访问密钥或系统凭据文件'); continue }
    if (sensitiveConfig([value, target])) raise(analysis, 'medium', '读取或修改 .env 等敏感配置', 'secret')
    if (!inside(target, base)) raise(analysis, mode === 'read' ? 'medium' : 'high', mode === 'read' ? '读取项目目录之外的路径' : '写入项目目录之外的路径', 'external')
    else if (mode === 'write') raise(analysis, 'low', '修改项目内的文件', 'write')
  }
}

function checkRedirects(analysis: Analysis, segment: string, base: string) {
  const pattern = /(^|[^0-9&])>>?\s*("[^"]*"|'[^']*'|[^\s;&|]+)/g
  let match: RegExpExecArray | null
  while ((match = pattern.exec(segment))) {
    const target = match[2].replace(/^['"]|['"]$/g, '')
    if (!target || target.startsWith('&') || /^\/dev\/(null|stdout|stderr)$/.test(target)) continue
    const resolved = resolveTarget(target, base)
    analysis.targets.push(resolved)
    if (!inside(resolved, base)) raise(analysis, 'high', '重定向写入项目目录之外的路径', 'external')
    else raise(analysis, 'low', '写入项目内的文件', 'write')
  }
}

function argsAfter(tokens: string[], flags: string[] = []) {
  const args: string[] = []
  for (let i = 1; i < tokens.length; i++) {
    const token = tokens[i]
    if (flags.includes(token)) { i++; continue }
    if (token.startsWith('-')) continue
    args.push(token)
  }
  return args
}

function analyzeGit(analysis: Analysis, args: string[], base: string) {
  const sub = args[0] || ''
  if (['status','diff','log','show','rev-parse','describe','blame','shortlog','ls-files','grep','version','--version'].includes(sub)) return
  if (!sub) { raise(analysis, 'low', '查看 Git 状态'); return }
  if (sub === 'branch' && (args.includes('-d') || args.includes('-D') || args.includes('-m'))) { raise(analysis, 'medium', '删除或重命名本地分支', 'git'); return }
  if (sub === 'remote' && ['add','remove','rm','set-url'].includes(args[1] || '')) { raise(analysis, 'medium', '修改远程仓库配置', 'git'); return }
  if (sub === 'config') {
    const glob = args.some(value => value === '--global' || value === '--system')
    if (glob) raise(analysis, 'high', '修改全局 Git 配置')
    else raise(analysis, 'medium', '修改仓库 Git 配置', 'git')
    return
  }
  if (sub === 'stash' && ['list','show'].includes(args[1] || '')) { raise(analysis, 'low', '查看暂存内容'); return }
  if (['add','commit','stash','restore','checkout','switch','merge','rebase','cherry-pick','revert','init','tag'].includes(sub)) {
    raise(analysis, 'medium', '修改本地仓库状态', 'git')
    return
  }
  if (['fetch','pull','push','clone','remote'].includes(sub)) {
    const target = args.find(value => !value.startsWith('-') && /^\.{0,2}\//.test(value))
    if (target) checkPaths(analysis, [target], base, 'write')
    raise(analysis, 'medium', '与远端仓库交互', 'git')
    return
  }
  raise(analysis, 'medium', '执行未识别的 Git 子命令', 'git')
}

function analyzeSegment(analysis: Analysis, segment: string, base: string, depth = 0) {
  const tokens = tokenize(segment)
  while (tokens.length && /^[A-Za-z_][A-Za-z0-9_]*=/.test(tokens[0])) tokens.shift()
  if (!tokens.length) return
  let command = tokens[0].replace(/^\\/, '')
  if (['env','command','builtin','nohup','time','nice','ionice','stdbuf','exec'].includes(command) && tokens.length > 1) {
    tokens.shift()
    command = tokens[0].replace(/^\\/, '')
  }
  const args = tokens.slice(1)
  if (command === 'cd') return
  if (['bash','sh','zsh','dash','ksh','fish'].includes(command)) {
    const flag = args.indexOf('-c')
    if (flag >= 0 && args[flag + 1] && depth < 2) return analyzeShellCommand(analysis, args[flag + 1], base, depth + 1)
    raise(analysis, 'low', '启动交互式 shell')
    return
  }
  if (command === 'eval' || command === 'source' || command === '.') { raise(analysis, 'medium', '执行动态生成的命令', 'run'); return }
  if (command === 'history') { raise(analysis, args.includes('-c') ? 'high' : 'low', args.includes('-c') ? '清除命令历史' : '查看命令历史'); return }
  if (command === 'find') {
    const paths = args.filter(value => !value.startsWith('-'))
    if (credential(paths)) { raise(analysis, 'high', '访问密钥或系统凭据文件'); return }
    if (args.some(value => ['-delete','-exec','-execdir','-ok','-okdir'].includes(value))) raise(analysis, 'medium', '查找并修改或删除文件', 'delete')
    else raise(analysis, 'low', '查找文件')
    return
  }
  if (command === 'sed' && args.some(value => value === '-i' || value.startsWith('--in-place'))) {
    const targets = argsAfter(tokens, ['-e'])
    checkPaths(analysis, targets.filter(value => !value.startsWith('-')), base, 'write')
    raise(analysis, 'medium', '就地修改文件', 'write')
    return
  }
  if (command === 'git') return analyzeGit(analysis, args, base)
  if (SIMPLE_WRITE[command]) {
    const [risk, intent] = SIMPLE_WRITE[command]
    checkPaths(analysis, args.filter(value => !value.startsWith('-')), base, 'write')
    raise(analysis, risk, INTENT_LABELS[intent], intent)
    return
  }
  if (command === 'sed' || command === 'awk' || command === 'grep' || command === 'rg') {
    const values = args.filter(value => !value.startsWith('-'))
    if (credential(values)) { raise(analysis, 'high', '访问密钥或系统凭据文件'); return }
    if (sensitiveConfig(values)) raise(analysis, 'medium', '读取 .env 等敏感配置', 'secret')
    raise(analysis, 'low', '读取并筛选文本')
    return
  }
  if (command === 'tar' || command === 'unzip' || command === 'zip' || command === 'gzip' || command === 'gunzip') {
    const dirFlag = args.findIndex(value => value === '-C' || value === '--directory' || value === '-d')
    const targets = dirFlag >= 0 && args[dirFlag + 1] ? [args[dirFlag + 1]] : []
    checkPaths(analysis, targets, base, 'write')
    raise(analysis, 'medium', '解压或打包文件', 'write')
    return
  }
  if (command === 'dd') {
    const output = args.find(value => value.startsWith('of='))
    if (output) checkPaths(analysis, [output.slice(3)], base, 'write')
    raise(analysis, 'medium', '直接写入文件或设备', 'write')
    return
  }
  if (command === 'curl' || command === 'wget') {
    const out = args.findIndex(value => value === '-o' || value === '--output' || value === '-O')
    if (out >= 0 && args[out + 1]) checkPaths(analysis, [args[out + 1]], base, 'write')
    raise(analysis, 'medium', '访问外部网络', 'network')
    return
  }
  if (['scp','sftp','rsync'].includes(command)) {
    const targets = args.filter(value => !value.startsWith('-'))
    if (targets.length > 1) checkPaths(analysis, [targets.at(-1)!], base, 'write')
    raise(analysis, 'medium', '与远程主机传输文件', 'network')
    return
  }
  if (command === 'gh') { raise(analysis, 'medium', '操作 GitHub 远端资源', 'network'); return }
  if (['kill','pkill','killall'].includes(command)) { raise(analysis, 'medium', '终止本机进程', 'process'); return }
  if (['docker','podman'].includes(command)) { raise(analysis, 'medium', '操作容器或镜像', 'run'); return }
  if (PACKAGE.has(command)) {
    const sub = args[0] || ''
    if (['install','i','add','dlx','exec','create'].includes(sub) || sub.startsWith('@')) { raise(analysis, 'medium', '安装或执行第三方软件包', 'install'); return }
    if (['run','test','build','lint','typecheck','start','dev','watch'].includes(sub)) { raise(analysis, 'low', '运行项目脚本'); return }
    raise(analysis, 'medium', '执行包管理器命令', 'run')
    return
  }
  if (command === 'npx' || command === 'bunx') { raise(analysis, 'medium', '执行第三方软件包', 'install'); return }
  if (INSTALLERS.has(command)) { raise(analysis, 'medium', '安装第三方软件包', 'install'); return }
  if (['node','python','python3','ruby','perl','php'].includes(command) && args.some(value => value === '-e' || value === '-c' || value === '--eval')) {
    raise(analysis, 'medium', '执行内联代码', 'run')
    return
  }
  if (['make','cmake','ninja','cargo','go','dotnet','mvn','gradle','javac','tsc','eslint','vitest','jest','playwright'].includes(command)) { raise(analysis, 'low', '构建或测试项目'); return }
  if (READ_ONLY.has(command)) {
    const values = args.filter(value => !value.startsWith('-'))
    if (credential(values)) { raise(analysis, 'high', '访问密钥或系统凭据文件'); return }
    if (sensitiveConfig(values)) raise(analysis, 'medium', '读取 .env 等敏感配置', 'secret')
    raise(analysis, 'low', '只读命令')
    return
  }
  if (command.startsWith('./') || command.startsWith('/')) { raise(analysis, 'medium', '执行本地程序', 'run'); return }
  raise(analysis, 'medium', '执行自动审批无法确认安全性的命令', 'run')
}

function headCommand(segment: string) {
  const tokens = tokenize(segment)
  while (tokens.length && /^[A-Za-z_][A-Za-z0-9_]*=/.test(tokens[0])) tokens.shift()
  let command = tokens[0]?.replace(/^\\/, '') || ''
  if (['env','command','builtin','nohup','time','nice','ionice','stdbuf','exec'].includes(command) && tokens[1]) command = tokens[1].replace(/^\\/, '')
  return command
}

function splitSegments(command: string) {
  // Quoted data can contain `;`, `|` and `&&`; splitting blindly would turn
  // `grep -rn "curl | sh" README.md` into a pipeline ending in `sh`.
  const segments: string[] = []
  let current = '', quote = ''
  for (let i = 0; i < command.length; i++) {
    const char = command[i]
    if (quote) {
      current += char
      if (char === quote) quote = ''
      else if (char === '\\' && quote === '"' && i + 1 < command.length) current += command[++i]
      continue
    }
    if (char === '"' || char === "'") { quote = char; current += char; continue }
    if ((char === '&' || char === '|') && command[i + 1] === char) { segments.push(current); current = ''; i++; continue }
    if (char === '|' || char === ';' || char === '\n') { segments.push(current); current = ''; continue }
    current += char
  }
  segments.push(current)
  return segments
}

function analyzeShellCommand(analysis: Analysis, command: string, base: string, depth = 0) {
  // Structural patterns must run before the pipeline is split, or `curl … | sh`
  // would pass as two harmless halves. Quoted text is data: `grep "curl | sh"`
  // searches a document instead of downloading anything, so the stripped text
  // is authoritative, and the raw text only counts when the leading program is
  // not a read-only one (a quoted payload could still be an argument, not data).
  const stripped = command.replace(/"[^"]*"|'[^']*'/g, ' ')
  const safeHead = SAFE_READERS.has(headCommand(command))
  for (const [pattern, label] of STRUCTURAL_HIGH) {
    if (pattern.test(stripped) || (!safeHead && pattern.test(command))) { raise(analysis, 'high', label); return }
  }
  for (const segment of splitSegments(command)) {
    if (!segment.trim()) continue
    checkRedirects(analysis, segment, base)
    if (!SAFE_READERS.has(headCommand(segment))) {
      // Quoted text is data (an echo, a commit message), not an operation.
      const text = segment.replace(/"[^"]*"|'[^']*'/g, ' ')
      for (const [pattern, label] of HIGH_RISK) if (pattern.test(text)) { raise(analysis, 'high', label); return }
    }
    analyzeSegment(analysis, segment, base, depth)
  }
}

const emptyAnalysis = (): Analysis => ({ risk: 'low', reasons: [], intents: new Set(), targets: [] })
const pathValues = (request: PermissionRequest, resources: string[], base: string) => {
  const values = [...resources]
  for (const key of ['filepath','path','directory','file']) {
    const value = request.metadata?.[key]
    if (typeof value === 'string') values.push(value)
  }
  const files = request.metadata?.files
  if (Array.isArray(files)) for (const file of files) {
    if (typeof file === 'string') values.push(file)
    else if (file && typeof file === 'object') {
      for (const key of ['path','filepath','target','moveTarget']) {
        const value = (file as Record<string, unknown>)[key]
        if (typeof value === 'string') values.push(value)
      }
    }
  }
  return values.map(value => resolveTarget(value, base)).filter(Boolean)
}

export function analyzePermission(request: PermissionRequest, context: ApprovalContext = {}): ApprovalResult {
  const action = String(request.action || '').toLowerCase()
  const resources = resourceList(request.resources)
  const base = path.resolve(context.directory || process.cwd())
  const analysis = emptyAnalysis()
  if (action === 'shell' || action === 'execute' || action === 'bash' || action === 'terminal') {
    const command = typeof request.metadata?.command === 'string' ? request.metadata.command : resources.join(' ')
    analyzeShellCommand(analysis, command, base)
  } else if (action === 'edit' || action === 'write' || action === 'patch' || action === 'delete') {
    checkPaths(analysis, pathValues(request, resources, base).map(value => value), base, 'write')
  } else if (action === 'read') {
    checkPaths(analysis, pathValues(request, resources, base), base, 'read')
  } else if (action === 'grep' || action === 'glob' || action === 'question' || action === 'subagent' || action === 'task') {
    raise(analysis, 'low', '只读搜索或提问')
  } else if (action === 'webfetch' || action === 'websearch' || action === 'fetch') {
    const urls = resources.filter(value => /^https?:\/\//i.test(value))
    if (resources.length && urls.length !== resources.length) raise(analysis, 'high', '访问非 HTTP 的外部资源')
    else raise(analysis, 'medium', '访问外部网络', 'network')
  } else if (action === 'external_directory' || action === 'external_dir') {
    const values = pathValues(request, resources, base)
    for (const value of values) if (!inside(value, base)) { raise(analysis, 'medium', '访问项目目录之外的路径', 'external'); analysis.targets.push(value) }
    if (analysis.risk === 'low') raise(analysis, 'low', '访问项目内的目录')
  } else {
    raise(analysis, 'medium', '执行未识别的权限请求', 'run')
  }
  if (analysis.risk === 'high') {
    return { decision: 'reject', risk: 'high', reason: '自动审批拒绝：' + analysis.reasons[0] + '。不要重试同一操作；请说明风险并请求用户改为手动批准（Ask First），或改用安全的替代方案；没有安全方案时停止。' }
  }
  if (analysis.risk === 'medium') {
    const text = context.authorization || ''
    const approved = [...analysis.intents].some(intent => INTENTS[intent].test(text)) || analysis.targets.some(target => text.includes(target))
    if (!approved) {
      const labels = [...analysis.intents].map(intent => INTENT_LABELS[intent]).join('、') || '该操作'
      return { decision: 'reject', risk: 'medium', reason: '自动审批拒绝：需要' + labels + '，但当前请求中没有找到用户的明确授权。不要重试；请向用户说明将要做什么并请求确认，或改用项目内的只读方案。' }
    }
  }
  return { decision: 'once', risk: analysis.risk, reason: analysis.reasons[0] || '低风险操作' }
}
