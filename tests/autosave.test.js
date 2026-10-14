/** 自动保存队列回归：验证编辑合并、写入串行、失败恢复和旧任务隔离。 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { setTimeout as wait } from 'node:timers/promises'
import { createAutosave } from '../src/lib/autosave.js'

/**
 * 生成由测试手动结束的异步任务。
 * @returns {{promise:Promise<void>,resolve:Function,reject:Function}} Promise 及控制函数。
 */
function deferred() {
  let resolve, reject
  const promise = new Promise((done, fail) => { resolve = done; reject = fail })
  return { promise, resolve, reject }
}

test('rapid changes debounce into one latest snapshot and flush waits for persistence', async (context) => {
  let value = 'first'
  const saved = [], states = []
  const queue = createAutosave({ snapshot: () => ({ value }), save: async (data) => { saved.push(data) }, onState: (state) => states.push(state.status), delay: 20 })
  context.after(() => queue.dispose())
  queue.changed()
  value = 'second'; queue.changed()
  value = 'latest'; queue.changed()
  assert.equal(queue.dirty, true)
  assert.equal(await queue.flush(), true)
  assert.deepEqual(saved, [{ value: 'latest' }])
  assert.equal(queue.dirty, false)
  assert.equal(states.at(-1), 'saved')
  await wait(35)
  assert.equal(saved.length, 1)
})

test('timer-driven autosave persists without an explicit flush', async (context) => {
  const done = deferred()
  let writes = 0
  const queue = createAutosave({ snapshot: () => 'draft', save: async () => { writes += 1; done.resolve() }, delay: 5 })
  context.after(() => queue.dispose())
  queue.changed()
  await done.promise
  await queue.flush()
  assert.equal(writes, 1)
  assert.equal(queue.dirty, false)
})

test('concurrent flushes and edits during a save remain serial and preserve the latest edit', async (context) => {
  const gate = deferred()
  let value = 1, active = 0, peak = 0
  const saved = []
  const queue = createAutosave({
    snapshot: () => value,
    save: async (data) => {
      active += 1; peak = Math.max(peak, active); saved.push(data)
      if (saved.length === 1) await gate.promise
      active -= 1
    }, delay: 1000,
  })
  context.after(() => queue.dispose())
  queue.changed()
  const first = queue.flush()
  await Promise.resolve()
  value = 2; queue.changed()
  value = 3; queue.changed()
  const second = queue.flush()
  assert.equal(queue.dirty, true)
  assert.equal(saved.length, 1)
  gate.resolve()
  assert.deepEqual(await Promise.all([first, second]), [true, true])
  assert.deepEqual(saved, [1, 3])
  assert.equal(peak, 1)
  assert.equal(queue.dirty, false)
})

test('storage failure pauses later writes and explicit retry saves the newest snapshot', async (context) => {
  let value = 'original', attempts = 0
  const saved = [], states = []
  const error = new DOMException('storage full', 'QuotaExceededError')
  const queue = createAutosave({
    snapshot: () => value,
    save: async (data) => { attempts += 1; if (attempts === 1) throw error; saved.push(data) },
    onState: (state) => states.push(state), delay: 5,
  })
  context.after(() => queue.dispose())
  queue.changed()
  assert.equal(await queue.flush(), false)
  assert.equal(queue.paused, true)
  assert.equal(queue.dirty, true)
  assert.equal(states.at(-1).status, 'error')
  assert.equal(states.at(-1).error, error)
  value = 'after-failure'; queue.changed()
  await wait(15)
  assert.equal(attempts, 1)
  assert.equal(await queue.flush(), false)
  assert.equal(await queue.resume(), true)
  assert.deepEqual(saved, ['after-failure'])
  assert.equal(queue.paused, false)
  assert.equal(queue.dirty, false)
})

