import { fileURLToPath } from 'node:url'

// The same relative path resolves from src/main, out/main and app.asar/out/main.
export const builtinSkillsPath = fileURLToPath(new URL('../../resources/skills/', import.meta.url))
export const builtinSkills = [
 { id: 'nxncode-plan', name: '任务规划' },
 { id: 'nxncode-debug', name: '排查故障' },
 { id: 'nxncode-review', name: '代码审查' },
 { id: 'nxncode-ui', name: '界面改进' },
 { id: 'nxncode-research', name: '网页调研' },
 { id: 'nxncode-data', name: '数据与报告' },
 { id: 'nxncode-find-skills', name: '查找 Skills' },
 { id: 'nxncode-skill-creator', name: '创建 Skills' }
] as const
