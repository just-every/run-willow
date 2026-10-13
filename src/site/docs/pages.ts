import { bodies, sections } from 'virtual:willow-docs'
import type { DocsPage, DocsPageMeta, DocsSection } from './types'

// The published docs, rendered from docs/site.json and docs/*.md at build time, and lookups over them.

export const docsSections: DocsSection[] = sections
export const docsPages: DocsPageMeta[] = sections.flatMap(section => section.pages)

export const docsTitle = 'Willow docs'
export const docsLead = 'Run Willow on your own computer, set it up for your team, and keep every record: the guides for the owner and HR.'

/** The page with its body and contents list. */
export function docsPage(slug: string): DocsPage {
  const meta = docsPages.find(page => page.slug === slug)
  if (!meta || !Object.hasOwn(bodies, slug)) throw new Error(`No docs page ${slug}`)
  return { ...meta, ...bodies[slug] }
}

/** The pages before and after `slug` in reading order, across sections. */
export function docsNeighbours(slug: string): { previous?: DocsPageMeta; next?: DocsPageMeta } {
  const index = docsPages.findIndex(page => page.slug === slug)
  return { previous: docsPages[index - 1], next: docsPages[index + 1] }
}
