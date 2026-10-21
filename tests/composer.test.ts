import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, symlink, rm } from 'node:fs/promises'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { composerToken } from '../src/shared/composer'
import { searchFiles, attachFile } from '../src/main/workspace'
const exec = promisify(execFile)

test('composer parses caret-local commands without hijacking emails, paths or code', () => {
 const text = '请参考 @src/文件.ts 再修改'
 const end = text.indexOf(' 再')
 assert.deepEqual(composerToken(text, end), { kind: '@', query: 'src/文件.ts', start: 4, end })
 assert.equal(composerToken('/local-skill', 12)?.kind, '/')
 for (const value of ['a@example.com', 'https://site.test/path', '/tmp/file', '\\@bot', '`@bot', '```ts\n@bot']) assert.equal(composerToken(value, value.length), null, value)
 const afterCode = '```ts\n@bot\n```\n/local'; assert.equal(composerToken(afterCode, afterCode.length)?.kind, '/')
})

test('file references respect Git ignores and reject escaped, binary and oversized attachments', async () => {
 const root = await mkdtemp(path.join(tmpdir(), 'nxn-ref-')), outside = await mkdtemp(path.join(tmpdir(), 'nxn-ref-out-'))
 try {
  await mkdir(path.join(root, 'src')); await writeFile(path.join(root, 'src', '文件.ts'), 'export const x = 1')
  await writeFile(path.join(root, '.gitignore'), 'ignored.txt\nnode_modules/\n'); await writeFile(path.join(root, 'ignored.txt'), 'ignored')
  await mkdir(path.join(root, 'node_modules')); await writeFile(path.join(root, 'node_modules', 'dependency.ts'), 'ignored')
  await writeFile(path.join(outside, 'secret'), 'outside'); await symlink(outside, path.join(root, 'escape'))
  await exec('git', ['init', '-q'], { cwd: root })
  assert.deepEqual(await searchFiles(root, '文件'), [{ path: 'src/文件.ts' }])
  assert.equal((await searchFiles(root, 'ignored')).length, 0)
  assert.equal((await searchFiles(root, 'dependency')).length, 0)
  await mkdir(path.join(root, 'nested')); await writeFile(path.join(root, 'nested', 'reference.txt'), 'nested')
  await writeFile(path.join(root, '.gitignore'), 'ignored.txt\nnode_modules/\nnested/\n')
  assert.deepEqual(await searchFiles(path.join(root, 'nested'), 'reference'), [{ path: 'reference.txt' }])
  assert.equal(await attachFile(root, 'src/文件.ts'), path.join(root, 'src/文件.ts'))
  await assert.rejects(attachFile(root, 'escape/secret'), /路径超出/)
  await assert.rejects(attachFile(root, path.join(outside, 'secret')), /路径超出/)
  await writeFile(path.join(root, 'binary'), Buffer.from([0, 1])); await assert.rejects(attachFile(root, 'binary'), /二进制/)
  await writeFile(path.join(root, 'large'), Buffer.alloc(2 * 1024 * 1024 + 1, 'a')); await assert.rejects(attachFile(root, 'large'), /2MB/)
  await rm(path.join(root, '.git'), { recursive: true }); assert.deepEqual(await searchFiles(root, '文件'), [{ path: 'src/文件.ts' }])
 } finally { await rm(root, { recursive: true, force: true }); await rm(outside, { recursive: true, force: true }) }
})
