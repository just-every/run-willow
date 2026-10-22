// Erasure has its own native snapshot fence. Import undo's no-dependents rule
// remains unchanged: erasure instead inventories and removes those dependents
// in the same owner-approved transaction.
import { willowTargets } from '../movein/target'
import type { D1TargetAdapter, D1Sql, Json } from '../../modules/import-kit/src/d1/index'

const image = (table: string, row: Record<string, unknown> | null, id: string, key = 'id'): D1Sql => {
  if (!row) return { sql: `NOT EXISTS(SELECT 1 FROM ${table} WHERE ${key}=?)`, params: [id] }
  const columns = Object.keys(row)
  return { sql: `(SELECT json_object(${columns.map(column => `'${column}',${column}`).join(',')}) FROM ${table} WHERE ${key}=?)=?`, params: [id, JSON.stringify(row)] }
}

export const erasureTargets: D1TargetAdapter = {
  ...willowTargets,
  async read(db, destination, kind, id) {
    if (kind !== 'person') return willowTargets.read(db, destination, kind, id)
    const person = await db.prepare('SELECT * FROM wl_people WHERE id=?').bind(id).first<Record<string, unknown>>()
    if (!person) return undefined
    const privateRow = await db.prepare('SELECT * FROM wl_person_private WHERE person_id=?').bind(id).first<Record<string, unknown>>()
    return { destination, targetKind: kind, targetId: id, revision: String(person.revision), value: { person, privateRow } as Json }
  },
  matches(row, destination, kind, id) {
    if (kind !== 'person') return willowTargets.matches(row, destination, kind, id)
    const value = row?.value as { person: Record<string, unknown>; privateRow: Record<string, unknown> | null } | undefined
    const predicates = [image('wl_people', value?.person ?? null, id), image('wl_person_private', value?.privateRow ?? null, id, 'person_id')]
    return { sql: predicates.map(part => `(${part.sql})`).join(' AND '), params: predicates.flatMap(part => part.params ?? []) }
  },
}
