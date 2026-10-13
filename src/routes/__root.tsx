import { HeadContent, Outlet, Scripts, createRootRoute } from '@tanstack/react-router'
import { introCss, introGuardScript } from '../base/hydration/intro-guard'

export const Route = createRootRoute({ component: RootComponent })

function RootComponent() {
  return <html lang="en"><head>
    <meta charSet="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <script dangerouslySetInnerHTML={{ __html: introGuardScript }} />
    <style>{introCss}</style>
    <HeadContent />
  </head><body><Outlet /><Scripts /></body></html>
}
