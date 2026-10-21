// HIRING-003 manual pipeline foundation. No matching, ranking, mail or provider claims.
import type { Bindings } from '../auth.server'
import { can, requirePermission, type Actor } from './actor'
import { all, auditRead, commit, guard, insist, json, newId, now, one, stmt } from './core'
import type { Input } from './input'

interface Opening { id: string; name: string; stages: string; revision: number; created_at: number }
interface Application { id: string; opening_id: string; name: string; contact_email: string; source: string; stage: string; revision: number; created_at: number }
const hr = (actor: Actor) => can(actor, 'people.manage')

async function opening(env: Bindings, actor: Actor, id: string) {
 const row = await one<Opening>(env, 'SELECT * FROM wl_hiring_openings WHERE id=?', id)
 insist(row && (hr(actor) || await one(env, 'SELECT 1 FROM wl_hiring_team WHERE opening_id=? AND member_id=?', id, actor.id)), 'not_found', 404)
 return row
}
async function application(env: Bindings, actor: Actor, id: string) {
 const row = await one<Application>(env, 'SELECT * FROM wl_hiring_applications WHERE id=?', id)
 insist(row, 'not_found', 404)
 return { row, opening: await opening(env, actor, row.opening_id) }
}
// Recheck current access and the team revision inside every business transaction.
function accessGuard(env: Bindings, actor: Actor, row: Opening, admin = false) {
 return guard(env, 'stale', `EXISTS(SELECT 1 FROM wl_hiring_openings WHERE id=? AND revision=?)
 AND EXISTS(SELECT 1 FROM wl_members WHERE id=? AND status='active')
 AND (?=1 OR EXISTS(SELECT 1 FROM wl_effective_permissions WHERE member_id=? AND permission='people.manage')
 OR (?=0 AND EXISTS(SELECT 1 FROM wl_hiring_team WHERE opening_id=? AND member_id=?)))`,
 row.id, row.revision, actor.id, actor.owner ? 1 : 0, actor.id, admin ? 1 : 0, row.id, actor.id)
}
async function teamStatements(env: Bindings, id: string, members: string[]) {
 insist(members.length > 0 && members.length <= 100 && new Set(members).size === members.length, 'invalid_team')
 const statements = []
 for (const member of members) {
  insist(member.length <= 100, 'invalid_team')
  const valid = await one(env, `SELECT 1 FROM wl_members m JOIN oa_operators o ON lower(o.email)=m.email WHERE m.id=? AND m.status='active' AND o.status='active'`, member)
  insist(valid, 'inactive_team_member')
  statements.push(guard(env, 'stale', `EXISTS(SELECT 1 FROM wl_members m JOIN oa_operators o ON lower(o.email)=m.email WHERE m.id=? AND m.status='active' AND o.status='active')`, member))
  statements.push(stmt(env, 'INSERT INTO wl_hiring_team(opening_id,member_id) VALUES (?,?)', id, member))
 }
 return statements
}

