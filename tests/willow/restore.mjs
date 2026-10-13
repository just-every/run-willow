// Export the journey's installation, restore it into a second fresh clone and
// prove every portable row and stored document came back, with credentials
// excluded, and that records, permissions, the ledger and documents read back.
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { access, copyFile, mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { readArchive } from '@runeditrun/rer/modules/portability'
import { command, devKey, serving, signIn } from './cli.mjs'

async function archive(path) {
  const data = await readFile(path), records = []
  for await (const record of readArchive(new ReadableStream({ start(controller) { controller.enqueue(data); controller.close() } }))) records.push(record)
  return records
}
const items = records => records.filter(record => record.kind === 'part').flatMap(record => record.items).map(({ index, ...item }) => item)

export async function restoreJourney({ root, target, port }) {
  // An archive inside public/ would ship with the deployed assets: export refuses to write one there.
  await command(root, ['export', '--output', 'public/exposed.rer'], { refuse: true })
  await assert.rejects(access(join(root, 'public/exposed.rer')))
  await command(root, ['export', '--output', 'exports/journey.rer'])
  const before = await archive(join(root, 'exports/journey.rer'))
  const header = before[0]
  for (const table of ['wl_people', 'wl_person_private', 'wl_terms', 'wl_term_pay', 'wl_ledger', 'wl_permissions', 'wl_documents', 'wl_audit']) assert.ok(header.tables.some(entry => entry.name === table), `${table} is in the archive`)
  assert.ok(header.excludedTables.includes('oa_sessions'), 'sessions never leave the installation')
  assert.ok(header.objects.length > 0, 'stored documents are in the archive')
  const rows = table => items(before).filter(item => item.kind === 'row' && item.table === table).map(item => item.row)
  assert.equal(rows('wl_people').length, 2)
  assert.equal(rows('wl_periods').filter(row => row.end_date).length, 2)
  assert.ok(rows('wl_ledger').some(row => row.kind === 'use'))

  const clone = spawn('git', ['clone', '--quiet', '--no-local', root, target], { stdio: 'ignore' })
  assert.equal(await new Promise(resolve => clone.once('exit', resolve)), 0, 'fresh target clone')
  await command(target, ['install'])
  await mkdir(join(target, 'exports'), { recursive: true })
  await copyFile(join(root, 'exports/journey.rer'), join(target, 'exports/journey.rer'))
  const corrupt = (await readFile(join(target, 'exports/journey.rer'), 'utf8')).replace('"kind":"part"', '"kind":"bad"')
  await writeFile(join(target, 'exports/corrupt.rer'), corrupt, { mode: 0o600 })
  await command(target, ['import', '--input', 'exports/corrupt.rer', '--yes'], { refuse: true })
  await command(target, ['import', '--input', 'exports/journey.rer', '--yes'])
  await command(target, ['import', '--input', 'exports/journey.rer', '--yes'], { refuse: true })
  await command(target, ['export', '--output', 'exports/restored.rer'])
  assert.deepEqual(items(await archive(join(target, 'exports/restored.rer'))), items(before), 'every portable row and document chunk survives an empty-target restore')

  const answers = join(target, 'exports/answers.json')
  await writeFile(answers, JSON.stringify({ OWNER_EMAIL: 'owner@example.test' }), { mode: 0o600 })
  await command(target, ['setup', '--answers', 'exports/answers.json', '--non-interactive', '--port', String(port)])
  const server = await serving(target, 'preview', port)
  const origin = `http://127.0.0.1:${port}`
  try {
    const cookie = await signIn(origin, await devKey(target), 'owner@example.test')
    // First-run confirmation belongs to the installation, not the archive: the new owner confirms it again.
    const confirmed = await fetch(`${origin}/setup`, { method: 'POST', redirect: 'manual', headers: { cookie, origin, 'content-type': 'application/x-www-form-urlencoded' }, body: 'confirm=yes' })
    assert.equal(confirmed.status, 303)
    const get = async path => { const response = await fetch(`${origin}/api/willow/${path}`, { headers: { cookie } }); assert.equal(response.status, 200, path); return response.json() }
    const people = await get('people')
    assert.equal(people.length, 2)
    for (const person of people) {
      const view = await get(`people/${person.id}`)
      assert.ok(view.employment[0].terms[0].pay.amountCents > 0, 'pay restored')
      assert.ok(view.leave.accounts[0].ledger.some(entry => entry.kind === 'use'), 'leave ledger restored')
      const version = view.documents[0].versions[0]
      const response = await fetch(`${origin}/app/files/document/${version.id}?download=1`, { headers: { cookie } })
      assert.equal(response.status, 200)
      const bytes = Buffer.from(await response.arrayBuffer())
      assert.equal((await import('node:crypto')).createHash('sha256').update(bytes).digest('hex'), version.sha256, 'document bytes restored')
    }
    const members = await get('members')
    assert.ok(members.some(member => member.person && member.status === 'ended'), 'access state restored')
    assert.ok((await get('payroll')).every(batch => batch.status === 'acknowledged'), 'payroll handoff history restored')
  } finally {
    await server.stop()
  }
  console.log('WIL-17 passed: rer export, public/ destination refused, corrupt and nonempty import refused, fresh-clone restore with identical rows and document bytes, people, pay, ledger, access and payroll history readable after a new sign-in')
}
