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
