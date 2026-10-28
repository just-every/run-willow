import { customImportSource } from '../custom-fields/import'
import { doorHistory } from './authority'
// Move-in kit 1: BambooHR. Reads an employee report (CSV or XLSX) using
// BambooHR's documented field names (or their report column labels), an
// optional time-off balance CSV and an optional documents ZIP with a
// manifest. Through Base's import kit: a dry-run preview that writes nothing,
// apply bound to the reviewed fingerprint, a durable journal with retained
// originals, re-import that adds nothing, and strict undo that removes only an
// untouched batch. Balances arrive as proposals that a leave manager signs
// off; documents land in their private category, never the directory.
import { validateImportedOrganization } from '../organization-import'
import type { Bindings } from '../../auth.server'
import { rollbackD1Import, undoD1Import, canonicalJson, sha256, type D1ImportContext, type SourceBundle, type SourceRecord, type Json, type TargetEffect, type ImportMapping, type MappingResult } from '../../modules/import-kit/src/d1/index'
import { requirePermission, type Actor } from '../actor'
import { WillowError, all, commit, insist, one, sha256Hex } from '../core'
import { isDate } from '../dates'
import { sniff } from '../files'
import type { Input } from '../input'
import { readCsv, readXlsx, unzip, type Table } from './tables'
import { sourceIdentity } from '../../modules/import-kit/src/provenance/identity'
import { KINDS, willowTargets } from './target'
import { recordTables, validateRowValues, CONTACTS } from '../record-tables/schema'

const namespace = 'bamboohr', mappingVersion = 'bamboohr-people-1', destination = 'people'
const FILE_BYTES = 8_000_000

const ALIASES: Record<string, string[]> = {
  id: ['id', 'eeid', 'employeeid'], employeeNumber: ['employeenumber', 'employee', 'employeeno'], firstName: ['firstname'], lastName: ['lastname'], preferredName: ['preferredname'],
  workEmail: ['workemail'], homeEmail: ['homeemail', 'personalemail'], mobilePhone: ['mobilephone', 'mobile'], address1: ['address1', 'addressline1'], address2: ['address2', 'addressline2'],
  city: ['city'], state: ['state', 'stateprovince'], zipcode: ['zipcode', 'zip', 'postcode', 'postalcode'], country: ['country'], dateOfBirth: ['dateofbirth', 'birthdate'],
  hireDate: ['hiredate'], terminationDate: ['terminationdate'], status: ['status'], employmentStatus: ['employmentstatus'], jobTitle: ['jobtitle'], department: ['department'], location: ['location'],
  supervisorEId: ['supervisoreid', 'supervisorid'], reportsTo: ['reportsto', 'reportingto', 'supervisor'], payRate: ['payrate'], payType: ['paytype'], paidPer: ['paidper', 'payper'],
  timeOffType: ['timeofftype', 'type', 'timeoffcategory'], balance: ['balance', 'available'], units: ['units', 'unit'], asOf: ['asof', 'date', 'balancedate'],
  file: ['file', 'filename'], category: ['category'], title: ['title', 'name', 'documentname'],
}
const normal = (header: string) => header.trim().toLowerCase().replace(/[^a-z0-9]/g, '')

function reader(header: string[]) {
  const columns = header.map(normal)
  const index = Object.fromEntries(Object.entries(ALIASES).map(([field, names]) => [field, columns.findIndex(column => names.includes(column))]))
  return { has: (field: string) => index[field] >= 0, get: (cells: string[], field: string) => index[field] >= 0 ? (cells[index[field]] ?? '').trim() : '' }
}

