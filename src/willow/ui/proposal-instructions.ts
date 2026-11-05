import { marked } from 'marked'
import instructions from '../../../docs/proposals.md?raw'
import { requirePermission, type Actor } from '../actor'
import { h, page, raw } from './html'

export async function proposalInstructionsPage(actor: Actor, url: URL) {
  requirePermission(actor, 'people.manage')
  // Repository-authored documentation only; no member-provided Markdown.
  return page('Prepare a proposal', actor, h`<p class="back"><a href="/app/proposals">← Proposals</a></p><h1>Prepare a proposal</h1><section class="card">${raw(await marked.parse(instructions))}</section>`, { current: '/app/proposals', url })
}