test('version conflicts surface separately and do not silently retry', async (context) => {
  let attempts = 0
  const states = []
  const queue = createAutosave({ snapshot: () => 'draft', save: async () => { attempts += 1; throw Object.assign(new Error('conflict'), { status: 409 }) }, onState: (state) => states.push(state.status), delay: 5 })
  context.after(() => queue.dispose())
  queue.changed()
  assert.equal(await queue.flush(), false)
  assert.equal(states.at(-1), 'conflict')
  queue.changed()
  await wait(15)
  assert.equal(attempts, 1)
  queue.reset()
  assert.equal(queue.paused, false)
  assert.equal(queue.dirty, false)
  assert.equal(await queue.flush(), true)
  assert.equal(attempts, 1)
})

test('snapshot failures are reported as recoverable save failures without losing dirty state', async (context) => {
  let broken = true
  const states = [], saved = []
  const queue = createAutosave({ snapshot: () => { if (broken) throw new Error('snapshot failed'); return 'recovered' }, save: async (data) => saved.push(data), onState: (state) => states.push(state.status) })
  context.after(() => queue.dispose())
  queue.changed()
  assert.equal(await queue.flush(), false)
  assert.equal(queue.paused, true)
  assert.equal(queue.dirty, true)
  assert.equal(states.at(-1), 'error')
  broken = false
  assert.equal(await queue.resume(), true)
  assert.deepEqual(saved, ['recovered'])
})

test('reset during an active save discards queued old edits and prevents another write', async (context) => {
  const gate = deferred()
  let value = 'first'
  const saved = []
  const queue = createAutosave({ snapshot: () => value, save: async (data) => { saved.push(data); await gate.promise } })
  context.after(() => queue.dispose())
  queue.changed()
  const flushing = queue.flush()
  await Promise.resolve()
  value = 'discarded-edit'; queue.changed()
  queue.reset()
  gate.resolve()
  await flushing
  assert.deepEqual(saved, ['first'])
  assert.equal(queue.dirty, false)
})

test('dispose prevents timer callbacks and new changes from reaching storage', async () => {
  let writes = 0
  const queue = createAutosave({ snapshot: () => 'draft', save: async () => { writes += 1 }, delay: 5 })
  queue.changed()
  queue.dispose()
  queue.changed()
  assert.equal(await queue.flush(), false)
  await wait(15)
  assert.equal(writes, 0)
})

test('new edits after reset wait for the old write and use only the new snapshot', async (context) => {
  const gate = deferred()
  let value = 'old-draft', active = 0, peak = 0
  const saved = []
  const queue = createAutosave({
    snapshot: () => value,
    save: async (data) => {
      active += 1; peak = Math.max(peak, active); saved.push(data)
      if (saved.length === 1) await gate.promise
      active -= 1
    },
  })
  context.after(() => queue.dispose())
  queue.changed()
  const pending = queue.flush()
  await Promise.resolve()
  queue.reset()
  value = 'new-draft'; queue.changed()
  gate.resolve()
  assert.equal(await pending, true)
  assert.deepEqual(saved, ['old-draft', 'new-draft'])
  assert.equal(peak, 1)
})

test('a rejected old-generation write cannot pause the newly loaded draft', async (context) => {
  const gate = deferred()
  let value = 'old-draft'
  const states = [], saved = []
  const queue = createAutosave({
    snapshot: () => value,
    save: async (data) => { saved.push(data); if (saved.length === 1) await gate.promise },
    onState: (state) => states.push(state.status),
  })
  context.after(() => queue.dispose())
  queue.changed()
  const pending = queue.flush()
  await Promise.resolve()
  queue.reset()
  value = 'new-draft'; queue.changed()
  gate.reject(Object.assign(new Error('old conflict'), { status: 409 }))
  assert.equal(await pending, true)
  assert.equal(queue.paused, false)
  assert.equal(states.includes('conflict'), false)
  assert.deepEqual(saved, ['old-draft', 'new-draft'])
})

test('dispose suppresses a running write completion from updating the abandoned page', async () => {
  const gate = deferred()
  const states = []
  const queue = createAutosave({ snapshot: () => 'draft', save: () => gate.promise, onState: (state) => states.push(state.status) })
  queue.changed()
  const pending = queue.flush()
  await Promise.resolve()
  assert.equal(states.at(-1), 'saving')
  const count = states.length
  queue.dispose()
  gate.resolve()
  assert.equal(await pending, false)
  assert.equal(states.length, count)
  assert.equal(queue.dirty, false)
})
