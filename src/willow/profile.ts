import type { LeaveField } from './levels/leave'
import { records as compensationRecordsFor } from './compensation/records'
import { compensationProjection } from './compensation/projection'
import { readsCompensation, COMPENSATION_FIELDS, type CompensationField } from './levels/compensation'
import { projectJobEmployment } from './job-projection'
import { hasJobBaseline, readsJobHistoryField, JOB_FIELDS, type JobField } from './levels/job'
// The one projection of a person: every page, JSON read, preview and agent
// context of a person is built here from the viewer's facets, selecting only
// the values those facets allow. Reads of someone else's private contact
// details or pay are audited.
import { readsPersonalField } from './levels/other-personal'
import type { SelfField } from './levels/personal'
import { personCustomFields } from './custom-fields/read'
import { personRecordTables } from './record-tables/rows'
import type { RecordTable } from './record-tables/schema'
import type { EffectiveField } from './custom-fields/store'
import type { Bindings } from '../auth.server'
import { employerZone, type Actor } from './actor'
import { requireDate } from './dates'
import { facets as facetsOf, readsCategory, seesEveryone, seesFormer, type Facet } from './access'
import { all, auditRead, insist, one, type Row } from './core'
import { selectedPeriods } from './employment'
import { documentsFor } from './documents'
import { leaveFor } from './leave'
import { casesFor } from './lifecycle'
import { PRIVATE_FIELDS, currentTerms, displayName, personNames, statusOf } from './people'

export interface ViewOptions {
  leaveFields?:(field:LeaveField)=>boolean
  compensationFields?: (field:CompensationField)=>boolean
  jobFields?: (field: JobField) => boolean
  personalFields?: (field: SelfField) => boolean
  asOf?: string
  audit?: boolean
  /** Preview admission is the selected member's; reads/audits remain the real viewer's. */
  admissionActor?: Actor
  /** A narrower facet set (visibility previews). Defaults to the actor's own facets. */
  facets?: Set<Facet>
  categories?: (category: Record<string, any>) => boolean
  /** Intersects current custom-field access for previews and explicit export selections. */
  customFields?: (definition: EffectiveField) => boolean
  /** Intersects current record-table access for visibility previews. */
  recordTables?: (table: RecordTable) => boolean
}

async function lookups(env: Bindings) {
  const [departments, locations, schedules, names, divisions] = await Promise.all([
    all(env, 'SELECT id, name FROM wl_departments'), all(env, 'SELECT id, name FROM wl_locations'), all(env, 'SELECT * FROM wl_schedules'), personNames(env),
    all(env, 'SELECT d.id AS department, v.id, v.name FROM wl_departments d JOIN wl_divisions v ON v.id = d.division_id'),
  ])
  const name = (rows: Row[]) => new Map(rows.map(row => [row.id, row.name as string]))
  return { divisions: new Map(divisions.map(row => [row.department as string, { id: row.id as string, name: row.name as string }])), departments: name(departments), locations: name(locations), schedules: new Map(schedules.map(row => [row.id, { name: row.name, weeklyMinutes: row.mon + row.tue + row.wed + row.thu + row.fri + row.sat + row.sun }])), people: names }
}

type Lookups = Awaited<ReturnType<typeof lookups>>

function termsSummary(terms: Row | undefined, look: Lookups) {
  if (!terms) return null
  return {
    jobTitle: terms.job_title,
    department: terms.department_id ? { id: terms.department_id, name: look.departments.get(terms.department_id) } : null,
    location: terms.location_id ? { id: terms.location_id, name: look.locations.get(terms.location_id) } : null,
    manager: terms.manager_person_id ? { id: terms.manager_person_id, name: look.people.get(terms.manager_person_id) } : null,
  }
}

