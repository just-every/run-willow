// A valid, checksummed older-style archive input with live connection authority.
// All business records/bytes come from the real public export; only its consent row changes.
import { canonicalJson, makePart, sha256 } from '@runeditrun/rer/modules/portability'
export async function enabledArchive(records) {
  const manifest = records[0]
  const parts = await Promise.all(records.filter(row => row.kind === 'part').map(part => makePart(part.index,
    part.items.map(item => item.kind === 'row' && item.table === 'wl_connections'
      ? { ...item, row: { ...item.row, notices: 1, oidc: 1, model: 'restore-proof-model' } } : item))))
  const rows = parts.flatMap(part => part.items).filter(item => item.kind === 'row')
  const tables = manifest.tables.map(table => ({ name: table.name, rows: rows.filter(item => item.table === table.name).map(item => item.row) }))
  const objects = manifest.objects.map(({ bucket, key, size, sha256, httpMetadata, customMetadata }) => ({ bucket, key, size, sha256, metadata: { httpMetadata, customMetadata } }))
  const contentHash = await sha256(canonicalJson({ objects, payloads: manifest.payloads, requiredConfiguration: manifest.requiredConfiguration, schema: manifest.schema, tables }))
  const archiveHash = await sha256(canonicalJson({ manifest, parts: parts.map(part => part.sha256) }))
  return [manifest, ...parts, { ...records.at(-1), contentHash, archiveHash }].map(canonicalJson).join('\n') + '\n'
}
