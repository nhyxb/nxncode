// Local stdio fixture. No external requests and no model calls.
import { createInterface } from 'node:readline'
const input = createInterface({ input: process.stdin })
input.on('line', line => {
 try {
  const request = JSON.parse(line)
  if (request.id === undefined) return
  let result
  if (request.method === 'initialize') result = { protocolVersion: '2025-06-18', capabilities: { tools: {} }, serverInfo: { name: 'nxncode-local-fixture', version: '1.0.0' } }
  else if (request.method === 'tools/list') result = { tools: [{ name: 'fixture_echo', description: 'Echo a local fixture value', inputSchema: { type: 'object', properties: { value: { type: 'string' } } } }] }
  else if (request.method === 'tools/call') result = { content: [{ type: 'text', text: request.params?.arguments?.value || 'LOCAL_MCP_OK' }] }
  else result = {}
  process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: request.id, result }) + '\n')
 } catch { /* malformed input is outside this fixture's contract */ }
})
