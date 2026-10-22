// Counts every D1 row and R2 blob in a harness persistence directory, for read-only proofs.
import { readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'

const walk = (dir, out = []) => { for (const name of readdirSync(dir)) { const path = join(dir, name); statSync(path).isDirectory() ? walk(path, out) : out.push(path) } return out }

export async function rowCounts(directory) {
  const files = walk(join(directory, 'v3'))
  const tables = {}
  for (const path of files.filter(p => p.includes('/d1/') && p.endsWith('.sqlite'))) {
    const db = new DatabaseSync(path, { readOnly: true })
    for (const { name } of db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'").all()) tables[name] = db.prepare(`SELECT COUNT(*) AS n FROM ${name}`).get().n
    db.close()
  }
  return { tables, blobs: files.filter(p => p.includes('/r2/') && !p.endsWith('.sqlite') && !p.endsWith('-wal') && !p.endsWith('-shm')).length }
}

/** Every table that holds any of the strings in a text or blob column, with its match count. */
export async function findText(directory, needles) {
  const found = {}
  for (const path of walk(join(directory, 'v3')).filter(p => p.includes('/d1/') && p.endsWith('.sqlite'))) {
    const db = new DatabaseSync(path, { readOnly: true })
    for (const { name } of db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'").all()) {
      const columns = db.prepare(`SELECT name FROM pragma_table_info('${name}')`).all().map(column => column.name)
      const test = columns.map(column => needles.map(() => `instr(CAST("${column}" AS TEXT), ?) > 0`).join(' OR ')).join(' OR ')
      const params = columns.flatMap(() => needles)
      const n = db.prepare(`SELECT COUNT(*) AS n FROM "${name}" WHERE ${test}`).get(...params).n
      if (n) found[name] = n
    }
    db.close()
  }
  return found
}

/** The ids of the stub person and stub member an erasure leaves under its label. */
export async function stubIdentities(directory, label) {
  const ids = []
  for (const path of walk(join(directory, 'v3')).filter(p => p.includes('/d1/') && p.endsWith('.sqlite'))) {
    const db = new DatabaseSync(path, { readOnly: true })
    if (db.prepare("SELECT 1 FROM sqlite_master WHERE name = 'wl_people'").get()) {
      for (const table of ['wl_people', 'wl_members']) ids.push(...db.prepare(`SELECT id FROM ${table} WHERE ${table === 'wl_people' ? 'legal_name' : 'name'} = ?`).all(label).map(row => row.id))
    }
    db.close()
  }
  return ids
}

/** The retained original payloads after using the public import/erasure doors. */
export async function originalPayloadCount(directory, job) {
  let count = 0
  for (const path of walk(join(directory, 'v3')).filter(p => p.includes('/d1/') && p.endsWith('.sqlite'))) {
    const db = new DatabaseSync(path, { readOnly: true })
    count += db.prepare('SELECT COUNT(*) AS n FROM ik_originals WHERE job_id=? AND bytes IS NOT NULL').get(job).n
    count += db.prepare('SELECT COUNT(*) AS n FROM ik_d1_original_chunks WHERE job_id=?').get(job).n
    db.close()
  }
  return count
}
