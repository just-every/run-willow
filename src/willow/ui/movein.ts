import { effectiveFieldDefinitions } from '../custom-fields/store'
import { insist } from '../core'
import { doorCall, uploadAndPlan } from '../movein/door'
import { doorSettings } from '../movein/authority'
// Move-in page: dry-run preview of a BambooHR export, apply bound to the
// reviewed fingerprint, and the import journal with undo.
import type { Bindings } from '../../auth.server'
import { requireOwner, type Actor } from '../actor'
import { formatInstant } from '../dates'
import { employer, settings } from '../employer'
import type { Input } from '../input'
import { policies } from '../leave'
import { importJobs, prepareBamboohr } from '../movein/bamboohr'
import { fileField, field, form, h, hidden, page, select, table, tag, type Html } from './html'

const DATE_FORMATS = [{ value: 'YMD', label: 'Year-month-day (2025-12-31), as BambooHR’s API writes them' }, { value: 'DMY', label: 'Day/month/year (31/12/2025)' }, { value: 'MDY', label: 'Month/day/year (12/31/2025)' }]

export async function importPage(env: Bindings, actor: Actor, url: URL) {
  requireOwner(actor)
  const [jobs, data, company, business, custom] = await Promise.all([importJobs(env, actor), settings(env), employer(env), doorSettings(env, actor),effectiveFieldDefinitions(env,actor.today)])
  const body = h`<h1>Move in from BambooHR</h1><p>Bring your people, their employment, time-off balances and documents across. Uploads are retained privately. No people or employment records change until you review and apply a plan. Balances arrive as proposals for a leave manager to sign off; documents keep their private category. Keep BambooHR read-only until Willow has produced one reconciled payroll handoff.</p>
<section class="card"><h2>1. Preview</h2><form method="post" action="/app/import/preview" enctype="multipart/form-data">
${fileField('Employee report (.csv or .xlsx) with BambooHR fields such as id, employeeNumber, firstName, lastName, workEmail, hireDate, terminationDate, jobTitle, department, location, supervisorEId, payRate, payType, paidPer', 'employees', { required: true, accept: '.csv,.xlsx' })}
${fileField('Time-off balances (.csv: id, timeOffType, balance, units, asOf) — optional', 'balances', { accept: '.csv' })}
${fileField('Documents (.zip with manifest.csv: file, id, category, title) — optional', 'documents', { accept: '.zip' })}
${fileField('Record tables (.zip with tables/<table>.csv, such as a Willow records bundle, or one <table>.csv: employeeNumber, effectiveFrom and the table’s columns) — optional', 'tables', { accept: '.zip,.csv' })}
${select('Dates in these files', 'dateFormat', DATE_FORMATS, 'YMD')}
${select('Working schedule for imported employment', 'schedule', data.schedules.map(row => ({ value: row.id, label: row.name })), '', { required: false, blank: 'None (set later)' })}
${custom.length?h`<details><summary>Custom field columns</summary><p>Column names default to custom:&lt;key&gt;. Values use the shared field definition on the effective date; required or invalid values reject that person.</p>${field('Custom values effective date','customEffectiveFrom',{value:actor.today,type:'date',required:true})}${custom.filter(d=>!d.retired).map(d=>field(`${d.label} (${d.type}${d.required?', required':''})`,`customColumn_${d.key}`,{value:`custom:${d.key}`}))}</details>`:''}
<label><input type="checkbox" name="catchup" value="yes"> Compare with the previous import (catch-up)</label><button type="submit">Preview import</button></form></section>
<section class="card"><h2>Imports</h2>${jobs.length ? table(['Applied', 'State', 'Records', '', 'Approval'], jobs.map(job => [formatInstant(job.appliedAt, company?.timezone ?? 'UTC'), tag(job.state), job.effects,
    job.state === 'completed' ? (job.blockers.length ? h`<p>Undo is blocked until these are reversed in Willow:</p><ul>${job.blockers.map(blocker => h`<li>${blocker.kind}: ${blocker.reason}</li>`)}</ul>` : h`${job.planId ? importForm([hidden('action','reconcile'),hidden('planId',job.planId)],'Reconcile',{secondary:true}) : ''}${importForm([hidden('job', job.id), hidden('action', job.planId ? 'undo' : 'legacy-undo'), hidden('planId', job.planId ?? '')], 'Undo this import', { secondary: true })}`)
      : ['undoing', 'applying','queued','failed','rolling_back'].includes(job.state) ? job.planId ? importForm([hidden('planId', job.planId ?? ''), hidden('fingerprint', job.fingerprint ?? ''), hidden('action', job.state === 'undoing' ? 'undo' : 'apply')], 'Resume', { secondary: true }) : importForm([hidden('job',job.id),hidden('action','legacy-undo')],'Undo interrupted legacy import',{secondary:true}) : '', job.caption ? h`<details><summary>Approval</summary><pre>${job.caption}</pre></details>` : '']))
    : h`<p class="muted">No imports yet.</p>`}</section>
<section class="card"><h2>Business imports</h2><p>Business is ${business.enabled?'enabled':'disabled'}. Your own imports always use the reviewed plan above. Revoked keys: ${business.revokedKids.join(', ')||'none'}.</p>${form('import.settings','/app/import',[hidden('enabled',business.enabled?'no':'yes')],business.enabled?'Disable Business imports':'Enable Business imports',{secondary:true})}</section>`
  return page('Move in', actor, body, { current: '/app/import', url })
}

