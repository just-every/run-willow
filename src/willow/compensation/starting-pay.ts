// Correct starting compensation without editing the immutable job/pay record.
import type { Bindings } from '../../auth.server'
import type { Actor } from '../actor'
import { guard, insist, newId, now, one, stmt, type Row } from '../core'
import type { Input } from '../input'
import { requireEmployer } from '../employer'
import { readPay, readTerms, termsOn, termsStatements } from '../people'

/** The compensation door has already checked current pay/history edit authority. */
export async function prepareStartingPay(env: Bindings, actor: Actor, period: Row, input: Input) {
  insist(actor.personId !== period.person_id, 'own_terms', 403)
  const base = await termsOn(env, period.id, period.start_date)
  insist(base && base.effective_from === period.start_date, 'terms_not_found', 404)
  const pay = readPay(actor, input, { approved: true })
  insist(pay, 'missing_payBasis')
  const terms = await readTerms(env, input, base, period.start_date)
  const previous = await one(env, 'SELECT currency FROM wl_term_pay WHERE term_id=?', base.id)
  const currency = previous?.currency ?? (await requireEmployer(env)).currency
  const termId = newId()
  return {
    statements: [
      guard(env, 'stale', 'EXISTS(SELECT 1 FROM wl_periods WHERE id=? AND revision=?)', period.id, period.revision),
      guard(env, 'stale', "EXISTS(SELECT 1 FROM wl_terms WHERE id=? AND period_id=? AND effective_from=? AND status='active')", base.id, period.id, period.start_date),
      guard(env, 'already_handed_off', "NOT EXISTS(SELECT 1 FROM wl_payroll_items WHERE (source_kind='start' AND source_id=?) OR (source_kind='terms' AND source_id IN (SELECT id FROM wl_terms WHERE period_id=?)))", period.id, period.id),
      stmt(env, "UPDATE wl_terms SET status='cancelled',cancelled_by=?,cancelled_at=? WHERE id=? AND status='active'", actor.id, now(), base.id),
      ...termsStatements(env, termId, period.id, terms, pay, currency, actor.id),
      stmt(env, 'UPDATE wl_periods SET revision=? WHERE id=?', newId(), period.id),
    ],
    audit: { actor: actor.id, action: 'compensation.start.correct', subject: termId, detail: { period: period.id, effectiveFrom: period.start_date, replaces: base.id, payChanged: true } },
    result: { id: termId, terms: termId, case: null, period: period.id, effectiveFrom: period.start_date },
  }
}
