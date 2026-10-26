import type { Bindings } from '../../auth.server'
import { insist, sha256Hex, WillowError } from '../core'

export interface OktaState {
 id: string
 status: string
 profile: { email: string; login: string; displayName: string; title: string; department: string }
 groups: { id: string; name: string; managed: boolean }[]
 applications: { id: string; name: string }[]
}

export function oktaOrigin(env: Bindings) {
 let url: URL
 try { url = new URL(env.OKTA_ORG_URL ?? '') } catch { throw new WillowError('okta_binding_required',409) }
 insist(url.protocol === 'https:' && /^[a-z0-9-]+\.okta(?:preview|-emea)?\.com$/.test(url.hostname) && !url.username && !url.password && !url.port && url.pathname === '/' && !url.search && !url.hash && env.OKTA_API_TOKEN, 'okta_invalid_binding',409)
 return url.origin
}

export const oktaTenant = (env: Bindings) => sha256Hex(oktaOrigin(env))
export const oktaConfiguration = async (env: Bindings, revision: string) => sha256Hex(JSON.stringify([oktaOrigin(env),env.OKTA_API_TOKEN,env.SESSION_SECRET,revision]))

// Provider response bodies never become errors or logs. Redirects cannot move
// the administrator credential to another origin, including during pagination.
export async function oktaRequest(env: Bindings, path: string, method = 'GET', body?: unknown): Promise<any> {
 insist(path.startsWith('/api/v1/') && !path.includes('..'), 'okta_invalid_path')
 let response: Response
 try {
  response = await fetch(oktaOrigin(env) + path, { method, redirect:'manual', signal:AbortSignal.timeout(20000), headers:{ authorization:`SSWS ${env.OKTA_API_TOKEN}`, accept:'application/json', ...(body === undefined ? {} : {'content-type':'application/json'}) }, ...(body === undefined ? {} : {body:JSON.stringify(body)}) })
 } catch { throw new WillowError('okta_request_uncertain',502) }
 if (!response.ok) { await response.body?.cancel(); throw new WillowError(`okta_http_${response.status}`,502) }
 const text = await response.text()
 insist(text.length < 1_000_000, 'okta_response_too_large',502)
 if (!text) return null
 try { return JSON.parse(text) } catch { throw new WillowError('okta_invalid_response',502) }
}

async function list(env: Bindings, path: string): Promise<any[]> {
 // These reads request one bounded page. A full page is not evidence that all
 // assignments were observed; refuse rather than silently truncate it.
 const rows = await oktaRequest(env,path + (path.includes('?') ? '&' : '?') + 'limit=200')
 insist(Array.isArray(rows) && rows.length < 200, 'okta_assignment_page_incomplete',502)
 return rows
}

export const oktaId = (value: string) => { insist(/^[A-Za-z0-9_-]{1,100}$/.test(value),'invalid_okta_id'); return value }

export async function oktaState(env: Bindings, account: string): Promise<OktaState> {
 const id = oktaId(account), user = await oktaRequest(env,`/api/v1/users/${id}`)
 insist(user?.id === id && typeof user.status === 'string' && user.profile && typeof user.profile.email === 'string', 'okta_invalid_user',502)
 const groups = await list(env,`/api/v1/users/${id}/groups`)
 const apps = await list(env,`/api/v1/users/${id}/appLinks`)
 return { id, status:user.status, profile:{ email:user.profile.email,login:user.profile.login ?? '',displayName:user.profile.displayName ?? '',title:user.profile.title ?? '',department:user.profile.department ?? '' },
  groups:groups.map(g=>{insist(typeof g.id === 'string' && g.profile && typeof g.profile.name === 'string','okta_invalid_group',502);return {id:oktaId(g.id),name:g.profile.name,managed:g.type === 'OKTA_GROUP' && g.profile.name !== 'Everyone'}}).sort((a,b)=>a.id.localeCompare(b.id)),
  applications:apps.map(a=>{insist(typeof a.id === 'string' && typeof a.label === 'string','okta_invalid_application',502);return {id:oktaId(a.id),name:a.label}}).sort((a,b)=>a.id.localeCompare(b.id)) }
}

export async function validateGroups(env: Bindings, ids: string[]) {
 const result: {id:string;name:string}[] = []
 for (const id of ids) {
  const group = await oktaRequest(env,`/api/v1/groups/${oktaId(id)}`)
  insist(group?.id === id && group.type === 'OKTA_GROUP' && typeof group.profile?.name === 'string' && group.profile.name !== 'Everyone','okta_group_not_manageable',409)
  result.push({id,name:group.profile.name})
 }
 return result.sort((a,b)=>a.id.localeCompare(b.id))
}
