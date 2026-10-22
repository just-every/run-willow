// Keep values inside SQL: neither EEO answers nor bearer digests enter the erasure planner.
import type { Bindings } from '../../auth.server'
import { all, stmt } from '../core'
import type { Item } from './erasure'
import type { Hold } from './holds'

export interface PreboardStore {
  id: string; table: string; label: string; column: string; subject: string
  item: Item; holds: Hold[]
}

/** One custody copy per applicable hold prevents release of one hold purging another's records. */
export async function movePreboarding(env: Bindings, stores: PreboardStore[], erasure: string, at: number) {
  const statements: D1PreparedStatement[] = []
  for (const store of stores) {
    if (store.item.disposition === 'held' || store.item.disposition === 'retained') {
      const columns = (await all<{ name: string }>(env, `PRAGMA table_info(${store.table})`))
        .map(row => row.name).filter(name => name !== 'token_hash')
      for (const hold of store.holds.length ? store.holds : [null]) {
        statements.push(stmt(env, `INSERT INTO wl_retained_records
          (erasure_id, store, table_name, class, rule, expiry, hold_id, row_json, created_at)
          SELECT ?, ?, ?, ?, ?, ?, ?, json_object(${columns.map(column => `'${column}', t.${column}`).join(', ')}), ?
          FROM ${store.table} t WHERE t.${store.column} = ?`,
        erasure, store.id, store.table, store.item.class, store.item.rule, store.item.expiry, hold?.id ?? null, at, store.subject))
      }
    }
    statements.push(stmt(env, `DELETE FROM ${store.table} WHERE ${store.column} = ?`, store.subject))
  }
  return statements
}

const quote = (value: string) => `'${value.replace(/'/g, "''")}'`

/** Preserve audit structure and work attribution, scrubbing every identifying position. */
export function preboardRedactions(env: Bindings, packet: { id: string; identity_id: string; name: string; email: string }, label: string) {
  const identities = [`preboarding:${packet.id}`, packet.id, packet.identity_id, packet.email, packet.name].filter(Boolean)
  const needles = [...new Set(identities)].sort((a, b) => b.length - a.length)
  // Replace through one private-use character so a short name cannot rewrite
  // labels introduced by an earlier replacement. The marker contains no needle.
  let markerCode = 0xe000
  while (needles.some(needle => needle.includes(String.fromCharCode(markerCode)))) markerCode++
  const marker = String.fromCharCode(markerCode)
  const replaced = (column: string) => `replace(${needles.reduce((expression, needle) => `replace(${expression}, ${quote(needle)}, ${quote(marker)})`, column)}, ${quote(marker)}, ${quote(label)})`
  // Redact decoded text values, then let json_set escape them. Names containing
  // quotes or short names matching field names must not corrupt JSON or its keys.
  const details = `(WITH RECURSIVE nodes AS (
    SELECT ROW_NUMBER() OVER (ORDER BY id) AS n, fullkey AS path, value FROM json_tree(detail) WHERE type = 'text'
  ), scrub(n, body) AS (
    SELECT 0, detail UNION ALL SELECT s.n + 1, json_set(s.body, t.path, ${replaced('t.value')})
    FROM scrub s JOIN nodes t ON t.n = s.n + 1
  ) SELECT body FROM scrub ORDER BY n DESC LIMIT 1)`
  const reference = (column: string) => `CASE WHEN ${column} IN (${identities.map(quote).join(', ')}) THEN ${quote(label)} ELSE ${[packet.id, packet.identity_id].reduce((expression, needle) => `replace(${expression}, ${quote(needle)}, ${quote(label)})`, column)} END`
  const positions = [
    { table: 'wl_audit', refs: ['actor', 'subject'] },
    { table: 'wl_work_history', refs: ['actor', 'source'] },
  ]
  const matches = (refs: string[]) => [...refs.map(column => `${column} <> ${reference(column)}`),
    `EXISTS (SELECT 1 FROM json_tree(detail) WHERE type = 'text' AND (${needles.map(needle => `instr(value, ${quote(needle)}) > 0`).join(' OR ')}))`].join(' OR ')
  return {
    // Evaluated when the receipt is inserted, before updates in the same transaction;
    // concurrent read audits excluded from BUSINESS_SEQUENCE are counted too.
    countsSql: `json_object(${positions.map(({ table, refs }) => `'${table}', (SELECT COUNT(*) FROM ${table} WHERE ${matches(refs)})`).join(', ')})`,
    statements: positions.map(({ table, refs }) => stmt(env,
      `UPDATE ${table} SET ${[...refs.map(column => `${column} = ${reference(column)}`), `detail = ${details}`].join(', ')} WHERE ${matches(refs)}`)),
  }
}
