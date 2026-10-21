import test from 'node:test'
import assert from 'node:assert/strict'
import { arrangeSessions, mergeSessionOrder, reorderSessions } from '../src/shared/sessions'

const sessions = [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }]

test('pin, archive and manual order drive the sidebar arrangement', () => {
  const arranged = arrangeSessions(sessions, { b: { pinned: true }, d: { archived: true } }, ['d', 'c', 'a'])
  assert.deepEqual(arranged.pinned.map(s => s.id), ['b'])
  assert.deepEqual(arranged.regular.map(s => s.id), ['c', 'a'])
  assert.deepEqual(arranged.archived.map(s => s.id), ['d'])
  assert.deepEqual(arranged.visible.map(s => s.id), ['b', 'c', 'a'])
})

test('sessions missing from the stored order are treated as newest and kept on top', () => {
  const arranged = arrangeSessions(sessions, {}, ['a', 'd'])
  assert.deepEqual(arranged.visible.map(s => s.id), ['b', 'c', 'a', 'd'])
})

test('dragging moves one session before or after its target', () => {
  assert.deepEqual(reorderSessions(['a', 'b', 'c', 'd'], 'd', 'b', false), ['a', 'd', 'b', 'c'])
  assert.deepEqual(reorderSessions(['a', 'b', 'c', 'd'], 'a', 'c', true), ['b', 'c', 'a', 'd'])
  assert.deepEqual(reorderSessions(['a', 'b'], 'a', 'a', true), ['a', 'b'])
  assert.deepEqual(reorderSessions(['a', 'b'], 'x', 'a', false), ['a', 'b'])
})

test('saved order keeps archived ids reachable and drops stale ones', () => {
  assert.deepEqual(mergeSessionOrder(['b', 'a'], ['a', 'b', 'c', 'gone'], ['c']), ['b', 'a', 'gone', 'c'])
  // d is absent from the stored order, so it counts as a new session on top; archived c is skipped.
  assert.deepEqual(arrangeSessions(sessions, { c: { archived: true } }, ['b', 'c', 'a']).visible.map(s => s.id), ['d', 'b', 'a'])
})
