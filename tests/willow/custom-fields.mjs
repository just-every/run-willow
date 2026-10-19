// PEOPLE-001: one complete typed-field journey through the migrated Worker.
import assert from 'node:assert/strict'
import { file, harness } from './harness.mjs'
import { fixture, today, day } from './regression-fixture.mjs'
import { imports } from './import-transport.mjs'
import { genericColumns } from './phase2-fixtures.mjs'
import { readZip } from './export-reader.mjs'
import { browserEvidence } from './custom-fields-browser.mjs'

function csv(text) {
  const rows = [], expression = /(?:^|,|\r\n)(?:"((?:[^"]|"")*)"|([^,\r\n]*))/g
  let row = []
  for (const match of text.matchAll(expression)) {
    if (match[0].startsWith('\r\n')) { rows.push(row); row = [] }
    row.push(match[1] === undefined ? match[2] : match[1].replaceAll('""', '"'))
  }
  if (row.some(Boolean)) rows.push(row)
  return rows
}
const objects = rows => rows.slice(1).map(row => Object.fromEntries(rows[0].map((key, index) => [key, row[index]])))
const encodeCsv = rows => rows.map(row => row.map(value => `"${String(value).replaceAll('"', '""')}"`).join(',')).join('\r\n') + '\r\n'
const keys = person => person.customFields.fields.map(field => field.key).sort()
const custom = (person, key) => person.customFields.fields.find(field => field.key === key)
const hasNone = (value, secrets) => secrets.forEach(secret => assert.ok(!JSON.stringify(value).includes(secret), `withheld ${secret}`))
const unpackXlsx = bytes => {
  const xml = readZip(bytes).get('xl/worksheets/sheet1.xml').toString()
  const decode = text => text.replaceAll('&lt;', '<').replaceAll('&gt;', '>').replaceAll('&quot;', '"').replaceAll('&amp;', '&')
  return [...xml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)].map(match => [...match[1].matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map(cell => decode(cell[1])))
}


