import type { Bindings } from '../../auth.server'
import { one } from '../core'
import { employer } from '../employer'
import { formatInstant } from '../dates'
import { h } from './html'

export async function proposalReceipt(env: Bindings, receipt: any, kind: string) {
  const result = receipt.result ?? {}
  const [member, company, person] = await Promise.all([
    one(env, 'SELECT name FROM wl_members WHERE id=?', receipt.executedBy), employer(env),
    result.person ? one(env, 'SELECT coalesce(preferred_name,legal_name) AS name FROM wl_people WHERE id=?', result.person)
      : result.period ? one(env, 'SELECT coalesce(p.preferred_name,p.legal_name) AS name,p.id FROM wl_people p JOIN wl_periods e ON e.person_id=p.id WHERE e.id=?', result.period) : null,
  ])
  const personId = result.person ?? person?.id
  return h`<section class="card"><h2>Receipt</h2><p>Approved by ${member?.name ?? 'a former member'} on ${formatInstant(receipt.executedAt, company?.timezone ?? 'UTC')}.</p>
  <p>${kind === 'joiner' ? 'Started employment for' : 'Scheduled an employment change for'} ${personId ? h`<a href="/app/people/${personId}">${person?.name ?? 'the person'}</a>` : 'the person'}${result.case ? h` and opened a <a href="/app/cases/${result.case}">${kind === 'joiner' ? 'joiner' : 'change'} case</a>` : ''}.</p></section>`
}
