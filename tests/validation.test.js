/** 完整性回归：每个基础字段、题目备注和照片槽都必须有效，虚构数据不含用户信息。 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { allBasicFields, basicPayload, meaningful, newDraft, photoCategories, questions, validateRevision } from '../src/lib/formValidation.js'

/**
 * 构造符合全部必填规则的虚构数据。
 * @returns {object} 包含32个基础字段、125题和16个不重复附件的草稿。
 */
function completeDraft() {
  const value = newDraft()
  value.ageConfirmedAt = '2026-10-14T12:00:00.000Z'
  value.basicInfo = Object.fromEntries(allBasicFields.map((field) => [field.key, '不适用']))
  value.answers = questions.map((question) => ({ questionId: question.id, grade: 'A', remark: '无' }))
  let index = 0
  value.photos = photoCategories.flatMap(({ key }) => Array.from({ length: 4 }, (_, slot) => {
    index += 1
    return { category: key, slot: slot + 1, sha256: index.toString(16).padStart(64, '0'), sourceSha256: (index + 16).toString(16).padStart(64, '0'), blob: new Blob([`photo-${index}`]), previewBlob: new Blob([`preview-${index}`]) }
  }))
  return value
}

test('metadata and fresh drafts keep the fixed 32-field, 125-question and 16-slot contract', () => {
  assert.equal(allBasicFields.length, 32)
  assert.equal(new Set(allBasicFields.map((field) => field.key)).size, 32)
  assert.equal(questions.length, 125)
  assert.equal(new Set(questions.map((question) => question.id)).size, 125)
  assert.equal(photoCategories.length * 4, 16)
  assert.equal(allBasicFields.some((field) => /^(?:ip|ipAddress|clientIp|clientIps)$/i.test(field.key)), false)
  const first = newDraft()
  const second = newDraft()
  assert.notEqual(first.id, second.id)
  assert.equal(first.ageConfirmedAt, null)
  assert.equal(first.answers.length, 125)
  assert.equal(first.photos.length, 0)
  assert.deepEqual(validateRevision(completeDraft()), [])
})

test('each basic field rejects missing or invisible content and enforces its length', () => {
  for (const field of allBasicFields) {
    for (const empty of ['', ' \n\t ', '\u200b\u200e\u2060\ufeff', null, 123]) {
      const value = completeDraft()
      value.basicInfo[field.key] = empty
      assert.ok(validateRevision(value).some((issue) => issue.id === `basic-${field.key}`), `${field.key}: ${JSON.stringify(empty)}`)
    }
    const value = completeDraft()
    value.basicInfo[field.key] = '字'.repeat(field.maxLength + 1)
    assert.ok(validateRevision(value).some((issue) => issue.id === `basic-${field.key}` && issue.message.includes('最多')))
  }
})

test('explicit no-content text is accepted for every basic field and remark', () => {
  for (const text of ['无', '不适用', '无/不适用', '无／不适用']) {
    const value = completeDraft()
    for (const field of allBasicFields) value.basicInfo[field.key] = text
    for (const answer of value.answers) answer.remark = text
    assert.deepEqual(validateRevision(value), [])
  }
  assert.equal(meaningful(' \t中\u200b文 \n'), '中文')
  assert.deepEqual(Object.keys(basicPayload({ unexpected: 'ignored', name: 'example' })), allBasicFields.map((field) => field.key))
  assert.equal(basicPayload({ name: 42 }).name, '')
})

test('phone, QQ and numeric fields preserve format requirements when supplied', () => {
  for (const [field, valid, invalid] of [
    ['phone', '+86 138-0000-0000', 'bad-phone'],
    ['qq', '123456789', '000001'],
    ['height', '170.5', '-1'],
    ['weight', '65', 'sixty'],
    ['shoeSize', '42', '42e0'],
    ['firstSexAge', '0', 'NaN'],
    ['meetingCount', '1', 'Infinity'],
  ]) {
    const value = completeDraft()
    value.basicInfo[field] = valid
    assert.deepEqual(validateRevision(value), [])
    value.basicInfo[field] = invalid
    assert.ok(validateRevision(value).some((issue) => issue.id === `basic-${field}`))
  }
  const value = completeDraft()
  value.basicInfo.phone = '-----'
  assert.ok(validateRevision(value).some((issue) => issue.id === 'basic-phone'), 'a phone number must contain digits')
})