export async function previewPage(env: Bindings, actor: Actor, input: Input, url: URL, request: Request) {
  requireOwner(actor)
  if(input.has('previousPlanId')) {
    const planId=input.text('previousPlanId',{max:100})
    const prior=await doorCall(env,request,'status',{planId})
    insist(!prior.job,'preview_already_applied',409)
    await doorCall(env,request,'undo',{planId})
  }
  const prepared = await prepareBamboohr(env, input)
  const plan = await uploadAndPlan(env,request,{...prepared.preview.carry,...(input.flag('catchup')?{catchup:'yes'}:{})})
  const preview = {...prepared.preview, fingerprint:plan.fingerprint, counts:plan.counts}

  const policyList = await policies(env)
  const carried = (except: string[] = []): Html[] => Object.entries(preview.carry).filter(([name]) => !except.some(prefix => name.startsWith(prefix))).map(([name, value]) => hidden(name, value))
  const unmappedTypes = [...new Set(preview.rejected.map(item => item.reason.match(/no Willow leave policy for "([^"]+)"/)?.[1]).filter(Boolean) as string[])]
  const counts = preview.counts as Record<string, unknown>
  const body = h`<p class="back"><a href="/app/import">← Move in</a></p><h1>Import preview</h1><p>Uploads and this plan are retained privately. No people or employment records have changed.</p>
<div class="grid"><section class="card"><h2>Summary</h2><ul><li>${preview.people.active} active, ${preview.people.upcoming} upcoming and ${preview.people.former} former employment periods</li><li>${counts.effects} records to write; ${counts.rejected} rows rejected; ${counts.duplicates} repeated rows collapsed</li>${preview.create.departments.length ? h`<li>New departments: ${preview.create.departments.join(', ')}</li>` : ''}${preview.create.locations.length ? h`<li>New locations: ${preview.create.locations.join(', ')}</li>` : ''}</ul></section>
<section class="card"><h2>Balances to sign off</h2>${preview.balances.length ? table(['Person', 'Type', 'Hours', 'As of'], preview.balances.map(item => [item.person, `${item.type} → ${item.policy}`, item.hours, item.asOf])) : h`<p class="muted">None.</p>`}</section>
<section class="card"><h2>Documents</h2>${preview.documents.length ? h`<ul>${preview.documents.map(item => h`<li>${item.person}: ${item.title} (${item.category})</li>`)}</ul>` : h`<p class="muted">None.</p>`}</section>
<section class="card"><h2>Record tables</h2>${preview.tables?.length ? h`<ul>${preview.tables.map(item => h`<li>${item.person}: ${item.rows} ${item.table} row(s)</li>`)}</ul>` : h`<p class="muted">None.</p>`}</section></div>
${preview.rejected.length ? h`<section class="card"><h2>Rejected rows</h2><ul>${preview.rejected.map(item => h`<li>${item.location}: ${item.reason}</li>`)}</ul></section>` : ''}
${preview.attention.length ? h`<section class="card"><h2>Needs attention</h2><ul>${preview.attention.map(item => h`<li>${item.location}: ${item.reason}</li>`)}</ul></section>` : ''}
${preview.unknowns.length ? h`<section class="card"><h2>Unknown after import</h2><p class="muted">Imported as explicitly unknown; fill them in Willow.</p><ul>${preview.unknowns.map(item => h`<li>${item.person}: ${item.missing.join(', ')}</li>`)}</ul></section>` : ''}
<section class="card"><h2>Gaps</h2><ul>${preview.gaps.map(gap => h`<li>${gap}</li>`)}</ul></section>
${unmappedTypes.length ? h`<section class="card"><h2>Time-off types</h2><form method="post" action="/app/import/preview">${carried(['map_'])}${hidden('previousPlanId',plan.planId)}${input.flag('catchup')?hidden('catchup','yes'):''}${unmappedTypes.map(type => select(`BambooHR “${type}”`, `map_${type.toLowerCase().replace(/[^a-z0-9]/g, '')}`, policyList.map(policy => ({ value: policy.id, label: policy.name })), '', { required: false, blank: 'Not mapped' }))}<button type="submit" class="secondary">Preview again with this mapping</button></form></section>` : ''}
<section class="card"><h2>2. Apply</h2><p>Applies exactly this preview (fingerprint ${preview.fingerprint.slice(0, 12)}…). If anything changed since, you will be asked to preview again.</p>${importForm( [hidden('planId',plan.planId), hidden('fingerprint', preview.fingerprint), hidden('action','apply')], 'Apply import')}</section>`
  return page('Import preview', actor, body, { current: '/app/import', url })
}

function importForm(fields: Html[], label: string, options: {secondary?:boolean} = {}) {
  return h`<form method="post" action="/app/import/execute">${fields}<button type="submit" class="${options.secondary?'secondary':''}">${label}</button></form>`
}
