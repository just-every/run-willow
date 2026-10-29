import assert from 'node:assert/strict'
import {browserProof} from './browser.mjs'
export default async function({tool,request,origin,cookie}) {
 const list=await tool('willow.candidates.list',{})
 const data=list.result.structuredContent
 const candidates=data.openings.flatMap(opening=>opening.candidates)
 assert(candidates.length>0)
 assert(candidates.some(candidate=>candidate.timeline.some(event=>event.actorName.includes(' for Olive Owner'))))
 assert(candidates.some(candidate=>candidate.scorecards.some(card=>card.authorName.includes(' for Olive Owner'))))
 await browserProof({request,origin,cookie,tool,application:candidates.find(candidate=>candidate.timeline.some(event=>event.actorName.includes(' for Olive Owner'))).id})
 assert(data.proposals.some(proposal=>proposal.agent.includes(' for Olive Owner')&&proposal.status==='pending'))
}