export async function createHiringOpening(env: Bindings, actor: Actor, input: Input) {
 requirePermission(actor, 'people.manage')
 const name = input.text('name'), stages = input.list('stages'), members = input.list('members')
 insist(stages.length >= 2 && stages.length <= 20 && new Set(stages).size === stages.length && stages.every(s => s.length <= 80), 'invalid_stages')
 const id = newId(), at = now(), team = await teamStatements(env, id, members)
 await commit(env, [stmt(env, 'INSERT INTO wl_hiring_openings(id,name,stages,created_at) VALUES (?,?,?,?)', id, name, JSON.stringify(stages), at), accessGuard(env, actor, { id, name, stages: JSON.stringify(stages), revision: 1, created_at: at }, true), ...team],
 { actor: actor.id, action: 'hiring.opening.create', subject: id })
 return { id, revision: 1 }
}
export async function setHiringTeam(env: Bindings, actor: Actor, input: Input) {
 requirePermission(actor, 'people.manage')
 const row = await opening(env, actor, input.text('opening')), revision = input.integer('revision', { min: 1 })
 insist(row.revision === revision, 'stale', 409)
 const team = await teamStatements(env, row.id, input.list('members'))
 await commit(env, [accessGuard(env, actor, row, true), stmt(env, 'DELETE FROM wl_hiring_team WHERE opening_id=?', row.id), ...team,
 stmt(env, 'UPDATE wl_hiring_openings SET revision=revision+1 WHERE id=?', row.id)], { actor: actor.id, action: 'hiring.team.set', subject: row.id })
 return { id: row.id, revision: row.revision + 1 }
}
export async function addHiringCandidate(env: Bindings, actor: Actor, input: Input) {
 const row = await opening(env, actor, input.text('opening')), name = input.text('name')
 const email = input.text('contactEmail', { max: 254 }).toLowerCase(), source = input.text('source')
 insist(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email), 'invalid_email')
 const id = newId(), stage = json<string[]>(row.stages, [])[0], at = now()
 await commit(env, [accessGuard(env, actor, row),
 stmt(env, 'INSERT INTO wl_hiring_applications(id,opening_id,name,contact_email,source,stage,created_at) VALUES (?,?,?,?,?,?,?)', id, row.id, name, email, source, stage, at),
 stmt(env, `INSERT INTO wl_hiring_events(application_id,actor,kind,to_stage,at) VALUES (?,?,'created',?,?)`, id, actor.id, stage, at)],
 { actor: actor.id, action: 'hiring.candidate.create', subject: id })
 return { id, stage, revision: 1 }
}
export async function moveHiringCandidate(env: Bindings, actor: Actor, input: Input) {
 const { row, opening: job } = await application(env, actor, input.text('application'))
 const revision = input.integer('revision', { min: 1 }), stage = input.text('stage', { max: 80 })
 insist(row.revision === revision, 'stale', 409)
 insist(json<string[]>(job.stages, []).includes(stage) && stage !== row.stage, 'invalid_stage')
 await commit(env, [accessGuard(env, actor, job),
 guard(env, 'stale', 'EXISTS(SELECT 1 FROM wl_hiring_applications WHERE id=? AND revision=?)', row.id, revision),
 stmt(env, 'UPDATE wl_hiring_applications SET stage=?,revision=revision+1 WHERE id=?', stage, row.id),
 stmt(env, `INSERT INTO wl_hiring_events(application_id,actor,kind,from_stage,to_stage,at) VALUES (?,?,'stage',?,?,?)`, row.id, actor.id, row.stage, stage, now())],
 { actor: actor.id, action: 'hiring.candidate.move', subject: row.id, detail: { revision: row.revision + 1 } })
 return { id: row.id, stage, revision: row.revision + 1 }
}
export async function scoreHiringCandidate(env: Bindings, actor: Actor, input: Input) {
 const { row, opening: job } = await application(env, actor, input.text('application'))
 // A scorecard always belongs to the current interviewer, never a supplied author.
 const evidence = input.text('evidence', { max: 4000 }), version = input.integer('version', { min: 0 })!
 const current = (await one<{ version: number }>(env, 'SELECT COALESCE(MAX(version),0) AS version FROM wl_hiring_scorecards WHERE application_id=? AND author=?', row.id, actor.id))!.version
 insist(current === version, 'stale', 409)
 const id = newId()
 await commit(env, [accessGuard(env, actor, job),
 guard(env, 'stale', '(SELECT COALESCE(MAX(version),0) FROM wl_hiring_scorecards WHERE application_id=? AND author=?)=?', row.id, actor.id, version),
 stmt(env, 'INSERT INTO wl_hiring_scorecards(id,application_id,author,version,evidence,created_at) VALUES (?,?,?,?,?,?)', id, row.id, actor.id, version + 1, evidence, now())],
 { actor: actor.id, action: 'hiring.scorecard.record', subject: row.id, detail: { version: version + 1 } })
 return { id, version: version + 1 }
}
export async function hiringOpenings(env: Bindings, actor: Actor) {
 const rows = await all<Opening>(env, `SELECT o.* FROM wl_hiring_openings o WHERE ?=1 OR EXISTS(SELECT 1 FROM wl_hiring_team t WHERE t.opening_id=o.id AND t.member_id=?) ORDER BY o.created_at,o.id`, hr(actor) ? 1 : 0, actor.id)
 return rows.map(row => ({ ...row, stages: json<string[]>(row.stages, []) }))
}
export async function hiringOpening(env: Bindings, actor: Actor, id: string) {
 const row = await opening(env, actor, id)
 const candidates = await all<Application>(env, 'SELECT * FROM wl_hiring_applications WHERE opening_id=? ORDER BY created_at,id', id)
 const team = await all(env, 'SELECT member_id FROM wl_hiring_team WHERE opening_id=? ORDER BY member_id', id)
 await auditRead(env, actor.id, 'hiring.opening.read', id)
 return { ...row, stages: json<string[]>(row.stages, []), team, candidates }
}
export async function hiringApplication(env: Bindings, actor: Actor, id: string) {
 const { row } = await application(env, actor, id)
 const timeline = await all(env, 'SELECT e.seq,e.actor,m.name AS actorName,e.kind,e.from_stage,e.to_stage,e.at FROM wl_hiring_events e JOIN wl_members m ON m.id=e.actor WHERE e.application_id=? ORDER BY e.seq', id)
 const scorecards = await all(env, 'SELECT s.id,s.author,m.name AS authorName,s.version,s.evidence,s.created_at FROM wl_hiring_scorecards s JOIN wl_members m ON m.id=s.author WHERE s.application_id=? ORDER BY s.created_at,s.id', id)
 await auditRead(env, actor.id, 'hiring.candidate.read', id)
 return { ...row, timeline, scorecards }
}
