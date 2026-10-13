// The docs module build/plugin.ts makes from docs/site.json and docs/*.md.
declare module 'virtual:willow-docs' {
  import type { DocsBody, DocsSection } from './types'
  export const sections: DocsSection[]
  export const bodies: Record<string, DocsBody>
}
