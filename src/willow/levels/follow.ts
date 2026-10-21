// ROLE-001: this is a level setting, never a directly grantable permission.
import type { Bindings } from '../../auth.server'
import type { Actor } from '../actor'
import { one } from '../core'
export async function followsOwnChanges(env: Bindings, actor: Actor) {
 return !!actor.personId && !!await one(env, `SELECT 1 FROM wl_member_levels a JOIN wl_levels l ON l.id=a.level_id WHERE a.member_id=? AND l.follow_own_changes=1 LIMIT 1`,actor.id)
}
