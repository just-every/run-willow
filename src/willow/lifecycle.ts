// Flows 4, 6, 11 and 12: versioned lifecycle templates and joiner, mover and
// leaver cases. Tasks go to HR, the manager, IT, payroll or the employee with
// due dates; external account and device work stays open until the
// responsible person records evidence. A case cannot complete while any task
// is open.
import type { Bindings } from '../auth.server'
import { can, requirePermission, type Actor, type Permission } from './actor'
import { sees } from './access'
import { all, commit, guard, insist, json, newId, now, one, stmt, type Row } from './core'
import { addDays, requireDate, today } from './dates'
import { requireEmployer } from './employer'
import type { Input } from './input'
import { endAccessStatements } from './members'
import { managerChangeGuard } from './organization'
import { editorTaskRules, parseTaskRules } from './workflow-rules'
import { blockedBy, plannedTasks, workflowContext, type WorkflowContext } from './workflow-plan'
import { PRIVATE_FIELDS, createPersonStatements, displayName, prepareTerms, readPerson, startPeriodStatements, termsOn } from './people'

export const ASSIGNEES = ['hr', 'manager', 'it', 'payroll', 'employee'] as const
export type Assignee = typeof ASSIGNEES[number]
export const ASSIGNEE_PERMISSION: Partial<Record<Assignee, Permission>> = { hr: 'people.manage', it: 'it.tasks', payroll: 'payroll.handoff' }
export const REQUIRED_FIELDS = [...PRIVATE_FIELDS, 'work_email', 'payroll_id'] as const

export async function createTemplate(env: Bindings, actor: Actor, input: Input) {
  requirePermission(actor, 'people.manage')
  const familyId = input.text('family', { optional: true, max: 100 })
  const previous = familyId ? await one(env, "SELECT * FROM wl_templates WHERE family_id = ? AND status = 'active'", familyId) : null
  if (familyId) insist(previous, 'template_not_found', 404)
  const kind = previous?.kind ?? input.text('kind', { max: 10 })
  insist(['joiner', 'mover', 'leaver'].includes(kind), 'invalid_kind')
  const required = input.list('requiredFields')
  insist(required.every(field => (REQUIRED_FIELDS as readonly string[]).includes(field)), 'invalid_requiredFields')
  const titles = input.list('taskTitle', { keepEmpty: true }), assignees = input.list('taskAssignee', { keepEmpty: true }), offsets = input.list('taskDueDays', { keepEmpty: true })
  const evidence = input.list('taskEvidence', { keepEmpty: true }), systems = input.list('taskSystem', { keepEmpty: true }), actions = input.list('taskAction', { keepEmpty: true })
  const tasks = titles.map((title, index) => ({ sourcePosition: index, title, assignee: assignees[index], offset: offsets[index] ?? '0', evidence: evidence[index] === 'yes', system: systems[index] || null, action: actions[index] || null })).filter(task => task.title)
  insist(tasks.length > 0 && tasks.length <= 40, 'tasks_required')
  for (const task of tasks) {
    insist(task.title.length <= 200, 'too_long_taskTitle')
    insist((ASSIGNEES as readonly string[]).includes(task.assignee), 'invalid_taskAssignee')
    insist(/^-?\d{1,3}$/.test(task.offset), 'invalid_taskDueDays')
    insist(!task.system || task.system.length <= 80, 'too_long_taskSystem')
    insist(!task.action || task.action === 'end_access', 'invalid_taskAction')
    // External account and device work always needs recorded evidence; Willow's own action is its own record.
    if (task.system) task.evidence = true
  }
  const rules = input.has('taskRules') ? parseTaskRules(input, tasks.length) : editorTaskRules(input, tasks.map(task => task.sourcePosition))
  const id = newId(), family = previous?.family_id ?? newId(), version = ((await one(env, 'SELECT MAX(version) AS version FROM wl_templates WHERE family_id=?', family))?.version ?? 0) + 1
  await commit(env, [
    guard(env, 'stale', '(SELECT COALESCE(MAX(version),0) FROM wl_templates WHERE family_id=?)=?', family, version - 1),
    stmt(env, "INSERT INTO wl_templates (id, family_id, version, kind, name, required_fields, status, publication, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, 'retired', 'draft', ?, ?)", id, family, version, kind, input.text('name', { max: 120 }), JSON.stringify(required), actor.id, now()),
    ...tasks.map((task, index) => stmt(env, 'INSERT INTO wl_template_tasks (id, template_id, position, title, assignee, due_offset_days, evidence_required, system, action, rule) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', newId(), id, index + 1, task.title, task.assignee, Number(task.offset), task.evidence ? 1 : 0, task.system, task.action, JSON.stringify(rules[index]))),
  ], { actor: actor.id, action: 'template.create', subject: id, detail: { family, version, kind, tasks: tasks.length } })
  return { id, family, version, kind }
}

