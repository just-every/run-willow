import type { Bindings } from '../../auth.server'
import type { Actor } from '../actor'
import { readsCategory, sees } from '../access'
import { one } from '../core'

/** Directory names and reader-authorized labels; exact private snapshots stay in the kit. */
export async function undoTargetLabel(env: Bindings, kind: string, id: string, actor: Actor | null) {
  if (kind === 'department' || kind === 'location') {
    const row = await one<{name:string}>(env, `SELECT name FROM ${kind === 'department' ? 'wl_departments' : 'wl_locations'} WHERE id=?`, id)
    return { label: row ? `${row.name} (${kind})` : `Removed ${kind}`, href: '/app/settings' }
  }
  const queries: Record<string,string> = {
    person: 'SELECT id AS person,legal_name AS name FROM wl_people WHERE id=?',
    period: 'SELECT p.id AS person,p.legal_name AS name FROM wl_periods e JOIN wl_people p ON p.id=e.person_id WHERE e.id=?',
    account: `SELECT p.id AS person,p.legal_name AS name,l.name AS record,
      EXISTS(SELECT 1 FROM wl_ledger WHERE account_id=a.id AND kind='opening') AS signed
      FROM wl_leave_accounts a JOIN wl_periods e ON e.id=a.period_id JOIN wl_people p ON p.id=e.person_id
      JOIN wl_leave_policies l ON l.id=a.policy_id WHERE a.id=?`,
    document: 'SELECT p.id AS person,p.legal_name AS name,d.category_id,c.subject_reads,c.manager_reads FROM wl_documents d JOIN wl_people p ON p.id=d.person_id JOIN wl_doc_categories c ON c.id=d.category_id WHERE d.id=?',
    record: 'SELECT p.id AS person,p.legal_name AS name,t.label AS record FROM wl_record_rows r JOIN wl_people p ON p.id=r.person_id JOIN wl_record_table_versions t ON t.id=(SELECT id FROM wl_record_table_versions WHERE table_id=r.table_id ORDER BY version DESC LIMIT 1) WHERE r.id=?',
  }
  const row = queries[kind] ? await one<{person:string;name:string;record?:string;signed?:number;category_id?:string;subject_reads?:number;manager_reads?:number}>(env, queries[kind], id) : null
  // Legacy summaries are also read by people managers without document rights.
  // Select the title only through the same category/facet boundary as a profile.
  if (row && kind === 'document' && actor && sees(actor, row.person, 'documents') && readsCategory(actor, row.person, row)) {
    row.record = (await one<{title:string}>(env, 'SELECT title FROM wl_documents WHERE id=?', id))?.title
  }
  return row ? {
    label: `${row.name} — ${row.record ?? (kind === 'period' ? 'employment' : kind === 'document' ? 'document' : 'person')}`,
    href: `/app/people/${row.person}`,
    ...(row.signed ? { permanentReason: 'The opening balance was signed off. Its permanent leave ledger entry prevents undo; it cannot be deleted.' } : {}),
  } : { label: `Removed ${kind}`, href: '/app/people' }
}