export type DateOrder = 'DMY' | 'MDY' | 'YMD'
export function parseDate(value: string, order: DateOrder): string | null {
  const text = value.trim()
  if (!text || /^0{4}-0{2}-0{2}$/.test(text)) return null
  const ymd = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T].*)?$/)
  const iso = (y: number, m: number, d: number) => { const date = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`; return isDate(date) ? date : null }
  if (ymd) return iso(+ymd[1], +ymd[2], +ymd[3])
  const parts = text.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/)
  if (!parts || order === 'YMD') return null
  return order === 'DMY' ? iso(+parts[3], +parts[2], +parts[1]) : iso(+parts[3], +parts[1], +parts[2])
}

interface KitFile { filename: string; bytes: Uint8Array }

async function kitFile(input: Input, name: string, optional: boolean): Promise<KitFile | null> {
  if (input.has(`${name}_b64`)) {
    const base64 = input.text(`${name}_b64`, { max: 12_000_000 })
    insist(/^[A-Za-z0-9+/]*={0,2}$/.test(base64), 'invalid_base64')
    const bytes = Uint8Array.from(atob(base64), character => character.charCodeAt(0))
    insist(bytes.length > 0 && bytes.length <= FILE_BYTES, 'file_size')
    return { filename: input.text(`${name}_name`, { max: 200 }), bytes }
  }
  return await input.file(name, { optional, maxBytes: FILE_BYTES })
}

async function table(file: KitFile): Promise<Table> {
  if (/\.xlsx$/i.test(file.filename) || (file.bytes[0] === 0x50 && file.bytes[1] === 0x4b)) return (await readXlsx(file.bytes))[0] ?? { name: file.filename, rows: [] }
  return readCsv(file.bytes, file.filename)
}

const hex = (text: string) => sha256(text)
export const targetIds = {
  department: (name: string) => hex(`willow:bamboohr:department:${name.toLowerCase()}`),
  location: (name: string) => hex(`willow:bamboohr:location:${name.toLowerCase()}`),
  person: (key: string) => hex(`willow:bamboohr:person:${key}`),
  period: (key: string, start: string) => hex(`willow:bamboohr:period:${key}:${start}`),
  account: (key: string, type: string) => hex(`willow:bamboohr:account:${key}:${type.toLowerCase()}`),
  document: (key: string, file: string) => hex(`willow:bamboohr:document:${key}:${file}`),
  record: (key: string, table: string, row: string) => hex(`willow:bamboohr:record:${key}:${table}:${row}`),
}

export interface Preview {
  fingerprint: string
  counts: Json
  people: { active: number; former: number; upcoming: number }
  create: { departments: string[]; locations: string[] }
  rejected: { location: string; reason: string }[]
  unknowns: { person: string; missing: string[] }[]
  attention: { location: string; reason: string }[]
  balances: { person: string; type: string; hours: string; asOf: string; policy: string }[]
  documents: { person: string; title: string; category: string }[]
  tables: { person: string; table: string; rows: number }[]
  gaps: string[]
  carry: Record<string, string>
}

export async function prepareBamboohr(env: Bindings, input: Input) {
  const employer = await one<{ timezone: string; currency: string }>(env, 'SELECT timezone, currency FROM wl_employer')
  insist(employer, 'employer_not_configured', 409)
  const order = (input.text('dateFormat', { optional: true, max: 3 }) || 'YMD') as DateOrder
  insist(['DMY', 'MDY', 'YMD'].includes(order), 'invalid_date_format')
  const scheduleId = input.text('schedule', { optional: true, max: 100 }) || null
  if (scheduleId) insist(await one(env, 'SELECT 1 FROM wl_schedules WHERE id = ?', scheduleId), 'schedule_not_found', 404)
  const employees = (await kitFile(input, 'employees', false))!
  const balances = await kitFile(input, 'balances', true), documents = await kitFile(input, 'documents', true), tableFile = await kitFile(input, 'tables', true)
  const carry: Record<string, string> = { dateFormat: order, ...(scheduleId ? { schedule: scheduleId } : {}) }
  const occurrences=new Map<string,number>()
  const artifacts: SourceBundle['artifacts'] = [], records: SourceRecord[] = []
  const addArtifact = async (file: KitFile, key: string) => {
    const base64 = btoa(Array.from(file.bytes, byte => String.fromCharCode(byte)).join(''))
    const hash = await sha256Hex(file.bytes)
    artifacts.push({ name: file.filename, sha256: hash, size: file.bytes.length, original: { status: 'available', base64 } })
    carry[`${key}_b64`] = base64
    carry[`${key}_name`] = file.filename
    return hash
  }
  const record = (kind: string, sourceId: string, payload: Json, artifactHash: string, artifact: string, row: number) => {
    const key=canonicalJson([kind,sourceId]), occurrence=occurrences.get(key)??0
    occurrences.set(key,occurrence+1)
    records.push({ namespace, kind, sourceId:occurrence?`${sourceId}:duplicate:${occurrence}`:sourceId, payload, payloadHash: sha256(canonicalJson(payload)), artifactHash, location: { artifact, row } })
  }

  // Employees: departments and locations first, then people, then employment (managers exist before references).
  const employeesHash = await addArtifact(employees, 'employees')
  const sheet = await table(employees)
  insist(sheet.rows.length >= 1, 'employees_empty')
  const read = reader(sheet.rows[0])
  if ((!read.has('id') && !read.has('employeeNumber')) || !read.has('firstName') || !read.has('lastName') || !read.has('hireDate')) throw new WillowError('employees_headers', 400, { found: sheet.rows[0], needs: ['id or employeeNumber', 'firstName', 'lastName', 'hireDate'] })
  const rows = sheet.rows.slice(1).map((cells, index) => ({ cells, row: index + 2, field: (name: string) => read.get(cells, name) }))
  const keyOf = (row: { field: (name: string) => string }) => row.field('id') ? `id:${row.field('id')}` : row.field('employeeNumber') ? `number:${row.field('employeeNumber')}` : ''
  const departments = new Set<string>(), locations = new Set<string>()
  for (const row of rows) { if (row.field('department')) departments.add(row.field('department')); if (row.field('location')) locations.add(row.field('location')) }
  for (const name of departments) record('department', `department:${name.toLowerCase()}`, { name }, employeesHash, employees.filename, 0)
  for (const name of locations) record('location', `location:${name.toLowerCase()}`, { name }, employeesHash, employees.filename, 0)
  for (const row of rows) record('person', `person:${keyOf(row) || `row-${row.row}`}`, { row: row.row, cells: Object.fromEntries(sheet.rows[0].map((header, index) => [header || `column ${index + 1}`, row.cells[index] ?? ''])) }, employeesHash, employees.filename, row.row)
  for (const row of rows) record('employment', `employment:${keyOf(row) || `row-${row.row}`}`, { row: row.row, cells: Object.fromEntries(sheet.rows[0].map((header, index) => [header || `column ${index + 1}`, row.cells[index] ?? ''])) }, employeesHash, employees.filename, row.row)

  let balanceRead: ReturnType<typeof reader> | null = null
  if (balances) {
    const hash = await addArtifact(balances, 'balances')
    const balanceSheet = await table(balances)
    insist(balanceSheet.rows.length >= 1, 'balances_empty')
    balanceRead = reader(balanceSheet.rows[0])
    if ((!balanceRead.has('id') && !balanceRead.has('employeeNumber')) || !balanceRead.has('timeOffType') || !balanceRead.has('balance') || !balanceRead.has('asOf')) throw new WillowError('balances_headers', 400, { found: balanceSheet.rows[0], needs: ['id or employeeNumber', 'timeOffType', 'balance', 'units', 'asOf'] })
    balanceSheet.rows.slice(1).forEach((cells, index) => record('balance', `balance:${index + 2}`, { row: index + 2, cells: Object.fromEntries(balanceSheet.rows[0].map((header, column) => [header, cells[column] ?? ''])) }, hash, balances.filename, index + 2))
  }
  const files = new Map<string, Uint8Array>(), hashes = new Map<string, string>()
  if (documents) {
    const hash = await addArtifact(documents, 'documents')
    const entries = await unzip(documents.bytes)
    const manifestEntry = [...entries.keys()].find(name => /(^|\/)manifest\.csv$/i.test(name))
    insist(manifestEntry, 'documents_manifest_missing')
    const manifest = readCsv(await entries.get(manifestEntry)!(), manifestEntry)
    const root = manifestEntry.slice(0, manifestEntry.length - 'manifest.csv'.length)
    for (const [name, open] of entries) if (name !== manifestEntry && !name.endsWith('/')) {
      const bytes = await open()
      files.set(name.slice(root.length), bytes)
      hashes.set(name.slice(root.length), await sha256Hex(bytes))
    }
    manifest.rows.slice(1).forEach((cells, index) => record('document', `document:${index + 2}`, { row: index + 2, manifest: manifestEntry, cells: Object.fromEntries(manifest.rows[0].map((header, column) => [header, cells[column] ?? ''])) }, hash, documents.filename, index + 2))
  }

  // PEOPLE-003: record tables as one CSV per table (tables/<key>.csv inside a ZIP, such as Willow's own records bundle, or a single <key>.csv).
  if (tableFile) {
    const hash = await addArtifact(tableFile, 'tables')
    const sheets: { key: string; name: string; sheet: Table }[] = []
    if (tableFile.bytes[0] === 0x50 && tableFile.bytes[1] === 0x4b) {
      for (const [name, open] of await unzip(tableFile.bytes)) {
        const key = name.match(/(?:^|\/)tables\/([a-z][a-z0-9_]{0,63})\.csv$/)?.[1]
        if (key) sheets.push({ key, name, sheet: readCsv(await open(), name) })
      }
    } else {
      const key = tableFile.filename.match(/^([a-z][a-z0-9_]{0,63})\.csv$/i)?.[1]?.toLowerCase()
      insist(key, 'tables_file_name')
      sheets.push({ key, name: tableFile.filename, sheet: readCsv(tableFile.bytes, tableFile.filename) })
    }
    insist(sheets.length, 'tables_empty')
    for (const { key, name, sheet } of sheets) sheet.rows.slice(1).forEach((cells, index) => record('record', `record:${key}:${name}:${index + 2}`, { table: key, row: index + 2, cells: Object.fromEntries(sheet.rows[0].map((header, column) => [header, cells[column] ?? ''])) }, hash, name, index + 2))
  }
  const knownTables = await recordTables(env), tableList = new Map<string, { person: string; table: string; rows: number }>(), primaries = new Set<string>()

  // What already exists in Willow: native people (duplicate conflicts), earlier imports, settings to map onto.
  const existingPeople = await all(env, 'SELECT id, legal_name, work_email, employee_number, origin FROM wl_people')
  const nativeDepartments = new Map((await all(env, "SELECT id, name FROM wl_departments WHERE origin = 'native'")).map(row => [row.name.toLowerCase(), row.id]))
  const nativeLocations = new Map((await all(env, "SELECT id, name FROM wl_locations WHERE origin = 'native'")).map(row => [row.name.toLowerCase(), row.id]))
  const policies = await all(env, "SELECT p.id, p.name, (SELECT v.id FROM wl_policy_versions v WHERE v.policy_id = p.id AND v.status = 'approved' ORDER BY v.version DESC LIMIT 1) AS version FROM wl_leave_policies p")
  const categories = new Map((await all(env, 'SELECT id, name FROM wl_doc_categories')).map(row => [row.name.toLowerCase(), row.id]))
  const claimed = new Map((await all(env, "SELECT p.target_kind, p.target_id, p.record_json FROM ik_provenance p JOIN ik_jobs j ON j.id = p.job_id WHERE p.destination = ? AND p.reversed = 0 AND j.namespace = 'bamboohr'", destination)).map(row => [`${row.target_kind}:${row.target_id}`, JSON.parse(row.record_json).sourceIdentity as string]))

  const seen = new Map<string, number>(), emails = new Map<string, number>(), periodOf = new Map<string, string>(), personOf = new Map<string, string>()
  const rejected: Preview['rejected'] = [], attention: Preview['attention'] = [], unknowns = new Map<string, Set<string>>()
  const people = { active: 0, former: 0, upcoming: 0 }, balanceList: Preview['balances'] = [], documentList: Preview['documents'] = []
  const create = { departments: [] as string[], locations: [] as string[] }
  const at = (source: SourceRecord) => `${source.location.artifact} row ${source.location.row}`
  const reject = (source: SourceRecord, reason: string) => { rejected.push({ location: at(source), reason }); return { effects: [], rejection: reason } }
  const unknown = (person: string, field: string) => { if (!unknowns.has(person)) unknowns.set(person, new Set()); unknowns.get(person)!.add(field) }
  /** An earlier import's target from a different source row is never overwritten. */
  const conflict = (kind: string, id: string, source: SourceRecord) => { const owner = claimed.get(`${kind}:${id}`); return owner !== undefined && owner !== sourceIdentity(destination, namespace, source.kind, source.sourceId) }
  const effect = (targetKind: string, targetId: string, value: Record<string, Json>): TargetEffect => ({ targetKind, targetId, value })
  const nameOf = (row: { field: (name: string) => string }) => [row.field('firstName'), row.field('lastName')].filter(Boolean).join(' ')
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: employer.timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(Date.now())

  const custom=await customImportSource(env,input,today)

  // Pre-pass: which rows will produce a person, so managers and balances can refer to them.
  const accepted = new Map<string, (typeof rows)[number]>()
  for (const row of rows) {
    const key = keyOf(row)
    if (!key || seen.has(key)) continue
    seen.set(key, row.row)
    accepted.set(key, row)
  }
  seen.clear()
  const managerKey = (row: (typeof rows)[number]) => {
    if (row.field('supervisorEId')) return accepted.has(`id:${row.field('supervisorEId')}`) ? `id:${row.field('supervisorEId')}` : null
    const name = row.field('reportsTo')
    if (!name) return null
    const wanted = name.includes(',') ? name.split(',').map(part => part.trim()).reverse().join(' ').toLowerCase() : name.toLowerCase()
    return [...accepted].find(([, candidate]) => nameOf(candidate).toLowerCase() === wanted || (candidate.field('preferredName') + ' ' + candidate.field('lastName')).toLowerCase() === wanted)?.[0] ?? null
  }

  const mapping: ImportMapping = {
    version: mappingVersion,
    map(source) {
      const payload = source.payload as any
      if (source.kind === 'department' || source.kind === 'location') {
        const name = payload.name as string
        if ((source.kind === 'department' ? nativeDepartments : nativeLocations).has(name.toLowerCase())) return { effects: [], unmapped: [{ reason: `uses the existing Willow ${source.kind} ${name}` }] }
        const id = targetIds[source.kind](name)
        if (conflict(source.kind, id, source)) return { effects: [], unmapped: [{ reason: 'already imported earlier' }] }
        create[source.kind === 'department' ? 'departments' : 'locations'].push(name)
        return { effects: [effect(source.kind, id, source.kind === 'department' ? { name } : { name, timezone: employer.timezone })] }
      }
      if (source.kind === 'person' || source.kind === 'employment') {
        const row = rows.find(candidate => candidate.row === payload.row)!
        const key = keyOf(row), label = nameOf(row) || `row ${row.row}`
        if (!key) return reject(source, 'no stable identifier (id or employeeNumber)')
        if (accepted.get(key) !== row) return reject(source, `duplicate of row ${accepted.get(key)!.row} (same ${key.startsWith('id:') ? 'id' : 'employee number'})`)
        const personId = targetIds.person(key)
        const workEmail = row.field('workEmail').toLowerCase() || null
        if (source.kind === 'person') {
          if (!row.field('firstName') || !row.field('lastName')) return reject(source, 'missing firstName or lastName')
          if (workEmail && emails.has(workEmail)) return reject(source, `work email also used by row ${emails.get(workEmail)}`)
          const existing = existingPeople.find(person => person.id !== personId && ((workEmail && person.work_email === workEmail) || (row.field('employeeNumber') && person.employee_number === row.field('employeeNumber'))))
          if (existing) return reject(source, `already in Willow as ${existing.legal_name} (same ${existing.work_email === workEmail ? 'work email' : 'employee number'}): resolve before importing this row`)
          if (conflict('person', personId, source)) return reject(source, 'already imported earlier with different values; edit the person in Willow instead')
          let customValue:Record<string,string>
          try { customValue=custom.forPerson(personId,payload.cells,source.payloadHash) } catch(error) { if(error instanceof WillowError) return reject(source,`custom field: ${error.code}`); throw error }
          if (workEmail) emails.set(workEmail, row.row)
          personOf.set(key, personId)
          const dob = row.field('dateOfBirth') ? parseDate(row.field('dateOfBirth'), order) : null
          if (row.field('dateOfBirth') && !dob) attention.push({ location: at(source), reason: `unreadable date of birth "${row.field('dateOfBirth')}"; left empty` })
          const address = [row.field('address1'), row.field('address2'), row.field('city'), row.field('state'), row.field('zipcode'), row.field('country')].filter(Boolean).join(', ') || null
          for (const [field, value] of [['work email', workEmail], ['personal email', row.field('homeEmail')], ['phone', row.field('mobilePhone')], ['address', address], ['date of birth', dob]] as const) if (!value) unknown(label, field)
          return { effects: [effect('person', personId, { ...customValue, legalName: nameOf(row), preferredName: row.field('preferredName') || null, workEmail, employeeNumber: row.field('employeeNumber') || null, private: { personal_email: row.field('homeEmail').toLowerCase() || null, phone: row.field('mobilePhone') || null, address, date_of_birth: dob, emergency_contact: null } })] }
        }
        // Employment: one period from hireDate, with an end date when terminated.
        if (!personOf.has(key)) return reject(source, 'the person row was not imported')
        const start = parseDate(row.field('hireDate'), order)
        if (!start) return reject(source, `missing or unreadable hireDate "${row.field('hireDate')}"`)
        const end = row.field('terminationDate') ? parseDate(row.field('terminationDate'), order) : null
        if (row.field('terminationDate') && !end) return reject(source, `unreadable terminationDate "${row.field('terminationDate')}"`)
        if (end && end < start) return reject(source, 'terminationDate is before hireDate')
        if (!end && /^inactive$/i.test(row.field('status'))) return reject(source, 'inactive in BambooHR without a terminationDate: add the date there or record the leaver in Willow')
        if (!row.field('jobTitle')) return reject(source, 'missing jobTitle')
        const periodId = targetIds.period(key, start)
        if (conflict('period', periodId, source)) return reject(source, 'already imported earlier with different values; record changes in Willow instead')
        periodOf.set(key, periodId)
        const status = end && end < today ? 'former' : start > today ? 'upcoming' : 'active'
        people[status]++
        const typeText = row.field('employmentStatus').toLowerCase()
        const type = /full/.test(typeText) ? 'full_time' : /part/.test(typeText) ? 'part_time' : /casual/.test(typeText) ? 'casual' : /contract|fixed|temp/.test(typeText) ? 'fixed_term' : 'unknown'
        if (type === 'unknown') unknown(label, `employment type ("${row.field('employmentStatus') || 'blank'}")`)
        const departmentName = row.field('department'), locationName = row.field('location')
        const departmentId = departmentName ? nativeDepartments.get(departmentName.toLowerCase()) ?? targetIds.department(departmentName) : null
        const locationId = locationName ? nativeLocations.get(locationName.toLowerCase()) ?? targetIds.location(locationName) : null
        if (!departmentId) unknown(label, 'department')
        if (!locationId) unknown(label, 'location')
        const manager = managerKey(row)
        if ((row.field('supervisorEId') || row.field('reportsTo')) && !manager) attention.push({ location: at(source), reason: `manager "${row.field('supervisorEId') || row.field('reportsTo')}" is not in this export; set it in Willow` })
        if (!manager) unknown(label, 'manager')
        if (!scheduleId) unknown(label, 'working schedule')
        const rate = row.field('payRate'), currency = rate.match(/\b([A-Z]{3})\b/)?.[1] ?? employer.currency, amount = rate.replace(/[^0-9.]/g, '')
        const payType = row.field('payType').toLowerCase(), per = row.field('paidPer').toLowerCase()
        let pay: { basis: string; amountCents: number | null; currency: string } = { basis: 'unknown', amountCents: null, currency }
        if (amount && /^\d+(\.\d+)?$/.test(amount) && payType === 'salary' && (!per || per === 'year')) pay = { basis: 'salary', amountCents: Math.round(Number(amount) * 100), currency }
        else if (amount && /^\d+(\.\d+)?$/.test(amount) && payType === 'hourly' && (!per || per === 'hour')) pay = { basis: 'hourly', amountCents: Math.round(Number(amount) * 100), currency }
        else unknown(label, rate || payType ? `pay ("${[rate, payType, per].filter(Boolean).join(' ')}" is not a yearly salary or hourly rate)` : 'pay')
        return { effects: [effect('period', periodId, {
          person: personOf.get(key)!, startDate: start, endDate: end, endReason: end ? 'Ended before the move to Willow (from BambooHR)' : null, employmentType: type, payrollId: null,
          terms: { id: hex(`${periodId}:terms`), jobTitle: row.field('jobTitle'), departmentId, locationId, managerPersonId: manager ? targetIds.person(manager) : null, scheduleId, reason: 'Imported from BambooHR', status: 'active' },
          pay,
        })] }
      }
      const cells = payload.cells as Record<string, string>
      const header = Object.keys(cells), values = Object.values(cells), get = (field: string) => reader(header).get(values, field)
      const key = get('id') ? `id:${get('id')}` : get('employeeNumber') ? `number:${get('employeeNumber')}` : ''
      const owner = accepted.get(key), label = owner ? nameOf(owner) : key || `row ${source.location.row}`
      if (source.kind === 'balance') {
        if (!owner || !periodOf.has(key)) return reject(source, `no imported employment for ${key || 'this row'}`)
        const type = get('timeOffType'), units = (get('units') || 'hours').toLowerCase()
        if (!/^hours?$/.test(units)) return reject(source, `balance for ${label} is in ${units}; Willow counts hours: convert with their schedule and re-export`)
        if (!/^-?\d+(\.\d+)?$/.test(get('balance'))) return reject(source, `unreadable balance "${get('balance')}"`)
        const asOf = parseDate(get('asOf'), order)
        if (!asOf) return reject(source, 'missing or unreadable asOf (the cutover date)')
        const mapped = input.text(`map_${normal(type)}`, { optional: true, max: 100 })
        const policy = policies.find(candidate => mapped ? candidate.id === mapped : candidate.name.toLowerCase() === type.toLowerCase())
        if (mapped) carry[`map_${normal(type)}`] = mapped
        if (!policy) return reject(source, `no Willow leave policy for "${type}": create and approve it, or map it`)
        if (!policy.version) return reject(source, `the Willow policy ${policy.name} has no approved version yet`)
        const id = targetIds.account(key, type)
        if (conflict('account', id, source)) return reject(source, 'already imported earlier with a different balance')
        const minutes = Math.round(Number(get('balance')) * 60)
        balanceList.push({ person: label, type, hours: (minutes / 60).toFixed(2), asOf, policy: policy.name })
        return { effects: [effect('account', id, { period: periodOf.get(key)!, policy: policy.id, policyVersion: policy.version, cutoverDate: asOf, openingMinutes: minutes, openingNote: `BambooHR ${type} balance at ${asOf} (proposed; needs sign-off)`, openingStatus: 'proposed', accruedThrough: asOf })] }
      }
      if (source.kind === 'record') {
        // Willow's own export names the person by employeeNumber; a BambooHR id column also works.
        const ownerKey = get('id') ? `id:${get('id')}` : cells.employeeNumber ? `number:${cells.employeeNumber}` : ''
        const person = [...accepted].find(([candidate, row]) => candidate === ownerKey || (cells.employeeNumber && row.field('employeeNumber') === cells.employeeNumber))
        if (!person || !personOf.has(person[0])) return reject(source, `no imported person for ${ownerKey || 'this row'}`)
        const table = knownTables.find(item => item.key === payload.table)
        if (!table || table.current.retired) return reject(source, `no Willow record table "${payload.table}": define it first`)
        let values
        try { values = validateRowValues(table.current.columns, Object.fromEntries(table.current.columns.map(column => [column.key, cells[column.key] ?? '']))) }
        catch (error) { if (error instanceof WillowError) return reject(source, `${table.key}: ${error.code}`); throw error }
        if (table.id === CONTACTS && values.primary === true) {
          if (primaries.has(person[0])) return reject(source, 'a second primary emergency contact for this person')
          primaries.add(person[0])
        }
        const effectiveFrom = cells.effectiveFrom ? parseDate(cells.effectiveFrom, order) : today
        if (!effectiveFrom) return reject(source, `unreadable effectiveFrom "${cells.effectiveFrom}"`)
        const id = targetIds.record(person[0], table.key, cells.row_id || String(payload.row))
        if (conflict('record', id, source)) return reject(source, 'already imported earlier')
        const label = nameOf(person[1]), listed = tableList.get(`${label}:${table.key}`) ?? { person: label, table: table.current.label, rows: 0 }
        listed.rows++
        tableList.set(`${label}:${table.key}`, listed)
        return { effects: [effect('record', id, { person: personOf.get(person[0])!, table: table.id, version: { id: hex(`${id}:v1`), tableVersion: table.current.id, effectiveFrom, values: canonicalJson(values) } })] }
      }
      // Document manifest row.
      if (!owner || !personOf.has(key)) return reject(source, `no imported person for ${key || 'this row'}`)
      const fileName = get('file'), bytes = files.get(fileName)
      if (!bytes) return reject(source, `file "${fileName}" is not in the ZIP`)
      const category = categories.get(get('category').toLowerCase())
      if (!category) return reject(source, `no Willow document category named "${get('category')}": create it first`)
      const id = targetIds.document(key, fileName)
      if (conflict('document', id, source)) return reject(source, 'already imported earlier')
      documentList.push({ person: label, title: get('title') || fileName, category: get('category') })
      return { effects: [effect('document', id, { person: personOf.get(key)!, category, title: get('title') || fileName, version: { id: hex(`${id}:v1`), filename: fileName.split('/').pop()!, mediaType: sniff(bytes), size: bytes.length, sha256: hashes.get(fileName)! } })] }
    },
  }
  const mapped = new Map<string, MappingResult>()
  for (const source of records) mapped.set(canonicalJson([source.kind, source.sourceId, source.payloadHash]), mapping.map(source))
  const entries = [...mapped.values()]
  await validateImportedOrganization(env, entries)
  const preview: Preview = {
    fingerprint: '', counts: {}, people, create, rejected, attention, balances: balanceList, documents: documentList, tables: [...tableList.values()],
    unknowns: [...unknowns].map(([person, missing]) => ({ person, missing: [...missing] })),
    gaps: [
      'BambooHR reports leave out fields the exporting user cannot see; check that every column you need is present.',
      ...(people.former === 0 ? ['No former employees are in this export. BambooHR reports default to active employees: include inactive employees to keep their history.'] : []),
      ...(balances ? [] : ['No time-off balance file: open leave accounts and enter signed-off opening balances in Willow.']),
      'Opening balances are proposals until a leave manager signs each one off at its cutover date.',
      'Working schedules and payroll identifiers are not part of these BambooHR fields; set them in Willow.',
      ...(tableFile ? [] : ['No record-table file: emergency contacts, education, certifications, assets and custom tables can be added in Willow or imported as tables/<key>.csv.']),
      'Keep BambooHR read-only until Willow has produced one reconciled payroll handoff.',
    ],
    carry:{...carry,...custom.carry},
  }
  // Only mapped native documents need loose FILES bytes. Unmapped ZIP entries
  // remain in the opaque retained original, which Base withdraws on erasure.
  const documentHashes = new Set(entries.flatMap(entry => entry.effects ?? []).filter(effect => effect.targetKind === 'document').map(effect => (effect.value as { version: { sha256: string } }).version.sha256))
  const mappedFiles = new Map([...files].filter(([name]) => documentHashes.has(hashes.get(name)!)))
  return { records, preview, files: mappedFiles, hashes, mapping: { version: mappingVersion, map(source: SourceRecord): MappingResult {
    // Base may remove credentials while reading; never recover their original values from this parser cache.
    return mapped.get(canonicalJson([source.kind, source.sourceId, source.payloadHash])) ?? { effects: [], rejection: 'Source changed during credential screening; review a clean export.' }
  } } }

}

/** Import authority is checked in SQL on every batch: an active session of the owner or of a member holding people.manage. */
function importContext(env: Bindings, actor: Actor): D1ImportContext {
  const predicate = () => ({ sql: `EXISTS(SELECT 1 FROM oa_sessions s JOIN oa_operators o ON o.id = s.operator_id WHERE s.id = ? AND s.revoked_at IS NULL AND s.expires_at > CAST(strftime('%s','now') AS INTEGER) * 1000 AND o.version = s.operator_version AND o.status = 'active'
    AND (o.role = 'owner' OR EXISTS(SELECT 1 FROM wl_members m JOIN wl_effective_permissions p ON p.member_id = m.id WHERE m.operator_id=o.id AND m.status = 'active' AND p.permission = 'people.manage')))`, params: [actor.sessionId] })
  return { destination, namespace, mappingVersion, storage: { database: env.DB as never, targets: willowTargets }, authorization: { principalId: actor.id, predicate }, batchSize: 25 }
}

/** Every imported entity that has since been edited or built on: undo is refused until each is reversed in Willow. */
export async function undoBlockers(env: Bindings, jobId: string) {
  const rows = await all(env, 'SELECT target_kind, target_id, record_json FROM ik_provenance WHERE job_id = ? AND reversed = 0', jobId)
  const blockers: { kind: string; target: string; reason: string }[] = []
  for (const row of rows) {
    const recorded = JSON.parse(row.record_json)
    const current = await KINDS[row.target_kind].read(env.DB as never, row.target_id)
    if (!current) blockers.push({ kind: row.target_kind, target: row.target_id, reason: 'removed since import' })
    else if ('dependents' in current.value) blockers.push({ kind: row.target_kind, target: row.target_id, reason: `${current.value.dependents} later record(s) depend on it` })
    else if (current.revision !== recorded.appliedRevision || sha256(canonicalJson(current.value as Json)) !== recorded.valueHash) blockers.push({ kind: row.target_kind, target: row.target_id, reason: 'edited since import' })
  }
  return blockers
}

export async function undoLegacyImport(env: Bindings, actor: Actor, job: string) {
  insist(actor.owner, 'owner_required', 403)
  const prior=await one<{principal_id:string;state:string}>(env, "SELECT principal_id,state FROM ik_jobs WHERE id = ? AND namespace = 'bamboohr'", job)
  insist(prior, 'legacy_import_not_found', 404)
  const blockers = await undoBlockers(env, job)
  insist(!blockers.length, 'undo_blocked', 409, { blockers })
  const context=importContext(env,actor)
  const reverse=['queued','applying','failed','rolling_back','rolled_back'].includes(prior.state)?rollbackD1Import:undoD1Import
  const result = await reverse(job, {...context,authorization:{...context.authorization,principalId:prior.principal_id}})
  await commit(env, [], { actor: actor.id, action: 'import.undo', subject: job, detail: { state: result.state } })
  return { job, state: result.state }
}

export async function importJobs(env: Bindings, actor: Actor) {
  requirePermission(actor, 'people.manage')
  // Listing is shared with people managers; plans, originals and mutations stay
  // behind import-kit's creator-bound context. Read only this kit's summary.
  const jobs = await all<{ id: string; at: number; detail: string; state: string; total: number }>(env,
    `SELECT j.id, a.at, a.detail, j.state, j.total FROM wl_audit a JOIN ik_jobs j ON j.id = a.subject
     WHERE a.action = 'import.apply' AND j.destination = ? AND j.namespace = ? AND j.mapping_version = ?
     ORDER BY a.at DESC`, destination, namespace, mappingVersion)
  const result: {id:string;planId?:string;fingerprint?:string;caption?:string;appliedAt:number;state:string;counts:any;effects:number;blockers:Awaited<ReturnType<typeof undoBlockers>>}[] = []
  for (const job of jobs) {
    result.push({ id: job.id, appliedAt: job.at, state: job.state, counts: JSON.parse(job.detail).counts, effects: job.total, blockers: job.state === 'completed' ? await undoBlockers(env, job.id) : [] })
  }
  const totals=new Map((await all<{id:string;total:number}>(env,'SELECT id,total FROM ik_jobs')).map(row=>[row.id,row.total]))
  if (actor.owner) for (const item of await doorHistory(env, actor)) {
    const blockers = item.state === 'completed' ? await undoBlockers(env, item.jobId) : []
    const fence = await one<{ receipt_id: string }>(env, 'SELECT receipt_id FROM wl_import_erasure_fences WHERE job_id=?', item.jobId)
    if (fence) blockers.push({ kind: 'erasure', target: fence.receipt_id, reason: `Import custody was withdrawn by erasure receipt ${fence.receipt_id}` })
    result.push({
      id:item.jobId, planId:item.planId, fingerprint:item.fingerprint, caption:item.caption,
      appliedAt:Date.parse(item.approvedAt), state:item.state, effects:totals.get(item.jobId)??0, counts:{}, blockers,
    })
  }
  return result.sort((a,b)=>b.appliedAt-a.appliedAt)
}
