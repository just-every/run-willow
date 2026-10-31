// Expo's production push edge dispatches to APNs/FCM. Payloads contain only fixed
// copy and a fixed authenticated home path; no business identifiers or prose.
import type { Bindings } from '../../auth.server'
import type { Actor } from '../actor'
import type { Input } from '../input'
import { all,commit,insist,now,stmt } from '../core'
import { session } from '../sign/custody'
import { languageFor } from '../locale/store'
import { msg } from '../locale/runtime'
export async function registerPush(env:Bindings,actor:Actor,input:Input) {
 input.only(['token','platform','enabled','returnTo'])
 const token=input.text('token',{max:240}),platform=input.text('platform')
 insist(/^(ExponentPushToken|ExpoPushToken)\[[A-Za-z0-9_-]+\]$/.test(token),'invalid_push_token')
 insist(['ios','android'].includes(platform),'invalid_platform')
 const enabled=input.flag('enabled')
 await commit(env,[session(env,actor),stmt(env,'DELETE FROM wl_mobile_push WHERE token=?',token),...(enabled?[stmt(env,'INSERT INTO wl_mobile_push(token,member_id,session_id,platform,created_at) VALUES(?,?,?,?,?)',token,actor.id,actor.sessionId,platform,now())]:[])],{actor:actor.id,action:'mobile.push.register',subject:actor.id,detail:{platform,enabled}})
 return {enabled,platform}
}
export async function sendMobileNotice(env:Bindings,member:string) {
 const devices=await all(env,`SELECT p.token FROM wl_mobile_push p JOIN wl_members m ON m.id=p.member_id JOIN oa_operators o ON lower(o.email)=m.email JOIN oa_sessions s ON s.id=p.session_id AND s.operator_id=o.id WHERE m.id=? AND m.status='active' AND o.status='active' AND s.revoked_at IS NULL AND s.operator_version=o.version AND s.expires_at>?`,member,now())
 for(const device of devices) {
  const language=await languageFor(env,'member',member)
  let status='uncertain'
  try {
   const response=await fetch('https://exp.host/--/api/v2/push/send',{method:'POST',headers:{'content-type':'application/json',accept:'application/json'},body:JSON.stringify({to:device.token,title:msg('Update ready',language),body:msg('Open Willow to review your work.',language),data:{path:'/app'},sound:'default',channelId:'willow'})})
   if(response.ok) {
    const result=await response.json() as {data?:{status?:string;details?:{error?:string}}}
    status=result.data?.status==='ok'?'accepted':'refused'
    if(result.data?.details?.error==='DeviceNotRegistered')await stmt(env,'DELETE FROM wl_mobile_push WHERE token=?',device.token).run()
   } else status='failed'
  } catch { /* Uncertain delivery never fails or retries the business action. */ }
  await stmt(env,'INSERT INTO wl_mobile_deliveries(member_id,status,language,created_at) VALUES(?,?,?,?)',member,status,language,now()).run()
 }
}
