// Read admission is not responsibility: proposal participants may see work they cannot decide.
import type { Actor } from './actor'
import type { WorkSource } from './work-sources'
import type { Row } from './core'

export const workAuthority = (source: WorkSource, actor: Actor) => source.approval || source.kind === 'change-request' ? source.responsible(actor) : source.visible(actor)

export function approvalAssignments(source: WorkSource, members: Actor[], current?: Row) {
 const eligible = members.filter(source.responsible)
 const owner = eligible.find(actor => actor.id === current?.owner) ?? eligible.find(actor => actor.id === source.preferred) ?? eligible[0]
 const substitute = eligible.find(actor => actor.id !== owner?.id && actor.id === current?.substitute) ?? eligible.find(actor => actor.id !== owner?.id)
 return { owner: owner?.id ?? null, substitute: substitute?.id ?? null }
}
