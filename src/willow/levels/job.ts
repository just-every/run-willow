// ROLE-004: additive job-field rights; self reads are independent of level scope.
import type { Bindings } from '../../auth.server'
import type { Actor, Permission } from '../actor'
import { all, insist } from '../core'
import type { Input } from '../input'
import { EVERYONE, levelScopes, scopeMembers, type Scope } from './scope'

export const JOB_FIELDS = ['jobTitle', 'departmentId', 'locationId', 'managerPersonId', 'scheduleId', 'employmentType', 'employmentStatus', 'fte', 'startDate', 'endDate'] as const
export type JobField = typeof JOB_FIELDS[number]
export type JobMode = 'none' | 'view' | 'approval' | 'edit'
export type JobSelfMode = 'none' | 'view'
export interface JobRules { self: Partial<Record<JobField, JobSelfMode>>; others: Partial<Record<JobField, JobMode>> }
export interface JobGrant { level: string; fields: JobRules; scope: Scope; members: Set<string> }
export type JobActor = Pick<Actor, 'owner' | 'permissions' | 'personId' | 'reports' | 'scoped'> & { jobFields: JobGrant[] }
export const JOB_RANK: Record<JobMode, number> = { none: 0, view: 1, approval: 2, edit: 3 }
export const JOB_LABELS: Record<JobField, string> = { jobTitle: 'Job title', departmentId: 'Department', locationId: 'Location', managerPersonId: 'Manager', scheduleId: 'Working schedule', employmentType: 'Employment type', employmentStatus:'Employment status', fte: 'FTE', startDate: 'Employment start date', endDate: 'Employment end date' }
export const JOB_INPUTS = ['jobFields', ...(['self', 'others'] as const).flatMap(relation => JOB_FIELDS.map(field => `jobMode.${relation}.${field}`))]
export const emptyJobRules = (): JobRules => ({ self: {}, others: {} })

/** Omitted input preserves saved rules; supplied input is a complete rule definition. */
export function readJobRules(input: Input): JobRules | undefined {
 if (!JOB_INPUTS.some(name => input.provided(name))) return undefined
 const raw = input.provided('jobFields') ? input.json('jobFields') : Object.fromEntries((['self', 'others'] as const).map(relation => [relation, Object.fromEntries(JOB_FIELDS.filter(field => input.provided(`jobMode.${relation}.${field}`)).map(field => [field, input.text(`jobMode.${relation}.${field}`)]))]))
 insist(raw && typeof raw === 'object' && !Array.isArray(raw) && Object.keys(raw).every(key => key === 'self' || key === 'others'), 'invalid_job_fields')
 const result = emptyJobRules()
 for (const relation of ['self', 'others'] as const) {
  const value = (raw as Record<string, unknown>)[relation]
  if (value === undefined) continue
  insist(value && typeof value === 'object' && !Array.isArray(value), 'invalid_job_fields')
  for (const [field, mode] of Object.entries(value)) {
   insist((JOB_FIELDS as readonly string[]).includes(field) && typeof mode === 'string' && Object.hasOwn(JOB_RANK, mode) && (relation === 'others' || mode === 'none' || mode === 'view'), 'invalid_job_fields')
   if (relation === 'self') result.self[field as JobField] = mode as JobSelfMode
   else result.others[field as JobField] = mode as JobMode
  }
 }
 return result
}

export interface JobRuleRow { level_id: string; relation: 'self' | 'others'; field: JobField; mode: JobMode }
export const jobRuleRows = (env: Bindings) => all<JobRuleRow>(env, 'SELECT * FROM wl_level_job_fields')

export async function jobGrants(env: Bindings, member: string, person: string | null, date: string): Promise<JobGrant[]> {
 const rows = await all<JobRuleRow>(env, 'SELECT f.* FROM wl_level_job_fields f JOIN wl_member_levels a ON a.level_id=f.level_id WHERE a.member_id=?', member)
 if (!rows.length) return []
 const scopes = await levelScopes(env)
 return Promise.all([...new Set(rows.map(row => row.level_id))].map(async level => {
  const scope = scopes.get(level) ?? EVERYONE, fields = emptyJobRules()
  for (const row of rows.filter(row => row.level_id === level)) {
   if (row.relation === 'self') fields.self[row.field] = row.mode as JobSelfMode
   else fields.others[row.field] = row.mode
  }
  return { level, fields, scope, members: scope.kind === 'everyone' ? new Set<string>() : await scopeMembers(env, date, scope, person) }
 }))
}

/** Only the levels' added rights; existing authority is applied separately below. */
export function jobMode(actor: JobActor, person: string, field: JobField): JobMode {
 const self = actor.personId === person
 return actor.jobFields.reduce<JobMode>((best, grant) => {
  if (!self && grant.scope.kind !== 'everyone' && !grant.members.has(person)) return best
  const mode = (self ? grant.fields.self : grant.fields.others)[field] ?? 'none'
  return JOB_RANK[mode] > JOB_RANK[best] ? mode : best
 }, 'none')
}

const holds = (actor: JobActor, person: string, permission: Permission) => actor.owner || actor.permissions.has(permission) || actor.scoped.some(grant => grant.permissions.has(permission) && grant.people.has(person))
const DIRECTORY_FIELDS: readonly JobField[] = ['jobTitle', 'departmentId', 'locationId', 'managerPersonId']

/** Admission to a person remains the caller's responsibility; PEOPLE-002 stays readable. */
export function readsJobField(actor: JobActor, person: string, field: JobField): boolean {
 return DIRECTORY_FIELDS.includes(field) || actor.personId === person || actor.reports.has(person) || holds(actor, person, 'people.manage') || holds(actor, person, 'payroll.handoff') || jobMode(actor, person, field) !== 'none'
}

/** Exact-field authority only; never authorizes a member to change their own job. */
export function canEditJobField(actor: JobActor, person: string, field: JobField): boolean {
 return actor.personId !== person && (holds(actor, person, 'people.manage') || jobMode(actor, person, field) === 'edit')
}

/** Entry authority for the typed FLOW-004 chain, including existing manager requests. */
export function canRequestJobField(actor: JobActor, person: string, field: JobField): boolean {
 return actor.personId !== person && (holds(actor, person, 'people.manage') || actor.reports.has(person) || jobMode(actor, person, field) === 'approval' || jobMode(actor, person, field) === 'edit')
}

/** Historical values need their own field grant or an existing employment source. */
export const hasJobBaseline=(actor:JobActor,person:string)=>actor.personId===person || actor.reports.has(person) || holds(actor,person,'people.manage') || holds(actor,person,'payroll.handoff')
export const readsJobHistoryField=(actor:JobActor,person:string,field:JobField)=>hasJobBaseline(actor,person) || jobMode(actor,person,field)!=='none'
export const anyJobGrant=(actor:JobActor,person:string)=>JOB_FIELDS.some(field=>jobMode(actor,person,field)!=='none')
