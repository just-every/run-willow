import type { Bindings } from '../../auth.server'
import type { Actor } from '../actor'
import { readReview } from '../workflow-review'
import { signingPlanSummary } from './workflow-signing'
import { formatDate } from '../dates'
import { json } from '../core'
import { form, h, hidden, table } from './html'
import { TYPE_LABELS, assignee, dueOffset } from './labels'

export async function workflowReviewPanel(env: Bindings, actor: Actor, url: URL) {
  const id = url.searchParams.get('review')
  if (!id) return ''
  const review = await readReview(env, actor, id)
  const detail = review.detail
  if (review.kind === 'publication') return h`<section class="card"><h2>Review publication: ${detail.template.name}</h2><p>Version ${detail.template.version}; preview anchored on ${formatDate(detail.asOf)}. Each row names a person and the work a new case on this date would create. Future hires are evaluated from the same rules when their case starts.</p>
<h3>Workflow recipe</h3>${table(['Task', 'When', 'Who and when', 'Dependency and external work'], detail.recipe.map((t: any) => {
  const rule = json<any>(t.rule, { conditions: {}, dependencies: [] })
  const labels: Record<string, string> = { jobTitle: 'Job title', workState: 'US work state', employmentType: 'Employment type', location: 'Location' }
  return [h`${t.position}. ${t.title}`, Object.entries(rule.conditions).map(([key, value]) => `${labels[key]}: ${key === 'location' ? detail.locationNames[String(value)] : key === 'employmentType' ? TYPE_LABELS[String(value)] ?? value : value}`).join('; ') || 'Everyone', `${assignee(t.assignee)} · ${dueOffset(t.due_offset_days).toLowerCase()}`, `${rule.dependencies.length ? `After tasks ${rule.dependencies.join(', ')}. ` : ''}${t.system ? `${t.system}; evidence required. ` : ''}${t.action === 'signature' ? 'Requires reviewed issue and verified sealed signing records.' : t.action ? 'Ends Willow access when completed.' : ''}`]
}))}
${table(['Person', 'Assignments, deadlines and external work'], detail.affected.map((p: any) => [p.name, h`<ul>${p.tasks.map((t: any) => h`<li>${t.position}. ${t.title} — ${assignee(t.assignee)}: ${t.recipients.map((m: any) => m.name).join(', ') || 'No active member answers this role yet'}; ${formatDate(t.dueDate)}${t.system ? `; ${t.system}, recorded evidence required` : ''}${t.action ? `; Willow action: ${t.action}` : ''}${t.dependencies.length ? `; after tasks ${t.dependencies.join(', ')}` : ''}${signingPlanSummary(t.signature)}</li>`)}</ul>`]))}
<p>${detail.openCases.length} open case(s) keep their current version. No provider action runs during preview or publication. Any intervening business change requires a fresh review.</p>
${form('template.publish', '/app/settings', [hidden('review', id)], 'Publish reviewed workflow')}</section>`
  return h`<section class="card"><h2>Review case upgrade</h2><p>Required information before: ${detail.requiredFields.before.map((f: string) => f.replace(/_/g, ' ')).join(', ') || 'none'}; after: ${detail.requiredFields.after.map((f: string) => f.replace(/_/g, ' ')).join(', ') || 'none'}.</p><h3>Completed work retained</h3><ul>${detail.retainedCompleted.map((t: any) => h`<li>${t.title}${t.evidence ? t.action === 'signature' ? ' — sealed signing evidence retained' : ` — ${t.evidence}` : ''}</li>`)}</ul><h3>Open work superseded (history retained)</h3><ul>${detail.supersededOpen.map((t: any) => h`<li>${t.title}</li>`)}</ul><h3>Reviewed replacement work</h3>${table(['Task', 'Owner role', 'Due', 'Outcome'], detail.tasks.map((t: any) => [t.title, assignee(t.assignee), formatDate(t.dueDate), t.reusedCompletion ? h`Existing completion retained${signingPlanSummary(t.signature)}` : h`${signingPlanSummary(t.signature)}${t.system ? `${t.system}; evidence required. ` : ''}${t.dependencies.length ? `After tasks ${t.dependencies.join(', ')}` : 'Ready after upgrade'}`]))}${form('case.upgrade', `/app/cases/${detail.case}`, [hidden('review', id)], 'Apply reviewed upgrade')}</section>`
}
