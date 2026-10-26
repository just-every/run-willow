// DATA-001: a valid v2 legacy input with live connection authority, as exported
// before Willow paused consent. This is test data, never an application rewrite.
// All business records/bytes come from the real public export; only activation changes.
import { canonicalJson, makePart, sha256 } from '@runeditrun/rer/modules/portability'
export async function enabledArchive(records) {
  const manifest = records[0]
  const parts = await Promise.all(records.filter(row => row.kind === 'part').map(part => makePart(part.index,
    part.items.map(item => {
      if (item.kind !== 'row') return item
      if (item.table === 'wl_connections') return { ...item, row: { ...item.row, notices: 1, oidc: 1, model: 'restore-proof-model' } }
      if (item.table === 'wl_ai_settings') return { ...item, row: { ...item.row, enabled: 1, policies: 1, workflows: 1, provider_retention: 'standard' } }
      if (item.table === 'ik_door_settings') return { ...item, row: { ...item.row, enabled: 1 } }
      return item
    }))))
  const rows = parts.flatMap(part => part.items).filter(item => item.kind === 'row')
  const tables = manifest.tables.map(table => ({ name: table.name, rows: rows.filter(item => item.table === table.name).map(item => item.row) }))
  const objects = manifest.objects.map(({ bucket, key, size, sha256, httpMetadata, customMetadata }) => ({ bucket, key, size, sha256, metadata: { httpMetadata, customMetadata } }))
  const contentHash = await sha256(canonicalJson({ objects, payloads: manifest.payloads, requiredConfiguration: manifest.requiredConfiguration, schema: manifest.schema, tables }))
  const archiveHash = await sha256(canonicalJson({ manifest, parts: parts.map(part => part.sha256) }))
  return Buffer.from([manifest, ...parts, { ...records.at(-1), contentHash, archiveHash }].map(canonicalJson).join('\n') + '\n')
}