async function employmentView(env: Bindings, periods: Row[], current: Row | undefined, look: Lookups, visible: Set<Facet>, date: string) {
  const entities = new Map((periods.length ? await all(env, `SELECT e.period_id, l.id, l.name FROM wl_period_entities e JOIN wl_legal_entities l ON l.id = e.entity_id WHERE e.period_id IN (${periods.map(() => '?').join(', ')})`, ...periods.map(period => period.id)) : []).map(row => [row.period_id, { id: row.id, name: row.name }]))
  const terms = periods.length ? await all(env, `SELECT * FROM wl_terms WHERE period_id IN (${periods.map(() => '?').join(', ')}) ORDER BY effective_from DESC, recorded_at DESC`, ...periods.map(period => period.id)) : []
  const pay = visible.has('pay') && terms.length ? new Map((await all(env, `SELECT * FROM wl_term_pay WHERE term_id IN (${terms.map(() => '?').join(', ')})`, ...terms.map(row => row.id))).map(row => [row.term_id, row])) : null
  const employment = periods.map(period => ({
    id: period.id, revision: period.revision, startDate: period.start_date, endDate: period.end_date, employmentType: period.employment_type, status: statusOf(period, date), legalEntity: entities.get(period.id) ?? null,
    ...(visible.has('payroll') ? { payrollId: period.payroll_id } : {}),
    ...(visible.has('private') ? { endReason: period.end_reason } : {}),
    terms: terms.filter(row => row.period_id === period.id).map(row => ({
      id: row.id, effectiveFrom: row.effective_from, status: row.status, reason: row.reason, inForce: row.id === current?.id,
      ...termsSummary(row, look), fte: row.fte ?? (row.schedule_id && look.schedules.get(row.schedule_id) ? look.schedules.get(row.schedule_id)!.weeklyMinutes / 2400 : null), division: row.department_id ? look.divisions.get(row.department_id) ?? null : null, schedule: row.schedule_id ? { id: row.schedule_id, ...look.schedules.get(row.schedule_id) } : null, recordedAt: row.recorded_at,
      ...(pay ? { pay: pay.get(row.id) ? { basis: pay.get(row.id)!.pay_basis, amountCents: pay.get(row.id)!.amount_cents, currency: pay.get(row.id)!.currency } : null } : {}),
    })),
  }))
  return { employment, ...(pay ? { pay: true } : {}) }
}

export async function personView(env: Bindings, actor: Actor, personId: string, options: ViewOptions = {}) {
  const date = options.asOf === undefined ? actor.today : requireDate(options.asOf, 'invalid_asOf')
  const zone = options.asOf === undefined ? undefined : await employerZone(env)
  const [person, look, periods, currentRows, selectedRows] = await Promise.all([
    one(env, 'SELECT id, legal_name, preferred_name, work_email, employee_number, revision FROM wl_people WHERE id = ? AND NOT EXISTS (SELECT 1 FROM wl_erasure_requests r WHERE r.person_id=wl_people.id AND r.receipt_id IS NOT NULL)', personId),
    lookups(env),
    all(env, 'SELECT id, revision, start_date, end_date, employment_type, payroll_id, end_reason FROM wl_periods WHERE person_id = ? ORDER BY start_date DESC', personId),
    currentTerms(env, date),
    selectedPeriods(env, date),
  ])
  insist(person, 'not_found', 404)
  const current = currentRows.get(personId), selected = selectedRows.get(personId)
  const admitted = options.admissionActor ?? actor
  // Former employees appear only to members who see everyone.
  const admittedPeriod = (await selectedPeriods(env, admitted.today)).get(personId)
  insist(statusOf(admittedPeriod, admitted.today) !== 'former' || seesFormer(admitted, personId) || admitted.personId === personId || facetsOf(admitted, personId).has('employment'), 'not_found', 404)
  const visible = options.facets ?? facetsOf(actor, personId)
  const personalFields=PRIVATE_FIELDS.filter(field=>readsPersonalField(actor,personId,field) && (!options.personalFields || options.personalFields(field)))
  // Resolve independent facets together, after admission and before rendering.
  const readsHistory=readsCompensation(actor,personId,'history')&&(!options.compensationFields||options.compensationFields('history'))
  const payProjection=readsHistory?new Set([...visible,'pay' as Facet]):visible
  const [employment, privateValues, leave, cases, documents, customFields, recordTables] = await Promise.all([
    visible.has('employment') || visible.has('pay') || readsHistory ? employmentView(env, periods, current, look, payProjection, date) : undefined,
    personalFields.length ? one(env, `SELECT ${personalFields.join(', ')} FROM wl_person_private WHERE person_id = ?`, personId) : undefined,
    visible.has('leave') ? leaveFor(env, actor, personId, visible.has('leave_reason'), options.asOf === undefined ? undefined : date, options.leaveFields) : undefined,
    visible.has('lifecycle') ? casesFor(env, personId, options.asOf === undefined ? undefined : { date, zone: zone! }) : undefined,
    visible.has('documents') ? documentsFor(env, actor, personId, options.categories ?? (category => readsCategory(actor, personId, category)), options.asOf === undefined ? undefined : { date, zone: zone! }) : undefined,
    personCustomFields(env, actor, personId, date, options.customFields),
    personRecordTables(env, actor, personId, date, { allow: options.recordTables }),
  ])
  if(employment) {
    const history=readsHistory
    const pay=readsCompensation(actor,personId,'pay')&&(!options.compensationFields||options.compensationFields('pay'))
    const todayTerm=(await currentTerms(env,actor.today)).get(personId)?.id
    for(const period of employment.employment)for(const term of period.terms)if(term.id===todayTerm?!pay:!history)delete (term as Record<string,unknown>).pay
  }
  if(employment&&!visible.has('pay'))delete (employment as Record<string,unknown>).pay
  if(employment) employment.employment=projectJobEmployment(actor,personId,employment.employment,options.jobFields) as typeof employment.employment
  const jobFields=Object.fromEntries(JOB_FIELDS.map(field=>[field,readsJobHistoryField(actor,personId,field)&&(!options.jobFields||options.jobFields(field))]))
  const compensationFields=Object.fromEntries(COMPENSATION_FIELDS.map(field=>[field,readsCompensation(actor,personId,field)&&(!options.compensationFields||options.compensationFields(field))]))
  const compensationRecords=await compensationRecordsFor(env,actor,personId,options.compensationFields)
  const compensation=await compensationProjection(env,actor,personId,options.compensationFields,date)
  const view: Record<string, unknown> = {
    compensationFields, compensationRecords, compensation,
    jobFields,
    customFields,
    recordTables,
    id: person.id, revision: person.revision, name: displayName(person), legalName: person.legal_name, preferredName: person.preferred_name, workEmail: person.work_email,
    asOf: date, status: statusOf(selected, date), selectedPeriod: selected?.id ?? null,
    current: current ? { id: current.id, effectiveFrom: current.effective_from, scheduled: current.effective_from > actor.today, ...termsSummary(current, look),
      ...(visible.has('employment') && jobFields.scheduleId ? { schedule: current.schedule_id ? { id: current.schedule_id, ...look.schedules.get(current.schedule_id) } : null } : {}), ...(visible.has('employment') && jobFields.fte ? {fte: current.fte ?? (current.schedule_id && look.schedules.get(current.schedule_id) ? look.schedules.get(current.schedule_id)!.weeklyMinutes / 2400 : null)} : {}) } : null, facets: [...visible],
    ...(employment ? { ...(hasJobBaseline(actor,personId) && visible.has('employment') ? {employeeNumber: person.employee_number} : {}), ...employment } : {}),
    ...(personalFields.length ? { private: Object.fromEntries(personalFields.map(field => [field, privateValues?.[field] ?? null])) } : {}),
    ...(visible.has('leave') ? { leave } : {}),
    ...(visible.has('lifecycle') ? { cases } : {}),
    ...(visible.has('documents') ? { documents } : {}),
  }
  if(view.current && !jobFields.startDate && current?.effective_from===selected?.start_date) delete (view.current as Record<string,unknown>).effectiveFrom
  if (options.audit !== false && actor.personId !== personId && (personalFields.length || COMPENSATION_FIELDS.some(field=>compensationFields[field]))) {
    await auditRead(env, actor.id, 'person.private.read', personId, { private: personalFields, pay: visible.has('pay'),compensation:COMPENSATION_FIELDS.filter(field=>compensationFields[field]), asOf: date })
  }
  return view
}

