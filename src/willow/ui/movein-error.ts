import type { Actor } from '../actor'
import { h, page } from './html'

const explanations: Record<string,string> = {
  owner_required: 'Move in is available to the installation owner. Ask the owner to review and apply the import.',
  loopback_required: 'The local import request could not verify this computer’s address. Reopen Willow at the address printed by rer dev.',
  origin_required: 'The import request did not come from this Willow address. Reopen Move in and submit the form again.',
  employees_headers: 'The employee report needs id or employeeNumber, firstName, lastName and hireDate columns.',
  catchup_required: 'This export differs from the previous import. Return to Move in, choose Compare with the previous import (catch-up), and preview again. People absent from the new export are kept.',
  undo_blocked: 'Later work depends on this import. Open Move in to see the named records and their links. A signed-off opening balance stays in the permanent leave ledger.',
  import_door_conflict: 'Willow could not complete this import step. Open Move in to check its saved status before continuing. If this was a preview, no people or employment records changed.',
  import_door_plan_failed: 'This import stopped while applying records. Open Move in to check its status, then review a new preview before applying again.',
}

export function importErrorPage(actor: Actor | null, error: {code:string;status:number;detail?:unknown}) {
  const reason = error.detail && typeof error.detail === 'object' && 'reason' in error.detail && typeof error.detail.reason === 'string' ? error.detail.reason : null
  return page('Import needs attention',actor,h`<h1>Import needs attention</h1><p>${explanations[error.code] ?? reason ?? 'Willow refused this import step. Check the file and the saved import status before continuing.'}</p><p class="muted">Reference: ${error.code.replace(/_/g,' ')}</p><p><a href="${error.code === 'owner_required' ? '/app' : '/app/import'}">${error.code === 'owner_required' ? 'Back to Willow' : 'Back to Move in'}</a></p>`,{status:error.status,current:'/app/import'})
}
