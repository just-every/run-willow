// Page frame and small form helpers. Every value is escaped; pages need no script.
import branding from '../../branding.json'
import { can, type Actor } from '../actor'
import { formatInstant } from '../dates'
import { iconPaths, type IconName } from '../../ui/icon-paths'
import { sentence } from './labels'

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

type NavItem = { href: string; label: string; icon: IconName; show: (actor: Actor) => boolean }
// The rail: everyday work, then administration, then Settings at the foot.
const NAV: NavItem[][] = [[
  { href: '/app', label: 'Home', icon: 'home', show: () => true },
  { href: '/app/progress', label: 'In progress', icon: 'checklist', show: () => true },
  { href: '/app/people', label: 'People', icon: 'people', show: () => true },
  { href: '/app/leave', label: 'Leave', icon: 'calendar', show: () => true },
  { href: '/app/people?view=organization', label: 'Organization chart', icon: 'org', show: () => true },
  { href: '/app/payroll', label: 'Payroll', icon: 'wallet', show: actor => can(actor, 'payroll.handoff') && can(actor, 'pay.read') },
  { href: '/app/reports', label: 'Reports', icon: 'chart', show: actor => can(actor, 'reports.read') || actor.reports.size > 0 },
  { href: '/app/proposals', label: 'Proposals', icon: 'sparkle', show: actor => can(actor, 'people.manage') },
  { href: '/app/eeo/self', label: 'Voluntary self-ID', icon: 'people', show: actor => !!actor.personId },
  { href: '/app/self-changes', label: 'Personal changes', icon: 'checklist', show: actor => !!actor.personId || can(actor,'people.private') },
  { href: '/app/performance', label: 'Performance', icon: 'chart', show: () => true },
  { href: '/app/surveys', label: 'Surveys', icon: 'chart', show: () => true },
  { href: '/app/dates', label: 'Upcoming dates', icon: 'calendar', show: () => true },
  { href: '/app/changes', label: 'Change requests', icon: 'checklist', show: actor => can(actor, 'people.manage') || can(actor, 'payroll.handoff') || actor.reports.size > 0 },
], [
  { href: '/app/import', label: 'Move in', icon: 'upload', show: actor => can(actor, 'people.manage') },
  { href: '/app/access', label: 'Access', icon: 'shield', show: actor => can(actor, 'people.manage') },
  { href: '/app/connections', label: 'Connections', icon: 'plug', show: actor => actor.owner },
  { href: '/app/audit', label: 'Audit', icon: 'document', show: actor => can(actor, 'audit.read') },
], [
  { href: '/app/settings', label: 'Settings', icon: 'gear', show: actor => can(actor, 'people.manage') || can(actor, 'leave.manage') },
]]
const NAV_CLASSES = ['nav-main', 'nav-admin', 'nav-foot']

/** A line icon from the shared set, decorative beside its text. */
export const icon = (name: IconName) => raw(`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="${iconPaths[name]}"/></svg>`)

/** What the signed-in member does here, from their explicit permissions. */
function roleOf(actor: Actor) {
  if (actor.owner) return 'Owner'
  if (can(actor, 'people.manage')) return 'People ops'
  if (can(actor, 'payroll.handoff')) return 'Payroll'
  if (can(actor, 'it.tasks')) return 'IT'
  return actor.reports.size ? 'Manager' : 'Employee'
}

const headers = {
  'content-type': 'text/html; charset=utf-8',
  'cache-control': 'no-store',
  'referrer-policy': 'strict-origin',
  'x-content-type-options': 'nosniff',
  'x-robots-tag': 'noindex, nofollow',
  'content-security-policy': "default-src 'none'; style-src 'self'; font-src 'self'; img-src 'self'; media-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",
}

const STYLES = ['/fonts/fonts.css', '/rer-theme.css', '/willow-tokens.css', '/willow.css', '/willow-layouts.css', '/willow-progress.css', '/willow-connections.css']

