import type { Bindings } from '../auth.server'
import { one } from './core'
export const publishedDocumentVersion=(alias='v')=>`NOT EXISTS(SELECT 1 FROM wl_document_proposals staged LEFT JOIN wl_self_decisions decision ON decision.change_id=staged.change_id WHERE staged.version_id=${alias}.id AND COALESCE(decision.outcome,'pending')!='approved')`
export async function documentNumber(env:Bindings,document:string,number:number) {
 return (await one<{n:number}>(env,`SELECT COUNT(*) AS n FROM wl_document_versions v WHERE v.document_id=? AND v.number<=? AND ${publishedDocumentVersion()}`,document,number))!.n
}
