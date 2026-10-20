import type { Row } from '../core'
export interface Cycle extends Row {
 id:string; name:string; kind:'merit'|'promotion'|'bonus'; effective_from:string; budget_cents:number|null; status:'draft'|'approved'|'published'; publication_json:string|null
}
export interface Proposal extends Row {
 id:string; cycle_id:string; person_id:string; period_id:string; period_revision:string; base_term:string;
 basis:string; amount_cents:number; previous_cents:number; job_title:string; note:string; requested_by:string;
 legal_name:string; preferred_name:string|null
}
