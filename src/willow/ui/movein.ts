// Move-in page: dry-run preview of a BambooHR export, apply bound to the
// reviewed fingerprint, and the import journal with undo.
import type { Bindings } from '../../auth.server'
import { requirePermission, type Actor } from '../actor'
import { formatInstant } from '../dates'
import { employer, settings } from '../employer'
import type { Input } from '../input'
import { policies } from '../leave'
import { importJobs, previewImport } from '../movein/bamboohr'
import { fileField, form, h, hidden, page, select, table, tag, type Html } from './html'

const DATE_FORMATS = [{ value: 'YMD', label: 'Year-month-day (2025-12-31), as BambooHR’s API writes them' }, { value: 'DMY', label: 'Day/month/year (31/12/2025)' }, { value: 'MDY', label: 'Month/day/year (12/31/2025)' }]

export async function importPage(env: Bindings, actor: Actor, url: URL) {
  requirePermission(actor, 'people.manage')
  const [jobs, data, company] = await Promise.all([importJobs(env, actor), settings(env), employer(env)])
  const body = h`<h1>Move in from BambooHR</h1><p>Bring your people, their employment, time-off balances and documents across. Nothing is written until you have reviewed a preview. Balances arrive as proposals for a leave manager to sign off; documents keep their private category. Keep BambooHR read-only until Willow has produced one reconciled payroll handoff.</p>
<section class="card"><h2>1. Preview</h2><form method="post" action="/app/import/preview" enctype="multipart/form-data">
${fileField('Employee report (.csv or .xlsx) with BambooHR fields such as id, employeeNumber, firstName, lastName, workEmail, hireDate, terminationDate, jobTitle, department, location, supervisorEId, payRate, payType, paidPer', 'employees', { required: true, accept: '.csv,.xlsx' })}
${fileField('Time-off balances (.csv: id, timeOffType, balance, units, asOf) — optional', 'balances', { accept: '.csv' })}
${fileField('Documents (.zip with manifest.csv: file, id, category, title) — optional', 'documents', { accept: '.zip' })}
${select('Dates in these files', 'dateFormat', DATE_FORMATS, 'YMD')}
${select('Working schedule for imported employment', 'schedule', data.schedules.map(row => ({ value: row.id, label: row.name })), '', { required: false, blank: 'None (set later)' })}
<button type="submit">Preview import</button></form></section>
<section class="card"><h2>Imports</h2>${jobs.length ? table(['Applied', 'State', 'Records', ''], jobs.map(job => [formatInstant(job.appliedAt, company?.timezone ?? 'UTC'), tag(job.state), job.effects,
    job.state === 'completed' ? (job.blockers.length ? h`<p>Undo is blocked until these are reversed in Willow:</p><ul>${job.blockers.map(blocker => h`<li>${blocker.kind}: ${blocker.reason}</li>`)}</ul>` : form('import.job', '/app/import', [hidden('job', job.id), hidden('action', 'undo')], 'Undo this import', { secondary: true }))
      : ['undoing', 'applying'].includes(job.state) ? form('import.job', '/app/import', [hidden('job', job.id), hidden('action', 'resume')], 'Resume', { secondary: true }) : '']))
    : h`<p class="muted">No imports yet.</p>`}</section>`
  return page('Move in', actor, body, { current: '/app/import', url })
}

export async function previewPage(env: Bindings, actor: Actor, input: Input, url: URL) {
  const preview = await previewImport(env, actor, input)
  const policyList = await policies(env)
  const carried = (except: string[] = []): Html[] => Object.entries(preview.carry).filter(([name]) => !except.some(prefix => name.startsWith(prefix))).map(([name, value]) => hidden(name, value))
  const unmappedTypes = [...new Set(preview.rejected.map(item => item.reason.match(/no Willow leave policy for "([^"]+)"/)?.[1]).filter(Boolean) as string[])]
  const counts = preview.counts as Record<string, unknown>
  const body = h`<p class="back"><a href="/app/import">← Move in</a></p><h1>Import preview</h1><p>This is a dry run: nothing has been written.</p>
<div class="grid"><section class="card"><h2>Summary</h2><ul><li>${preview.people.active} active, ${preview.people.upcoming} upcoming and ${preview.people.former} former employment periods</li><li>${counts.effects} records to write; ${counts.rejected} rows rejected; ${counts.duplicates} repeated rows collapsed</li>${preview.create.departments.length ? h`<li>New departments: ${preview.create.departments.join(', ')}</li>` : ''}${preview.create.locations.length ? h`<li>New locations: ${preview.create.locations.join(', ')}</li>` : ''}</ul></section>
<section class="card"><h2>Balances to sign off</h2>${preview.balances.length ? table(['Person', 'Type', 'Hours', 'As of'], preview.balances.map(item => [item.person, `${item.type} → ${item.policy}`, item.hours, item.asOf])) : h`<p class="muted">None.</p>`}</section>
<section class="card"><h2>Documents</h2>${preview.documents.length ? h`<ul>${preview.documents.map(item => h`<li>${item.person}: ${item.title} (${item.category})</li>`)}</ul>` : h`<p class="muted">None.</p>`}</section></div>
${preview.rejected.length ? h`<section class="card"><h2>Rejected rows</h2><ul>${preview.rejected.map(item => h`<li>${item.location}: ${item.reason}</li>`)}</ul></section>` : ''}
${preview.attention.length ? h`<section class="card"><h2>Needs attention</h2><ul>${preview.attention.map(item => h`<li>${item.location}: ${item.reason}</li>`)}</ul></section>` : ''}
${preview.unknowns.length ? h`<section class="card"><h2>Unknown after import</h2><p class="muted">Imported as explicitly unknown; fill them in Willow.</p><ul>${preview.unknowns.map(item => h`<li>${item.person}: ${item.missing.join(', ')}</li>`)}</ul></section>` : ''}
<section class="card"><h2>Gaps</h2><ul>${preview.gaps.map(gap => h`<li>${gap}</li>`)}</ul></section>
${unmappedTypes.length ? h`<section class="card"><h2>Time-off types</h2><form method="post" action="/app/import/preview">${carried(['map_'])}${unmappedTypes.map(type => select(`BambooHR “${type}”`, `map_${type.toLowerCase().replace(/[^a-z0-9]/g, '')}`, policyList.map(policy => ({ value: policy.id, label: policy.name })), '', { required: false, blank: 'Not mapped' }))}<button type="submit" class="secondary">Preview again with this mapping</button></form></section>` : ''}
<section class="card"><h2>2. Apply</h2><p>Applies exactly this preview (fingerprint ${preview.fingerprint.slice(0, 12)}…). If anything changed since, you will be asked to preview again.</p>${form('import.apply', '/app/import', [...carried(), hidden('fingerprint', preview.fingerprint)], 'Apply import')}</section>`
  return page('Import preview', actor, body, { current: '/app/import', url })
}
