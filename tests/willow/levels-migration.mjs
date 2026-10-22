// ROLE-001: a persisted pre-level installation upgraded by the real D1 CLI,
// then inspected through the current production Worker's public doors.
import assert from 'node:assert/strict'
import { pathToFileURL } from 'node:url'
import { harness } from './harness.mjs'

const hr = ['people.manage', 'people.private', 'documents.private', 'leave.manage', 'reports.read', 'audit.read']
const legacy = [
  ['active', []],
  ['active', ['people.manage']], // A partial HR grant must not become a preset.
  ['active', ['pay.read', 'payroll.handoff']],
  ['active', ['it.tasks', 'people.private', 'reports.read']], // Deliberately mixed.
  ['active', hr],
  ['ended', ['audit.read', 'pay.read', 'people.manage']],
  ['ended', []],
  ['active', [...hr, 'pay.read', 'payroll.handoff', 'it.tasks', 'eeo.read']],
].map(([status, permissions], index) => ({
  id: `synthetic-willow-${index + 2}`, email: `synthetic-willow-${index + 2}@example.test`,
  name: `synthetic-willow-${index + 2}`, status, permissions: [...permissions].sort(),
}))
const sql = value => `'${String(value).replaceAll("'", "''")}'`
const person = 'synthetic-willow-10'
const phone = 'synthetic-willow-11'

// Documented schema inputs from 0001_owner.sql, 0006_willow.sql and 0027_eeo.sql.
// These are synthetic persisted upgrade records, not an application substitute.
const fixtureSql = [
  `INSERT INTO oa_operators(id,email,display_name,role,status,created_at) VALUES('synthetic-willow-1','synthetic-willow-1@example.test','synthetic-willow-1','owner','active',0);`,
  `INSERT INTO oa_bootstrap(singleton,claim_id,claimed_at) VALUES(1,'synthetic-willow-1',0);`,
  ...legacy.flatMap(member => [
    `INSERT INTO wl_members(id,email,name,status,created_at) VALUES(${sql(member.id)},${sql(member.email)},${sql(member.name)},${sql(member.status)},0);`,
    // Keep Base identity active even for ended Willow members, exercising the
    // native member-admission fence instead of relying on inactive sign-in.
    `INSERT INTO oa_operators(id,email,display_name,role,status,created_at) VALUES(${sql(member.id)},${sql(member.email)},${sql(member.name)},${sql(member.permissions.includes('people.manage') ? 'admin' : 'member')},'active',0);`,
    ...member.permissions.map(permission => `INSERT INTO wl_permissions(member_id,permission,granted_by,granted_at) VALUES(${sql(member.id)},${sql(permission)},'synthetic-willow-1',0);`),
  ]),
  `INSERT INTO wl_employer(singleton,name,timezone,country,currency,updated_at) VALUES(1,'synthetic-willow-12','UTC','AU','AUD',0);`,
  `INSERT INTO wl_people(id,legal_name,work_email,revision,created_at,updated_at) VALUES('${person}','${person}','${person}@example.test','${person}',0,0);`,
  `INSERT INTO wl_person_private(person_id,phone) VALUES('${person}','${phone}');`,
  `INSERT INTO wl_periods(id,person_id,start_date,employment_type,revision,created_at) VALUES('synthetic-willow-13','${person}','2020-01-01','full_time','synthetic-willow-13',0);`,
  `INSERT INTO wl_terms(id,period_id,effective_from,job_title,reason,recorded_by,recorded_at) VALUES('synthetic-willow-14','synthetic-willow-13','2020-01-01','synthetic-willow-15','synthetic-willow-16','synthetic-willow-1',0);`,
  `INSERT INTO wl_term_pay(term_id,pay_basis,amount_cents,currency) VALUES('synthetic-willow-14','salary',8123456,'AUD');`,
].join('\n')

const snapshotSql = `SELECT m.id,m.name,m.status,
 (SELECT COALESCE(json_group_array(permission),'[]') FROM
  (SELECT permission FROM wl_permissions WHERE member_id=m.id ORDER BY permission)) AS permissions
 FROM wl_members m ORDER BY m.id`
const sorted = permissions => [...permissions].sort()
const decode = text => text.replaceAll('&quot;', '"').replaceAll('&#39;', "'").replaceAll('&lt;', '<').replaceAll('&gt;', '>').replaceAll('&amp;', '&')

