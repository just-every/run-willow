import type { Bindings } from '../../auth.server'
import { PERMISSIONS, PERMISSION_LABELS, type Actor } from '../actor'
import { levelReview } from '../levels/actions'
import { levels } from '../levels/store'
import { checks, field, form, h, hidden, select, table } from './html'

export async function levelPanel(env: Bindings, actor: Actor, url: URL) {
 if(!actor.owner) return ''
 const data=await levels(env,actor)
 const reviewId=url.searchParams.get('levelReview')
 const review=reviewId ? await levelReview(env,actor,reviewId) : null
 const rights=(selected: string[]=[])=>checks('Permissions in this level','permissions',PERMISSIONS.map(value=>({value,label:PERMISSION_LABELS[value]})),selected)
 const edit=(level?: Record<string,any>)=>form('level.preview','/app/access?levelReview={id}',[
  hidden('kind','level'),...(level?[hidden('level',level.id)]:[]),field('Level name','name',{value:level?.name ?? ''}),rights(level?.permissions),
 ],'Preview level')
 return h`<section class="card"><h2>Named access levels</h2><p>Levels combine their explicit permissions. The existing self-service and direct-manager boundaries still apply. Field-by-field editing and delegated level administration are not available yet.</p>
${review ? h`<section class="card"><h3>Review access change</h3><p>${review.plan.kind==='level' ? review.plan.name : 'Level assignment'}</p>${review.plan.kind==='level' ? h`<p>${review.plan.permissions.map((p:string)=>PERMISSION_LABELS[p as keyof typeof PERMISSION_LABELS]).join('; ') || 'No additional permissions'}</p>` : ''}${table(['Member','Added permissions','Removed permissions'],review.impact.map((item:Record<string,any>)=>[item.name,item.added.join(', ')||'None',item.removed.join(', ')||'None']))}<p>${review.impact.length} affected member(s). Self-service, direct-report scope and explicit performance releases remain in force.</p>${review.consumed ? h`<p>Applied. This review cannot be used again.</p>` : form('level.apply','/app/access',[hidden('review',review.id)],'Apply reviewed change')}</section>` : ''}
<details><summary>Create a level</summary>${edit()}</details>
${data.levels.map(level=>h`<details><summary>${level.name} · ${level.members.length} member(s)</summary>${edit(level)}</details>`)}
<h3>Assign levels</h3><p>Assigned levels add to direct permissions. Replacing a member's permissions below clears all level assignments. Ending access clears assignments and direct permissions.</p>${form('level.preview','/app/access?levelReview={id}',[hidden('kind','assignment'),select('Member','member',data.members.filter(m=>m.status==='active'&&!m.owner).map(m=>({value:m.id,label:m.name}))),checks('Replace assigned levels with','levels',data.levels.map(l=>({value:l.id,label:l.name})))],'Preview assignment')}
<details><summary>Exact-rights migration report</summary>${table(['Member','Before','After','Widened rights'],data.migration.map(row=>[row.name,row.before_permissions,row.after_permissions,row.widened]))}</details>
</section>`
}
