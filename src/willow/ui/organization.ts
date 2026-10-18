// Existing People-page cards and links: navigate one manager/report level at
// a time, so deep organizations remain usable without horizontal scrolling.
import type { Actor } from '../actor'
import { formatDate } from '../dates'
import type { organizationChart } from '../organization'
import { h, tag } from './html'

type Chart = ReturnType<typeof organizationChart>
export function organizationSection(chart: Chart, actor: Actor, url: URL) {
  const nodes = new Map(chart.nodes.map(node => [node.id, node]))
  const focus = nodes.get(url.searchParams.get('focus') ?? '')
  const link = (id: string) => `/app/people?view=organization&asOf=${chart.date}&focus=${encodeURIComponent(id)}`
  const personLink = (id: string) => `/app/people/${id}?asOf=${chart.date}`
  const selected = focus ? [focus] : chart.roots.map(id => nodes.get(id)!)
  return h`<section class="card"><h2>Organization chart</h2><p>${chart.activeCount} active people · ${chart.totalCount} visible records · ${formatDate(chart.date)}</p>
${chart.date > actor.today ? h`<p>${tag('scheduled')} Preview of recorded future reporting lines. Changes remain on their effective dates.</p>` : ''}
${focus ? h`<p><a href="/app/people?view=organization&asOf=${chart.date}">← Top-level people</a></p>` : ''}
${selected.length ? selected.map(node => h`<article><h3><a href="${link(node.id)}">${node.name}</a> ${tag(node.status)}</h3><p>${node.jobTitle ?? 'No role recorded'} · ${node.department?.name ?? 'No department'} · ${node.location?.name ?? 'No location'}</p>
<p>Reports to: ${node.parent ? h`<a href="${link(node.parent)}">${nodes.get(node.parent)!.name}</a>` : node.vacantManager ? h`<strong>Vacant manager</strong> · ${node.vacantManager.name}` : 'No manager assigned'}</p>
<p><a href="${personLink(node.id)}">Open record as of this date</a></p>
<h4>Direct reports (${node.reports.length})</h4>${node.reports.length ? h`<ul>${node.reports.map(id => h`<li><a href="${link(id)}">${nodes.get(id)!.name}</a> · ${nodes.get(id)!.jobTitle ?? 'No role recorded'} ${tag(nodes.get(id)!.status)}</li>`)}</ul>` : h`<p class="muted">No direct reports on this date.</p>`}</article>`) : h`<p class="muted">No visible reporting lines on this date.</p>`}</section>`
}
