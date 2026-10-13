// Page frame and small form helpers. Every value is escaped; pages need no script.
import branding from '../../branding.json'
import { can, type Actor } from '../actor'
import { formatInstant } from '../dates'

export const esc = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]!))

export type Html = { html: string }
export const raw = (html: string): Html => ({ html })
export function h(strings: TemplateStringsArray, ...values: unknown[]): Html {
  let out = strings[0]
  values.forEach((value, index) => { out += render(value) + strings[index + 1] })
  return { html: out }
}
function render(value: unknown): string {
  if (value === null || value === undefined || value === false) return ''
  if (Array.isArray(value)) return value.map(render).join('')
  if (typeof value === 'object' && 'html' in (value as Html)) return (value as Html).html
  return esc(value)
}

const NAV: { href: string; label: string; show: (actor: Actor) => boolean }[] = [
  { href: '/app', label: 'Home', show: () => true },
  { href: '/app/people', label: 'People', show: () => true },
  { href: '/app/leave', label: 'Leave', show: () => true },
  { href: '/app/payroll', label: 'Payroll', show: actor => can(actor, 'payroll.handoff') && can(actor, 'pay.read') },
  { href: '/app/reports', label: 'Reports', show: actor => can(actor, 'reports.read') || actor.reports.size > 0 },
  { href: '/app/proposals', label: 'Proposals', show: actor => can(actor, 'people.manage') },
  { href: '/app/settings', label: 'Settings', show: actor => can(actor, 'people.manage') || can(actor, 'leave.manage') },
  { href: '/app/connections', label: 'Connections', show: actor => actor.owner },
  { href: '/app/access', label: 'Access', show: actor => can(actor, 'people.manage') },
  { href: '/app/import', label: 'Move in', show: actor => can(actor, 'people.manage') },
  { href: '/app/audit', label: 'Audit', show: actor => can(actor, 'audit.read') },
]

const headers = {
  'content-type': 'text/html; charset=utf-8',
  'cache-control': 'no-store',
  'referrer-policy': 'strict-origin',
  'x-content-type-options': 'nosniff',
  'x-robots-tag': 'noindex, nofollow',
  'content-security-policy': "default-src 'none'; style-src 'self'; font-src 'self'; img-src 'self'; media-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",
}

// Watercolour only where the style allows it: 'frame' hangs fronds from both top
// corners with the river at the foot (first-run pages), 'frond' one small frond
// at the top right of the page title.
type Art = 'frame' | 'frond'

export function page(title: string, actor: Actor | null, body: Html, { current = '', url, status = 200, art, showNav = true }: { current?: string; url?: URL; status?: number; art?: Art; showNav?: boolean } = {}): Response {
  const notice = url?.searchParams.get('notice'), error = url?.searchParams.get('error')
  const nav = actor && showNav ? h`<nav aria-label="Main"><ul>${NAV.filter(item => item.show(actor)).map(item => h`<li><a href="${item.href}"${item.href === current ? raw(' aria-current="page"') : ''}>${item.label}</a></li>`)}</ul></nav>` : ''
  const who = actor ? h`<span class="who">${actor.name}</span>` : ''
  const document = h`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title} · ${branding.name}</title><link rel="stylesheet" href="/fonts/fonts.css"><link rel="stylesheet" href="/rer-theme.css"><link rel="stylesheet" href="/willow-tokens.css"><link rel="stylesheet" href="/willow.css"><link rel="stylesheet" href="/willow-layouts.css"><link rel="stylesheet" href="/willow-connections.css"></head><body${art ? raw(` class="art-${art}"`) : ''}>
<header class="top"><div class="top-inner"><a class="brand" href="/app"><img src="/brand/mark.svg" alt="" width="32" height="32">${branding.name}</a>${nav}${who}</div></header>
<main>${notice ? h`<p class="flash" role="status">${notice}</p>` : ''}${error ? h`<p class="flash error" role="alert">That did not work: ${describeError(error)}</p>` : ''}${body}</main></body></html>`
  return new Response(document.html, { status, headers })
}

const ERRORS: Record<string, string> = {
  stale: 'someone changed this record first. Reload and try again.',
  insufficient_balance: 'the leave balance does not cover this request.',
  tasks_open: 'every task must be done, with its evidence, before the case can complete.',
  already_handed_off: 'this change has already been handed to payroll; record a new change instead.',
  period_overlap: 'this person has an employment period that has not ended before this start date.',
  required_information_missing: 'required information is still missing for this case.',
  evidence_required: 'this task needs evidence of what was done.',
  opening_not_signed_off: 'the opening balance has not been signed off yet.',
  overlaps_existing_leave: 'this overlaps leave that is already requested or approved.',
  no_working_schedule: 'there is no working schedule for some of these days.',
  proposal_stale: 'the records changed after this proposal was prepared. Ask for a new proposal.',
  reviewed_fingerprint_changed: 'the import changed since it was reviewed. Preview it again.',
  undo_blocked: 'some imported records were edited or built on since the import. Reverse those changes first.',
  employer_not_configured: 'the owner must set up the employer first.',
  record_is_immutable: 'this record is kept as history and cannot be changed.',
  not_your_task: 'this task belongs to someone else.',
  not_your_decision: 'this decision belongs to someone else.',
}
export const describeError = (code: string) => ERRORS[code] ?? code.replace(/_/g, ' ') + '.'