/** The directory: current and upcoming people for every member; former people too for members who see everyone. */
export async function directory(env: Bindings, actor: Actor, asOf = actor.today) {
  const date = requireDate(asOf, 'invalid_asOf')
  const look = await lookups(env)
  const people = await all(env, 'SELECT id, legal_name, preferred_name, work_email FROM wl_people WHERE NOT EXISTS (SELECT 1 FROM wl_erasure_requests r WHERE r.person_id=wl_people.id AND r.receipt_id IS NOT NULL) ORDER BY COALESCE(preferred_name, legal_name)')
  const selected = await selectedPeriods(env, date)
  const current = await currentTerms(env, date)
  const everyone = seesEveryone(actor)
  const admitted = await selectedPeriods(env, actor.today)
  return people
    .map(person => ({ person, status: statusOf(selected.get(person.id), date) }))
    .filter(({ person }) => everyone || ['active', 'upcoming'].includes(statusOf(admitted.get(person.id), actor.today)) || seesFormer(actor, person.id))
    .map(({ person, status }) => ({ id: person.id, name: displayName(person), workEmail: person.work_email, status, ...termsSummary(current.get(person.id), look) }))
}

/** SELF-002 consent publishes only month/day, never the canonical private birth date. */
export async function birthdayMonthDays(env:Bindings,date:string):Promise<{person:string;month:number;day:number}[]> {
 requireDate(date,'invalid_asOf')
 return all(env,`SELECT pr.person_id AS person,CAST(substr(pr.date_of_birth,6,2) AS INTEGER) AS month,CAST(substr(pr.date_of_birth,9,2) AS INTEGER) AS day
 FROM wl_person_private pr JOIN wl_company_preferences c ON c.person_id=pr.person_id
 WHERE c.birthday=1 AND pr.date_of_birth IS NOT NULL AND pr.date_of_birth<>''
 AND EXISTS(SELECT 1 FROM wl_periods p WHERE p.person_id=pr.person_id AND p.start_date<=? AND (p.end_date IS NULL OR p.end_date>=?))`,date,date)
}
