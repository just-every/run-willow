import type { Bindings } from '../../auth.server'
import { can, type Actor } from '../actor'
import { all, type Row } from '../core'
import { signatureTemplates } from '../sign/templates'
import { h, form, hidden, select } from './html'

export async function signingEditor(env: Bindings, actor: Actor, data: { locations: Row[]; departments: Row[] }) {
  if (!can(actor, 'people.manage')) return () => ''
  const templates = (await signatureTemplates(env, actor)).filter(t => t.current && t.approvedAt)
  const counters = await all(env, `SELECT m.id,m.name FROM wl_members m WHERE m.status='active' AND
    (EXISTS(SELECT 1 FROM wl_effective_permissions p WHERE p.member_id=m.id AND p.permission='people.manage') OR
    EXISTS(SELECT 1 FROM oa_operators o WHERE o.id=m.operator_id AND o.role='owner' AND o.status='active'))`)
  const levels = await all(env, 'SELECT id,name FROM wl_levels')
  return () => h`<details><summary>Native signing step</summary><p>Assign this step to HR. Issue requires a separate review of the exact recipients and document. Personal signatures and the sealed record complete it.</p>${select('Signature template', 'taskSignatureTemplate', templates.map(t => ({ value: t.id, label: `${t.title} · version ${t.version}` })), '', { required: false, blank: 'No signing step' })}${select('Named HR countersigner', 'taskSignatureHr', counters.map(m => ({ value: m.id, label: m.name })), '', { required: false, blank: 'Choose countersigner' })}${select('Signing recipients', 'taskSignatureCohort', [
    { value: 'named', label: 'The person in this case' }, { value: 'everyone', label: 'Everyone' },
    ...data.locations.map(l => ({ value: `location:${l.id}`, label: `Location: ${l.name}` })),
    ...data.departments.map(d => ({ value: `department:${d.id}`, label: `Department: ${d.name}` })),
    ...['full_time', 'part_time', 'casual', 'contractor'].map(value => ({ value: `employment_type:${value}`, label: `Employment type: ${value.replaceAll('_', ' ')}` })),
    ...levels.map(l => ({ value: `access_level:${l.id}`, label: `Access level: ${l.name}` })),
  ], 'named', { required: false })}</details>`
}

export function signingTaskActions(actor: Actor, task: { id: string }, caseId: string) {
  if (!can(actor, 'people.manage')) return ''
  return h`<details><summary>Manage signing</summary>${form('task.signature.preview', `/app/cases/${caseId}`, hidden('task', task.id), 'Review signing requests', { secondary: true })}${form('task.signature.verify', `/app/cases/${caseId}`, hidden('task', task.id), 'Verify completed signatures', { secondary: true })}<p><a href="/app/signatures">Open signature requests</a></p></details>`
}

export function signingPlanSummary(step: any) {
  return step ? h`<p>Native signing: ${step.template.title}, version ${step.template.version}. Countersigner: ${step.countersigner.name}. Recipients: ${step.recipients.map((p: any) => p.name).join(', ') || 'No current recipients'}. Issue action: ${step.action}. No outbound message.</p>` : ''
}
