// A dated salary version belongs to history only while a later version is in force.
import type { Bindings } from '../../auth.server'
import type { Actor } from '../actor'
import { requireDate } from '../dates'
import { currentTerms } from '../people'
export async function payWriteField(env:Bindings,actor:Actor,person:string,effectiveFrom:string):Promise<'pay'|'history'> {
 const date=requireDate(effectiveFrom,'invalid_effectiveFrom')
 const current=(await currentTerms(env,actor.today)).get(person)
 return current&&date<current.effective_from?'history':'pay'
}
