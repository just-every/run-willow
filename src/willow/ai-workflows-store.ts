import type { Bindings } from '../auth.server'
import { insist, one, type Row } from './core'
import type { WorkflowSource } from './ai-workflows-source'
import type { WorkflowEdit, WorkflowOutput } from './ai-workflows-types'

export async function workflowRecord(env: Bindings, id: string) {
  const row = await one(env, 'SELECT * FROM wl_ai_workflows WHERE id=?', id)
  insist(row, 'not_found', 404)
  return row
}

export function workflowData(row: Row) {
  return { source: JSON.parse(row.source_snapshot) as WorkflowSource,
    edits: JSON.parse(row.normalized_request) as WorkflowEdit[],
    output: row.output ? JSON.parse(row.output) as WorkflowOutput : null }
}
