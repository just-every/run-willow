import { DocsFrame } from './DocsFrame'
import { docsLead, docsSections, docsTitle } from './pages'

/** /docs: every guide by section, each with its one-line summary. */
export function DocsIndex() {
  return (
    <DocsFrame>
      <main className="docs-main docs-home">
        <h1>{docsTitle}</h1>
        <p className="docs-lead">{docsLead}</p>
        {docsSections.map(section => (
          <section key={section.title} aria-labelledby={`section-${section.pages[0].slug}`}>
            <h2 id={`section-${section.pages[0].slug}`}>{section.title}</h2>
            <ul className="docs-cards">
              {section.pages.map(page => (
                <li key={page.slug}><a href={`/docs/${page.slug}`}><strong>{page.title}</strong><span>{page.summary}</span></a></li>
              ))}
            </ul>
          </section>
        ))}
      </main>
    </DocsFrame>
  )
}