test('every grade and remark is required and grades cannot use prototype property names', () => {
  for (const question of questions) {
    const value = completeDraft()
    const answer = value.answers.find((item) => item.questionId === question.id)
    answer.grade = ''
    answer.remark = '\u200b \n'
    const errors = validateRevision(value)
    assert.ok(errors.some((issue) => issue.id === `grade-${question.id}`))
    assert.ok(errors.some((issue) => issue.id === `remark-${question.id}`))
  }
  for (const grade of ['F', 'a', '无', 'toString', '__proto__']) {
    const value = completeDraft()
    value.answers[0].grade = grade
    assert.ok(validateRevision(value).some((issue) => issue.id === `grade-${questions[0].id}`))
  }
  const value = completeDraft()
  value.answers[0].remark = '字'.repeat(500)
  assert.deepEqual(validateRevision(value), [])
  value.answers[0].remark += '字'
  assert.ok(validateRevision(value).some((issue) => issue.id === `remark-${questions[0].id}`))
})

test('unknown, duplicate and missing question identities block export', () => {
  for (const change of [
    (answers) => answers.pop(),
    (answers) => { answers[1].questionId = answers[0].questionId },
    (answers) => { answers[0].questionId = 999999 },
    (answers) => answers.push({ questionId: 999999, grade: 'A', remark: '无' }),
  ]) {
    const value = completeDraft()
    change(value.answers)
    assert.ok(validateRevision(value).some((issue) => issue.id === 'assessment-heading'))
  }
})

test('all sixteen photo slots reject missing, duplicated or misplaced entries', () => {
  for (let index = 0; index < 16; index += 1) {
    const value = completeDraft()
    const [removed] = value.photos.splice(index, 1)
    assert.ok(validateRevision(value).some((issue) => issue.id === `photo-${removed.category}-${removed.slot}`))
  }
  for (const change of [
    (photos) => photos.push({ ...photos[0] }),
    (photos) => { photos[0].category = 'unknown' },
    (photos) => { photos[0].slot = 0 },
    (photos) => { photos[0].slot = '1' },
  ]) {
    const value = completeDraft()
    change(value.photos)
    assert.ok(validateRevision(value).some((issue) => issue.step === 2))
  }
})

test('duplicate input or final hashes are rejected across photo categories', () => {
  for (const hash of ['sha256', 'sourceSha256']) {
    const value = completeDraft()
    value.photos[15][hash] = value.photos[0][hash]
    assert.ok(validateRevision(value).some((issue) => issue.step === 2 && issue.message.includes('重复')))
  }
  for (const hash of ['sha256', 'sourceSha256']) {
    const value = completeDraft()
    value.photos[0][hash] = 'not-a-hash'
    assert.ok(validateRevision(value).some((issue) => issue.step === 2 && issue.message.includes('摘要')))
  }
})

test('missing and over-limit attachment or preview bytes block export', () => {
  for (const [key, value] of [
    ['blob', null], ['blob', new Blob()], ['blob', new Blob([new Uint8Array(2 * 1024 * 1024 + 1)])],
    ['previewBlob', null], ['previewBlob', new Blob()], ['previewBlob', new Blob([new Uint8Array(512 * 1024 + 1)])],
  ]) {
    const data = completeDraft()
    data.photos[0][key] = value
    assert.ok(validateRevision(data).some((issue) => issue.step === 2 && issue.message.includes('文件')))
  }
})

test('malformed local arrays return actionable errors instead of throwing', () => {
  for (const change of [
    (value) => { value.photos[0] = null },
    (value) => { value.answers[0] = null },
    (value) => { value.answers[0] = 'invalid' },
    (value) => { value.basicInfo = null },
  ]) {
    const value = completeDraft()
    change(value)
    assert.ok(validateRevision(value).length > 0)
  }
  assert.ok(validateRevision(null).length > 0)
})