export async function templates(env: Bindings) {
  const rows = await all(env, 'SELECT * FROM wl_templates ORDER BY kind, name, version DESC')
  const tasks = await all(env, 'SELECT * FROM wl_template_tasks ORDER BY template_id, position')
  return rows.map(row => ({ id: row.id, family: row.family_id, version: row.version, kind: row.kind, name: row.name, status: row.publication === 'draft' ? 'draft' : row.status, requiredFields: json<string[]>(row.required_fields, []), tasks: tasks.filter(task => task.template_id === row.id).map(task => ({ title: task.title, assignee: task.assignee, dueOffsetDays: task.due_offset_days, evidenceRequired: !!task.evidence_required, system: task.system, action: task.action, rule: json(task.rule, {}) })) }))
}

async function activeTemplate(env: Bindings, id: string, kind: string) {
  const template = await one(env, "SELECT * FROM wl_templates WHERE id = ? AND status = 'active'", id)
  insist(template && template.kind === kind, 'template_not_found', 404)
  return template
}

/** Statements that open a case: tasks get due dates from the anchor and the manager in force on it. */
export async function caseStatements(env: Bindings, actor: Actor, template: Row, personId: string, periodId: string, anchor: string, managerPersonId: string | null, context?: WorkflowContext) {
  const caseId = newId()
  if (!context) {
    const period = (await one(env, 'SELECT * FROM wl_periods WHERE id=?', periodId))!
    context = await workflowContext(env, await termsOn(env, periodId, anchor) ?? {}, period.employment_type)
  }
  const tasks = await plannedTasks(env, template.id, context, anchor, managerPersonId)
  const ids = new Map(tasks.map(task => [task.position, newId()]))
  return {
    caseId,
    statements: [
      guard(env, 'stale', "EXISTS(SELECT 1 FROM wl_templates WHERE id=? AND status='active')", template.id),
      stmt(env, "INSERT INTO wl_cases (id, kind, person_id, period_id, template_id, anchor_date, status, opened_by, opened_at, revision) VALUES (?, ?, ?, ?, ?, ?, 'open', ?, ?, ?)", caseId, template.kind, personId, periodId, template.id, anchor, actor.id, now(), newId()),
      ...tasks.map(task => stmt(env, "INSERT INTO wl_case_tasks (id, case_id, position, title, assignee, assignee_person_id, due_date, evidence_required, system, action, dependencies, source_task, created_at, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'open')",
        ids.get(task.position), caseId, task.position, task.title, task.assignee, task.manager, task.dueDate, task.evidence_required, task.system, task.action, JSON.stringify(task.dependencies.filter(p => ids.has(p)).map(p => ids.get(p))), task.key, now())),
    ],
  }
}

/** Joiner or rehire: person (new, or existing for a rehire), a new employment period, first terms and a case. */
export async function prepareJoiner(env: Bindings, actor: Actor, input: Input) {
  requirePermission(actor, 'people.manage')
  const employer = await requireEmployer(env)
  const template = await activeTemplate(env, input.text('template', { max: 100 }), 'joiner')
  const existing = input.text('person', { optional: true, max: 100 })
  let personId: string, statements: D1PreparedStatement[] = []
  if (existing) {
    // Rehire: the earlier periods and their history stay; access is not restored here.
    insist(await one(env, 'SELECT 1 FROM wl_people WHERE id = ?', existing), 'person_not_found', 404)
    personId = existing
  } else {
    const created = await createPersonStatements(env, readPerson(input))
    personId = created.id
    statements = created.statements
  }
  const period = await startPeriodStatements(env, actor, input, personId, employer.currency)
  const opened = await caseStatements(env, actor, template, personId, period.periodId, period.start, period.terms.managerPersonId, await workflowContext(env, period.terms, period.type))
  return {
    statements: [...statements, ...period.statements, ...opened.statements, guard(env, 'stale', "EXISTS(SELECT 1 FROM wl_templates WHERE id = ? AND status = 'active')", template.id)],
    audit: { actor: actor.id, action: existing ? 'joiner.rehire' : 'joiner.start', subject: personId, detail: { period: period.periodId, case: opened.caseId, template: template.id } },
    result: { id: opened.caseId, person: personId, period: period.periodId, case: opened.caseId },
  }
}

