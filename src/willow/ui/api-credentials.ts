import type { Bindings } from '../../auth.server'
import { canLevelAdmin, type Actor } from '../actor'
import { all } from '../core'
import { listCredentials,type CredentialMetadata } from '../api-credentials/store'
import { requireSetting } from '../levels/settings'
import { h,page,table,form,field,select,hidden,when } from './html'
const path='/app/api-credentials'
const expiry=()=>new Date(Date.now()+30*86400000).toISOString()
export async function credentialsPage(env:Bindings,actor:Actor,url:URL) {
 if(!canLevelAdmin(actor))requireSetting(actor,'api-credentials')
 if(!canLevelAdmin(actor))return page('API credentials',actor,h`<h1>API credentials</h1><section class="card"><p>An access administrator issues and revokes credentials bound to a named access level. This setting grants no employee data or credential secret.</p></section>`,{current:path,url})
 const [credentials,levels]=await Promise.all([listCredentials(env,actor),all<{id:string;name:string}>(env,'SELECT id,name FROM wl_levels ORDER BY name')])
 return page('API credentials',actor,h`<header class="page-head"><h1>API credentials</h1><p>Each read-only key uses one level’s current scope and readable fields. It has no person, self-service, manager or owner authority.</p></header><section class="card"><h2>Issue a key</h2>${form('apiKey.issue',path,[field('Name','name'),select('Access level','level',levels.map(level=>({value:level.id,label:level.name}))),field('Expires at (ISO date and time)','expiresAt',{value:expiry()})],'Issue read-only key')}<p>Sensitive keys issued by a delegate stay inactive until the owner or a distinct eligible access administrator approves. Changing the level or the issuing administrator’s authority permanently revokes its keys. Issue a new key after reviewing a changed level.</p></section><section class="card"><h2>Credentials</h2><p><a href="/app/settings/webhooks">Review webhooks and delivery logs</a></p>${table(['Name','Level','Write scopes','Expires','Last used','State','Action'],credentials.map(row=>[row.name,levels.find(level=>level.id===row.level)?.name??'Unavailable level',row.writeScopes.join(', ')||'Read only',when(row.expiresAt,'UTC'),when(row.lastUsedAt,'UTC'),row.revokedAt?'Revoked':row.expiresAt<=Date.now()?'Expired':row.approvalRequired&&!row.approvedBy?'Awaiting independent approval':'Active',row.revokedAt?'':h`${row.approvalRequired&&!row.approvedBy&&row.issuedBy!==actor.id?form('apiKey.approve',path,[hidden('credential',row.id),field('Approval reason','reason')],'Approve credential'):''}${actor.owner||row.issuedBy===actor.id?h`${form('apiKey.revoke',path,hidden('credential',row.id),'Revoke')}${form('apiKey.rotate',path,[hidden('credential',row.id),field('New expiry (ISO date and time)','expiresAt',{value:expiry()})],'Rotate')}`:''}`]))}</section>`,{current:path,url})
}
export function issuedCredentialPage(actor:Actor,result:CredentialMetadata&{token:string}) {
 const response=page('API key issued',actor,h`<h1>API key issued</h1><section class="card"><h2>${result.name}</h2>${result.approvalRequired&&!result.approvedBy?h`<p>This key is inactive until an independent access administrator approves it.</p>`:''}<p>Copy this key now. It will not be shown again. Store it in your tool’s protected credential store.</p><pre style="white-space:pre-wrap;overflow-wrap:anywhere"><code id="issued-api-token">${result.token}</code></pre><p>${result.readOnly?'Read only':result.writeScopes.join(', ')} · Expires ${new Date(result.expiresAt).toISOString()}</p><p><a href="${path}">Back to API credentials</a></p></section>`,{current:path})
 response.headers.set('cache-control','no-store');response.headers.set('referrer-policy','no-referrer')
 return response
}
