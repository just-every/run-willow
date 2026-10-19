// OPEN-001: the exact public command, against public main, with no author account.
// This is remote-source evidence; local connection billing is proved separately.
import assert from 'node:assert/strict'
import { publishTemplate } from './publish-template.mjs'
import { execFile } from 'node:child_process'
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, delimiter } from 'node:path'
import { promisify } from 'node:util'
import { pathToFileURL } from 'node:url'
import { createRedaction } from '@runeditrun/rer/redaction'
import { publicStart } from './open-start-process.mjs'

const execute = promisify(execFile), redaction = createRedaction()
const safe = value => redaction.redact(String(value)).replace(/https?:\/\/[^\s<>"']+/gi, '[private URL]')
const gates = /\b(?:upgrade (?:your|to|now)|buy (?:a )?licen[cs]e|enter (?:a |your )?licen[cs]e (?:key|code)|choose (?:a )?(?:paid )?plan|start (?:a |your )?(?:free )?trial|subscribe (?:now|to (?:willow|unlock))|payment required|(?:employee|seat) limit reached|purchase (?:seats|a plan))\b/i

async function run() {
  const scratch = await mkdtemp(join(tmpdir(), 'willow-open-'))
  const cwd = join(scratch, 'empty'), home = join(scratch, 'home')
  const npmUser = join(scratch, 'user.npmrc'), npmGlobal = join(scratch, 'global.npmrc')
  await Promise.all([mkdir(cwd), mkdir(home), writeFile(npmUser, ''), writeFile(npmGlobal, '')])
  // No ambient npm config, git credentials, provider keys, checkout overrides or
  // registry/cache overrides. HOME belongs only to this child, never this Node/browser.
  const environment = {
    PATH: [...new Set([dirname(process.execPath), ...(process.env.PATH ?? '').split(delimiter).filter(p => p && !p.includes('node_modules'))])].join(delimiter),
    HOME: home, TMPDIR: scratch, LANG: 'en_US.UTF-8', CI: '1',
    GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null', GIT_TERMINAL_PROMPT: '0',
    npm_config_userconfig: npmUser, npm_config_globalconfig: npmGlobal, npm_config_registry: 'https://registry.npmjs.org/',
    BROWSER: 'none',
  }
  assert.equal((await readdir(cwd)).length, 0, 'Public command begins in an empty directory')
  const cancelled = new AbortController(), cancel = () => cancelled.abort()
  process.on('SIGINT', cancel); process.on('SIGTERM', cancel)
  let launch, browser, revision = 'not yet resolved', failure
  try {
    launch = await publicStart(cwd, environment)
    const open = await launch.ready(cancelled.signal)
    redaction.addSecrets(open)
    const url = new URL(open), origin = url.origin
    assert.ok(url.protocol === 'http:' && /^(?:localhost|127\.0\.0\.1|\[::1\]|[\w.-]+\.localhost)$/.test(url.hostname), 'RER_OPEN must stay on this computer')
    const root = join(cwd, 'run-willow')
    const git = async args => (await execute('git', ['-C', root, ...args], { env: environment, timeout: 30_000 })).stdout.trim()
    const [source, head, main, license, manifest] = await Promise.all([
      git(['config', '--get', 'remote.origin.url']), git(['rev-parse', 'HEAD']), git(['rev-parse', 'refs/remotes/origin/main']),
      readFile(join(root, 'LICENSE'), 'utf8'), readFile(join(root, 'package.json'), 'utf8'),
    ])
    assert.ok(/^https:\/\/github\.com\/just-every\/run-willow(?:\.git)?\/?$/.test(source), 'The command must clone the public source')
    assert.ok(head === main && /^[a-f0-9]{40,64}$/.test(head), 'The journey must exercise public main')
    revision = head
    const terms = license.replace(/\s+/g, ' ').toLowerCase()
    // Check the legal grant, notice obligation and disclaimer, not a file hash,
    // formatting, copyright year or a pinned verbatim license fixture.
    assert.ok(/^mit license\b/.test(terms), 'Repository identifies its license as MIT')
    assert.ok(/permission.*free of charge.*without restriction/.test(terms), 'MIT grants use without payment or restriction')
    for (const right of ['use', 'copy', 'modify', 'merge', 'publish', 'distribute', 'sublicense', 'sell']) assert.ok(new RegExp(`\\b${right}\\b`).test(terms), `License grants ${right}`)
    assert.ok(/copyright notice.*permission notice.*included/.test(terms) && /without warranty/.test(terms) && /no event.*liable/.test(terms), 'MIT notice obligation and warranty/liability terms remain')
    assert.ok(JSON.parse(manifest).license === 'MIT', 'Package declares the same MIT rights')

    const { chromium } = await import(process.env.WILLOW_PLAYWRIGHT_PATH ? pathToFileURL(process.env.WILLOW_PLAYWRIGHT_PATH).href : '@playwright/test')
    browser = await chromium.launch({ headless: true, args: ['--use-mock-keychain', '--password-store=basic'] }) // Real HOME/browser cache.
    cancelled.signal.addEventListener('abort', () => { void browser?.close().catch(() => {}) }, { once: true })
    const context = await browser.newContext(), page = await context.newPage()
    const response = await page.goto(open)
    assert.ok(response?.ok(), 'Signed-in local entry responds successfully')
    await page.waitForURL(u => /^\/(app(?:\/.*)?|setup)$/.test(u.pathname))
    if (new URL(page.url()).pathname === '/setup') {
      await page.getByRole('checkbox').check()
      await page.getByRole('button', { name: 'Finish setup' }).click()
      await page.waitForURL(u => u.pathname.startsWith('/app'))
    }
    const h = { api: async (path, _cookie, data) => {
      const response = await context.request.fetch(`${origin}/api/willow/${path}`, {
        method: data === undefined ? 'GET' : 'POST', headers: { Origin: origin }, data, timeout: 30_000, maxRedirects: 0,
      })
      assert.ok(response.status() === 200, `Public API ${path.split('?')[0]} failed (${response.status()})`)
      const result = await response.json()
      assert.ok(!result?.error, `Public API ${path.split('?')[0]} refused its business operation`)
      return result
    } }
    const api = (path, data) => h.api(path, undefined, data)
    const owner = await api('me')
    assert.ok(owner.owner, 'RER_OPEN signs in as the local owner without an author account')
    await api('employer.configure', { name: 'Juniper Field Services', timezone: 'America/Chicago', country: 'US', currency: 'USD' })
    assert.equal((await api('people')).length, 0, 'Populate a fresh employer through public writes')
    const today = (await api('me')).today, day = offset => new Date(Date.parse(today) + offset * 86400000).toISOString().slice(0, 10)
    const schedule = (await api('schedule.create', { name: 'Standard full-time week', mon: '8', tue: '8', wed: '8', thu: '8', fri: '8' })).id
    const location = (await api('location.create', { name: 'Austin office', timezone: 'America/Chicago' })).id
    const template = (await publishTemplate(h, undefined, { name: 'Employee onboarding', kind: 'joiner', taskTitle: ['Review employment record'], taskAssignee: ['hr'], taskDueDays: ['0'] })).id
    const departmentNames = ['Operations', 'Customer Success', 'Engineering', 'Finance', 'People', 'Sales']
    const departments = await Promise.all(departmentNames.map(async name => (await api('department.create', { name })).id))
    const first = ['Amara', 'Noah', 'Sofia', 'Liam', 'Priya', 'Ethan', 'Zoe', 'Mateo'], last = ['Okafor', 'Williams', 'Garcia', 'Chen', 'Patel', 'Nguyen'], employees = []
    for (let index = 0; index < 48; index++) {
      const team = Math.floor(index / 8), name = `${first[index % 8]} ${last[(team + index % 8) % 6]}`
      employees.push(await api('joiner.start', {
        template, legalName: name, workEmail: `${name.toLowerCase().replace(' ', '.')}@example.com`, employeeNumber: `JF-${1001 + index}`,
        startDate: day(-730 + index * 7), employmentType: 'full_time', payrollId: `PAY-${1001 + index}`,
        jobTitle: index === 0 ? 'Managing Director' : index % 8 === 0 ? `${departmentNames[team]} Manager` : `${departmentNames[team]} Specialist`,
        departmentId: departments[team], locationId: location, scheduleId: schedule,
        managerPersonId: index === 0 ? '' : employees[index % 8 === 0 ? 0 : team * 8].person,
        payBasis: 'salary', payAmount: String(62000 + team * 5000 + (index % 8 === 0 ? 35000 : index * 250)),
      }))
    }
    const people = await api('people?status=active')
    assert.equal(people.length, 48, 'All 48 employees are active and readable')
    assert.deepEqual(new Set(people.map(p => p.id)), new Set(employees.map(p => p.person)), 'No employee disappeared behind a seat gate')
    assert.equal((await api('organization')).activeCount, 48)
    const employee = employees[47]
    await page.goto(`${origin}/app/people/${employee.person}`)
    await page.getByText('Schedule a change (mover)', { exact: true }).click()
    const mover = page.locator('form[action="/app/do/mover.schedule"]')
    await mover.getByLabel('Effective from').fill(today)
    await mover.getByLabel('Job title').fill('Sales Team Lead')
    await mover.getByLabel('Reason').fill('Approved internal promotion')
    await mover.getByRole('button').click()
    await page.waitForURL(u => u.searchParams.has('notice'))
    assert.equal((await api(`people/${employee.person}`)).current.jobTitle, 'Sales Team Lead', 'Employment write succeeds with 48 employees')
    const caseRecord = await api(`cases/${employee.case}`)
    await api('task.complete', { task: caseRecord.tasks[0].id })
    await api('case.complete', { case: employee.case })
    assert.equal((await api(`cases/${employee.case}`)).status, 'completed', 'Onboarding remains useful at 48')
    const policy = await api('policy.write', { name: 'Paid time off', summary: 'Four weeks of scheduled hours annually.', accrualWeeks: '4', negativeLimitHours: '0' })
    await api('policy.approve', { version: policy.id })
    const account = await api('account.open', { period: employee.period, policy: policy.policy, cutoverDate: day(-1), openingHours: '80', note: 'Reconciled opening entitlement' })
    await api('account.approve', { account: account.id })
    let leaveDay = day(7)
    while ([0, 6].includes(new Date(leaveDay).getUTCDay())) leaveDay = new Date(Date.parse(leaveDay) + 86400000).toISOString().slice(0, 10)
    const leave = await api('leave.request', { account: account.id, startDate: leaveDay, endDate: leaveDay })
    const category = await api('category.create', { name: 'Employment agreements', subjectReads: true })
    const agreement = 'Invented Juniper employment agreement.'
    const document = await api('document.add', { person: employee.person, category: category.id, title: 'Employment agreement', file: { filename: 'agreement.txt', base64: Buffer.from(agreement).toString('base64') } })
    const proposal = await api('proposal.create', { kind: 'mover', summary: 'Next quarter role review', agent: 'Juniper people operations', plan: { period: employees[46].period, effectiveFrom: day(30), jobTitle: 'Senior Sales Specialist', reason: 'Quarterly development review' } })
    // Exercise a real payroll artifact; provider execution stays with the provider.
    const columns = ['provider_employee_id', 'employee_number', 'name', 'change', 'effective_date', 'end_date', 'units', 'unit', 'field', 'from', 'to', 'note'].map(source => ({ source, heading: source }))
    await api('payroll.layout', { format: 'generic', columns })
    const batch = await api('payroll.draft', { periodStart: day(-14), periodEnd: today })
    const preview = await api('payroll.preview', { batch: batch.id })
    await api('payroll.export', { batch: batch.id, previewRevision: preview.previewRevision })
    const routes = new Set(['/app/people?view=organization'])
    const detail = { person: `/app/people/${employee.person}`, case: `/app/cases/${employee.case}`, request: `/app/leave/${leave.id}`, batch: `/app/payroll/${batch.id}`, batchFile: `/app/payroll/${batch.id}.csv`, proposal: `/app/proposals/${proposal.id}`, document: `/app/files/document/${document.version}` }
    // Enumerate the actual downloaded edition, including pages absent from nav.
    const doors = await readFile(join(root, 'src/willow/doors.ts'), 'utf8')
    const registered = [...doors.matchAll(/\['(\^\/app[^']+)',\s*'([^']+)'\]/g)]
    assert.ok(registered.length > 0, 'Discover public pages in the downloaded edition')
    for (const [, pattern, name] of registered) {
      const route = pattern.includes('(') ? detail[name] : pattern.slice(1, -1).replaceAll('\\\\', '\\').replaceAll('\\.', '.')
      assert.ok(route, `Add public business data to open shipped page ${name}`)
      routes.add(route)
    }
    const visited = new Set()
    for (const route of routes) {
      const response = await context.request.get(origin + route, { maxRedirects: 0 })
      assert.equal(response.status(), 200, `Product page/download ${route} opens without a paid gate`)
      if (!(response.headers()['content-type'] ?? '').includes('text/html')) {
        const body = (await response.body()).toString()
        assert.ok(body.length > 0, 'Download contains real business data')
        if (route === detail.document) assert.equal(body, agreement, 'Download preserves the employment agreement bytes')
        if (route === detail.batchFile) for (let index = 0; index < employees.length; index++) assert.ok(body.includes(`PAY-${1001 + index}`), 'Payroll download includes every employee')
        continue
      }
      const navigation = await page.goto(origin + route)
      assert.ok(navigation?.ok() && new URL(page.url()).pathname === new URL(origin + route).pathname, `Product area ${route} stays accessible`)
      assert.ok(await page.locator('main h1').count(), `Product area ${route} renders its working page`)
      assert.ok(!gates.test(await page.locator('main').innerText()), `Product area ${route} presents an author payment/license gate`)
      for (const href of await page.locator('nav a[href]').evaluateAll(links => links.map(link => link.getAttribute('href')))) {
        assert.ok(href.startsWith('/app'), 'Product navigation stays inside the signed-in product')
        routes.add(href)
      }
      visited.add(route)
    }
    const reads = ['me', 'permissions', 'settings', 'members', 'people', 'organization', 'templates', 'tasks', 'policies', 'approvals', 'payroll', 'reports', 'proposals', 'imports', 'audit', 'connections', 'payroll-layout', 'model-drafts', `people/${employee.person}`, `context/${employee.person}`, `cases/${employee.case}`, `leave/${leave.id}`, `payroll/${batch.id}`, `proposals/${proposal.id}`, `preview?member=${owner.id}&person=${employee.person}`, `quote?account=${account.id}&startDate=${leaveDay}&endDate=${leaveDay}`]
    for (let offset = 0; offset < reads.length; offset += 4) await Promise.all(reads.slice(offset, offset + 4).map(path => api(path)))
    assert.equal((await api('people?status=active')).length, 48)
    console.log(`OPEN-001 public main ${revision}: MIT rights, credential-free exact npx start, 48 employees, employment/case/payroll writes, ${visited.size} product pages and all navigation passed. Local billing disclosures require their separate proof.`)
  } catch (error) { failure = error }
  finally {
    const cleanup = await Promise.allSettled([browser?.close(), launch?.stop()])
    process.off('SIGINT', cancel); process.off('SIGTERM', cancel)
    const errors = cleanup.filter(result => result.status === 'rejected').map(result => result.reason)
    if (!errors.length) await rm(scratch, { recursive: true, force: true })
    if (failure || errors.length) throw new Error(`Remote main ${revision}: ${[failure, ...errors].filter(Boolean).map(error => safe(error.message)).join('\n')}${errors.length ? `\nScratch retained for owned-process recovery: ${scratch}` : ''}`)
  }
}

run().catch(error => { console.error(safe(error.message)); process.exitCode = 1 })