export async function startJoiner(env: Bindings, actor: Actor, input: Input) {
  const prepared = await prepareJoiner(env, actor, input)
  await commit(env, prepared.statements, prepared.audit)
  return prepared.result
}

/** Mover: a new terms version from a date, plus an optional mover case anchored on it, in one batch. */
export async function prepareMover(env: Bindings, actor: Actor, input: Input) {
  const prepared = await prepareTerms(env, actor, input)
  const templateId = input.text('template', { optional: true, max: 100 })
  const opened = templateId ? await caseStatements(env, actor, await activeTemplate(env, templateId, 'mover'), prepared.period.person_id, prepared.period.id, prepared.effective, prepared.terms.managerPersonId, await workflowContext(env, prepared.terms, prepared.period.employment_type)) : null
  return {
    statements: [...prepared.statements, ...(opened?.statements ?? [])],
    audit: [prepared.audit, ...(opened ? [{ actor: actor.id, action: 'mover.case', subject: opened.caseId, detail: { terms: prepared.termId } }] : [])],
    result: { id: opened?.caseId ?? prepared.termId, terms: prepared.termId, case: opened?.caseId ?? null, period: prepared.period.id, effectiveFrom: prepared.effective },
  }
}

export async function scheduleMover(env: Bindings, actor: Actor, input: Input) {
  const prepared = await prepareMover(env, actor, input)
  await commit(env, prepared.statements, prepared.audit)
  return prepared.result
}

/** Leaver: records the period's end date and reason and opens the leaver case. */
export async function startLeaver(env: Bindings, actor: Actor, input: Input) {
  requirePermission(actor, 'people.manage')
  const periodId = input.text('period', { max: 100 })
  const period = await one(env, 'SELECT * FROM wl_periods WHERE id = ?', periodId)
  insist(period, 'period_not_found', 404)
  insist(!period.end_date, 'period_already_ended', 409)
  const end = requireDate(input.text('endDate', { max: 10 }), 'invalid_endDate')
  insist(end >= period.start_date, 'end_before_start')
  const template = await activeTemplate(env, input.text('template', { max: 100 }), 'leaver')
  const organizationGuard = await managerChangeGuard(env, { period: { id: periodId, personId: period.person_id, startDate: period.start_date, endDate: end } })
  const terms = await termsOn(env, periodId, end)
  const opened = await caseStatements(env, actor, template, period.person_id, periodId, end, terms?.manager_person_id ?? null)
  await commit(env, [
    organizationGuard,
    guard(env, 'stale', "EXISTS(SELECT 1 FROM wl_periods WHERE id = ? AND revision = ? AND end_date IS NULL)", periodId, period.revision),
    guard(env, 'stale', "NOT EXISTS(SELECT 1 FROM wl_terms WHERE period_id = ? AND status = 'active' AND effective_from > ?)", periodId, end),
    stmt(env, 'UPDATE wl_periods SET end_date = ?, end_reason = ?, revision = ? WHERE id = ?', end, input.text('reason', { max: 300 }), newId(), periodId),
    ...opened.statements,
  ], { actor: actor.id, action: 'leaver.start', subject: period.person_id, detail: { period: periodId, endDate: end, case: opened.caseId } })
  return { id: opened.caseId, case: opened.caseId, period: periodId, endDate: end }
}

/** Who answers for a task: its named member, the holders of its role's permission, or the employee themselves. */
export function answersFor(actor: Actor, task: Row, caseRow: Row): boolean {
  if (task.assignee === 'employee') return actor.personId === caseRow.person_id
  // The manager in force on the case's date answers; without one, HR does.
  if (task.assignee === 'manager') return task.assignee_person_id ? task.assignee_person_id === actor.personId : can(actor, 'people.manage')
  return can(actor, ASSIGNEE_PERMISSION[task.assignee as Assignee]!)
}

