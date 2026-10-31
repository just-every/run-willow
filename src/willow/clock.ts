// The native clock records append-only events; provider time/payroll reconciliation is separate.
import type { Bindings } from '../auth.server'
import type { Actor } from './actor'
import { all,commit,guard,insist,newId,now,stmt } from './core'
import type { Input } from './input'
import { session } from './sign/custody'
import { locale,msg } from './locale/runtime'
import { field,form,h,hidden,page,table } from './ui/html'
export async function clockView(env:Bindings,actor:Actor) {
 const events=actor.personId?await all(env,'SELECT id,kind,at FROM wl_clock_events WHERE person_id=? ORDER BY at,id',actor.personId):[]
 const active=!!actor.personId&&!!(await all(env,'SELECT 1 FROM wl_periods WHERE person_id=? AND start_date<=? AND (end_date IS NULL OR end_date>=?)',actor.personId,actor.today,actor.today)).length
 const last=events.at(-1),state=last?.kind??'out'
 return {events,state,revision:events.length,allowed:!active?[]:state==='out'?['in']:state==='break'?['resume','out']:['break','out']}
}
export async function clockPunch(env:Bindings,actor:Actor,input:Input) {
 input.only(['kind','revision','returnTo'])
 const view=await clockView(env,actor),kind=input.text('kind')
 insist(view.allowed.includes(kind),'clock_transition_invalid',409)
 insist(input.integer('revision')===view.revision,'stale',409)
 const id=newId(),at=now()
 await commit(env,[session(env,actor),guard(env,'stale','(SELECT COUNT(*) FROM wl_clock_events WHERE person_id=?)=?',actor.personId,view.revision),guard(env,'access_ended',"EXISTS(SELECT 1 FROM wl_members WHERE id=? AND person_id=? AND status='active') AND EXISTS(SELECT 1 FROM wl_periods WHERE person_id=? AND start_date<=? AND (end_date IS NULL OR end_date>=?))",actor.id,actor.personId,actor.personId,actor.today,actor.today),stmt(env,'INSERT INTO wl_clock_events VALUES(?,?,?,?,?,?)',id,actor.personId,actor.id,kind,at,locale())],{actor:actor.id,action:'clock.'+kind,subject:actor.personId!})
 return {id,kind,at}
}
const names:Record<string,string>={in:'Clock in',out:'Clock out',break:'Start break',resume:'End break'}
export async function clockPage(env:Bindings,actor:Actor,url:URL) {
 const view=await clockView(env,actor)
 return page('Time clock',actor,h`<h1>Time clock</h1><section class="card"><h2>${msg(view.state==='out'?'Off shift':view.state==='break'?'On break':'Working')}</h2>${view.allowed.map(kind=>form('clock.punch','/app/clock',[hidden('kind',kind),hidden('revision',view.revision)],names[kind]))}${!view.allowed.length?h`<p>No active employment is linked to this account.</p>`:''}</section><section class="card"><h2>Recent events</h2>${table(['Action','Recorded at'],view.events.slice(-30).reverse().map(e=>[msg(names[e.kind]),new Date(e.at).toISOString()]))}</section>`,{url,current:'/app/clock'})
}