// `wide` lets a page use the whole work area (In progress). Without the nav (first run) the shell is bare.
export function page(title: string, actor: Actor | null, body: Html, { current = '', url, status = 200, showNav = true, wide = false }: { current?: string; url?: URL; status?: number; showNav?: boolean; wide?: boolean } = {}): Response {
  const notice = url?.searchParams.get('notice'), error = url?.searchParams.get('error')
  const nav = actor && showNav ? h`<input type="checkbox" id="menu-toggle" class="menu-toggle"><label for="menu-toggle" class="menu-button">${icon('menu')}Menu</label><nav aria-label="Main">${NAV.map((group, index) => {
    const items = group.filter(item => item.show(actor))
    return items.length ? h`<ul class="${NAV_CLASSES[index]}">${items.map(item => h`<li><a href="${item.href}"${item.href === current ? raw(' aria-current="page"') : ''}>${icon(item.icon)}${item.label}</a></li>`)}</ul>` : ''
  })}</nav>` : ''
  const top = actor && showNav ? h`<header class="topbar"><form class="find" method="get" action="/app/people" role="search">${icon('search')}<input type="search" name="q" placeholder="Find a person" aria-label="Find a person"></form><a class="bell" href="/app/tasks" aria-label="Open your task list" title="Your tasks">${icon('bell')}</a><div class="who">${avatar(actor.name)}<span>${actor.name}<small>${roleOf(actor)}</small></span></div></header>` : ''
  const document = h`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title} · ${branding.name}</title>${STYLES.map(href => h`<link rel="stylesheet" href="${href}">`)}<link rel="icon" href="/favicon.ico" sizes="32x32"><link rel="icon" type="image/svg+xml" href="/brand/favicon-32.svg"><link rel="apple-touch-icon" href="/apple-touch-icon.png"></head><body>
<div class="shell${actor && showNav ? '' : ' bare'}"><aside class="rail"><a class="brand" href="/app"><img src="/brand/mark.svg" alt="" width="21" height="38"><span data-rer-name>${branding.name}</span></a>${nav}</aside>
<div class="work">${top}<main${wide ? raw(' class="wide"') : ''}>${notice ? h`<p class="flash" role="status">${notice}</p>` : ''}${error ? h`<p class="flash error" role="alert">That did not work: ${describeError(error)}</p>` : ''}${body}</main></div></div></body></html>`
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
const TONES: Record<string, 'done' | 'wait' | 'alert'> = {
  active: 'done', 'in force': 'done', approved: 'done', 'signed off': 'done', done: 'done', yes: 'done', on: 'done', 'receipt acknowledged': 'done', completed: 'done', acknowledged: 'done', exported: 'done', 'owner (everything)': 'done', 'resolved in a later batch': 'done', start: 'done', change: 'done',
  upcoming: 'wait', scheduled: 'wait', draft: 'wait', 'awaiting sign-off': 'wait', pending: 'wait', open: 'wait', proposed: 'wait', 'receipt not yet acknowledged': 'wait', leave: 'wait',
  overdue: 'alert', unresolved: 'alert', failed: 'alert',
}
const toneOf = (text: string) => TONES[text.toLowerCase().replace(/^yes \(.*\)$/, 'yes')]
/** A status chip, toned by its words and shown in sentence case ("overdue" -> "Overdue"). */
// Stored statuses keep their spelling; people read US English.
const US_LABELS: Record<string, string> = { cancelled: 'canceled' }
export const tag = (text: unknown) => { const tone = toneOf(String(text ?? '')); return h`<span class="tag${tone ? ` tone-${tone}` : ''}">${sentence(US_LABELS[String(text)] ?? String(text ?? ''))}</span>` }

/** An initials disc beside a person's name (never part of a link's name), tinted by the name. */
export const avatar = (name: string) => {
  const tint = [...name].reduce((sum, character) => sum + character.charCodeAt(0), 0) % 5 + 1
  return h`<span class="avatar${tint > 1 ? ` t${tint}` : ''}" aria-hidden="true">${name.split(/\s+/).filter(Boolean).map(part => part[0]).slice(0, 2).join('').toUpperCase()}</span>`
}

/** A person's name with its initials disc; the link (when given) is the name alone. */
export const person = (name: string, href?: string) => h`<span class="person">${avatar(name)}${href ? h`<a href="${href}">${name}</a>` : name}</span>`