export async function completeTask(env: Bindings, actor: Actor, input: Input, request: Request) {
  const task = await one(env, 'SELECT * FROM wl_case_tasks WHERE id = ?', input.text('task', { max: 100 }))
  insist(task, 'task_not_found', 404)
  const caseRow = (await one(env, 'SELECT * FROM wl_cases WHERE id = ?', task.case_id))!
  insist(answersFor(actor, task, caseRow), 'not_your_task', 403)
  insist(task.status === 'open' && !task.superseded_at, 'task_already_done', 409)
  insist(!(await blockedBy(env, task)).length, 'dependencies_open', 409)
  const evidence = input.text('evidence', { optional: true, max: 2000 })
  insist(!task.evidence_required || evidence, 'evidence_required')
  const statements: D1PreparedStatement[] = [
    guard(env, 'dependencies_open', "NOT EXISTS(SELECT 1 FROM wl_case_tasks d JOIN json_each(?) j ON d.id=j.value WHERE d.status<>'done' AND d.superseded_at IS NULL)", task.dependencies),
    guard(env, 'stale', "EXISTS(SELECT 1 FROM wl_case_tasks WHERE id=? AND status='open' AND superseded_at IS NULL)", task.id),
    stmt(env, "UPDATE wl_case_tasks SET status = 'done', failure = NULL, evidence = ?, completed_by = ?, completed_at = ? WHERE id = ? AND status = 'open'", evidence || null, actor.id, now(), task.id),
    guard(env, 'stale', "EXISTS(SELECT 1 FROM wl_case_tasks WHERE id = ? AND completed_by = ? AND status = 'done')", task.id, actor.id),
    stmt(env, 'UPDATE wl_cases SET revision = ? WHERE id = ?', newId(), caseRow.id),
  ]
  // The one local action a task can run: ending the person's Willow access.
  if (task.action === 'end_access') statements.push(...await endAccessStatements(env, actor, request, caseRow.person_id))
  await commit(env, statements, { actor: actor.id, action: 'task.complete', subject: task.id, detail: { case: caseRow.id, evidence: !!evidence, action: task.action } })
  return { id: task.id, case: caseRow.id, status: 'done' }
}

export async function missingFields(env: Bindings, caseRow: Row, template: Row): Promise<string[]> {
  const required = json<string[]>(template.required_fields, [])
  const person = await one(env, 'SELECT p.work_email, v.* FROM wl_people p JOIN wl_person_private v ON v.person_id = p.id WHERE p.id = ?', caseRow.person_id)
  const period = await one(env, 'SELECT payroll_id FROM wl_periods WHERE id = ?', caseRow.period_id)
  return required.filter(field => !(field === 'payroll_id' ? period?.payroll_id : person?.[field]))
}

export async function completeCase(env: Bindings, actor: Actor, input: Input) {
  requirePermission(actor, 'people.manage')
  const caseRow = await one(env, 'SELECT * FROM wl_cases WHERE id = ?', input.text('case', { max: 100 }))
  insist(caseRow, 'case_not_found', 404)
  insist(caseRow.status === 'open', 'case_already_completed', 409)
  const open = await all(env, "SELECT title FROM wl_case_tasks WHERE case_id = ? AND status <> 'done' AND superseded_at IS NULL ORDER BY position", caseRow.id)
  insist(!open.length, 'tasks_open', 409, { open: open.map(task => task.title) })
  const template = (await one(env, 'SELECT * FROM wl_templates WHERE id = ?', caseRow.template_id))!
  const missing = await missingFields(env, caseRow, template)
  insist(!missing.length, 'required_information_missing', 409, { missing })
  await commit(env, [
    guard(env, 'stale', "EXISTS(SELECT 1 FROM wl_cases WHERE id=? AND revision=? AND status='open')", caseRow.id, caseRow.revision),
    guard(env, 'tasks_open', "NOT EXISTS(SELECT 1 FROM wl_case_tasks WHERE case_id = ? AND status <> 'done' AND superseded_at IS NULL)", caseRow.id),
    stmt(env, "UPDATE wl_cases SET status = 'completed', completed_by = ?, completed_at = ?, revision = ? WHERE id = ? AND status = 'open'", actor.id, now(), newId(), caseRow.id),
  ], { actor: actor.id, action: 'case.complete', subject: caseRow.id })
  return { id: caseRow.id, status: 'completed' }
}

