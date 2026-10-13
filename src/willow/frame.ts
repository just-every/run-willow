// Base's no-script frames (sign-in, its confirmation, /setup) take only --rer-* tokens
// from the declared theme. Willow's frames also wear its watercolour and card style:
// this adds Willow's own same-origin stylesheets to the frame's head, which every
// frame's policy already allows (style-src 'self', img-src 'self').
const FRAME_STYLES = '<link rel="stylesheet" href="/willow-tokens.css"><link rel="stylesheet" href="/willow-frame.css">'

export async function willowFrame(response: Response): Promise<Response> {
  if (!response.headers.get('content-type')?.includes('text/html') || !response.body) return response
  const html = await response.text()
  if (!/<html[^>]* class="rer-themed"/.test(html)) return new Response(html, response)
  const headers = new Headers(response.headers)
  headers.delete('content-length')
  return new Response(html.replace('</head>', `${FRAME_STYLES}</head>`), { status: response.status, statusText: response.statusText, headers })
}
