// Encrypted, credential-bound sync state contains identifiers and digests, never record values.
import type { Bindings } from '../../auth.server'
import { insist, now } from '../core'
export interface CursorState {
 kind:'page'|'sync'; credential:string; query:string; expires:number;
 manifest:Record<string,string>; before:Record<string,string>|null; offset:number; date:string;
}
const encode=(bytes:Uint8Array)=>btoa(Array.from(bytes,b=>String.fromCharCode(b)).join('')).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'')
const decode=(value:string)=>Uint8Array.from(atob(value.replaceAll('-','+').replaceAll('_','/')),c=>c.charCodeAt(0))
async function key(env:Bindings) {
 const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode('willow-api-v1-cursor:'+env.SESSION_SECRET))
 return crypto.subtle.importKey('raw',bytes,'AES-GCM',false,['encrypt','decrypt'])
}
export async function sealCursor(env:Bindings,state:CursorState) {
 const iv=crypto.getRandomValues(new Uint8Array(12))
 const body=new TextEncoder().encode(JSON.stringify(state))
 const encrypted=new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv},await key(env),body))
 const result=encode(new Uint8Array([...iv,...encrypted]))
 insist(result.length<=256000,'sync_population_too_large',413)
 return result
}
export async function openCursor(env:Bindings,token:string,credential:string,query:string,kind:'page'|'sync') {
 insist(token.length<=256000&&/^[A-Za-z0-9_-]+$/.test(token),'invalid_cursor')
 let state:CursorState
 try {
  const bytes=decode(token)
  const plain=await crypto.subtle.decrypt({name:'AES-GCM',iv:bytes.slice(0,12)},await key(env),bytes.slice(12))
  state=JSON.parse(new TextDecoder().decode(plain)) as CursorState
 } catch { insist(false,'invalid_cursor') }
 insist(state.kind===kind&&state.credential===credential&&state.query===query,'invalid_cursor')
 insist(state.expires>now(),'cursor_expired',409)
 return state
}
