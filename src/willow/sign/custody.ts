import type { Bindings } from '../../auth.server'
import { can, type Actor } from '../actor'
import { readsCategory } from '../access'
import { guard, insist, now, one, type Row } from '../core'
import { serve } from '../files'
export const CONSENT='I consent to electronic records and signatures for this exact document. I can download a copy and withdraw before completion. I intend my entered name and initials to be my signature.'
export const SESSION=`EXISTS(SELECT 1 FROM oa_sessions s JOIN oa_operators o ON o.id=s.operator_id JOIN wl_members m ON m.operator_id=o.id WHERE s.id=? AND m.id=? AND m.status='active' AND o.status='active' AND s.revoked_at IS NULL AND s.operator_version=o.version AND s.expires_at>?)`
export const session=(env:Bindings,actor:Actor)=>guard(env,'signature_session_changed',SESSION,actor.sessionId,actor.id,now())
export const authority=(env:Bindings,actor:Actor)=>guard(env,'signature_authority_changed',`EXISTS(SELECT 1 FROM wl_effective_permissions WHERE member_id=? AND permission='people.manage') OR EXISTS(SELECT 1 FROM oa_operators o JOIN wl_members m ON m.operator_id=o.id WHERE m.id=? AND o.role='owner' AND o.status='active')`,actor.id,actor.id)
export const requestState=(row:Row)=>row.state==='voided'&&row.closure_reason==='cohort-cancelled'?'cancelled':row.state
export const pending=(row:Row)=>['sent','viewed'].includes(row.state)
export const SEQUENCE="COALESCE((SELECT MAX(seq) FROM wl_audit WHERE action NOT LIKE '%.read' AND action NOT LIKE '%.download'),0)"
export const rowFor=(env:Bindings,id:string)=>one(env,`SELECT r.*,t.title,t.source_version,t.category_id,t.signers_json,t.fields_json,c.name AS category_name,c.subject_reads,c.manager_reads FROM wl_sign_requests r JOIN wl_sign_templates t ON t.id=r.template_id JOIN wl_doc_categories c ON c.id=t.category_id WHERE r.id=?`,id)
export function readable(actor:Actor,row:Row) { return readsCategory(actor,row.person_id,row)&&(can(actor,'people.manage')||actor.personId===row.person_id||actor.reports.has(row.person_id)) }
export async function bytes(env:Bindings,hash:string,size:number) {
 const response=await serve(env,{sha256:hash,size,filename:'document.pdf',mediaType:'application/pdf'})
 return new Uint8Array(await response.arrayBuffer())
}
export function draw(page:any,font:any,text:string,field:Row) {
 insist(!/[\x00-\x1f\x7f]/.test(text),'signature_text_unsupported')
 try {font.encodeText(text)}catch{insist(false,'signature_text_unsupported')}
 const {width,height}=page.getSize(),w=field.width*width,h=field.height*height
 const size=Math.min(14,h*0.7,w/Math.max(font.widthOfTextAtSize(text||' ',1),1))
 insist(size>=6,'signature_text_does_not_fit')
 page.drawText(text,{x:field.x*width,y:height-(field.y+field.height)*height+Math.max(0,(h-size)/2),size,font})
}