export async function caseDetail(env: Bindings, actor: Actor, id: string) {
  const caseRow = await one(env, 'SELECT * FROM wl_cases WHERE id = ?', id)
  insist(caseRow, 'not_found', 404)
  const tasks = await all(env, 'SELECT * FROM wl_case_tasks WHERE case_id = ? AND superseded_at IS NULL ORDER BY position', id)
  const mine = tasks.filter(task => answersFor(actor, task, caseRow))
  // Anyone answering a task sees the case's tasks; the lifecycle facet sees the whole case.
  insist(sees(actor, caseRow.person_id, 'lifecycle') || mine.length, 'not_found', 404)
  const template = (await one(env, 'SELECT * FROM wl_templates WHERE id = ?', caseRow.template_id))!
  const person = (await one(env, 'SELECT legal_name, preferred_name FROM wl_people WHERE id = ?', caseRow.person_id))!
  return {
    id, kind: caseRow.kind, status: caseRow.status, person: { id: caseRow.person_id, name: displayName(person) }, period: caseRow.period_id, anchorDate: caseRow.anchor_date,
    template: { id: template.id, family: template.family_id, name: template.name, version: template.version },
    missing: sees(actor, caseRow.person_id, 'lifecycle') ? await missingFields(env, caseRow, template) : [],
    upgrades: await all(env, 'SELECT from_template,to_template,at,detail FROM wl_workflow_upgrades WHERE case_id=? ORDER BY at', id),
    tasks: await Promise.all(tasks.map(async task => ({ id: task.id, title: task.title, assignee: task.assignee, dueDate: task.due_date, evidenceRequired: !!task.evidence_required, system: task.system, action: task.action, status: task.status, evidence: task.evidence, completedAt: task.completed_at, mine: answersFor(actor, task, caseRow), failure: task.failure, blockedBy: await blockedBy(env, task) }))),
  }
}

export async function casesFor(env: Bindings, personId: string, asOf?: { date: string; zone: string }) {
  const rows = await all(env, 'SELECT * FROM wl_cases WHERE person_id = ? ORDER BY opened_at DESC', personId)
  const tasks = await all(env, 'SELECT t.* FROM wl_case_tasks t JOIN wl_cases c ON c.id = t.case_id WHERE c.person_id = ?', personId)
  return rows.filter(row => !asOf || today(asOf.zone, row.opened_at) <= asOf.date).map(row => {
    const completed = row.completed_at && (!asOf || today(asOf.zone, row.completed_at) <= asOf.date)
    return { id: row.id, kind: row.kind, status: completed ? 'completed' : 'open', anchorDate: row.anchor_date,
      openTasks: tasks.filter(task => task.case_id === row.id && (!asOf || !task.created_at || today(asOf.zone, task.created_at) <= asOf.date) && (!task.superseded_at || (asOf && today(asOf.zone, task.superseded_at) > asOf.date)) && (!task.completed_at || (asOf && today(asOf.zone, task.completed_at) > asOf.date))).length }
  })
}

/** Open tasks this member answers for, across every case. */
export async function myTasks(env: Bindings, actor: Actor) {
  const rows = await all(env, "SELECT t.*, c.person_id, c.kind, p.legal_name, p.preferred_name FROM wl_case_tasks t JOIN wl_cases c ON c.id = t.case_id JOIN wl_people p ON p.id = c.person_id WHERE t.status = 'open' AND t.superseded_at IS NULL AND c.status='open' ORDER BY t.due_date, t.position")
  return await Promise.all(rows.filter(row => answersFor(actor, row, row)).map(async row => ({ id: row.id, case: row.case_id, kind: row.kind, person: displayName(row), title: row.title, dueDate: row.due_date, overdue: row.due_date < actor.today, evidenceRequired: !!row.evidence_required, system: row.system, failure: row.failure, blockedBy: await blockedBy(env, row) })))
}
