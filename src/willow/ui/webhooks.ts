import type { Bindings } from '../../auth.server'
import { requireOwner, type Actor } from '../actor'
import { webhookList, webhookLog } from '../webhooks'
import { form, h, hidden, page, table, when } from './html'

const path = '/app/settings/webhooks'
export async function webhooksPage(env: Bindings, actor: Actor, url: URL) {
 requireOwner(actor)
 const hooks = await webhookList(env, actor)
 const selected = url.searchParams.get('webhook')
 const log = selected ? await webhookLog(env, actor, selected) : null
 return page('Webhooks', actor, h`<p class="back"><a href="/app/api-credentials">← API credentials</a></p><h1>Webhooks</h1><p>Review the destination and data before allowing delivery. Only the owner can activate, stop or replay a subscription.</p><section class="card"><h2>Subscriptions</h2>${hooks.data.length ? hooks.data.map(hook => h`<article><h3 style="overflow-wrap:anywhere">${hook.endpoint}</h3><dl><dt>Credential</dt><dd>${hook.credentialId}</dd><dt>Posted fields</dt><dd>${hook.fields.join(', ')}</dd><dt>Events</dt><dd>${hook.events.join(', ')}</dd><dt>Monitored fields</dt><dd>${hook.monitoredFields.join(', ')}</dd><dt>State</dt><dd>${!hook.active ? 'Inactive' : hook.paused ? 'Paused' : 'Active'}</dd></dl>${hook.alert ? h`<p role="status">${hook.alert}</p>` : ''}<p><a href="${path}?webhook=${hook.id}">Delivery log</a></p>${!hook.active ? form('webhook.approve', path + '?webhook=' + hook.id, [hidden('webhook', hook.id), h`<label class="check"><input type="checkbox" name="consent" value="yes" required> I approve sending these permitted fields and events to this destination.</label>`], 'Activate webhook') : form('webhook.disable', path + '?webhook=' + hook.id, hidden('webhook', hook.id), 'Stop delivery')}</article>`) : h`<p>No subscriptions. An explicitly scoped API key can register one for your review.</p>`}</section>${log ? h`<section class="card"><h2>Delivery log</h2>${log.deliveries.length ? table(['Event', 'Event ID', 'State', 'Attempts', 'Response', 'Retry due', 'Action'], log.deliveries.map(row => [row.event, row.id, row.status, row.attempts, row.responseCode ?? 'No response', log.data.paused ? 'Paused' : ['pending','failed'].includes(row.status) ? when(row.dueAt, 'UTC') : '—', log.data.active && ['failed', 'uncertain'].includes(row.status) ? form('webhook.replay', path + '?webhook=' + selected, hidden('delivery', row.id), 'Replay delivery') : ''])) : h`<p>No deliveries recorded.</p>`}</section>` : ''}`, { current: '/app/settings', url })
}
