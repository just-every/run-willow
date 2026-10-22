// Award versions remain immutable during ordinary work. The journaled erasure
// window alone may replace a former member's identity in another person's award.
import type { Bindings } from '../../auth.server'
import { one, stmt } from '../core'
import type { Subject } from './erasure'

const quote = (value: string) => `'${value.replaceAll("'", "''")}'`
export const COMPENSATION_AUTHORSHIP = 'wl_comp_records:recorded_by'

/** Count distinct surviving award versions, including attribution-only changes. */
export async function compensationRedactions(env: Bindings, subject: Subject, swaps: [string, string][]) {
 const columns = ['note', 'security']
 const replaced = (column: string) => swaps.reduce((expression, [from, to]) => `replace(${expression},${quote(from)},${quote(to)})`, column)
 const matches = columns.flatMap(column => swaps.map(([from]) => `instr(${column},${quote(from)})>0`)).join(' OR ') || '0'
 const count = (await one<{ n: number }>(env, `SELECT COUNT(*) AS n FROM wl_comp_records WHERE person_id<>?1 AND ((${matches}) OR (?2<>'' AND recorded_by=?2))`, subject.personId, subject.memberId))!.n
 return {
  count,
  // Authorship itself is replaced by the shared AUTHORED path. A held original
  // is copied to restricted custody before either of these identity changes.
  statements: [stmt(env, `UPDATE wl_comp_records SET ${columns.map(column => `${column}=${replaced(column)}`).join(',')} WHERE person_id<>?1 AND (${matches})`, subject.personId)],
 }
}
