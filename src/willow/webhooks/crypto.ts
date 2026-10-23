// Webhook signing secrets are encrypted under the installation runtime secret and excluded from archives.
import type { Bindings } from '../../auth.server'
const hex=(bytes:ArrayBuffer)=>Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,'0')).join('')
async function custodyKey(env:Bindings) {
 const raw=await crypto.subtle.digest('SHA-256',new TextEncoder().encode('willow-webhook-custody:'+env.SESSION_SECRET))
 return crypto.subtle.importKey('raw',raw,'AES-GCM',false,['encrypt','decrypt'])
}
export async function protectSecret(env:Bindings,secret:string) {
 const iv=crypto.getRandomValues(new Uint8Array(12)),bytes=await crypto.subtle.encrypt({name:'AES-GCM',iv},await custodyKey(env),new TextEncoder().encode(secret))
 return btoa(Array.from(new Uint8Array([...iv,...new Uint8Array(bytes)]),b=>String.fromCharCode(b)).join(''))
}
export async function recoverSecret(env:Bindings,cipher:string) {
 const bytes=Uint8Array.from(atob(cipher),c=>c.charCodeAt(0))
 return new TextDecoder().decode(await crypto.subtle.decrypt({name:'AES-GCM',iv:bytes.slice(0,12)},await custodyKey(env),bytes.slice(12)))
}
export async function sign(secret:string,id:string,timestamp:string,body:string) {
 const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign'])
 return 'v1='+hex(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(id+'.'+timestamp+'.'+body)))
}