export const hidden = (name: string, value: unknown) => h`<input type="hidden" name="${name}" value="${value}">`

/** A POST form to the shared action door; returnTo may contain {id} for the created record. */
// `layout` names a field arrangement in willow-layouts.css: columns, row-form, days or tasks.
export function form(action: string, returnTo: string, fields: unknown, submit: string, { multipart = false, secondary = false, layout = '' } = {}) {
  return h`<form method="post" action="/app/do/${action}"${layout ? h` class="${layout}"` : ''}${multipart ? raw(' enctype="multipart/form-data"') : ''}>${hidden('returnTo', returnTo)}${fields}<button type="submit"${secondary ? raw(' class="secondary"') : ''}>${submit}</button></form>`
}

// Several forms share a page, so every control gets its own id.
let sequence = 0
const uid = (name: string) => `f-${name}-${(sequence = (sequence + 1) % 1_000_000)}`

export function field(label: string, name: string, { type = 'text', value = '', required = true, hint = '' }: { type?: string; value?: unknown; required?: boolean; hint?: string } = {}) {
  const id = uid(name)
  return h`<div class="field"><label for="${id}">${label}</label>${hint ? h`<p class="hint" id="${id}-hint">${hint}</p>` : ''}<input id="${id}" type="${type}" name="${name}" value="${value}"${required ? raw(' required') : ''}${hint ? raw(` aria-describedby="${esc(id)}-hint"`) : ''}></div>`
}

export function area(label: string, name: string, value = '', required = true) {
  const id = uid(name)
  return h`<div class="field"><label for="${id}">${label}</label><textarea id="${id}" name="${name}"${required ? raw(' required') : ''}>${value}</textarea></div>`
}

export function select(label: string, name: string, options: { value: string; label: string }[], selected = '', { required = true, blank = '' } = {}) {
  const id = uid(name)
  return h`<div class="field"><label for="${id}">${label}</label><select id="${id}" name="${name}"${required ? raw(' required') : ''}>${blank ? h`<option value="">${blank}</option>` : ''}${options.map(option => h`<option value="${option.value}"${option.value === selected ? raw(' selected') : ''}>${option.label}</option>`)}</select></div>`
}

export function fileField(label: string, name: string, { required = false, accept = '' } = {}) {
  const id = uid(name)
  return h`<div class="field"><label for="${id}">${label}</label><input id="${id}" type="file" name="${name}"${accept ? h` accept="${accept}"` : ''}${required ? raw(' required') : ''}></div>`
}

export const checks = (legend: string, name: string, options: { value: string; label: string }[], selected: string[] = []) =>
  h`<fieldset><legend>${legend}</legend>${options.map(option => h`<label class="check"><input type="checkbox" name="${name}" value="${option.value}"${selected.includes(option.value) ? raw(' checked') : ''}> ${option.label}</label>`)}</fieldset>`

export const when = (instant: number | null | undefined, zone: string) => instant ? formatInstant(instant, zone) : '—'

// On a phone each row stacks as label and value pairs; data-label carries the column heading.
export const table = (headers: string[], rows: unknown[][]) => h`<div class="table-wrap"><table><thead><tr>${headers.map(header => h`<th scope="col">${header}</th>`)}</tr></thead><tbody>${rows.map(row => h`<tr>${row.map((cell, index) => h`<td${headers[index] ? h` data-label="${headers[index]}"` : ''}>${cell}</td>`)}</tr>`)}</tbody></table></div>`

// One mapping from a tag's words to its chip tone; anything not listed stays quiet.
const TONES: Record<string, 'willow' | 'gold' | 'alert'> = {
  active: 'willow', 'in force': 'willow', approved: 'willow', 'signed off': 'willow', done: 'willow', yes: 'willow', on: 'willow', 'receipt acknowledged': 'willow', completed: 'willow', acknowledged: 'willow', exported: 'willow', 'owner (everything)': 'willow', 'resolved in a later batch': 'willow', start: 'willow', change: 'willow',
  upcoming: 'gold', scheduled: 'gold', draft: 'gold', 'awaiting sign-off': 'gold', pending: 'gold', open: 'gold', proposed: 'gold', 'receipt not yet acknowledged': 'gold', leave: 'gold',
  overdue: 'alert', unresolved: 'alert', failed: 'alert',
}
const toneOf = (text: string) => TONES[text.toLowerCase().replace(/^yes \(.*\)$/, 'yes')]
/** A status chip, toned by its words. */
export const tag = (text: unknown) => { const tone = toneOf(String(text ?? '')); return h`<span class="tag${tone ? ` tone-${tone}` : ''}">${text}</span>` }

/** A watercolour disc with a person's initials, beside their name (never part of a link's name). */
export const avatar = (name: string) => h`<span class="avatar" aria-hidden="true">${name.split(/\s+/).filter(Boolean).map(part => part[0]).slice(0, 2).join('').toUpperCase()}</span>`

/** A person's name with its initials disc; the link (when given) is the name alone. */
export const person = (name: string, href?: string) => h`<span class="person">${avatar(name)}${href ? h`<a href="${href}">${name}</a>` : name}</span>`