const h = await harness()
try {
  await h.raw('/auth/bootstrap', { body: { token: h.vars.SETUP_TOKEN, displayName: 'Olive Owner' } })
  const owner = await h.signIn(h.vars.OWNER_EMAIL)
  await h.raw('/setup', { cookie: owner, form: new URLSearchParams({ confirm: 'yes' }) })
  const { api, join, staff: s, schedule, templates } = await fixture(h, owner)
  const names={managera:'Maya Chen',managerb:'Leo Ortiz',employee:'Elena Patel',payroll:'Noah Brooks',hr:'Harper Jones',ended:'Avery Singh',invited:'Sofia Martinez'}
  for(const [key,staff] of Object.entries(s)) { const record=await api(`people/${staff.person}`); await api('person.update',{person:staff.person,revision:record.revision,legalName:names[key],preferredName:record.preferredName??'',workEmail:record.workEmail??'',employeeNumber:record.employeeNumber??''}) }
  const person = s.employee.person, definitions = {}
  const schema = (key, type, classification, validation, extra = {}) => ({ key, classification, type, validation,
    effectiveFrom: day(-60), label: key.replaceAll('_', ' '), required: false, employeeRead: false, managerRead: false, retired: false, ...extra })
  const define = async (definition, cookie = s.hr.cookie, status = 200) => h.api('customField.define', cookie, { definition }, status)
  const versions = {
    office_code: schema('office_code', 'text', 'general', { minLength: 2, maxLength: 12 }, { label: 'Office code', required: true, employeeRead: true, managerRead: true }),
    allocation: schema('allocation', 'number', 'payroll', { min: '0', max: '100' }),
    credential_expiry: schema('credential_expiry', 'date', 'hr', { min: day(-365), max: day(365) }),
    remote: schema('remote', 'boolean', 'general', {}, { employeeRead: true }),
    work_track: schema('work_track', 'select', 'general', { options: [{ value: 'ic', label: 'Individual contribution' }, { value: 'lead', label: 'Team leadership' }] }, { managerRead: true }),
    hr_note: schema('hr_note', 'text', 'hr', { maxLength: 80 }),
  }
  for (const [key, definition] of Object.entries(versions)) definitions[key] = await define(definition)
  for (const cookie of [s.managera.cookie, s.employee.cookie, s.payroll.cookie]) {
    await h.api('custom-fields', cookie, undefined, 403)
    await define(schema('forbidden', 'text', 'general', { maxLength: 20 }), cookie, 403)
    await h.api('customField.write', cookie, { person, effectiveFrom: today, values: { office_code: 'NO' } }, 403)
  }
  for (const invalid of [
    schema('bad_text', 'text', 'general', { maxLength: 0 }),
    schema('bad_number', 'number', 'general', { min: '10', max: '1' }),
    schema('bad_date', 'date', 'general', { min: '2026-02-30' }),
    schema('bad_boolean', 'boolean', 'general', { min: 0 }),
    schema('bad_select', 'select', 'general', { options: [{ value: 'x', label: 'X' }, { value: 'x', label: 'Again' }] }),
  ]) await define(invalid, owner, 400)
  await define({ ...versions.hr_note, id: definitions.hr_note.id, classification: 'general' }, owner, 400)
  await define({ ...versions.hr_note, id: definitions.hr_note.id, employeeRead: true }, owner, 400)
  assert.equal((await api('custom-fields')).length, Object.keys(versions).length)

  const write = (values, effectiveFrom = day(-30), cookie = owner, status = 200, target = person) => h.api('customField.write', cookie, { person: target, effectiveFrom, values }, status)
  const values = { office_code: 'OPS-11', allocation: '025.500', credential_expiry: day(90), remote: false, work_track: 'ic', hr_note: 'HR-ONLY-CUSTOM-593' }
  const beforeCreate = (await api('people')).length
  await h.api('joiner.start', owner, { template: templates.joiner, legalName: 'Missing custom field', startDate: today, employmentType: 'full_time', jobTitle: 'Specialist' }, 400)
  await h.api('joiner.start', owner, { template: templates.joiner, legalName: 'Invalid typed starter', startDate: today, employmentType: 'full_time', jobTitle: 'Specialist', customValues: { ...values, allocation: '200' } }, 400)
  assert.equal((await api('people')).length, beforeCreate, 'required and typed validation leave no partial person or case')
  const native = await join('typed-native', { legalName:'Nadia Brooks', startDate: day(-20), customValues: { ...values, office_code: 'NATIVE' } })
  assert.equal(custom(await api(`people/${native.person}`), 'remote').value, false)
  await write(values)
  const initial = custom(await api(`people/${person}`), 'office_code')
  assert.equal(custom(await api(`people/${person}`), 'allocation').value, '25.5')
  for (const [key, bad] of [['office_code', null], ['office_code', 'x'], ['office_code', '😀'], ['allocation', '100.1'], ['allocation', '100.0000000000000000000001'], ['allocation', 25], ['credential_expiry', '2026-02-30'], ['credential_expiry', day(400)], ['remote', 'false'], ['work_track', 'unknown']]) await write({ [key]: bad }, day(-30), owner, 400)
  assert.deepEqual(custom(await api(`people/${person}`), 'office_code').history, initial.history, 'invalid writes append nothing')
  await write({ office_code: 'OPS-12' })
  const corrected = custom(await api(`people/${person}`), 'office_code')
  assert.equal(corrected.value, 'OPS-12')
  assert.equal(corrected.history[0].correctsId, initial.valueRevisionId)
  assert.equal(corrected.history.find(row => row.id === initial.valueRevisionId).value, 'OPS-11')
  await write({ hr_note: 'HR-ONLY-CUSTOM-594' }, day(-25), s.hr.cookie)
  await write({ allocation: '50' }, day(-25), s.hr.cookie, 403)
  const beforeUpdate = await api(`people/${person}`)
  await h.api('person.update', owner, { person, revision: beforeUpdate.revision, effectiveFrom: day(-23), customValues: { remote: 'true' } }, 400)
  assert.equal((await api(`people/${person}`)).revision, beforeUpdate.revision)
  await api('person.update', { person, revision: beforeUpdate.revision, effectiveFrom: day(-23), customValues: { remote: true } })
  assert.equal(custom(await api(`people/${person}`), 'remote').value, true)
  const expected = { owner: Object.keys(versions), hr: ['office_code', 'credential_expiry', 'remote', 'work_track', 'hr_note'], payroll: ['allocation'], managera: ['office_code', 'work_track'], employee: ['office_code', 'remote'], managerb: [] }
  for (const [who, permitted] of Object.entries(expected)) {
    const cookie = who === 'owner' ? owner : s[who].cookie
    const [profile, context] = await Promise.all([h.api(`people/${person}`, cookie), h.api(`context/${person}`, cookie)])
    assert.deepEqual(keys(profile), permitted.sort(), `${who} profile field authority`)
    assert.deepEqual(context.record.customFields, profile.customFields, `${who} agent context uses the profile projection`)
    if (!permitted.includes('hr_note')) hasNone([profile, context], ['HR-ONLY-CUSTOM-593', 'HR-ONLY-CUSTOM-594'])
  }
  assert.ok(!(await (await h.raw('/app/people', { cookie: s.managera.cookie })).text()).includes(values.hr_note))
  const publicDirectory=await api('people'), publicChart=await api('organization')
  assert.ok(publicDirectory.every(person=>!Object.hasOwn(person,'customFields')))
  hasNone([publicDirectory,publicChart],['OPS-11','OPS-12','HR-ONLY-CUSTOM-593','HR-ONLY-CUSTOM-594','25.5'])

  // Reviewed BambooHR mappings use the same requiredness and exact typed parser.
  const transfer = imports(h, owner), baselinePeople = (await api('people')).length
  const headers = ['id', 'employeeNumber', 'firstName', 'lastName', 'workEmail', 'hireDate', 'status', 'employmentStatus', 'jobTitle', 'payRate', 'payType', 'paidPer', 'Site reference', 'custom:allocation', 'custom:credential_expiry', 'custom:remote', 'custom:work_track', 'custom:hr_note']
  const importedRow = (id, code, allocation = '35') => [id, `CF-${id}`, id==='804'?'Theo':'Iris', 'Turner', `typed${id}@example.com`, day(-15), 'Active', 'Full-Time', 'Field specialist', '50000 AUD', 'Salary', 'Year', code, allocation, day(80), 'false', 'ic', 'IMPORTED-HR-ONLY']
  const importInput = rows => ({ employees: file('typed-employees.csv', encodeCsv([headers, ...rows])), schedule, customEffectiveFrom: day(-15), customColumn_office_code: 'Site reference' })
  const input = importInput([importedRow('801', 'IMPORT-A'), importedRow('802', ''), importedRow('803', 'IMPORT-C', '200')])
  const plan = await transfer.plan(input)
  assert.equal((await api('people')).length, baselinePeople, 'typed import planning writes nothing')
  assert.ok(plan.rejected.some(row => row.reason.includes('required_field_value')))
  assert.ok(plan.rejected.some(row => row.reason.includes('field_value_out_of_bounds')))
  await transfer.apply(plan)
  assert.equal((await transfer.reconcile(plan)).ok, true)
  const imported = (await api('people')).find(row => row.workEmail === 'typed801@example.com')
  assert.ok(imported)
  assert.equal((await api('people')).length, baselinePeople + 1)
  assert.equal(custom(await api(`people/${imported.id}`), 'office_code').value, 'IMPORT-A')
  assert.equal(custom(await api(`people/${imported.id}`), 'remote').value, false)
  const beforeRepeat = (await api(`people/${imported.id}`)).customFields
  await transfer.apply(await transfer.plan(input))
  assert.equal((await api('people')).length, baselinePeople + 1, 'the identical custom import creates no second person')
  assert.deepEqual((await api(`people/${imported.id}`)).customFields, beforeRepeat, 'the identical custom import appends no value history')
  const catchup = await transfer.plan(importInput([importedRow('801', 'IMPORT-B')]), { catchup: true })
  await transfer.apply(catchup)
  const caughtUp = custom(await api(`people/${imported.id}`), 'office_code')
  assert.equal(caughtUp.value, 'IMPORT-B')
  assert.deepEqual(caughtUp.history.map(row => row.value).sort(), ['IMPORT-A', 'IMPORT-B'])
  await transfer.undo(catchup)
  assert.equal(custom(await api(`people/${imported.id}`), 'office_code').value, 'IMPORT-A')
  await transfer.undo(plan)
  await h.api(`people/${imported.id}`, owner, undefined, 404)
  assert.equal((await api('people')).length, baselinePeople)
  const guarded = await transfer.plan(importInput([importedRow('804', 'IMPORT-D')]))
  await transfer.apply(guarded)
  const retained = (await api('people')).find(row => row.workEmail === 'typed804@example.com')
  await write({ office_code: 'NATIVE-FIX' }, day(-15), owner, 200, retained.id)
  await transfer.request('undo', { planId: guarded.planId }, 409)
  assert.equal(custom(await api(`people/${retained.id}`), 'office_code').value, 'NATIVE-FIX')

  // Versioned schemas keep old select labels and the definition each value used.
  const trackV2 = { ...versions.work_track, id: definitions.work_track.id, effectiveFrom: day(-10), label: 'Delivery model', validation: { options: [{ value: 'team', label: 'Team delivery' }] } }
  const newDefinition = await define(trackV2)
  await write({ work_track: 'team' }, day(-5))
  const old = custom(await api(`people/${person}?asOf=${day(-20)}`), 'work_track')
  assert.equal(old.value, 'ic')
  assert.equal(old.definition.definitionVersionId, definitions.work_track.versionId)
  assert.equal(old.definitions.find(row => row.id === old.history.find(row => row.value === 'ic').definitionVersionId).validation.options[0].label, 'Individual contribution')
  assert.equal(custom(await api(`people/${person}?asOf=${day(-5)}`), 'work_track').definition.definitionVersionId, newDefinition.versionId)
  await define({ ...trackV2, effectiveFrom: today, retired: true })
  await write({ work_track: 'team' }, today, owner, 400)
  const retired = custom(await api(`people/${person}`), 'work_track')
  assert.equal(retired.definition.retired, true)
  assert.equal(retired.value, 'team')
  assert.ok(retired.history.some(row => row.definitionVersionId === definitions.work_track.versionId && row.value === 'ic'))

  // Each consumer selects the same stable keys and uses the profile projection.
  const selected = Object.keys(versions).map(key => `custom.${key}`)
  const download = async (cookie, scope, format, asOf = today) => {
    const params = new URLSearchParams({ scope, fields: ['name', ...selected].join(','), person, asOf, ...(format === 'zip' ? { history: 'employment' } : {}) })
    const response = await h.raw(`/app/exports/employees.${format}?${params}`, { cookie })
    assert.equal(response.status, 200, `${scope} custom ${format}`)
    assert.match(response.headers.get('cache-control'), /no-store/)
    return Buffer.from(await response.arrayBuffer())
  }
  const exportRoles = [['owner', owner, 'organization'], ['hr', s.hr.cookie, 'organization'], ['payroll', s.payroll.cookie, 'organization'], ['managera', s.managera.cookie, 'team'], ['employee', s.employee.cookie, 'self']]
  for (const [who, cookie, scope] of exportRoles) {
    const profile = await h.api(`people/${person}`, cookie)
    const csvRows = objects(csv((await download(cookie, scope, 'csv')).toString()))
    const xlsxRows = objects(unpackXlsx(await download(cookie, scope, 'xlsx')))
    assert.deepEqual(xlsxRows, csvRows, `${who} CSV/XLSX agree`)
    assert.equal(csvRows.length, 1)
    for (const key of Object.keys(versions)) {
      const field = custom(profile, key)
      assert.equal(csvRows[0][`custom.${key}`], field ? String(field.value ?? '') : '', `${who} exported ${key}`)
      assert.equal(csvRows[0].withheld_fields.split(';').includes(`custom.${key}`), !field)
    }
    const bundle = readZip(await download(cookie, scope, 'zip'))
    const record = JSON.parse(bundle.get('records.json')).records[0]
    assert.deepEqual(record.customFields, profile.customFields, `${who} bundle keeps permitted definitions and value history`)
    if (who !== 'owner' && who !== 'hr') hasNone([...bundle.values()].map(bytes => bytes.toString()), ['HR-ONLY-CUSTOM-593', 'HR-ONLY-CUSTOM-594'])
  }
  await api('member.permissions', { member: s.hr.member, permissions: ['people.manage', 'people.private', 'documents.private', 'leave.manage', 'reports.read'] })
  s.hr.cookie = await h.signIn('hr@example.com')
  const reportQuery = new URLSearchParams({ fields: selected.join(','), asOf: today })
  for (const cookie of [owner, s.hr.cookie, s.managera.cookie]) {
    const report = await h.api(`reports?${reportQuery}`, cookie)
    const row = report.customFields.rows.find(row => row.personId === person)
    const profile = await h.api(`people/${person}`, cookie)
    assert.ok(row)
    for (const key of Object.keys(versions)) {
      const field = custom(profile, key)
      if (field) assert.equal(row.values[key], field.value)
      else { assert.ok(!Object.hasOwn(row.values, key)); assert.ok(row.withheldFields.includes(key)) }
    }
    const response = await h.raw(`/app/reports.csv?${reportQuery}`, { cookie })
    assert.equal(response.status, 200)
    const text = await response.text()
    assert.ok(text.includes('OPS-12'))
    if (cookie === s.managera.cookie) hasNone([report, text], ['HR-ONLY-CUSTOM-593', 'HR-ONLY-CUSTOM-594'])
  }
  const preview = await h.api(`preview?member=${s.payroll.member}&person=${person}`, s.hr.cookie)
  hasNone(preview, ['25.5', 'HR-ONLY-CUSTOM-593', 'HR-ONLY-CUSTOM-594'])

  // Explicit optional payroll columns retain reviewed bytes and source/schema fences.
  for (const source of ['custom.hr_note', 'custom.allocation']) await h.api('payroll.layout', owner, { format: 'generic', columns: [...genericColumns, { source, heading: 'Restricted' }] }, 400)
  // Earlier employees predate this required field; complete their real records
  // before selecting it for a file that contains their payroll changes.
  for (const [key, employee] of Object.entries(s)) if (key !== 'employee') await write({ office_code: `HQ-${key}` }, day(-30), owner, 200, employee.person)
  const retainedProfile = await api(`people/${retained.id}`)
  await api('period.payroll', { period: retainedProfile.employment[0].id, payrollId: 'CF804' })
  const columns = [...genericColumns, { source: 'custom.office_code', heading: 'Office code' }]
  await api('payroll.layout', { format: 'generic', columns })
  const draft = async () => {
    const batch = await api('payroll.draft', { periodStart: today, periodEnd: day(30) })
    const reviewed = await api('payroll.preview', { batch: batch.id })
    return { ...batch, ...reviewed }
  }
  const staleValue = await draft()
  assert.ok(objects(csv(staleValue.file)).some(row => row['Office code'] === 'OPS-12'))
  await write({ office_code: 'OPS-13' }, today)
  await h.api('payroll.export', owner, { batch: staleValue.id, previewRevision: staleValue.previewRevision }, 409)
  assert.equal((await api(`payroll/${staleValue.id}`)).status, 'draft')
  await api('payroll.discard', { batch: staleValue.id, previewRevision: staleValue.previewRevision })
  const staleSchema = await draft()
  const hiddenDefinition = { ...versions.office_code, id: definitions.office_code.id, effectiveFrom: today, employeeRead: false, managerRead: false }
  await define({ ...hiddenDefinition, label: 'Office code interim', managerRead: true })
  const latestSameDay = await define(hiddenDefinition)
  const tied = custom(await api(`people/${person}`), 'office_code')
  assert.equal(tied.definition.definitionVersionId, latestSameDay.versionId, 'the latest complete version wins a same-date definition correction')
  assert.equal(tied.definition.managerRead, false)
  await h.api('payroll.export', owner, { batch: staleSchema.id, previewRevision: staleSchema.previewRevision }, 409)
  await api('payroll.discard', { batch: staleSchema.id, previewRevision: staleSchema.previewRevision })
  const frozen = await draft()
  await api('payroll.export', { batch: frozen.id, previewRevision: frozen.previewRevision })
  await write({ office_code: 'OPS-14' }, today)
  await api('payroll.layout', { format: 'generic', columns: genericColumns })
  assert.equal(await (await h.raw(`/app/payroll/${frozen.id}.csv`, { cookie: owner })).text(), frozen.file)
  assert.equal((await h.raw(`/app/payroll/${frozen.id}.csv`, { cookie: s.payroll.cookie })).status, 403, 'a frozen custom column still needs current field access')
  await h.api(`payroll/${frozen.id}`, s.payroll.cookie, undefined, 403)
  await api('member.permissions', { member: s.payroll.member, permissions: ['pay.read', 'payroll.handoff', 'people.manage'] })
  s.payroll.cookie = await h.signIn('payroll@example.com')
  await h.api(`payroll/${frozen.id}`, s.payroll.cookie)
  assert.equal(await (await h.raw(`/app/payroll/${frozen.id}.csv`, { cookie: s.payroll.cookie })).text(), frozen.file)
  await api('member.permissions', { member: s.payroll.member, permissions: ['pay.read', 'payroll.handoff'] })
  s.payroll.cookie = await h.signIn('payroll@example.com')
  await h.api(`payroll/${frozen.id}`, s.payroll.cookie, undefined, 403)
  assert.equal((await h.raw(`/app/payroll/${frozen.id}.csv`, { cookie: s.payroll.cookie })).status, 403)

  // The existing ADP provider format stays fixed, even with all five types defined.
  const leave = await h.api('leave.request', s.employee.cookie, { account: s.employee.account, startDate: day(5), endDate: day(5) })
  await api('leave.decide', { request: leave.id, decision: 'approve' })
  const policy = (await api(`people/${person}`)).leave.accounts.find(account => account.id === s.employee.account).policy.id
  await api('payroll.layout', { format: 'adp-run', company: 'CFCO', frequency: 'B', rateCode: 'BASE', department: '100', separateCheck: 0, earnings: { [policy]: 'VAC' } })
  const adp = await draft()
  const adpRows = csv(adp.file).slice(1)
  assert.ok(adpRows.every(row => row.length === 11), 'ADP has only its eleven provider columns')
  assert.equal(adpRows.length, 2, 'one header and the approved leave line')
  assert.ok(adpRows[1].includes('VAC') && adpRows[1].includes('8.00'))
  hasNone(adp.file, ['Office code', 'custom.office_code', 'OPS-14', 'HR-ONLY-CUSTOM-594'])
  await write({ office_code: 'OPS-15' }, today)
  await api('payroll.export', { batch: adp.id, previewRevision: adp.previewRevision })
  assert.equal(await (await h.raw(`/app/payroll/${adp.id}.csv`, { cookie: owner })).text(), adp.file)


  // Current authority applies to old definitions, values, agents, reports and files.
  await define({ ...hiddenDefinition, effectiveFrom: day(2), employeeRead: true, managerRead: true })
  await write({ office_code: 'OPS-FUTURE' }, day(10))
  assert.equal(custom(await api(`people/${person}?asOf=${day(9)}`), 'office_code').value, 'OPS-15')
  assert.equal(custom(await api(`people/${person}?asOf=${day(10)}`), 'office_code').value, 'OPS-FUTURE')
  for (const [cookie, scope] of [[s.employee.cookie, 'self'], [s.managera.cookie, 'team']]) {
    for (const asOf of [day(-20), day(10)]) {
      const [profile, context] = await Promise.all([h.api(`people/${person}?asOf=${asOf}`, cookie), h.api(`context/${person}?asOf=${asOf}`, cookie)])
      assert.ok(!custom(profile, 'office_code'))
      assert.ok(!custom(context.record, 'office_code'))
      for (const format of ['csv', 'xlsx', 'zip']) hasNone((await download(cookie, scope, format, asOf)).toString(), ['OPS-11', 'OPS-12', 'OPS-13', 'OPS-14', 'OPS-15', 'OPS-FUTURE'])
    }
  }
  const historicReport = await h.api(`reports?fields=custom.office_code&asOf=${day(-20)}`, s.managera.cookie)
  hasNone(historicReport, ['OPS-11', 'OPS-12'])
  await api('member.permissions', { member: s.hr.member, permissions: ['people.manage', 'reports.read'] })
  s.hr.cookie = await h.signIn('hr@example.com')
  const revoked = await h.api(`people/${person}?asOf=${day(-20)}`, s.hr.cookie)
  assert.ok(!custom(revoked, 'hr_note') && !custom(revoked, 'credential_expiry'))
  hasNone(await h.api(`context/${person}?asOf=${day(-20)}`, s.hr.cookie), ['HR-ONLY-CUSTOM-593', 'HR-ONLY-CUSTOM-594'])
  for (const format of ['csv', 'xlsx', 'zip']) hasNone((await download(s.hr.cookie, 'organization', format, day(-20))).toString(), ['HR-ONLY-CUSTOM-593', 'HR-ONLY-CUSTOM-594'])
  await api('leaver.start',{period:s.ended.period,template:templates.leaver,endDate:day(-1),reason:'Fixed-term assignment completed'})
  await browserEvidence(h, owner, s, person, frozen.id)
  console.log('PEOPLE-001 typed fields: schema/value validation, dated corrections, immutable classification, scoped profiles/agents, import catch-up/guarded undo and retained historical meaning passed')
} finally { await h.close() }
