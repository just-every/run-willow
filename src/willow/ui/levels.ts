import type { Bindings } from '../../auth.server'
import { PERMISSIONS, PERMISSION_LABELS, type Actor } from '../actor'
import { levelReview } from '../levels/actions'
import { levels } from '../levels/store'
import { SELF_FIELDS, SELF_LABELS } from '../levels/personal'
import { checks, field, form, h, hidden, select, table } from './html'

export async function levelPanel(env: Bindings, actor: Actor, url: URL) {
 if(!actor.owner) return ''
 const data=await levels(env,actor)
 const reviewId=url.searchParams.get('levelReview')
 const review=reviewId ? await levelReview(env,actor,reviewId) : null
 const rights=(selected: string[]=[])=>checks('Permissions in this level','permissions',PERMISSIONS.map(value=>({value,label:PERMISSION_LABELS[value]})),selected)
 const edit=(level?: Record<string,any>)=>form('level.preview','/app/access?levelReview={id}',[
  hidden('kind','level'),...(level?[hidden('level',level.id)]:[]),field('Level name','name',{value:level?.name ?? ''}),rights(level?.permissions),
  h`<h4>Personal fields about themselves</h4><p>These modes control writes to existing personal fields. Reading rights stay under the existing private-contact rules. Explicit modes from assigned levels combine as Edit, then Edit with HR approval, then View. Fields without an explicit mode keep their current immediate-edit behavior.</p>`,
  ...SELF_FIELDS.map(name=>select(SELF_LABELS[name],`selfMode.${name}`,[{value:'',label:'Existing self-service'},{value:'view',label:'View (no self edits)'},{value:'approval',label:'Edit with HR approval'},{value:'edit',label:'Edit immediately'}],level?.selfFields?.[name]??'',{required:false})),
 ],'Review level')
 return h`<section class="card"><h2>Named access levels</h2><p>Levels combine their explicit permissions. The existing self-service and direct-manager boundaries still apply. Personal self-write modes are available below. Other field and section rules and delegated level administration remain unavailable.</p>
${review ? h`<section class="card"><h3>Review access change</h3><p>${review.plan.kind==='level' ? review.plan.name : 'Level assignment'}</p>${review.plan.kind!=='level' ? h`<p>Assigned levels: ${review.plan.levels.map((id:string)=>data.levels.find(level=>level.id===id)?.name ?? id).join('; ') || 'None'}</p>` : ''}${review.plan.kind==='level' ? h`<p>${review.plan.permissions.map((p:string)=>PERMISSION_LABELS[p as keyof typeof PERMISSION_LABELS]).join('; ') || 'No additional permissions'}</p>` : ''}${review.plan.kind==='level' ? h`<p>Personal write modes: ${Object.entries(review.plan.selfFields ?? {}).map(([field,mode])=>`${SELF_LABELS[field as keyof typeof SELF_LABELS]}: ${mode}`).join('; ') || 'Existing self-service'}</p>` : ''}${table(['Member','Added permissions','Removed permissions','Personal write changes'],review.impact.map((item:Record<string,any>)=>[item.name,item.added.join(', ')||'None',item.removed.join(', ')||'None',(item.changedFields??[]).map((field:string)=>`${SELF_LABELS[field as keyof typeof SELF_LABELS]}: ${item.beforeSelf[field]} → ${item.afterSelf[field]}`).join('; ')||'None']))}<p>${review.impact.length} affected member(s). Self-service, direct-report scope and explicit performance releases remain in force.</p>${review.consumed ? h`<p>Applied. This review cannot be used again.</p>` : form('level.apply','/app/access',[hidden('review',review.id)],'Apply reviewed change')}</section>` : ''}
<details><summary>Create a level</summary>${edit()}</details>
${data.levels.map(level=>h`<details><summary>${level.name} · ${level.members.length} member(s)</summary>${edit(level)}</details>`)}
<h3>Assign levels</h3><p>Assigned levels add to direct permissions. Replacing a member's permissions below clears all level assignments. Ending access clears assignments and direct permissions.</p>${form('level.preview','/app/access?levelReview={id}',[hidden('kind','assignment'),select('Assign levels to','member',data.members.filter(m=>m.status==='active'&&!m.owner).map(m=>({value:m.id,label:m.name}))),checks('Replace assigned levels with','levels',data.levels.map(l=>({value:l.id,label:l.name})))],'Review assignment')}
<details><summary>Assign levels to several members</summary><p>Review every selected member before replacing their assigned levels together. Direct permissions are retained. Group scopes and batch revert remain unavailable.</p>${form('level.preview','/app/access?levelReview={id}',[hidden('kind','bulk-assignment'),checks('Members in this batch','members',data.members.filter(m=>m.status==='active'&&!m.owner).map(m=>({value:m.id,label:m.name}))),checks('Replace assigned levels with','levels',data.levels.map(l=>({value:l.id,label:l.name})))],'Review bulk assignment')}</details>
<details><summary>Exact-rights migration report</summary>${table(['Member','Before','After','Widened rights'],data.migration.map(row=>[row.name,row.before_permissions,row.after_permissions,row.widened]))}</details>
</section>`
}
