// DATA-002's EEO-002 exception, exercised by real erasure and frozen-run doors.
import assert from 'node:assert/strict'

export async function erasedSnapshotEvidence(h, { f, owner, staff, reports, aggregate }) {
  const api = f.api, hr = f.staff.hr.cookie, reader = f.staff.managerb.cookie
  const read = path => h.api(path, hr)
  const beforePeople = new Map(await Promise.all(reports.map(async report => [report.id, (await read(`eeo/runs/${report.id}/people`)).people])))
  await api('retention.adopt', { version: '2026-10-21' })
  for (const state of ['CA', 'TX', 'CO']) await api('retention.state', { state, decision: 'none' })

  // One declined in-period person, one outside the period, and one of exactly
  // five in Denver: losing the last person's row would change suppression.
  const erased = []
  for (const key of ['cara', 'frank', 'denver0']) {
    const person = staff[key].person
    if (key !== 'frank') await api('leaver.start', { period: staff[key].period, template: f.templates.leaver, endDate: '2025-11-20', reason: 'Resigned' })
    for (const item of (await api(`people/${person}`)).cases.filter(row => row.status === 'open')) {
      for (const task of (await api(`cases/${item.id}`)).tasks) await api('task.complete', { task: task.id, evidence: 'Complete' })
      await api('case.complete', { case: item.id })
    }
    await api('erasure.request', { person, source: 'own_request', receivedOn: '2025-12-31' })
    const preview = await api(`erasure/preview?person=${person}`)
    assert.equal(preview.confirmable, true, JSON.stringify(preview.blockers))
    assert.ok(preview.items.some(item => item.id === (key === 'frank' ? 'eeo_run_excluded' : 'eeo_run_rows') && item.disposition === 'retained'))
    const receipt = await api('erasure.confirm', { person, digest: preview.digest })
    erased.push({ key, person, label: receipt.label })
    for (const path of [`people/${person}`, `context/${person}`]) await api(path, undefined, 404)
    await h.api(`eeo/person/${person}`, hr, undefined, 404)
    assert.equal((await h.raw('/api/willow/me', { cookie: staff[key].cookie })).status, 401)
  }

  const secrets = erased.flatMap(row => [row.person, `${row.key}@example.com`, row.key])
  const safe = value => {
    const text = typeof value === 'string' ? value : JSON.stringify(value)
    for (const secret of secrets) assert.ok(!text.includes(secret), `frozen EEO output withholds erased identity ${secret}`)
  }
  for (const before of reports) {
    const report = await read(`eeo/runs/${before.id}`)
    assert.equal(report.roster, before.roster)
    assert.equal(report.reconciles, true)
    for (const field of ['cells', 'flags', 'establishments', 'runFlags', 'noFilingValue']) assert.deepEqual(report[field], before[field], `${field} stays frozen after erasure`)
    assert.equal(report.excluded.length, before.excluded.length)
    const former = report.excluded.find(row => row.person.name === erased.find(row => row.key === 'frank').label)
    assert.deepEqual(former.person, { id: null, name: erased.find(row => row.key === 'frank').label })
    const people = await read(`eeo/runs/${before.id}/people`)
    assert.equal(people.people.length, before.roster)
    for (const row of erased.filter(row => row.key !== 'frank')) {
      const retained = people.people.find(person => person.name === row.label)
      assert.ok(retained)
      assert.equal(retained.id, null)
      assert.equal(retained.title, null, 'free-text title stays in restricted custody')
      const original = beforePeople.get(before.id).find(person => person.id === row.person)
      for (const field of ['category', 'employmentType', 'location', 'race', 'sex', 'flags']) assert.deepEqual(retained[field], original[field], `${field} keeps its frozen compliance value`)
    }
    const cara = (await read(`eeo/runs/${before.id}/people?flag=declined_sex`)).people
    assert.deepEqual(cara.map(person => person.name), [erased.find(row => row.key === 'cara').label])
    assert.equal(cara[0].sex, null)
    if (before.id === reports[0].id) assert.equal(cara[0].race, null)
    else assert.match(cara[0].race.source, /^HR-recorded from employment records/)
    safe(report); safe(people)
    const page = await (await h.raw(`/app/eeo/runs/${before.id}`, { cookie: hr })).text()
    const drillPage = await (await h.raw(`/app/eeo/runs/${before.id}/people?flag=declined_sex`, { cookie: hr })).text()
    assert.ok(page.includes(former.person.name) && drillPage.includes(cara[0].name))
    safe(page); safe(drillPage)
  }

  const after = await h.api(`eeo/runs/${reports[0].id}/aggregate`, reader)
  const sorted = tables => tables.toSorted((a, b) => a.scope.localeCompare(b.scope))
  assert.deepEqual(sorted(after.tables), sorted(aggregate.tables), 'retained Denver person keeps its cell at five; each table keeps its own suppression')
  safe(after)
  for (const row of erased) assert.ok(!JSON.stringify(after).includes(row.label), 'aggregate never exposes receipt labels')
  for (const cookie of [owner, reader, f.staff.managera.cookie]) {
    for (const path of [`eeo/runs/${reports[0].id}`, `eeo/runs/${reports[0].id}/people`]) {
      await h.api(path, cookie, undefined, 403)
      assert.equal((await h.raw(`/app/${path}`, { cookie })).status, 403)
    }
  }
  // Permission removal takes effect immediately, including for retained rows.
  await api('eeo.grant', { member: f.staff.hr.member, enabled: false })
  await h.api(`eeo/runs/${reports[0].id}/people`, hr, undefined, 403)
  await api('eeo.grant', { member: f.staff.hr.member, enabled: true })
  for (const path of ['people', 'eeo/people', 'reports', 'eeo/report']) {
    const ordinary = path === 'eeo/people' ? await read(path) : await api(path)
    safe(ordinary)
    for (const row of erased) assert.ok(!JSON.stringify(ordinary).includes(row.label), 'ordinary doors never project retained people')
  }
}