export async function migrationProof() {
  const h = await harness({
    bindings: { OWNER_EMAIL: 'synthetic-willow-1@example.test' },
    upgrade: { before: '0036_access_levels.sql', sql: fixtureSql, snapshot: snapshotSql },
  })
  try {
    const before = h.upgradeSnapshot.map(row => ({ ...row, permissions: JSON.parse(row.permissions) }))
    assert.deepEqual(before, legacy.map(({ email, ...row }) => row), 'The persisted legacy grants are measured before the upgrade')
    const owner = await h.signIn(h.vars.OWNER_EMAIL)
    assert.equal((await h.raw('/setup', { cookie: owner, form: new URLSearchParams({ confirm: 'yes' }) })).status, 303)
    const data = await h.api('levels', owner)
    const members = await h.api('members', owner)
    assert.equal(data.migration.length, before.length, 'Every legacy member has a migration receipt')
    const expectedRows = []
    for (const prior of before) {
      const expected = prior.status === 'active' ? prior.permissions : []
      const receipt = data.migration.find(row => row.member_id === prior.id)
      assert.ok(receipt, `Migration receipt for ${prior.id}`)
      assert.deepEqual(JSON.parse(receipt.before_permissions), prior.permissions, `${prior.id}: receipt preserves the measured prior grants`)
      assert.deepEqual(JSON.parse(receipt.after_permissions), expected, `${prior.id}: receipt records the exact admitted rights`)
      assert.equal(receipt.widened, 0, `${prior.id}: no widened rights`)
      const assigned = data.levels.filter(level => level.members.includes(prior.id))
      assert.deepEqual(sorted(new Set(assigned.flatMap(level => level.permissions))), expected, `${prior.id}: assigned levels contribute exactly the legacy rights`)
      if (prior.status === 'ended') assert.deepEqual(assigned, [], 'Ended access receives no assignment, including an empty level')
      assert.deepEqual(sorted(members.find(member => member.id === prior.id).permissions), expected, `${prior.id}: SQL-derived public member rights agree`)
      const email = legacy.find(member => member.id === prior.id).email
      const cookie = await h.signIn(email)
      if (prior.status === 'ended') {
        assert.equal((await h.api('me', cookie, undefined, 403)).error, 'access_ended')
        await h.api(`people/${person}`, cookie, undefined, 403)
      } else {
        assert.deepEqual(sorted((await h.api('me', cookie)).permissions), expected, `${prior.id}: the real signed-in actor retains exactly its rights`)
        const profile = await h.api(`people/${person}`, cookie)
        assert.equal(profile.private?.phone === phone, expected.includes('people.private'), `${prior.id}: actual private-field disclosure follows the migrated right`)
        assert.equal(profile.facets.includes('pay'), expected.includes('pay.read'), `${prior.id}: actual compensation access follows the migrated right`)
        if (expected.includes('pay.read') && expected.includes('payroll.handoff')) assert.equal(profile.employment[0].terms[0].pay.amountCents, 8123456)
        await h.api('levels', cookie, undefined, 403) // No legacy grant implies access administration.
      }
      expectedRows.push([prior.name, JSON.stringify(prior.permissions), JSON.stringify(expected), '0'])
    }
    const response = await h.raw('/app/access', { cookie: owner })
    assert.equal(response.status, 200)
    const html = await response.text()
    const rows = [...html.matchAll(/<tr>([\s\S]*?)<\/tr>/g)].map(match => [...match[1].matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/g)].map(cell => decode(cell[1])))
    for (const row of expectedRows) assert.ok(rows.some(actual => JSON.stringify(actual) === JSON.stringify(row)), `${row[0]}: Access report shows the actual before/after receipt and zero widening`)
    await migrationBrowserProof(h, owner, expectedRows)
    console.log('ROLE-001 migration: PASS — real pre-0036 D1 upgrade; per-member before/after and zero widening in levels JSON and Access report; exact effective actors, private/pay boundaries and ended-access refusal')
  } finally { await h.close() }
}

async function migrationBrowserProof(h, owner, rows) {
  if (process.env.WILLOW_LEVELS_BROWSER !== '1') return
  assert.ok(process.platform !== 'darwin' || process.env.WILLOW_PLAYWRIGHT_PATH)
  const { evidenceDirectory } = await import('./evidence.mjs')
  const { chromium } = await import(process.env.WILLOW_PLAYWRIGHT_PATH ? pathToFileURL(process.env.WILLOW_PLAYWRIGHT_PATH).href : '@playwright/test')
  const browser = await chromium.launch({ headless: true, args: ['--use-mock-keychain', '--password-store=basic'] })
  try {
    const context = await browser.newContext({ ignoreHTTPSErrors: true })
    try {
      await context.addCookies(owner.split('; ').map(item => ({ name: item.slice(0, item.indexOf('=')), value: item.slice(item.indexOf('=') + 1), url: h.origin })))
      const page = await context.newPage()
      for (const width of [1440, 390]) {
        await page.setViewportSize({ width, height: 1000 })
        assert.equal((await page.goto(h.origin + '/app/access')).status(), 200)
        const report = page.locator('details').filter({ has: page.getByText('Exact-rights migration report', { exact: true }) })
        await report.locator('summary').click()
        const actual = await report.locator('tbody tr').evaluateAll(elements => elements.map(row => [...row.querySelectorAll('td')].map(cell => cell.textContent)))
        assert.deepEqual(actual, rows, `The visible migration report retains every exact receipt at ${width}`)
        await page.evaluate(() => document.fonts.ready)
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `The migration report fits ${width}`)
        await report.scrollIntoViewIfNeeded()
        await page.screenshot({ path: `${evidenceDirectory}/ROLE-001-migration-${width}.png`, fullPage: true })
      }
    } finally { await context.close() }
  } finally { await browser.close() }
}
