import { DocsFrame } from './DocsFrame'
import { docsNeighbours, docsPage } from './pages'

/** One guide: its section, title and summary, the rendered Markdown, its contents and the next page. */
export function DocsArticle({ slug }: { slug: string }) {
  const page = docsPage(slug)
  const { next } = docsNeighbours(slug)
  const toc = page.toc.filter(entry => entry.depth === 2)
  return (
    <DocsFrame current={slug}>
      <main className="docs-main">
        <article>
          <p className="docs-section">{page.section}</p>
          <h1>{page.title}</h1>
          <p className="docs-lead">{page.summary}</p>
          {toc.length ? (
            <nav className="docs-toc docs-toc-inline" aria-label="On this page">
              <p className="docs-toc-title">On this page</p>
              <ul>{toc.map(entry => <li key={entry.id}><a href={`#${entry.id}`}>{entry.text}</a></li>)}</ul>
            </nav>
          ) : null}
          <div className="docs-body" dangerouslySetInnerHTML={{ __html: page.html }} />
          {next ? <a className="docs-next" href={`/docs/${next.slug}`}><span>Next</span>{next.title}</a> : null}
        </article>
      </main>
      {toc.length ? (
        <aside className="docs-toc-side">
          <nav className="docs-toc" aria-label="On this page">
            <p className="docs-toc-title">On this page</p>
            <ul>{toc.map(entry => <li key={entry.id}><a href={`#${entry.id}`}>{entry.text}</a></li>)}</ul>
          </nav>
        </aside>
      ) : null}
    </DocsFrame>
  )
}
